package markSmith;

import com.dukascopy.api.*;
import com.rabbitmq.client.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Callable;

/**
 * =================================================================================================================
 * HistoricalBarRequester - On-Demand Historical Bar Producer
 * =================================================================================================================
 *
 * Description:
 * This JForex strategy acts as an on-demand historical data server. It listens on a dedicated
 * RabbitMQ queue for JSON requests specifying an instrument and the number of bars to fetch.
 * Upon receiving a request, it fetches the historical data for a curated set of timeframes,
 * calculates the full suite of technical indicators for each bar, and publishes the results to a
 * dedicated data queue.
 *
 * Features:
 * - On-Demand Processing: Sits idle until a request is received via AMQP.
 * - Rich Data Payload: Generates the exact same comprehensive JSON message format as the live data feeder.
 * - Automatic Startup Fetch: Optionally fetches a default dataset (e.g., EURUSD) on startup to pre-warm caches or databases.
 * - Centralized Configuration: All key parameters are located in a single block at the top.
 *
 * AMQP Integration:
 * - Listens for requests on the "H-Requests" queue.
 * - Publishes resulting bar data to the "H-Bars" queue.
 *
 * Author: Mark Smith & Gemini
 * Version: 2.3 (Final API Fixes)
 *
 * =================================================================================================================
 */
@Library("rabbitmq-client.jar")
@RequiresFullAccess
public class HistoricalBarRequester implements IStrategy {

    // =============================================================================================================
    // --- CENTRALIZED CONFIGURATION ---
    // =============================================================================================================

    // --- AMQP Configuration ---
    @Configurable(value = "AMQP Hostname")
    public String amqpHostname = "localhost";
    @Configurable(value = "AMQP Port")
    public int amqpPort = 5672;
    @Configurable(value = "AMQP Username")
    public String amqpUsername = "mark";
    @Configurable(value = "AMQP Password")
    public String amqpPassword = "mark";
    @Configurable(value = "Request Queue Name")
    public String requestQueueName = "H-Requests";
    @Configurable(value = "Response/Data Queue Name")
    public String responseQueueName = "H-Bars";
    @Configurable(value = "Default Bars to Fetch")
    public int defaultBarsCount = 20;

    // --- Timeframe Configuration ---
    private static final Period[] REQUEST_PERIODS = {
        Period.TEN_SECS, Period.ONE_MIN, Period.FIVE_MINS, Period.FIFTEEN_MINS,
        Period.ONE_HOUR, Period.FOUR_HOURS, Period.DAILY
    };

    // --- Instrument & Pair ID Mappings ---
    private static final Map<Instrument, Integer> INSTRUMENT_PAIR_IDS;
    static {
        Map<Instrument, Integer> map = new LinkedHashMap<>();
        map.put(Instrument.EURUSD, 1);
        map.put(Instrument.GBPUSD, 2);
        map.put(Instrument.USDJPY, 3);
        map.put(Instrument.USDCHF, 4);
        map.put(Instrument.AUDUSD, 5);
        map.put(Instrument.USDCAD, 6);
        map.put(Instrument.NZDUSD, 7);
        map.put(Instrument.EURJPY, 8);
        map.put(Instrument.GBPJPY, 9);
        map.put(Instrument.EURGBP, 10);
        INSTRUMENT_PAIR_IDS = Collections.unmodifiableMap(map);
    }
    
    // --- Technical Indicator Parameter Configuration ---
    private static final int[] DEMA_PERIODS = {25, 50, 100, 200};
    private static final int MACD_FAST_PERIOD = 12;
    private static final int MACD_SLOW_PERIOD = 26;
    private static final int MACD_SIGNAL_PERIOD = 9;
    private static final int SUPERTREND_PERIOD = 12;
    private static final double SUPERTREND_MULTIPLIER = 3.0;
    private static final int DONCHIAN_PERIOD = 20;
    private static final int BOLLINGER_PERIOD = 20;
    private static final double BOLLINGER_DEVIATION = 2.0;
    private static final int KELTNER_PERIOD = 20;
    private static final double KELTNER_MULTIPLIER = 2.0;
    private static final int ATR_PERIOD = 12;
    private static final int RSI_FAST_PERIOD = 7;
    private static final int RSI_SLOW_PERIOD = 21;
    private static final int STOCH_K_PERIOD = 14;
    private static final int STOCH_K_SLOW_PERIOD = 3;
    private static final int STOCH_D_PERIOD = 3;
    private static final int CCI_PERIOD = 20;
    private static final int MFI_PERIOD = 14;
    private static final int INDICATOR_HISTORY_BUFFER = 250; // Extra bars for DEMA(200) etc.

