package markSmith;

import com.dukascopy.api.*;
import com.rabbitmq.client.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Callable;

@Library("rabbitmq-client.jar")
@RequiresFullAccess
public class EURUSD_HistoricalBarRequester implements IStrategy {

    // =============================================================================================================
    // --- CENTRALIZED CONFIGURATION ---
    // =============================================================================================================

    // --- AMQP Configuration ---
    // --- AMQP Configuration ---
    // // @Configurable(value = "AMQP Hostname")
    public String amqpHostname = "localhost";
    // // @Configurable(value = "AMQP Port")
    public int amqpPort = 5672;
    // // @Configurable(value = "AMQP Username")
    public String amqpUsername = "mark";
    // // @Configurable(value = "AMQP Password")
    public String amqpPassword = "mark";
    // // @Configurable(value = "Request Queue Name")
    public String requestQueueName = "EURUSD_H-Requests";
    // // @Configurable(value = "Response/Data Queue Name")
    public String responseQueueName = "EURUSD_H-Bars";
    // // @Configurable(value = "Default Bars to Fetch")
    public int defaultBarsCount = 200;

    // --- Timeframe Configuration ---
    private static final Period[] REQUEST_PERIODS = {
        Period.TEN_SECS,
        Period.ONE_MIN,
        Period.FIVE_MINS,
        Period.FIFTEEN_MINS,
        Period.ONE_HOUR,
        Period.FOUR_HOURS,
        Period.DAILY,
    };

    // --- Instrument & Pair ID Mappings ---
    private static final Instrument INSTRUMENT = Instrument.EURUSD;
    private static final int PAIR_ID = 1;

    // --- Technical Indicator Parameter Configuration ---
    private static final int[] DEMA_PERIODS = { 25, 50, 100, 200 };
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
        console
            .getOut()
            .println("Starting EURUSD_HistoricalBarRequester strategy...");

