package markSmith;

import com.dukascopy.api.*;
import com.rabbitmq.client.ConnectionFactory;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.Channel;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

@Library("rabbitmq-client.jar")
@RequiresFullAccess
public class USDJPY_BarDataFeeder implements IStrategy {

    // --- Instrument Configuration (CHANGE THESE FOR EACH NEW INSTRUMENT) ---
    private static final Instrument INSTRUMENT = Instrument.USDJPY;
    private static final int PAIR_ID = 2;

    // --- Fixed Configuration ---
    private static final String AMQP_HOSTNAME = "localhost";
    private static final int AMQP_PORT = 5672;
    private static final String AMQP_USERNAME = "mark";
    private static final String AMQP_PASSWORD = "mark";
    // Queue name is now instrument-specific, e.g., "AUDUSD_Market_Data_Bars"
    private static final String AMQP_QUEUE_NAME = "USDJPY_Market_Data_Bars";

    // --- Technical Indicator Configuration ---
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
    private static final int MIN_BARS_FOR_INDICATORS = 250; // Increased for DEMA(200)

    // --- JForex and AMQP State ---
    private IConsole console;
    private IHistory history;
    private IIndicators indicators;
    private Connection amqpConnection;
    private Channel amqpChannel;
    private final Object amqpConnectionLock = new Object();

    // --- Period Configuration ---
    private static final Set<Period> SUPPORTED_PERIODS = Set.of(
        Period.TEN_SECS,
        Period.ONE_MIN,
        Period.FIVE_MINS,
        Period.TEN_MINS,
        Period.FIFTEEN_MINS,
        Period.ONE_HOUR,
        Period.FOUR_HOURS,
        Period.DAILY
    );

    // --- VWAP Calculation State ---
    private final Map<Period, VwapCalculator> tickVwapCalculators = new HashMap<>();
    private final Map<Period, VwapCalculator> barVwapCalculators = new HashMap<>();

    // --- Statistics ---
    private final AtomicLong barsSent = new AtomicLong(0);
    private final AtomicLong errors = new AtomicLong(0);

    @Override
    public void onStart(IContext context) throws JFException {
        this.console = context.getConsole();
        this.history = context.getHistory();
        this.indicators = context.getIndicators();
        console.getOut().println("Starting Enhanced BarDataFeeder strategy for " + INSTRUMENT.name() + " ONLY...");

        // CRITICAL: Force subscription to AUDUSD only - try multiple approaches
        Set<Instrument> instrumentSet = Collections.singleton(INSTRUMENT);

        // First approach: Standard subscription
        context.setSubscribedInstruments(instrumentSet, true);
        console.getOut().println("DEBUG: Requested subscription to: " + instrumentSet.toString());

        // Second approach: Clear all subscriptions first, then subscribe to AUDUSD
        try {
            context.setSubscribedInstruments(Collections.emptySet(), true);
            Thread.sleep(100); // Small delay
            context.setSubscribedInstruments(instrumentSet, true);
            console.getOut().println("DEBUG: Attempted to clear and re-subscribe to: " + instrumentSet.toString());
        } catch (InterruptedException e) {
            console.getErr().println("Interrupted during subscription setup");
        }

        // Verify subscription
        Set<Instrument> subscribedInstruments = context.getSubscribedInstruments();
        console.getOut().println("DEBUG: JForex confirmed subscribed instruments: " + subscribedInstruments.toString());

        if (subscribedInstruments.size() != 1 || !subscribedInstruments.contains(INSTRUMENT)) {
            console.getErr().println("WARNING: JForex ignored subscription request!");
            console.getErr().println("SOLUTION: Strategy will filter and ONLY process " + INSTRUMENT.name() + " bars");
            console.getErr().println("All other instruments will be ignored with warnings");
        } else {
            console.getOut().println("SUCCESS: Subscription limited to " + INSTRUMENT.name() + " only");
        }

        // Initialize VWAP calculators for each period
        for (Period period : SUPPORTED_PERIODS) {
            tickVwapCalculators.put(period, new VwapCalculator());
            barVwapCalculators.put(period, new VwapCalculator());
        }

        if (!initializeAmqp()) {
            console.getErr().println("FATAL: Could not establish AMQP connection. Stopping strategy.");
            context.stop();
        }
    }

    @Override
    public void onStop() throws JFException {
        console.getOut().println("Stopping Enhanced BarDataFeeder strategy for all instruments...");
        synchronized (amqpConnectionLock) {
            try {
                if (amqpChannel != null && amqpChannel.isOpen()) amqpChannel.close();
                if (amqpConnection != null && amqpConnection.isOpen()) amqpConnection.close();
            } catch (Exception e) {
                console.getErr().println("Error closing AMQP connection: " + e.getMessage());
            }
        }
        console.getOut().println("Multi-instrument Feeder stopped. Bars Sent: " + barsSent.get() + ", Errors: " + errors.get());
    }