    // =============================================================================================================
    // --- STRATEGY STATE AND LOGIC ---
    // =============================================================================================================
    
    private IConsole console;
    private IContext context;
    private IIndicators indicators;
    private IHistory history;
    private Connection amqpConnection;
    private Channel amqpChannel;
    private final Object amqpConnectionLock = new Object();
    private final Timer startupTimer = new Timer(true);

    @Override
    public void onStart(IContext context) throws JFException {
        this.context = context;
        this.console = context.getConsole();
        this.indicators = context.getIndicators();
        this.history = context.getHistory();
        console.getOut().println("Starting HistoricalBarRequester strategy...");

        if (initializeAmqp()) {
            startCommandConsumer();
            scheduleStartupFetch();
        } else {
            console.getErr().println("FATAL: Could not establish AMQP connection. Stopping strategy.");
            context.stop();
        }
    }

    @Override
    public void onStop() throws JFException {
        startupTimer.cancel();
        console.getOut().println("Stopping HistoricalBarRequester strategy...");
        synchronized (amqpConnectionLock) {
            try {
                if (amqpChannel != null && amqpChannel.isOpen()) amqpChannel.close();
                if (amqpConnection != null && amqpConnection.isOpen()) amqpConnection.close();
            } catch (Exception e) {
                console.getErr().println("Error closing AMQP connection: " + e.getMessage());
            }
        }
        console.getOut().println("Strategy stopped.");
    }

    private void scheduleStartupFetch() {
        console.getOut().println("Scheduling initial EURUSD bar fetch in 5 seconds...");
        startupTimer.schedule(new TimerTask() {
            @Override
            public void run() {
                console.getOut().println("Executing scheduled startup fetch for EURUSD...");
                try {
                    context.executeTask((Callable<Void>) () -> {
                        fetchAndSendHistoricalBars(Instrument.EURUSD, defaultBarsCount);
                        return null;
                    });
                } catch (Exception e) {
                    console.getErr().println("Startup fetch task failed: " + e.getMessage());
                }
            }
        }, 5000);
    }

    private void startCommandConsumer() {
        try {
            console.getOut().println("Starting command consumer on queue '" + requestQueueName + "'...");
            DeliverCallback deliverCallback = (consumerTag, delivery) -> {
                String message = new String(delivery.getBody(), StandardCharsets.UTF_8);
                console.getOut().println("Received command: " + message);
                handleCommand(message);
            };
            amqpChannel.basicConsume(requestQueueName, true, deliverCallback, consumerTag -> {});
        } catch (IOException e) {
            console.getErr().println("Failed to start AMQP consumer: " + e.getMessage());
        }
    }

    private void handleCommand(String jsonCommand) {
        try {
            Map<String, String> commandMap = new HashMap<>();
            String sanitized = jsonCommand.trim().replaceAll("[{}\"]", "");
            for (String pair : sanitized.split(",")) {
                String[] kv = pair.split(":", 2);
                if (kv.length == 2) commandMap.put(kv[0].trim(), kv[1].trim());
            }

            int barsCount = Integer.parseInt(commandMap.getOrDefault("barsCount", String.valueOf(defaultBarsCount)));
            String instrumentName = commandMap.get("instrument");
            if (instrumentName == null) {
                console.getErr().println("Command missing 'instrument' field. Ignoring.");
                return;
            }

            Instrument instrument = Instrument.fromString(instrumentName);
            if (!INSTRUMENT_PAIR_IDS.containsKey(instrument)) {
                console.getErr().println("Instrument " + instrumentName + " is not configured in this feeder. Ignoring.");
                return;
            }

            context.executeTask((Callable<Void>) () -> {
                fetchAndSendHistoricalBars(instrument, barsCount);
                return null;
            });

        } catch (Exception e) {
            console.getErr().println("Error handling command '" + jsonCommand + "': " + e.getMessage());
        }
    }