        if (initializeAmqp()) {
            startCommandConsumer();
            // scheduleStartupFetch(); // disabled: Go backend coordinates historical requests
        } else {
            console
                .getErr()
                .println(
                    "FATAL: Could not establish AMQP connection. Stopping strategy."
                );
            context.stop();
        }
    }

    @Override
    public void onStop() throws JFException {
        startupTimer.cancel();
        console
            .getOut()
            .println("Stopping EURUSD_HistoricalBarRequester strategy...");
        synchronized (amqpConnectionLock) {
            try {
                if (
                    amqpChannel != null && amqpChannel.isOpen()
                ) amqpChannel.close();
                if (
                    amqpConnection != null && amqpConnection.isOpen()
                ) amqpConnection.close();
            } catch (Exception e) {
                console
                    .getErr()
                    .println(
                        "Error closing AMQP connection: " + e.getMessage()
                    );
            }
        }
        console.getOut().println("Strategy stopped.");
    }

    private void scheduleStartupFetch() {
        console
            .getOut()
            .println(
                "Scheduling initial bar fetch for " +
                INSTRUMENT.name() +
                " in 5 seconds..."
            );
        startupTimer.schedule(
            new TimerTask() {
                @Override
                public void run() {
                    console
                        .getOut()
                        .println(
                            "Executing scheduled startup fetch for " +
                            INSTRUMENT.name() +
                            "..."
                        );
                    try {
                        context.executeTask(
                            (Callable<Void>) () -> {
                                fetchAndSendHistoricalBars(
                                    INSTRUMENT,
                                    defaultBarsCount
                                );
                                return null;
                            }
                        );
                    } catch (Exception e) {
                        console
                            .getErr()
                            .println(
                                "Startup fetch task failed: " + e.getMessage()
                            );
                    }
                }
            },
            5000
        );
    }

    private void startCommandConsumer() {
        try {
            console
                .getOut()
                .println(
                    "Starting command consumer on queue '" +
                    requestQueueName +
                    "'..."
                );
            DeliverCallback deliverCallback = (consumerTag, delivery) -> {
                String message = new String(
                    delivery.getBody(),
                    StandardCharsets.UTF_8
                );
                console.getOut().println("Received command: " + message);
                handleCommand(message);
            };
            amqpChannel.basicConsume(
                requestQueueName,
                true,
                deliverCallback,
                consumerTag -> {}
            );
        } catch (IOException e) {
            console
                .getErr()
                .println("Failed to start AMQP consumer: " + e.getMessage());
        }
    }

    private void handleCommand(String jsonCommand) {
        try {
            Map<String, String> commandMap = new HashMap<>();
            String sanitized = jsonCommand.trim().replaceAll("[{\"]", "");
            for (String pair : sanitized.split(",")) {
                String[] kv = pair.split(":", 2);
                if (kv.length == 2) commandMap.put(kv[0].trim(), kv[1].trim());
            }

            int barsCount = Integer.parseInt(
                commandMap.getOrDefault(
                    "barsCount",
                    String.valueOf(defaultBarsCount)
                )
            );

            // Command only triggers a fetch for the strategy's hardcoded instrument
            context.executeTask(
                (Callable<Void>) () -> {
                    fetchAndSendHistoricalBars(INSTRUMENT, barsCount);
                    return null;
                }
            );
        } catch (Exception e) {
            console
                .getErr()
                .println(
                    "Error handling command '" +
                    jsonCommand +
                    "': " +
                    e.getMessage()
                );
        }
    }

    private void fetchAndSendHistoricalBars(
        Instrument instrument,
        int barsCount
    ) {
        console
            .getOut()
            .println(
                "Fetching last " +
                barsCount +
                " bars for " +
                instrument +
                " across all periods..."
            );
        for (Period period : REQUEST_PERIODS) {
            try {
                long now = System.currentTimeMillis();
                long toTime = history.getBarStart(period, now);
                int barsToRequest = barsCount + INDICATOR_HISTORY_BUFFER;

                List<IBar> bidBars = history.getBars(
                    instrument,
                    period,
                    OfferSide.BID,
                    Filter.WEEKENDS,
                    barsToRequest,
                    toTime,
                    0
                );
                List<IBar> askBars = history.getBars(
                    instrument,
                    period,
                    OfferSide.ASK,
                    Filter.WEEKENDS,
                    barsToRequest,
                    toTime,
                    0
                );

                calculateAndSendBars(
                    instrument,
                    period,
                    bidBars,
                    askBars,
                    barsCount
                );
            } catch (Exception e) {
                console
                    .getErr()
                    .println(
                        "Exception while fetching for " +
                        instrument +
                        " " +
                        period +
                        ": " +
                        e.getMessage()
                    );
            }
        }
    }

    private void calculateAndSendBars(
        Instrument instrument,
        Period period,
        List<IBar> allBidBars,
        List<IBar> allAskBars,
        int barsToSend
    ) throws JFException, IOException {
        if (
            allBidBars == null ||
            allAskBars == null ||
            allBidBars.isEmpty() ||
            allAskBars.isEmpty()
        ) {
            console
                .getOut()
                .println(
                    "No historical bars found for " + instrument + " " + period
                );
            return;
        }

        // Calculate Bid Indicators
        TechnicalIndicators bidTi = calculateIndicatorsForSide(instrument, period, allBidBars, barsToSend, OfferSide.BID);

        // Calculate Ask Indicators
        TechnicalIndicators askTi = calculateIndicatorsForSide(instrument, period, allAskBars, barsToSend, OfferSide.ASK);

        int historySize = allBidBars.size();
        int sentCount = 0;
        int startIdx = Math.max(0, historySize - barsToSend);
        int totalBars = historySize - startIdx;

        for (int i = startIdx; i < historySize; i++) {
            IBar bidBar = allBidBars.get(i);
            IBar askBar = findMatchingBar(bidBar.getTime(), allAskBars);
            if (askBar == null) continue;

            int sequence = totalBars - sentCount;
            String jsonMessage = formatBarToJson(
                instrument,
                period,
                askBar,
                bidBar,
                bidTi, // Pass bid indicators
                askTi, // Pass ask indicators
                sequence,
                i // Pass current index
            );
            sendMessage(jsonMessage);
            sentCount++;
        }
        console
            .getOut()
            .println(
                "Sent " +
                sentCount +
                " historical bars for " +
                instrument +
                " " +
                period
            );
    }

    private TechnicalIndicators calculateIndicatorsForSide(Instrument instrument, Period period, List<IBar> allBars, int barsToSend, OfferSide offerSide) throws JFException {
        TechnicalIndicators ti = new TechnicalIndicators();
        int historySize = allBars.size();
        long lastBarTime = allBars.get(historySize - 1).getTime();

        // Bulk-fetch all indicators that support it
        ti.atr = indicators.atr(instrument, period, offerSide, ATR_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);
        ti.rsiFast = indicators.rsi(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, RSI_FAST_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);
        ti.rsiSlow = indicators.rsi(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, RSI_SLOW_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);
        ti.cci = indicators.cci(instrument, period, offerSide, CCI_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);
        ti.mfi = indicators.mfi(instrument, period, offerSide, MFI_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);
        ti.obv = indicators.obv(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, offerSide, Filter.WEEKENDS, historySize, lastBarTime, 0);

        ti.demas = new HashMap<>();
        for (int p : DEMA_PERIODS) {
            ti.demas.put(p, indicators.dema(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, p, Filter.WEEKENDS, historySize, lastBarTime, 0));
        }

        ti.macd = indicators.macd(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, MACD_FAST_PERIOD, MACD_SLOW_PERIOD, MACD_SIGNAL_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);
        ti.bbands = indicators.bbands(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, BOLLINGER_PERIOD, BOLLINGER_DEVIATION, BOLLINGER_DEVIATION, IIndicators.MaType.SMA, Filter.WEEKENDS, historySize, lastBarTime, 0);
        ti.stoch = indicators.stoch(instrument, period, offerSide, STOCH_K_PERIOD, STOCH_K_SLOW_PERIOD, IIndicators.MaType.SMA, STOCH_D_PERIOD, IIndicators.MaType.SMA, Filter.WEEKENDS, historySize, lastBarTime, 0);
        ti.keltnerMiddle = indicators.sma(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, KELTNER_PERIOD, Filter.WEEKENDS, historySize, lastBarTime, 0);

        // Donchian Channels (Manual Calculation from bar data)
        // Donchian uses the highest high and lowest low over the period
        int startIdx = Math.max(0, historySize - DONCHIAN_PERIOD);
        double[] highs = new double[DONCHIAN_PERIOD];
        double[] lows = new double[DONCHIAN_PERIOD];

        for (int i = 0; i < DONCHIAN_PERIOD && (startIdx + i) < historySize; i++) {
            highs[i] = allBars.get(startIdx + i).getHigh();
            lows[i] = allBars.get(startIdx + i).getLow();
        }

        ti.donchianUpper = Arrays.stream(highs).max().orElse(Double.NaN);
        ti.donchianLower = Arrays.stream(lows).min().orElse(Double.NaN);
        ti.donchianMiddle = (ti.donchianUpper + ti.donchianLower) / 2.0;

        // Calculate VWAP for historical bars
        ti.vwap = new double[historySize];
        double cumulativeVolume = 0.0;
        double cumulativeVolumePrice = 0.0;

        for (int i = 0; i < historySize; i++) {
            IBar bar = allBars.get(i);
            double typicalPrice = (bar.getHigh() + bar.getLow() + bar.getClose()) / 3.0;
            double volume = bar.getVolume();

            cumulativeVolume += volume;
            cumulativeVolumePrice += typicalPrice * volume;

            if (cumulativeVolume > 0.0) {
                ti.vwap[i] = cumulativeVolumePrice / cumulativeVolume;
            } else {
                ti.vwap[i] = Double.NaN;
            }
        }

        return ti;
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
                console
                    .getOut()
                    .println(
                        "Initializing AMQP connection to " +
                        amqpHostname +
                        ":" +
                        amqpPort
                    );
                ConnectionFactory factory = new ConnectionFactory();
                factory.setHost(amqpHostname);
                factory.setPort(amqpPort);
                factory.setUsername(amqpUsername);
                factory.setPassword(amqpPassword);
                factory.setAutomaticRecoveryEnabled(true);
                this.amqpConnection = factory.newConnection();
                this.amqpChannel = amqpConnection.createChannel();

                this.amqpChannel.queueDeclare(
                    requestQueueName,
                    true,
                    false,
                    false,
                    null
                );
                this.amqpChannel.queueDeclare(
                    responseQueueName,
                    true,
                    false,
                    false,
                    null
                );

                console
                    .getOut()
                    .println(
                        "AMQP OK. Listening on '" +
                        requestQueueName +
                        "', publishing to '" +
                        responseQueueName +
                        "'."
                    );
                return true;
            } catch (Exception e) {
                console
                    .getErr()
                    .println("AMQP initialization failed: " + e.getMessage());
                return false;
            }
        }
    }

    private void sendMessage(String message) throws IOException {
        synchronized (amqpConnectionLock) {
            if (amqpChannel == null || !amqpChannel.isOpen()) {
                console
                    .getErr()
                    .println("Cannot send message, AMQP channel is not open.");
                return;
            }
            amqpChannel.basicPublish(
                "",
                responseQueueName,
                null,
                message.getBytes(StandardCharsets.UTF_8)
            );
        }
    }

    private String formatBarToJson(
        Instrument instrument,
        Period period,
        IBar askBar,
        IBar bidBar,
        TechnicalIndicators bidTi,
        TechnicalIndicators askTi,
        int sequence,
        int index
    ) {
        long barStartTimestamp = bidBar.getTime();
        long barEndTimestamp = barStartTimestamp + period.getInterval();
        long producedAt = System.currentTimeMillis();
        String instrumentName = instrument.name().replace("/", "");

        StringBuilder json = new StringBuilder();
        json.append("{");
        json.append("\"produced_at\":").append(producedAt);
        json.append(",\"bar_start_timestamp\":").append(barStartTimestamp);
        json.append(",\"bar_end_timestamp\":").append(barEndTimestamp);
        json.append(",\"pairId\":").append(PAIR_ID);
        json.append(",\"instrument\":\"").append(instrumentName).append("\"");
        json.append(",\"period\":\"").append(period.name()).append("\"");
        json.append(",\"sequence\":").append(sequence);

        json.append(
            String.format(
                Locale.US,
                ",\"bid\":{\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%.3f}",
                bidBar.getOpen(),
                bidBar.getHigh(),
                bidBar.getLow(),
                bidBar.getClose(),
                bidBar.getVolume()
            )
        );
        json.append(
            String.format(
                Locale.US,
                ",\"ask\":{\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%.3f}",
                askBar.getOpen(),
                askBar.getHigh(),
                askBar.getLow(),
                askBar.getClose(),
                askBar.getVolume()
            )
        );

        // Bid Indicators
        json.append(",\"bid_vwap\":{\"tick_vwap\":").append(bidTi.vwap != null && bidTi.vwap.length > 0 && !Double.isNaN(bidTi.vwap[bidTi.vwap.length - 1]) ? String.format(Locale.US, "%.5f", bidTi.vwap[bidTi.vwap.length - 1]) : "null").append("}");
        json.append(String.format(Locale.US, ",\"bid_atr\":%.5f", bidTi.atr[index]));
        json.append(String.format(Locale.US, ",\"bid_obv\":%.3f", bidTi.obv[index]));
        json.append(",\"bid_demas\":{");
        for (int i = 0; i < DEMA_PERIODS.length; i++) {
            json.append(String.format(Locale.US, "\"dema_%d\":%.5f", DEMA_PERIODS[i], bidTi.demas.get(DEMA_PERIODS[i])[index]));
            if (i < DEMA_PERIODS.length - 1) json.append(",");
        }
        json.append("}");
        json.append(String.format(Locale.US, ",\"bid_macd\":{\"line\":%.5f,\"signal\":%.5f,\"hist\":%.5f}", bidTi.macd[0][index], bidTi.macd[1][index], bidTi.macd[2][index]));
        json.append(String.format(Locale.US, ",\"bid_rsi\":{\"fast\":%.2f,\"slow\":%.2f}", bidTi.rsiFast[index], bidTi.rsiSlow[index]));
        json.append(String.format(Locale.US, ",\"bid_stoch\":{\"k\":%.2f,\"d\":%.2f}", bidTi.stoch[0][index], bidTi.stoch[1][index]));
        json.append(String.format(Locale.US, ",\"bid_cci\":%.2f", bidTi.cci[index]));
        json.append(String.format(Locale.US, ",\"bid_mfi\":%.2f", bidTi.mfi[index]));
        json.append(String.format(Locale.US, ",\"bid_bollinger\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", bidTi.bbands[0][index], bidTi.bbands[1][index], bidTi.bbands[2][index]));
        json.append(String.format(Locale.US, ",\"bid_keltner\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", bidTi.keltnerMiddle[index] + (bidTi.atr[index] * KELTNER_MULTIPLIER), bidTi.keltnerMiddle[index], bidTi.keltnerMiddle[index] - (bidTi.atr[index] * KELTNER_MULTIPLIER)));
        json.append(String.format(Locale.US, ",\"bid_donchian\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", bidTi.donchianUpper, bidTi.donchianMiddle, bidTi.donchianLower));
        json.append(String.format(Locale.US, ",\"bid_supertrend\":{\"upper\":%.5f,\"lower\":%.5f}", (bidBar.getHigh() + bidBar.getLow()) / 2.0 + (SUPERTREND_MULTIPLIER * bidTi.atr[index]), (bidBar.getHigh() + bidBar.getLow()) / 2.0 - (SUPERTREND_MULTIPLIER * bidTi.atr[index])));

        // Ask Indicators
        json.append(",\"ask_vwap\":{\"tick_vwap\":").append(askTi.vwap != null && askTi.vwap.length > 0 && !Double.isNaN(askTi.vwap[askTi.vwap.length - 1]) ? String.format(Locale.US, "%.5f", askTi.vwap[askTi.vwap.length - 1]) : "null").append("}");
        json.append(String.format(Locale.US, ",\"ask_atr\":%.5f", askTi.atr[index]));
        json.append(String.format(Locale.US, ",\"ask_obv\":%.3f", askTi.obv[index]));
        json.append(",\"ask_demas\":{");
        for (int i = 0; i < DEMA_PERIODS.length; i++) {
            json.append(String.format(Locale.US, "\"dema_%d\":%.5f", DEMA_PERIODS[i], askTi.demas.get(DEMA_PERIODS[i])[index]));
            if (i < DEMA_PERIODS.length - 1) json.append(",");
        }
        json.append("}");
        json.append(String.format(Locale.US, ",\"ask_macd\":{\"line\":%.5f,\"signal\":%.5f,\"hist\":%.5f}", askTi.macd[0][index], askTi.macd[1][index], askTi.macd[2][index]));
        json.append(String.format(Locale.US, ",\"ask_rsi\":{\"fast\":%.2f,\"slow\":%.2f}", askTi.rsiFast[index], askTi.rsiSlow[index]));
        json.append(String.format(Locale.US, ",\"ask_stoch\":{\"k\":%.2f,\"d\":%.2f}", askTi.stoch[0][index], askTi.stoch[1][index]));
        json.append(String.format(Locale.US, ",\"ask_cci\":%.2f", askTi.cci[index]));
        json.append(String.format(Locale.US, ",\"ask_mfi\":%.2f", askTi.mfi[index]));
        json.append(String.format(Locale.US, ",\"ask_bollinger\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", askTi.bbands[0][index], askTi.bbands[1][index], askTi.bbands[2][index]));
        json.append(String.format(Locale.US, ",\"ask_keltner\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", askTi.keltnerMiddle[index] + (askTi.atr[index] * KELTNER_MULTIPLIER), askTi.keltnerMiddle[index], askTi.keltnerMiddle[index] - (askTi.atr[index] * KELTNER_MULTIPLIER)));
        json.append(String.format(Locale.US, ",\"ask_donchian\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", askTi.donchianUpper, askTi.donchianMiddle, askTi.donchianLower));
        json.append(String.format(Locale.US, ",\"ask_supertrend\":{\"upper\":%.5f,\"lower\":%.5f}", (askBar.getHigh() + askBar.getLow()) / 2.0 + (SUPERTREND_MULTIPLIER * askTi.atr[index]), (askBar.getHigh() + askBar.getLow()) / 2.0 - (SUPERTREND_MULTIPLIER * askTi.atr[index])));

        json.append("}");
        return json.toString();
    }

    private static class VwapCalculator {
        private double priceVolumeSum = 0.0;
        private double volumeSum = 0.0;
        private long periodInterval = 0;
        private long lastResetTime = 0;

        public void addTick(double price, double volume, long tickTime, long periodInterval) {
            // Reset VWAP calculation if we've moved to a new period
            if (this.periodInterval != periodInterval || tickTime - lastResetTime >= periodInterval) {
                this.periodInterval = periodInterval;
                this.lastResetTime = tickTime - (tickTime % periodInterval); // Align to period start
                this.priceVolumeSum = 0.0;
                this.volumeSum = 0.0;
            }

            priceVolumeSum += price * volume;
            volumeSum += volume;
        }

        public double getCurrentVwap() {
            if (volumeSum == 0.0) {
                return Double.NaN;
            }
            return priceVolumeSum / volumeSum;
        }
    }


    private static class TechnicalIndicators {
        double[] atr, obv, rsiFast, rsiSlow, cci, mfi, keltnerMiddle, vwap;
        Map<Integer, double[]> demas;
        double[][] macd, bbands, stoch;
        double donchianUpper = Double.NaN, donchianMiddle = Double.NaN, donchianLower = Double.NaN;
    }

    @Override
    public void onTick(Instrument i, ITick t) {}

    @Override
    public void onBar(Instrument i, Period p, IBar a, IBar b) {}

    @Override
    public void onMessage(IMessage m) {}

    @Override
    public void onAccount(IAccount a) {}
}