    @Override
    public void onTick(Instrument instrument, ITick tick) throws JFException {
        if (!instrument.equals(INSTRUMENT)) return;

        // Update tick-based VWAP for all periods
        double midPrice = (tick.getAsk() + tick.getBid()) / 2.0;
        double volume = (tick.getAskVolume() + tick.getBidVolume()) / 2.0;

        for (Period period : SUPPORTED_PERIODS) {
            VwapCalculator calculator = tickVwapCalculators.get(period);
            if (calculator != null) {
                calculator.addTick(midPrice, volume, tick.getTime(), period.getInterval());
            }
        }
    }

    @Override
    public void onBar(Instrument instrument, Period period, IBar askBar, IBar bidBar) throws JFException {
        // --- FIX: ADDED THIS CHECK TO IGNORE UNWANTED INSTRUMENTS ---
        if (!instrument.equals(INSTRUMENT)) {
            return;
        }
        // --- END FIX ---

        if (!SUPPORTED_PERIODS.contains(period)) {
            return;
        }

        if (bidBar == null || askBar == null || bidBar.getTime() != askBar.getTime()) {
            errors.incrementAndGet();
            return;
        }

        try {
            // Update bar-based VWAP
            double midClose = (askBar.getClose() + bidBar.getClose()) / 2.0;
            double totalVolume = askBar.getVolume() + bidBar.getVolume();
            VwapCalculator barVwapCalc = barVwapCalculators.get(period);
            if (barVwapCalc != null) {
                barVwapCalc.addTick(midClose, totalVolume, bidBar.getTime(), period.getInterval());
            }

            // Get technical indicators for both bid and ask
            TechnicalIndicators bidIndicators = calculateTechnicalIndicators(instrument, period, bidBar.getTime(), OfferSide.BID);
            TechnicalIndicators askIndicators = calculateTechnicalIndicators(instrument, period, askBar.getTime(), OfferSide.ASK);

            String jsonMessage = formatBarToJson(instrument, period, askBar, bidBar, bidIndicators, askIndicators);
            sendMessage(jsonMessage);
        } catch (Exception e) {
            errors.incrementAndGet();
            console.getErr().println("Error processing bar for " + instrument + " " + period + ": " + e.getMessage());
        }
    }

