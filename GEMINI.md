# Go Trading System - Project Documentation

This document outlines the architecture, status, and roadmap for the high-performance Go trading system.

## 1. Project Status (v1 - Complete)

The initial version of the application is complete. The core backend and frontend have been implemented, providing a solid foundation for real-time data visualization.

### Implemented Features:
- **Go Backend:** A concurrent, high-performance application that connects to RabbitMQ, processes live market data, and manages a central state ledger.
- **State Manager:** An in-memory, thread-safe "ledger" that stores the latest tick data, bar data, and account information.
- **Smart Startup:** The backend performs a startup sequence that drains stale messages from the queues and pre-populates the ledger with historical data.
- **WebSocket Hub:** A real-time WebSocket server that broadcasts the complete application state to all connected frontend clients.
- **React Frontend:** A decoupled Vite/React application that provides a real-time dashboard.
- **Real-Time UI:** The frontend displays live price charts, account information, and a table of open positions using Material-UI and Lightweight Charts.

## 2. How to Run the Application

To run the application, you will need Go, Node.js, and npm installed.

### A. Start the Backend

1. Open a terminal in the project root (`/DATA/Documents/go-trader`).
2. Ensure the required Go dependencies are available in your environment:
   - `github.com/rabbitmq/amqp091-go`
   - `github.com/gorilla/websocket`
3. Run the backend server:
   ```bash
   go run cmd/trading-system/main.go
   ```

### B. Start the Frontend

1. Open a second terminal in the `frontend` directory (`/DATA/Documents/go-trader/frontend`).
2. Install the Node.js dependencies:
   ```bash
   npm install
   ```
3. Start the frontend development server:
   ```bash
   npm run dev
   ```
4. Open your web browser and navigate to the URL provided by Vite (e.g., `http://localhost:5173`).

## 3. v2 Feature Roadmap

The following features are planned for the next version of the application, which will evolve it from a data visualizer into a complete trading platform.

### Global UI Enhancements
- **Global Header:** An always-visible header containing:
  - Real-time gross account balance and equity.
  - An emergency "STOP" button to immediately close all open positions and halt all running strategies.
  - A mechanism to re-enable strategies after a halt.
- **Connection Status Dashboard:** A dedicated view to monitor the health of system connections (RabbitMQ, WebSocket) and confirm that live data is being received.

### Per-Instrument Views
- **Tabbed/Button Navigation:** The main dashboard will feature tabs or buttons for each of the 10 currency pairs.
- **Detailed Ledger View:** Clicking on a pair's tab will navigate to a detailed view showing the complete ledger state for that instrument (e.g., all 200 stored bars, recent ticks, indicator values).

### Manual Trading Interface
- **Market Orders:** Simple "BUY" and "SELL" buttons on each instrument's view for executing immediate market orders.
- **Complex Orders:** An interface to place limit and stop orders with specified prices.

### Strategy Management
- **Per-Pair Strategy Control:** Each instrument's view will have a strategy management panel.
- **Strategy Selection:** A dropdown menu to select from a list of available trading strategies.
- **Lifecycle Control:** "START" and "STOP" buttons to enable or disable the selected strategy for that specific instrument.

## 4. Core Architectural Principles
- **Concurrent by Design:** Leverage goroutines and channels for all I/O and processing tasks.
- **Decoupled:** The core trading logic runs independently of any UI connection.
- **Single Source of Truth:** The backend maintains an in-memory state cache (the "ledger").
- **Performant:** All components are designed for low-latency data processing.

## 5. Project Structure

/go-trader
|-- go.mod
|-- GEMINI.md
|-- /cmd
|   /-- trading-system
|       /-- main.go
|-- /internal
|   |-- /amqp
|   |   |-- consumer.go
|   |   |-- publisher.go
|   |-- /state
|   |   |-- manager.go
|   |   |-- models.go
|   |-- /strategy
|   |   |-- engine.go
|   |   |-- example_strategy.go
|   |-- /websocket
|   |   |-- hub.go
|   |   |-- client.go
|-- /frontend
|   /-- (Vite/React project)
|-- /configs
|   /-- config.yaml


## RabbitMQ Queues

Account-Info
H-Bars
H-Requests
EURUSD_Market_Data_Bars (each of the other 9 currency pairs will have their own bar queue e.b. GBPUSD_Market_Data_Bars)
Market_Data_Ticks
Trade_Commands