    private void fetchAndSendHistoricalBars(Instrument instrument, int barsCount) {
        console.getOut().println("Fetching last " + barsCount + " bars for " + instrument + " across all periods...");
        for (Period period : REQUEST_PERIODS) {
            try {
                long now = System.currentTimeMillis();
                long toTime = history.getBarStart(period, now);
                int barsToRequest = barsCount + INDICATOR_HISTORY_BUFFER;

                List<IBar> bidBars = history.getBars(instrument, period, OfferSide.BID, Filter.WEEKENDS, barsToRequest, toTime, 0);
                List<IBar> askBars = history.getBars(instrument, period, OfferSide.ASK, Filter.WEEKENDS, barsToRequest, toTime, 0);

                calculateAndSendBars(instrument, period, bidBars, askBars, barsCount);
            } catch (Exception e) {
                console.getErr().println("Exception while fetching for " + instrument + " " + period + ": " + e.getMessage());
            }
        }
    }

    private void calculateAndSendBars(Instrument instrument, Period period, List<IBar> allBidBars, List<IBar> allAskBars, int barsToSend) throws JFException, IOException {
        if (allBidBars == null || allAskBars == null || allBidBars.isEmpty() || allAskBars.isEmpty()) {
            console.getOut().println("No historical bars found for " + instrument + " " + period);
            return;
        }

        long lastBarTime = allBidBars.get(allBidBars.size() - 1).getTime();
        int historySize = allBidBars.size();

        // Bulk-fetch all indicators that support it
        double[] atrVals = indicators.atr(instrument, period, OfferSide.BID, ATR_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);
        double[] rsiFastVals = indicators.rsi(instrument, period, OfferSide.BID, IIndicators.AppliedPrice.CLOSE, RSI_FAST_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);
        double[] rsiSlowVals = indicators.rsi(instrument, period, OfferSide.BID, IIndicators.AppliedPrice.CLOSE, RSI_SLOW_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);
        double[] cciVals = indicators.cci(instrument, period, OfferSide.BID, CCI_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);
        double[] mfiVals = indicators.mfi(instrument, period, OfferSide.BID, MFI_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);
        // FIXED: The OBV method signature is unusual and requires a second OfferSide argument.
        double[] obvVals = indicators.obv(instrument, period, OfferSide.BID, IIndicators.AppliedPrice.CLOSE, OfferSide.BID, Filter.WEEKENDS, historySize, lastBarTime, 0);

        Map<Integer, double[]> demas = new HashMap<>();
        for (int p : DEMA_PERIODS) {
            demas.put(p, indicators.dema(instrument, period, OfferSide.BID, IIndicators.AppliedPrice.CLOSE, p, Filter.WEEKENDS, historySize, lastBarTime, 0));
        }

        double[][] macdVals = indicators.macd(instrument, period, OfferSide.BID, IIndicators.AppliedPrice.CLOSE, MACD_FAST_PERIOD, MACD_SLOW_PERIOD, MACD_SIGNAL_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);
        double[][] bbands = indicators.bbands(instrument, period, OfferSide.BID, IIndicators.AppliedPrice.CLOSE, BOLLINGER_PERIOD, BOLLINGER_DEVIATION, BOLLINGER_DEVIATION, IIndicators.MaType.SMA, Filter.WEEKENDS, historySize, lastBarTime, 0);
        double[][] stochVals = indicators.stoch(instrument, period, OfferSide.BID, STOCH_K_PERIOD, STOCH_K_SLOW_PERIOD, IIndicators.MaType.SMA, STOCH_D_PERIOD, IIndicators.MaType.SMA, Filter.WEEKENDS, historySize, lastBarTime, 0);
        double[] keltnerMiddleVals = indicators.sma(instrument, period, OfferSide.BID, IIndicators.AppliedPrice.CLOSE, KELTNER_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);

        int sentCount = 0;
        int startIdx = Math.max(0, historySize - barsToSend);

        for (int i = startIdx; i < historySize; i++) {
            IBar bidBar = allBidBars.get(i);
            IBar askBar = findMatchingBar(bidBar.getTime(), allAskBars);
            if (askBar == null) continue;

            TechnicalIndicators ti = new TechnicalIndicators();
            
            ti.atr = atrVals[i];
            ti.rsiFast = rsiFastVals[i];
            ti.rsiSlow = rsiSlowVals[i];
            ti.cci = cciVals[i];
            ti.mfi = mfiVals[i];
            ti.obv = obvVals[i];
            ti.demas = new HashMap<>();
            for (int p : DEMA_PERIODS) ti.demas.put(p, demas.get(p)[i]);
            ti.macdLine = macdVals[0][i];
            ti.signalLine = macdVals[1][i];
            ti.histogram = macdVals[2][i];
            ti.bbUpper = bbands[0][i];
            ti.bbMiddle = bbands[1][i];
            ti.bbLower = bbands[2][i];
            ti.stochK = stochVals[0][i];
            ti.stochD = stochVals[1][i];

            int donchianStart = Math.max(0, i - DONCHIAN_PERIOD + 1);
            List<IBar> donchianHistory = allBidBars.subList(donchianStart, i + 1);
            ti.donchianUpper = donchianHistory.stream().mapToDouble(IBar::getHigh).max().orElse(Double.NaN);
            ti.donchianLower = donchianHistory.stream().mapToDouble(IBar::getLow).min().orElse(Double.NaN);
            ti.donchianMiddle = (ti.donchianUpper + ti.donchianLower) / 2.0;

            double keltnerMiddle = keltnerMiddleVals[i];
            ti.kcUpper = keltnerMiddle + (ti.atr * KELTNER_MULTIPLIER);
            ti.kcMiddle = keltnerMiddle;
            ti.kcLower = keltnerMiddle - (ti.atr * KELTNER_MULTIPLIER);

            double midPrice = (bidBar.getHigh() + bidBar.getLow()) / 2.0;
            ti.superTrendUpper = midPrice + (SUPERTREND_MULTIPLIER * ti.atr);
            ti.superTrendLower = midPrice - (SUPERTREND_MULTIPLIER * ti.atr);

            String jsonMessage = formatBarToJson(instrument, period, askBar, bidBar, ti);
            sendMessage(jsonMessage);
            sentCount++;
        }
        console.getOut().println("Sent " + sentCount + " historical bars for " + instrument + " " + period);
    }
    
