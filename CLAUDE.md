# Claude Configuration for Go-Trader

## Project Overview
A comprehensive real-time trading system consisting of JForex strategies (Java), Go backend server, and React frontend. The system processes market data, executes trades, and provides a web-based trading interface with real-time price charts and technical indicators.

## Architecture
```
JForex Platform (Java) → RabbitMQ → Go Backend → WebSocket → React Frontend
```
- **JForex Strategies**: Feed market data and handle trading operations via RabbitMQ
- **Go Backend**: WebSocket server, message processing, and state management
- **React Frontend**: Real-time trading interface with charts and order management

## Development Commands

### Frontend (React/Vite)
```bash
cd frontend
npm run dev          # Development server on localhost:5173
npm run build        # Production build
npm run lint         # ESLint checking
npm run typecheck    # TypeScript type checking
```

### Backend (Go)
```bash
# Build the application (when main.go exists)
go build -o trading-system cmd/trading-system/main.go

# Run the compiled binary
./trading-system

# Run tests (when implemented)
go test ./...

# Run linter (if golangci-lint installed)
golangci-lint run
```

### JForex Strategies
- Compile with Dukascopy JForex SDK
- Deploy to JForex platform
- Each strategy targets specific currency pairs (EURUSD, GBPUSD, etc.)

## Project Structure
```
go-trader/
├── cmd/                    # Go application entry points
├── internal/
│   ├── strategy/          # Trading strategy engine (placeholder)
│   ├── websocket/          # WebSocket hub and client management
│   ├── amqp/              # RabbitMQ integration
│   └── state/             # Application state management
├── frontend/               # React/Vite frontend
├── JForex-Strategies/     # Java JForex strategies
├── configs/               # Configuration files
├── trading-system         # Compiled Go binary
├── go.mod                 # Go module definition
├── package.json           # Frontend dependencies
└── recommendations.md     # Analysis findings
```

## Technology Stack
- **Backend**: Go 1.19, gorilla/websocket, RabbitMQ (amqp091-go)
- **Frontend**: React 19, TypeScript, Vite, Zustand, Material-UI, lightweight-charts
- **Trading**: Dukascopy JForex platform, technical indicators (DEMA, MACD, RSI, etc.)
- **Messaging**: RabbitMQ for real-time data streaming
- **Data**: Real-time market data, VWAP calculations, OHLC bars

## Current Status
- ✅ Frontend interface with dark mode support implemented
- ✅ WebSocket communication framework established
- ✅ JForex strategies functional for multiple currency pairs
- ✅ Comprehensive technical indicator calculations
- ⚠️ Go backend strategy engine incomplete (placeholder implementation)
- ⚠️ Many TODO items for backend integration in frontend
- ❌ No test coverage implemented
- ❌ Missing proper configuration management

## Working with This Project

### Before Making Changes
1. Check git status to understand current changes
2. Run frontend build (`cd frontend && npm run build`) to ensure no breaking changes
3. Run linting (`npm run lint` and `npm run typecheck`) when available

### Code Style Guidelines
- **Go**: Follow standard Go conventions, use golangci-lint if available
- **TypeScript**: Use ESLint configuration, prefer strict typing, avoid any types
- **Java**: Follow JForex conventions, proper exception handling
- **General**: Use descriptive variable names, add comments for complex logic

### Security Considerations
- Never commit hardcoded credentials (current issue in JForex strategies)
- Use environment variables for configuration (AMQP credentials, WebSocket URLs)
- WebSocket connections should be properly authenticated
- Input validation for all user inputs in trading interface

### When to Use TodoWrite
**TodoWrite is a tool I use to track multi-step tasks and show progress. I should use it for:**
- Tasks with 3 or more implementation steps
- Complex bug fixes that require multiple file changes
- Feature implementation that spans multiple components
- Refactoring operations that affect multiple parts of the codebase
- When you explicitly ask me to track progress

**Examples of when to use TodoWrite:**
- Implementing a new trading strategy (backend + frontend integration)
- Adding authentication system
- Setting up testing framework
- Major refactoring of data structures

## Dependencies & Requirements
- **Go**: 1.19+ (from go.mod)
- **Node.js**: 18+ (for frontend development)
- **Dukascopy JForex SDK**: For compiling Java strategies
- **RabbitMQ Server**: For message queuing (localhost:5672)
- **Java**: 8+ for JForex compilation

## Configuration
- **Environment Variables Needed**:
  - `AMQP_HOSTNAME` (currently hardcoded as "localhost")
  - `AMQP_USERNAME` (currently hardcoded as "mark")
  - `AMQP_PASSWORD` (currently hardcoded as "mark")
  - `WEBSOCKET_URL` (currently hardcoded as "ws://localhost:8080/ws")
- **Configuration Files**: go.mod, package.json
- **Secrets Management**: Currently hardcoded - needs environment variable implementation

## Testing Strategy
- **Frontend**: Ready for testing with React Testing Library/Jest
- **Backend**: Ready for testing with Go's testing package
- **Integration**: End-to-end testing needed for full trading flow
- **Test Coverage**: Currently 0% - needs comprehensive test suite

## Deployment
- **Frontend**: `npm run build` creates static files
- **Backend**: Go builds to single binary
- **Docker**: Not yet implemented
- **CI/CD**: Not yet implemented

## Important Notes
- The system uses sophisticated VWAP (Volume Weighted Average Price) calculations
- Technical indicators include DEMA, MACD, RSI, Stochastic, Bollinger Bands, Supertrend, etc.
- Each JForex strategy is instrument-specific (EURUSD, GBPUSD, USDJPY, etc.)
- Frontend supports both dark and light mode switching
- Emergency stop functionality is partially implemented (UI only)

## Known Issues & Limitations
- **Security**: Hardcoded AMQP credentials in JForex strategies
- **Performance**: Custom JSON parser in JForex instead of proper library
- **Maintainability**: Duplicate code across multiple BarDataFeeder files
- **Completion**: Go backend strategy engine is placeholder only
- **Integration**: Many TODO items for backend-frontend integration

## Future Plans
- Implement proper configuration management with environment variables
- Complete Go backend strategy engine implementation
- Add comprehensive test coverage
- Implement Docker containers for deployment
- Add authentication and authorization for WebSocket connections
- Refactor duplicate JForex strategy code into reusable components

---
*Last Updated: 2025-09-07*
*Maintainer: Project Owner*
*Contact: Available via project repository*

## Glossary of Terms
- **TodoWrite**: A tool Claude uses to track multi-step tasks and show progress visually
- **JForex**: Dukascopy's trading platform for algorithmic trading
- **VWAP**: Volume Weighted Average Price - a trading benchmark
- **OHLC**: Open, High, Low, Close price data
- **WebSocket**: Real-time communication protocol between browser and server
- **RabbitMQ**: Message broker for asynchronous communication
- **DEMA**: Double Exponential Moving Average (technical indicator)
- **Zustand**: Lightweight state management library for React
- **Vite**: Modern build tool for frontend development