    private TechnicalIndicators calculateTechnicalIndicators(Instrument instrument, Period period, long barTime, OfferSide offerSide) {
        TechnicalIndicators result = new TechnicalIndicators();

        try {
            // Get VWAP values
            VwapCalculator tickVwap = tickVwapCalculators.get(period);
            if (tickVwap != null) result.tickVwap = tickVwap.getCurrentVwap();

            // Check if we have enough historical data
            List<IBar> historicalBars = history.getBars(instrument, period, offerSide,
                Filter.WEEKENDS, MIN_BARS_FOR_INDICATORS, barTime, 0);

            if (historicalBars.size() < MIN_BARS_FOR_INDICATORS) {
                return result; // Not enough data
            }

            // --- Bulk-fetch all indicators ---
            double[] atrVals = indicators.atr(instrument, period, offerSide, ATR_PERIOD, Filter.WEEKENDS, 1, barTime, 0);
            double[] rsiFastVals = indicators.rsi(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, RSI_FAST_PERIOD, Filter.WEEKENDS, 1, barTime, 0);
            double[] rsiSlowVals = indicators.rsi(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, RSI_SLOW_PERIOD, Filter.WEEKENDS, 1, barTime, 0);
            double[] cciVals = indicators.cci(instrument, period, offerSide, CCI_PERIOD, Filter.WEEKENDS, 1, barTime, 0);
            double[] mfiVals = indicators.mfi(instrument, period, offerSide, MFI_PERIOD, Filter.WEEKENDS, 1, barTime, 0);
            double[] obvVals = indicators.obv(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, offerSide, Filter.WEEKENDS, 1, barTime, 0);

            result.atr = atrVals[0];
            result.rsiFast = rsiFastVals[0];
            result.rsiSlow = rsiSlowVals[0];
            result.cci = cciVals[0];
            result.mfi = mfiVals[0];
            result.obv = obvVals[0];

            // DEMAs
            result.demas = new HashMap<>();
            for (int p : DEMA_PERIODS) {
                double[] demaVals = indicators.dema(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, p, Filter.WEEKENDS, 1, barTime, 0);
                result.demas.put(p, demaVals[0]);
            }

            // MACD
            double[][] macdVals = indicators.macd(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, MACD_FAST_PERIOD, MACD_SLOW_PERIOD, MACD_SIGNAL_PERIOD, Filter.WEEKENDS, 1, barTime, 0);
            result.macdLine = macdVals[0][0];
            result.signalLine = macdVals[1][0];
            result.histogram = macdVals[2][0];

            // Bollinger Bands
            double[][] bbands = indicators.bbands(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, BOLLINGER_PERIOD, BOLLINGER_DEVIATION, BOLLINGER_DEVIATION, IIndicators.MaType.SMA, Filter.WEEKENDS, 1, barTime, 0);
            result.bbUpper = bbands[0][0];
            result.bbMiddle = bbands[1][0];
            result.bbLower = bbands[2][0];

            // Stochastics
            double[][] stochVals = indicators.stoch(instrument, period, offerSide, STOCH_K_PERIOD, STOCH_K_SLOW_PERIOD, IIndicators.MaType.SMA, STOCH_D_PERIOD, IIndicators.MaType.SMA, Filter.WEEKENDS, 1, barTime, 0);
            result.stochK = stochVals[0][0];
            result.stochD = stochVals[1][0];

            // Donchian Channels (Manual Calculation)
            List<IBar> donchianHistory = history.getBars(instrument, period, offerSide, Filter.WEEKENDS, DONCHIAN_PERIOD, barTime, 0);
            result.donchianUpper = donchianHistory.stream().mapToDouble(IBar::getHigh).max().orElse(Double.NaN);
            result.donchianLower = donchianHistory.stream().mapToDouble(IBar::getLow).min().orElse(Double.NaN);
            result.donchianMiddle = (result.donchianUpper + result.donchianLower) / 2.0;

            // Keltner Channels
            double[] keltnerMiddleVals = indicators.sma(instrument, period, offerSide, IIndicators.AppliedPrice.CLOSE, KELTNER_PERIOD, Filter.WEEKENDS, 1, barTime, 0);
            double keltnerMiddle = keltnerMiddleVals[0];
            result.kcUpper = keltnerMiddle + (result.atr * KELTNER_MULTIPLIER);
            result.kcMiddle = keltnerMiddle;
            result.kcLower = keltnerMiddle - (result.atr * KELTNER_MULTIPLIER);

            // SuperTrend
            IBar currentBar = historicalBars.get(historicalBars.size() - 1);
            double midPrice = (currentBar.getHigh() + currentBar.getLow()) / 2.0;
            result.superTrendUpper = midPrice + (SUPERTREND_MULTIPLIER * result.atr);
            result.superTrendLower = midPrice - (SUPERTREND_MULTIPLIER * result.atr);

        } catch (Exception e) {
            console.getErr().println("Error calculating technical indicators: " + e.getMessage());
        }

        return result;
    }

    private boolean initializeAmqp() {
        synchronized (amqpConnectionLock) {
            try {
                console.getOut().println("Initializing AMQP connection to " + AMQP_HOSTNAME + ":" + AMQP_PORT);
                ConnectionFactory factory = new ConnectionFactory();
                factory.setHost(AMQP_HOSTNAME);
                factory.setPort(AMQP_PORT);
                factory.setUsername(AMQP_USERNAME);
                factory.setPassword(AMQP_PASSWORD);
                factory.setAutomaticRecoveryEnabled(true);

                this.amqpConnection = factory.newConnection();
                this.amqpChannel = amqpConnection.createChannel();
                this.amqpChannel.queueDeclare(AMQP_QUEUE_NAME, true, false, false, null);

                console.getOut().println("AMQP connection established. Sending bars to queue '" + AMQP_QUEUE_NAME + "'.");
                return true;
            } catch (Exception e) {
                console.getErr().println("AMQP initialization failed: " + e.getMessage());
                return false;
            }
        }
    }

