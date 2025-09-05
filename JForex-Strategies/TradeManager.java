package markSmith;

import com.dukascopy.api.*;
import com.rabbitmq.client.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Strategy 4: Trade Manager
 * Handles account monitoring and trade execution using RabbitMQ.
 * Optimized for low latency with no configuration popups.
 */
@Library("rabbitmq-client.jar")
@RequiresFullAccess
public class TradeManager implements IStrategy {

    // --- Fixed Configuration (no popups) ---
    private static final String AMQP_HOSTNAME = "localhost";
    private static final int AMQP_PORT = 5672;
    private static final String AMQP_USERNAME = "mark";
    private static final String AMQP_PASSWORD = "mark";
    private static final String ACCOUNT_INFO_QUEUE_NAME = "Account_Info";
    private static final String TRADE_COMMANDS_QUEUE_NAME = "Trade_Commands";

    // --- JForex and RabbitMQ state ---
    private IConsole console;
    private IContext context;
    private IEngine engine;
    private IAccount account;
    private Connection amqpConnection;
    private Channel amqpChannel;
    private final Object amqpConnectionLock = new Object();
    private ScheduledExecutorService scheduler;

    @Override
    public void onStart(IContext context) throws JFException {
        this.context = context;
        this.console = context.getConsole();
        this.engine = context.getEngine();
        this.account = context.getAccount();
        console.getOut().println("Starting TradeManager strategy...");

        if (initializeAmqp()) {
            startCommandConsumer();
            scheduler = Executors.newSingleThreadScheduledExecutor();
            scheduler.scheduleAtFixedRate(this::publishAccountStatus, 1, 1, TimeUnit.SECONDS);
            console.getOut().println("Account status publisher scheduled every 1 second.");
        } else {
            console.getErr().println("FATAL: Could not establish AMQP connection. Stopping strategy.");
            context.stop();
        }
    }

