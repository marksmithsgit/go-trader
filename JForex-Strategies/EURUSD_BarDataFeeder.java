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
public class EURUSD_BarDataFeeder implements IStrategy {

    // --- Instrument Configuration (CHANGE THESE FOR EACH NEW INSTRUMENT) ---
    private static final Instrument INSTRUMENT = Instrument.EURUSD;
    private static final int PAIR_ID = 1;

    // --- Fixed Configuration ---
    private static final String AMQP_HOSTNAME = "localhost";
    private static final int AMQP_PORT = 5672;
    private static final String AMQP_USERNAME = "mark";
    private static final String AMQP_PASSWORD = "mark";
    // Queue name is now instrument-specific, e.g., "Market_Data_Bars_EURUSD"
    private static final String AMQP_QUEUE_NAME = "Market_Data_Bars_" + INSTRUMENT.name();

    // --- Technical Indicator Configuration ---
    private static final int[] EMA_PERIODS = {5, 8, 30, 50};
    private static final int DONCHIAN_PERIOD = 20;
    private static final int BOLLINGER_PERIOD = 10;
    private static final double BOLLINGER_DEVIATION = 2.0;
    private static final int MIN_BARS_FOR_INDICATORS = Math.max(Math.max(50, DONCHIAN_PERIOD), BOLLINGER_PERIOD);

    // --- JForex and AMQP State ---
    private IConsole console;
    private IHistory history;
    private IIndicators indicators;
    private Connection amqpConnection;
    private Channel amqpChannel;
    private final Object amqpConnectionLock = new Object();

    // --- Period Configuration ---
    private static final Map<Period, Long> PERIOD_DURATIONS;
    static {
        Map<Period, Long> map = new LinkedHashMap<>();
        map.put(Period.TEN_SECS, 10_000L);
        map.put(Period.ONE_MIN, 60_000L);
        map.put(Period.FIVE_MINS, 300_000L);
        map.put(Period.TEN_MINS, 600_000L);
        map.put(Period.FIFTEEN_MINS, 900_000L);
        PERIOD_DURATIONS = Collections.unmodifiableMap(map);
    }
    private static final Set<Period> SUPPORTED_PERIODS = PERIOD_DURATIONS.keySet();

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
        
        // CRITICAL: Force subscription to EURUSD only - try multiple approaches
        Set<Instrument> instrumentSet = Collections.singleton(INSTRUMENT);
        
        // First approach: Standard subscription
        context.setSubscribedInstruments(instrumentSet, true);
        console.getOut().println("DEBUG: Requested subscription to: " + instrumentSet.toString());
        