    private IBar findMatchingBar(long time, List<IBar> barList) {
        for (IBar bar : barList) {
            if (bar.getTime() == time) return bar;
        }
        return null;
    }

    private boolean initializeAmqp() {
        synchronized (amqpConnectionLock) {
            try {
                console.getOut().println("Initializing AMQP connection to " + amqpHostname + ":" + amqpPort);
                ConnectionFactory factory = new ConnectionFactory();
                factory.setHost(amqpHostname);
                factory.setPort(amqpPort);
                factory.setUsername(amqpUsername);
                factory.setPassword(amqpPassword);
                factory.setAutomaticRecoveryEnabled(true);
                this.amqpConnection = factory.newConnection();
                this.amqpChannel = amqpConnection.createChannel();
                
                this.amqpChannel.queueDeclare(requestQueueName, true, false, false, null);
                this.amqpChannel.queueDeclare(responseQueueName, true, false, false, null);
                
                console.getOut().println("AMQP OK. Listening on '" + requestQueueName + "', publishing to '" + responseQueueName + "'.");
                return true;
            } catch (Exception e) {
                console.getErr().println("AMQP initialization failed: " + e.getMessage());
                return false;
            }
        }
    }

    private void sendMessage(String message) throws IOException {
        synchronized (amqpConnectionLock) {
            if (amqpChannel == null || !amqpChannel.isOpen()) {
                console.getErr().println("Cannot send message, AMQP channel is not open.");
                return;
            }
            amqpChannel.basicPublish("", responseQueueName, null, message.getBytes(StandardCharsets.UTF_8));
        }
    }