    @Override
    public void onStop() throws JFException {
        console.getOut().println("Stopping TradeManager strategy...");
        if (scheduler != null) scheduler.shutdown();
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

    private void publishAccountStatus() {
        try {
            double balance = account.getBalance();
            double equity = account.getEquity();
            double marginUsed = account.getUsedMargin();
            // FIX: Replaced non-existent getMargin() with getEquity(). Equity is the total available margin.
            double marginAvailable = account.getEquity();
            double freeMargin = marginAvailable - marginUsed;
            double leverage = account.getLeverage();
            String accountId = account.getAccountId();
            
            // Account-wide PnL: equity - balance
            double accountPnL = equity - balance;
            double unrealizedPnL = 0.0;
            List<String> positionJsonList = new ArrayList<>();

            try {
                for (IOrder order : engine.getOrders()) {
                    if (order.getState() == IOrder.State.FILLED || order.getState() == IOrder.State.OPENED) {
                        double orderPnL = order.getProfitLossInAccountCurrency();
                        unrealizedPnL += orderPnL;

                        // Enhanced order information with all requested fields
                        positionJsonList.add(String.format(Locale.US,
                            "{\"orderId\":\"%s\",\"label\":\"%s\",\"instrument\":\"%s\",\"orderCommand\":\"%s\",\"amount\":%.3f,\"openPrice\":%.5f,\"stopLoss\":%.5f,\"takeProfit\":%.5f,\"pnl\":%.2f,\"state\":\"%s\"}",
                            order.getId(),
                            order.getLabel(),
                            order.getInstrument().name(),
                            order.getOrderCommand().name(),
                            order.getAmount(),
                            order.getOpenPrice(),
                            order.getStopLossPrice(),
                            order.getTakeProfitPrice(),
                            orderPnL,
                            order.getState().name()
                        ));
                    }
                }
            } catch (JFException e) {
                console.getErr().println("Error retrieving orders: " + e.getMessage());
            }

            // If no open positions, ensure marginUsed is accurate (though getUsedMargin should handle this)
            if (positionJsonList.isEmpty()) {
                marginUsed = 0.0;
                freeMargin = equity; // If nothing is used, free margin equals equity
            }

            // Enhanced account information with all requested fields
            String accountJson = String.format(Locale.US,
                "{\"accountId\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"marginUsed\":%.2f,\"freeMargin\":%.2f,\"marginAvailable\":%.2f,\"leverage\":%.2f,\"accountPnL\":%.2f,\"unrealizedPnL\":%.2f}",
                accountId, balance, equity, marginUsed, freeMargin, marginAvailable, leverage, accountPnL, unrealizedPnL
            );

            String positionsJson = "[" + String.join(",", positionJsonList) + "]";
            long timestamp = System.currentTimeMillis();
            
            // Consistent format with produced_at and timestamp
            String finalJson = String.format(
                "{\"produced_at\":%d,\"timestamp\":%d,\"account\":%s,\"positions\":%s}",
                timestamp, timestamp, accountJson, positionsJson
            );

            sendMessage(ACCOUNT_INFO_QUEUE_NAME, finalJson);

        } catch (Exception e) {
            console.getErr().println("Error publishing account status: " + e.getMessage());
        }
    }

    private void startCommandConsumer() {
        try {
            DeliverCallback deliverCallback = (consumerTag, delivery) -> {
                String message = new String(delivery.getBody(), StandardCharsets.UTF_8);
                console.getOut().println("Received command: " + message);
                handleCommand(message);
            };
            amqpChannel.basicConsume(TRADE_COMMANDS_QUEUE_NAME, true, deliverCallback, consumerTag -> {});
            console.getOut().println("Command consumer started on queue '" + TRADE_COMMANDS_QUEUE_NAME + "'");
        } catch (IOException e) {
            console.getErr().println("Failed to start AMQP consumer: " + e.getMessage());
        }
    }

    private void handleCommand(String jsonCommand) {
        try {
            Map<String, String> cmdMap = parseSimpleJson(jsonCommand);
            String command = cmdMap.getOrDefault("command", "").toUpperCase();
            switch (command) {
                case "SUBMIT_ORDER":
                    handleSubmitOrder(cmdMap);
                    break;
                case "CLOSE_ORDER":
                    handleCloseOrder(cmdMap);
                    break;
                case "MODIFY_ORDER":
                    handleModifyOrder(cmdMap);
                    break;
                default:
                    console.getErr().println("Unknown command received: " + command);
            }
        } catch (Exception e) {
            console.getErr().println("Error handling command: " + e.getMessage());
        }
    }

    private void handleSubmitOrder(Map<String, String> cmdMap) throws JFException {
        try {
            String label = cmdMap.getOrDefault("label", "jforex_order_" + System.currentTimeMillis());
            Instrument instrument = Instrument.valueOf(cmdMap.get("instrument"));
            IEngine.OrderCommand orderCmd = IEngine.OrderCommand.valueOf(cmdMap.get("orderCmd").toUpperCase());
            double amount = Double.parseDouble(cmdMap.get("amount"));
            double price = Double.parseDouble(cmdMap.getOrDefault("price", "0"));
            double slippage = Double.parseDouble(cmdMap.getOrDefault("slippage", "5"));
            double stopLoss = Double.parseDouble(cmdMap.getOrDefault("stopLossPrice", "0"));
            double takeProfit = Double.parseDouble(cmdMap.getOrDefault("takeProfitPrice", "0"));

            engine.submitOrder(label, instrument, orderCmd, amount, price, slippage, stopLoss, takeProfit);
            console.getOut().println("Submitted order for " + instrument + " amount " + amount);
        } catch (Exception e) {
            console.getErr().println("Failed to submit order: " + e.getMessage());
        }
    }

    private void handleCloseOrder(Map<String, String> cmdMap) throws JFException {
        try {
            String orderId = cmdMap.get("orderId");
            IOrder order = engine.getOrderById(orderId);
            if (order != null && (order.getState() == IOrder.State.OPENED || order.getState() == IOrder.State.FILLED)) {
                order.close();
                console.getOut().println("Closing order ID: " + orderId);
            } else {
                console.getErr().println("Could not close order. ID not found or order not open: " + orderId);
            }
        } catch (Exception e) {
            console.getErr().println("Failed to close order: " + e.getMessage());
        }
    }

    private void handleModifyOrder(Map<String, String> cmdMap) throws JFException {
        try {
            String orderId = cmdMap.get("orderId");
            IOrder order = engine.getOrderById(orderId);
            if (order != null && (order.getState() == IOrder.State.OPENED || order.getState() == IOrder.State.FILLED)) {
                if (cmdMap.containsKey("stopLossPrice")) {
                    double newSl = Double.parseDouble(cmdMap.get("stopLossPrice"));
                    order.setStopLossPrice(newSl);
                    console.getOut().println("Modified SL for order " + orderId + " to " + newSl);
                }
                if (cmdMap.containsKey("takeProfitPrice")) {
                    double newTp = Double.parseDouble(cmdMap.get("takeProfitPrice"));
                    order.setTakeProfitPrice(newTp);
                    console.getOut().println("Modified TP for order " + orderId + " to " + newTp);
                }
            } else {
                console.getErr().println("Could not modify order. ID not found or order not open: " + orderId);
            }
        } catch (Exception e) {
            console.getErr().println("Failed to modify order: " + e.getMessage());
        }
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
                factory.setNetworkRecoveryInterval(5000);
                
                this.amqpConnection = factory.newConnection();
                this.amqpChannel = amqpConnection.createChannel();
                this.amqpChannel.queueDeclare(ACCOUNT_INFO_QUEUE_NAME, true, false, false, null);
                this.amqpChannel.queueDeclare(TRADE_COMMANDS_QUEUE_NAME, true, false, false, null);
                
                console.getOut().println("AMQP connection established. Listening on '" + TRADE_COMMANDS_QUEUE_NAME + "', publishing to '" + ACCOUNT_INFO_QUEUE_NAME + "'.");
                return true;
            } catch (Exception e) {
                console.getErr().println("AMQP initialization failed: " + e.getMessage());
                return false;
            }
        }
    }

    private void sendMessage(String queueName, String message) throws IOException {
        synchronized (amqpConnectionLock) {
            if (amqpChannel != null && amqpChannel.isOpen()) {
                amqpChannel.basicPublish("", queueName, null, message.getBytes(StandardCharsets.UTF_8));
            }
        }
    }

    private Map<String, String> parseSimpleJson(String json) {
        Map<String, String> map = new LinkedHashMap<>();
        if (json == null) return map;
        String sanitized = json.trim().replaceAll("[{}\"]", "");
        if (sanitized.isEmpty()) return map;
        String[] pairs = sanitized.split(",");
        for (String pair : pairs) {
            String[] kv = pair.split(":", 2);
            if (kv.length == 2) {
                map.put(kv[0].trim(), kv[1].trim());
            }
        }
        return map;
    }

    // --- Unused IStrategy Methods ---
    @Override public void onTick(Instrument i, ITick t) {}
    @Override public void onBar(Instrument i, Period p, IBar a, IBar b) {}
    @Override public void onMessage(IMessage m) {}
    @Override public void onAccount(IAccount a) {}
}