        // Second approach: Clear all subscriptions first, then subscribe to EURUSD
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
                calculator.addTick(midPrice, volume, tick.getTime(), PERIOD_DURATIONS.get(period));
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
                barVwapCalc.addTick(midClose, totalVolume, bidBar.getTime(), PERIOD_DURATIONS.get(period));
            }

            // Get technical indicators
            TechnicalIndicators indicators = calculateTechnicalIndicators(instrument, period, bidBar.getTime());
            
            String jsonMessage = formatBarToJson(instrument, period, askBar, bidBar, indicators);
            sendMessage(jsonMessage);
        } catch (Exception e) {
            errors.incrementAndGet();
            console.getErr().println("Error processing bar for " + instrument + " " + period + ": " + e.getMessage());
        }
    }

    private TechnicalIndicators calculateTechnicalIndicators(Instrument instrument, Period period, long barTime) {
        TechnicalIndicators result = new TechnicalIndicators();
        
        try {
            // Get VWAP values
            VwapCalculator tickVwap = tickVwapCalculators.get(period);
            VwapCalculator barVwap = barVwapCalculators.get(period);
            
            if (tickVwap != null) result.tickVwap = tickVwap.getCurrentVwap();
            if (barVwap != null) result.barVwap = barVwap.getCurrentVwap();
            
            // Check if we have enough historical data
            List<IBar> historicalBars = history.getBars(instrument, period, OfferSide.BID, 
                Filter.WEEKENDS, MIN_BARS_FOR_INDICATORS + 1, barTime, 0);
                
            if (historicalBars.size() < MIN_BARS_FOR_INDICATORS) {
                return result; // Return with null values for indicators
            }
            
            // Calculate EMAs
            result.emas = new HashMap<>();
            for (int emaPeriod : EMA_PERIODS) {
                if (historicalBars.size() >= emaPeriod) {
                    double[] emaValues = indicators.ema(instrument, period, OfferSide.BID, 
                        IIndicators.AppliedPrice.CLOSE, emaPeriod, Filter.WEEKENDS, 1, barTime, 0);
                    if (emaValues != null && emaValues.length > 0 && !Double.isNaN(emaValues[0])) {
                        result.emas.put(emaPeriod, emaValues[0]);
                    }
                }
            }
            
            // Calculate Donchian Channels
            if (historicalBars.size() >= DONCHIAN_PERIOD) {
                double[] highestValues = new double[DONCHIAN_PERIOD];
                double[] lowestValues = new double[DONCHIAN_PERIOD];
                
                for (int i = 0; i < DONCHIAN_PERIOD && i < historicalBars.size(); i++) {
                    IBar bar = historicalBars.get(historicalBars.size() - 1 - i);
                    highestValues[i] = bar.getHigh();
                    lowestValues[i] = bar.getLow();
                }
                
                result.donchianUpper = Arrays.stream(highestValues).max().orElse(Double.NaN);
                result.donchianLower = Arrays.stream(lowestValues).min().orElse(Double.NaN);
                result.donchianMiddle = (result.donchianUpper + result.donchianLower) / 2.0;
            }
            
            // Calculate Bollinger Bands
            if (historicalBars.size() >= BOLLINGER_PERIOD) {
                double[][] bbValues = indicators.bbands(instrument, period, OfferSide.BID,
                    IIndicators.AppliedPrice.CLOSE, BOLLINGER_PERIOD, BOLLINGER_DEVIATION, BOLLINGER_DEVIATION,
                    IIndicators.MaType.SMA, Filter.WEEKENDS, 3, barTime, 0);
                
                if (bbValues != null && bbValues.length >= 3 && bbValues[0] != null && bbValues[0].length > 0) {
                    result.bollingerUpper = bbValues[0][0];  // Upper band
                    result.bollingerMiddle = bbValues[1][0]; // Middle line (SMA)
                    result.bollingerLower = bbValues[2][0];  // Lower band
                }
            }
            
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

    private String formatBarToJson(Instrument instrument, Period period, IBar askBar, IBar bidBar, TechnicalIndicators indicators) {
        // EMERGENCY FAILSAFE: Absolutely ensure we're only processing EURUSD
        if (!instrument.equals(INSTRUMENT)) {
            throw new RuntimeException("CRITICAL ERROR: Attempted to format JSON for wrong instrument: " + instrument.name() + " (Expected: " + INSTRUMENT.name() + ")");
        }
        
        long barStartTimestamp = bidBar.getTime();
        long periodDurationMs = PERIOD_DURATIONS.get(period);
        long barEndTimestamp = barStartTimestamp + periodDurationMs;
        long producedAt = System.currentTimeMillis();
        
        StringBuilder json = new StringBuilder();
        json.append(String.format(Locale.US,
            "{\"produced_at\":%d,\"bar_start_timestamp\":%d,\"bar_end_timestamp\":%d,\"pairId\":%d,\"instrument\":\"%s\",\"period\":\"%s\"," +
            "\"bid\":{\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%.3f}," +
            "\"ask\":{\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%.3f}",
            producedAt, barStartTimestamp, barEndTimestamp, PAIR_ID, instrument.name(), period.name(),
            bidBar.getOpen(), bidBar.getHigh(), bidBar.getLow(), bidBar.getClose(), bidBar.getVolume(),
            askBar.getOpen(), askBar.getHigh(), askBar.getLow(), askBar.getClose(), askBar.getVolume()));
        
        // Add VWAP data
        json.append(",\"vwap\":{");
        if (!Double.isNaN(indicators.tickVwap)) {
            json.append(String.format(Locale.US, "\"tick_vwap\":%.5f", indicators.tickVwap));
        } else {
            json.append("\"tick_vwap\":null");
        }
        if (!Double.isNaN(indicators.barVwap)) {
            json.append(String.format(Locale.US, ",\"bar_vwap\":%.5f", indicators.barVwap));
        } else {
            json.append(",\"bar_vwap\":null");
        }
        json.append("}");
        
        // Add EMAs
        json.append(",\"emas\":{");
        boolean first = true;
        for (int period_ : EMA_PERIODS) {
            if (!first) json.append(",");
            Double emaValue = indicators.emas.get(period_);
            if (emaValue != null && !Double.isNaN(emaValue)) {
                json.append(String.format(Locale.US, "\"ema_%d\":%.5f", period_, emaValue));
            } else {
                json.append(String.format("\"ema_%d\":null", period_));
            }
            first = false;
        }
        json.append("}");
        
        // Add Donchian Channels
        json.append(",\"donchian\":{");
        if (!Double.isNaN(indicators.donchianUpper)) {
            json.append(String.format(Locale.US, "\"upper\":%.5f", indicators.donchianUpper));
        } else {
            json.append("\"upper\":null");
        }
        if (!Double.isNaN(indicators.donchianMiddle)) {
            json.append(String.format(Locale.US, ",\"middle\":%.5f", indicators.donchianMiddle));
        } else {
            json.append(",\"middle\":null");
        }
        if (!Double.isNaN(indicators.donchianLower)) {
            json.append(String.format(Locale.US, ",\"lower\":%.5f", indicators.donchianLower));
        } else {
            json.append(",\"lower\":null");
        }
        json.append("}");
        
        // Add Bollinger Bands
        json.append(",\"bollinger\":{");
        if (!Double.isNaN(indicators.bollingerUpper)) {
            json.append(String.format(Locale.US, "\"upper\":%.5f", indicators.bollingerUpper));
        } else {
            json.append("\"upper\":null");
        }
        if (!Double.isNaN(indicators.bollingerMiddle)) {
            json.append(String.format(Locale.US, ",\"middle\":%.5f", indicators.bollingerMiddle));
        } else {
            json.append(",\"middle\":null");
        }
        if (!Double.isNaN(indicators.bollingerLower)) {
            json.append(String.format(Locale.US, ",\"lower\":%.5f", indicators.bollingerLower));
        } else {
            json.append(",\"lower\":null");
        }
        json.append("}");
        
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

    // --- Helper Classes ---
    
    private static class TechnicalIndicators {
        double tickVwap = Double.NaN;
        double barVwap = Double.NaN;
        Map<Integer, Double> emas = new HashMap<>();
        double donchianUpper = Double.NaN;
        double donchianMiddle = Double.NaN;
        double donchianLower = Double.NaN;
        double bollingerUpper = Double.NaN;
        double bollingerMiddle = Double.NaN;
        double bollingerLower = Double.NaN;
    }
    
    private static class VwapCalculator {
        private double cumulativePriceVolume = 0.0;
        private double cumulativeVolume = 0.0;
        private long lastResetTime = 0;
        
        public void addTick(double price, double volume, long timestamp, long periodDurationMs) {
            // Reset VWAP calculation at the start of each new period
            long periodStart = (timestamp / periodDurationMs) * periodDurationMs;
            if (periodStart != lastResetTime) {
                cumulativePriceVolume = 0.0;
                cumulativeVolume = 0.0;
                lastResetTime = periodStart;
            }
            
            if (volume > 0) {
                cumulativePriceVolume += price * volume;
                cumulativeVolume += volume;
            }
        }
        
        public double getCurrentVwap() {
            return cumulativeVolume > 0 ? cumulativePriceVolume / cumulativeVolume : Double.NaN;
        }
    }

    // --- Unused IStrategy Methods ---
    @Override public void onMessage(IMessage m) {}
    @Override public void onAccount(IAccount a) {}
}