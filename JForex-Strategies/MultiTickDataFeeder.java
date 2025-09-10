package markSmith;

import com.dukascopy.api.*;
import com.rabbitmq.client.ConnectionFactory;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.Channel;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

/**
 * =================================================================================================================
 * MultiTickDataFeeder - High-Frequency Live Tick Data Producer
 * =================================================================================================================
 *
 * Description:
 * This JForex strategy captures every live tick for a configured list of instruments and publishes
 * them as lightweight JSON messages to a single RabbitMQ queue. It is designed for high-throughput,
 * low-latency performance by performing minimal work on the JForex event thread.
 *
 * Features:
 * - Multi-Instrument: Efficiently handles ticks from multiple currency pairs in a single process.
 * - Low Latency: Optimized for speed, with no complex calculations.
 * - Centralized Configuration: The list of instruments and AMQP settings are defined in a single
 * block at the top of the class for easy modification.
 *
 * AMQP Integration:
 * - Connects to a local RabbitMQ instance.
 * - Publishes all tick messages to a single, durable queue (e.g., "Market_Data_Ticks").
 *
 * Author: Mark Smith & Gemini
 * Version: 1.0
 *
 * =================================================================================================================
 */
@Library("rabbitmq-client.jar")
@RequiresFullAccess
public class MultiTickDataFeeder implements IStrategy {

    // =============================================================================================================
    // --- CENTRALIZED CONFIGURATION ---
    // =============================================================================================================

    // --- Instrument & AMQP Configuration ---
    private static final String AMQP_HOSTNAME = "localhost";
    private static final int AMQP_PORT = 5672;
    private static final String AMQP_USERNAME = "mark";
    private static final String AMQP_PASSWORD = "mark";
    private static final String AMQP_QUEUE_NAME = "Market_Data_Ticks";

    // --- Instrument Configuration ---
    // The list of instruments to process. Add or remove as needed.
    private static final List<Instrument> INSTRUMENTS_TO_PROCESS = Arrays.asList(
            Instrument.EURUSD, Instrument.GBPUSD, Instrument.USDJPY, Instrument.USDCHF,
            Instrument.AUDUSD, Instrument.USDCAD, Instrument.NZDUSD, Instrument.EURJPY,
            Instrument.GBPJPY, Instrument.EURGBP
    );

    // --- Automatically create a Set for fast filtering ---
    private static final Set<Instrument> INSTRUMENT_SET = new HashSet<>(INSTRUMENTS_TO_PROCESS);

    // --- Map instruments to their pair IDs (consistent with bar data strategies) ---
    private static final Map<Instrument, Integer> INSTRUMENT_PAIR_IDS = new HashMap<>();
    static {
        // Pair ID mapping consistent with StandingData.md and bar data strategies
        INSTRUMENT_PAIR_IDS.put(Instrument.EURUSD, 1);
        INSTRUMENT_PAIR_IDS.put(Instrument.USDJPY, 2);
        INSTRUMENT_PAIR_IDS.put(Instrument.GBPUSD, 3);
        INSTRUMENT_PAIR_IDS.put(Instrument.USDCHF, 4);
        INSTRUMENT_PAIR_IDS.put(Instrument.AUDUSD, 5);
        INSTRUMENT_PAIR_IDS.put(Instrument.USDCAD, 6);
        INSTRUMENT_PAIR_IDS.put(Instrument.NZDUSD, 7);
        INSTRUMENT_PAIR_IDS.put(Instrument.EURJPY, 8);
        INSTRUMENT_PAIR_IDS.put(Instrument.GBPJPY, 9);
        INSTRUMENT_PAIR_IDS.put(Instrument.EURGBP, 10);
    }

    // =============================================================================================================
    // --- STRATEGY STATE AND LOGIC ---
    // =============================================================================================================

    private IConsole console;
    private Connection amqpConnection;
    private Channel amqpChannel;
    private final Object amqpConnectionLock = new Object();
    private final AtomicLong ticksSent = new AtomicLong(0);

    @Override
    public void onStart(IContext context) throws JFException {
        this.console = context.getConsole();
        console.getOut().println("Starting MultiTickDataFeeder for " + INSTRUMENTS_TO_PROCESS.size() + " instruments...");
        context.setSubscribedInstruments(new HashSet<>(INSTRUMENTS_TO_PROCESS), true);

        if (!initializeAmqp()) {
            console.getErr().println("FATAL: Could not establish AMQP connection. Stopping strategy.");
            context.stop();
        }
    }

    @Override
    public void onStop() throws JFException {
        console.getOut().println("Stopping MultiTickDataFeeder strategy...");
        synchronized (amqpConnectionLock) {
            try {
                if (amqpChannel != null && amqpChannel.isOpen()) amqpChannel.close();
                if (amqpConnection != null && amqpConnection.isOpen()) amqpConnection.close();
            } catch (Exception e) {
                console.getErr().println("Error closing AMQP connection: " + e.getMessage());
            }
        }
        console.getOut().println("Strategy stopped. Ticks Sent: " + ticksSent.get());
    }

    @Override
    public void onTick(Instrument instrument, ITick tick) throws JFException {
        // Filter to ensure we only process instruments from our configured list
        if (!INSTRUMENT_SET.contains(instrument)) {
            return;
        }

        try {
            String jsonMessage = formatTickToJson(instrument, tick);
            sendMessage(jsonMessage);
        } catch (Exception e) {
            console.getErr().println("Error processing tick for " + instrument + ": " + e.getMessage());
        }
    }

    private String formatTickToJson(Instrument instrument, ITick tick) {
        long producedAt = System.currentTimeMillis();
        int pairId = INSTRUMENT_PAIR_IDS.getOrDefault(instrument, -1);
        String instrumentName = instrument.name().replace("/", "");

        return String.format(Locale.US,
            "{\"produced_at\":%d,\"timestamp\":%d,\"pairId\":%d,\"instrument\":\"%s\",\"bid\":%.5f,\"ask\":%.5f,\"bidVol\":%.3f,\"askVol\":%.3f}",
            producedAt,
            tick.getTime(),
            pairId,
            instrumentName,
            tick.getBid(),
            tick.getAsk(),
            tick.getBidVolume(),
            tick.getAskVolume()
        );
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

                console.getOut().println("AMQP connection established. Sending ticks to queue '" + AMQP_QUEUE_NAME + "'.");
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
                console.getErr().println("WARNING: Cannot send tick message - AMQP channel is not available");
                return;
            }

            try {
                amqpChannel.basicPublish("", AMQP_QUEUE_NAME, null, message.getBytes(StandardCharsets.UTF_8));
                ticksSent.incrementAndGet();
            } catch (IOException e) {
                console.getErr().println("ERROR: Failed to send tick message to queue '" + AMQP_QUEUE_NAME + "': " + e.getMessage());
                throw e; // Re-throw to allow calling code to handle the error
            }
        }
    }

    // --- Unused IStrategy Methods ---
    @Override public void onBar(Instrument i, Period p, IBar a, IBar b) {}
    @Override public void onMessage(IMessage m) {}
    @Override public void onAccount(IAccount a) {}
}