    private String formatBarToJson(Instrument instrument, Period period, IBar askBar, IBar bidBar, TechnicalIndicators ti) {
        int pairId = INSTRUMENT_PAIR_IDS.getOrDefault(instrument, -1);
        long barStartTimestamp = bidBar.getTime();
        long barEndTimestamp = barStartTimestamp + period.getInterval();
        long producedAt = System.currentTimeMillis();
        String instrumentName = instrument.name().replace("/", "");

        StringBuilder json = new StringBuilder();
        json.append("{");
        json.append("\"produced_at\":").append(producedAt);
        json.append(",\"bar_start_timestamp\":").append(barStartTimestamp);
        json.append(",\"bar_end_timestamp\":").append(barEndTimestamp);
        json.append(",\"pairId\":").append(pairId);
        json.append(",\"instrument\":\"").append(instrumentName).append("\"");
        json.append(",\"period\":\"").append(period.name()).append("\"");

        json.append(String.format(Locale.US, ",\"bid\":{\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%.3f}", bidBar.getOpen(), bidBar.getHigh(), bidBar.getLow(), bidBar.getClose(), bidBar.getVolume()));
        json.append(String.format(Locale.US, ",\"ask\":{\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%.3f}", askBar.getOpen(), askBar.getHigh(), askBar.getLow(), askBar.getClose(), askBar.getVolume()));

        json.append(",\"vwap\":{\"tick_vwap\":null}"); // No tick data for historical bars
        json.append(String.format(Locale.US, ",\"atr\":%.5f", ti.atr));
        json.append(String.format(Locale.US, ",\"obv\":%.3f", ti.obv));

        json.append(",\"demas\":{");
        for (int i = 0; i < DEMA_PERIODS.length; i++) {
            json.append(String.format(Locale.US, "\"dema_%d\":%.5f", DEMA_PERIODS[i], ti.demas.get(DEMA_PERIODS[i])));
            if (i < DEMA_PERIODS.length - 1) json.append(",");
        }
        json.append("}");

        json.append(String.format(Locale.US, ",\"macd\":{\"line\":%.5f,\"signal\":%.5f,\"hist\":%.5f}", ti.macdLine, ti.signalLine, ti.histogram));
        json.append(String.format(Locale.US, ",\"rsi\":{\"fast\":%.2f,\"slow\":%.2f}", ti.rsiFast, ti.rsiSlow));
        json.append(String.format(Locale.US, ",\"stoch\":{\"k\":%.2f,\"d\":%.2f}", ti.stochK, ti.stochD));
        json.append(String.format(Locale.US, ",\"cci\":%.2f", ti.cci));
        json.append(String.format(Locale.US, ",\"mfi\":%.2f", ti.mfi));

        json.append(String.format(Locale.US, ",\"bollinger\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", ti.bbUpper, ti.bbMiddle, ti.bbLower));
        json.append(String.format(Locale.US, ",\"keltner\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", ti.kcUpper, ti.kcMiddle, ti.kcLower));
        json.append(String.format(Locale.US, ",\"donchian\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", ti.donchianUpper, ti.donchianMiddle, ti.donchianLower));
        json.append(String.format(Locale.US, ",\"supertrend\":{\"upper\":%.5f,\"lower\":%.5f}", ti.superTrendUpper, ti.superTrendLower));

        json.append("}");
        return json.toString();
    }

    private static class TechnicalIndicators {
        double atr = Double.NaN, obv = Double.NaN;
        Map<Integer, Double> demas;
        double macdLine = Double.NaN, signalLine = Double.NaN, histogram = Double.NaN;
        double rsiFast = Double.NaN, rsiSlow = Double.NaN;
        double stochK = Double.NaN, stochD = Double.NaN;
        double cci = Double.NaN, mfi = Double.NaN;
        double bbUpper = Double.NaN, bbMiddle = Double.NaN, bbLower = Double.NaN;
        double kcUpper = Double.NaN, kcMiddle = Double.NaN, kcLower = Double.NaN;
        double donchianUpper = Double.NaN, donchianMiddle = Double.NaN, donchianLower = Double.NaN;
        double superTrendUpper = Double.NaN, superTrendLower = Double.NaN;
    }

    @Override public void onTick(Instrument i, ITick t) {}
    @Override public void onBar(Instrument i, Period p, IBar a, IBar b) {}
    @Override public void onMessage(IMessage m) {}
    @Override public void onAccount(IAccount a) {}
}