    private String formatBarToJson(
        Instrument instrument,
        Period period,
        IBar askBar,
        IBar bidBar,
        TechnicalIndicators bidTi,
        TechnicalIndicators askTi
    ) {
        if (!instrument.equals(INSTRUMENT)) {
            throw new RuntimeException(
                "CRITICAL ERROR: Attempted to format JSON for wrong instrument: " +
                instrument.name() +
                " (Expected: " +
                INSTRUMENT.name() +
                ")"
            );
        }

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
        json.append(",\"instrument\":\"" + instrumentName + "\"");
        json.append(",\"period\":\"" + period.name() + "\"");

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
        json.append(",\"bid_vwap\":{\"tick_vwap\":").append(bidTi.tickVwap != Double.NaN ? String.format(Locale.US, "%.5f", bidTi.tickVwap) : "null").append("}");
        json.append(String.format(Locale.US, ",\"bid_atr\":%.5f", bidTi.atr));
        json.append(String.format(Locale.US, ",\"bid_obv\":%.3f", bidTi.obv));
        json.append(",\"bid_demas\":{");
        for (int bid_i = 0; bid_i < DEMA_PERIODS.length; bid_i++) {
            json.append(String.format(Locale.US, "\"dema_%d\":%.5f", DEMA_PERIODS[bid_i], bidTi.demas.get(DEMA_PERIODS[bid_i])));
            if (bid_i < DEMA_PERIODS.length - 1) json.append(",");
        }
        json.append("}");
        json.append(String.format(Locale.US, ",\"bid_macd\":{\"line\":%.5f,\"signal\":%.5f,\"hist\":%.5f}", bidTi.macdLine, bidTi.signalLine, bidTi.histogram));
        json.append(String.format(Locale.US, ",\"bid_rsi\":{\"fast\":%.2f,\"slow\":%.2f}", bidTi.rsiFast, bidTi.rsiSlow));
        json.append(String.format(Locale.US, ",\"bid_stoch\":{\"k\":%.2f,\"d\":%.2f}", bidTi.stochK, bidTi.stochD));
        json.append(String.format(Locale.US, ",\"bid_cci\":%.2f", bidTi.cci));
        json.append(String.format(Locale.US, ",\"bid_mfi\":%.2f", bidTi.mfi));
        json.append(String.format(Locale.US, ",\"bid_bollinger\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", bidTi.bbUpper, bidTi.bbMiddle, bidTi.bbLower));
        json.append(String.format(Locale.US, ",\"bid_keltner\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", bidTi.kcUpper, bidTi.kcMiddle, bidTi.kcLower));
        json.append(String.format(Locale.US, ",\"bid_donchian\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", bidTi.donchianUpper, bidTi.donchianMiddle, bidTi.donchianLower));
        json.append(String.format(Locale.US, ",\"bid_supertrend\":{\"upper\":%.5f,\"lower\":%.5f}", bidTi.superTrendUpper, bidTi.superTrendLower));

        // Ask Indicators
        json.append(",\"ask_vwap\":{\"tick_vwap\":").append(askTi.tickVwap != Double.NaN ? String.format(Locale.US, "%.5f", askTi.tickVwap) : "null").append("}");
        json.append(String.format(Locale.US, ",\"ask_atr\":%.5f", askTi.atr));
        json.append(String.format(Locale.US, ",\"ask_obv\":%.3f", askTi.obv));
        json.append(",\"ask_demas\":{");
        for (int ask_i = 0; ask_i < DEMA_PERIODS.length; ask_i++) {
            json.append(String.format(Locale.US, "\"dema_%d\":%.5f", DEMA_PERIODS[ask_i], askTi.demas.get(DEMA_PERIODS[ask_i])));
            if (ask_i < DEMA_PERIODS.length - 1) json.append(",");
        }
        json.append("}");
        json.append(String.format(Locale.US, ",\"ask_macd\":{\"line\":%.5f,\"signal\":%.5f,\"hist\":%.5f}", askTi.macdLine, askTi.signalLine, askTi.histogram));
        json.append(String.format(Locale.US, ",\"ask_rsi\":{\"fast\":%.2f,\"slow\":%.2f}", askTi.rsiFast, askTi.rsiSlow));
        json.append(String.format(Locale.US, ",\"ask_stoch\":{\"k\":%.2f,\"d\":%.2f}", askTi.stochK, askTi.stochD));
        json.append(String.format(Locale.US, ",\"ask_cci\":%.2f", askTi.cci));
        json.append(String.format(Locale.US, ",\"ask_mfi\":%.2f", askTi.mfi));
        json.append(String.format(Locale.US, ",\"ask_bollinger\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", askTi.bbUpper, askTi.bbMiddle, askTi.bbLower));
        json.append(String.format(Locale.US, ",\"ask_keltner\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", askTi.kcUpper, askTi.kcMiddle, askTi.kcLower));
        json.append(String.format(Locale.US, ",\"ask_donchian\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f}", askTi.donchianUpper, askTi.donchianMiddle, askTi.donchianLower));
        json.append(String.format(Locale.US, ",\"ask_supertrend\":{\"upper\":%.5f,\"lower\":%.5f}", askTi.superTrendUpper, askTi.superTrendLower));

        json.append("}");
        return json.toString();
    }

    private void sendMessage(String message) throws IOException {
        synchronized (amqpConnectionLock) {
            if (amqpChannel == null || !amqpChannel.isOpen()) {
                errors.incrementAndGet();
                return;
            }
            amqpChannel.basicPublish("", AMQP_QUEUE_NAME, null, message.getBytes(StandardCharsets.UTF_8));
            barsSent.incrementAndGet();
        }
    }

    @Override
    public void onAccount(IAccount account) throws JFException {
        // Account information handling - not needed for this strategy
    }

    @Override
    public void onMessage(IMessage message) throws JFException {
        // Message handling - not needed for this strategy
    }

    // --- Helper Classes ---

    private static class TechnicalIndicators {
        double tickVwap = Double.NaN;
        double barVwap = Double.NaN;
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
}
