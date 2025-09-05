# GoTrader Frontend Documentation

## 🚀 Project Overview

GoTrader is a professional trading application frontend built with React, TypeScript, and Zustand for state management. The application provides real-time market data visualization, trading controls, and account management through a WebSocket connection to a Go backend.

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── App.tsx              # Main application component with WebSocket logic
│   │   ├── Dashboard.tsx        # Main dashboard with header/footer and navigation
│   │   └── PriceChart.tsx       # EURUSD trading interface with charts and controls
│   ├── store/
│   │   └── store.ts             # Zustand state management
│   └── types/
│       └── index.ts             # TypeScript type definitions
├── package.json                 # Dependencies and scripts
└── tsconfig.json               # TypeScript configuration
```

## 🧩 Components Architecture

### App.tsx
- **Purpose**: Root component handling WebSocket connection and application state
- **Features**:
  - WebSocket connection management (`ws://localhost:8080/ws`)
  - Connection status monitoring (connecting/connected/disconnected)
  - Full state synchronization with backend
  - Error handling and reconnection logic

### Dashboard.tsx
- **Purpose**: Main application layout with header, navigation, and content area
- **Features**:
  - Account overview header (balance, equity, positions)
  - Currency pair navigation buttons
  - Light/dark mode toggle
  - Professional footer with connection status
  - Responsive grid layout

### PriceChart.tsx
- **Purpose**: EURUSD trading interface
- **Features**:
  - Real-time price display (BID/ASK with flashing changes)
  - Spread calculation and display
  - Quick trade controls (BUY/SELL market orders)
  - Advanced order entry (limit orders with SL/TP)
  - Data availability indicators
  - Historical data requests

## 🎨 Styling Approach

### Theme System
- **Light Mode**: Default theme (white backgrounds, dark text)
- **Dark Mode**: Alternative theme (dark backgrounds, light text)
- **Dynamic Colors**: Context-aware color selection based on theme

### Color Palette
```typescript
// Light Mode
background: '#ffffff'
cardBackground: '#f5f5f5'
border: '#ddd'
text: '#333'
textSecondary: '#666'
inputBackground: '#e0e0e0'

// Dark Mode
background: '#121212'
cardBackground: '#2a2a2a'
border: '#555'
text: 'white'
textSecondary: '#ccc'
inputBackground: '#333'
```

### Button Styling
- **Primary Buttons**: Green (#4CAF50) with white borders when selected
- **Secondary Buttons**: Grey backgrounds with hover effects
- **Trading Buttons**: Color-coded (Green=BUY, Red=SELL)
- **Consistent Spacing**: 8px padding, 8px border-radius, 2px box-shadow

## 🔄 State Management (Zustand)

### Store Structure
```typescript
interface AppState {
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  fullState: FullState | null;
  connect: () => void;
  disconnect: () => void;
  requestHistoricalData: (instrument: string) => void;
}
```

### Data Flow
1. **WebSocket Connection**: Establishes real-time connection to backend
2. **State Synchronization**: Receives FullState updates from Go backend
3. **Component Updates**: React components re-render based on store changes
4. **User Actions**: Button clicks trigger WebSocket messages to backend

## 📊 Data Handling

### Real-time Data
- **Ticks**: Live price updates for EURUSD
- **Bars**: OHLC data for multiple timeframes (10s, 1m, 5m, 15m, 1h, 4h, 1d)
- **Account Info**: Balance, equity, positions
- **Historical Bars**: Stored historical data for analysis

### WebSocket Communication
- **Incoming**: FullState updates from backend
- **Outgoing**: Historical data requests, trade commands
- **Message Format**: JSON with type field for command identification

## 🎯 Key Features Implemented

### ✅ Completed Features
- [x] Professional dashboard layout
- [x] Real-time market data display
- [x] Light/dark mode toggle
- [x] Account overview header
- [x] Currency pair navigation
- [x] Trading controls (market orders, limit orders)
- [x] Stop loss and take profit entry
- [x] Spread calculation
- [x] Data availability indicators
- [x] Historical data requests
- [x] WebSocket connection management
- [x] Responsive design
- [x] TypeScript type safety

### 🔧 Technical Challenges Resolved
- **WebSocket Connection Issues**: Implemented retry logic and error handling
- **Chart Rendering Errors**: Replaced complex charting with simple data display
- **TypeScript Errors**: Fixed type definitions and import issues
- **State Synchronization**: Proper data flow between Go backend and React frontend
- **Theme Consistency**: Dynamic styling based on light/dark mode
- **Button Styling**: Professional appearance with proper contrast and accessibility

## ⚙️ Configuration

### Environment Setup
- **Development Server**: `npm run dev` (Vite on port 5173)
- **Backend Connection**: WebSocket on `ws://localhost:8080/ws`
- **Build Tool**: Vite for fast development and optimized production builds

### Dependencies
```json
{
  "react": "^18.x",
  "zustand": "^4.x",
  "@types/react": "^18.x",
  "typescript": "^5.x"
}
```

## 🎨 UI/UX Decisions

### Layout Philosophy
- **Header-Centric**: Account info prominently displayed at top
- **Navigation-First**: Currency buttons for easy instrument switching
- **Content-Focused**: Large main content area for trading interface
- **Footer-Supportive**: Connection status and additional info at bottom

### User Experience Flow
1. **Landing**: Clean dashboard welcome screen
2. **Navigation**: Click currency pairs to access trading interfaces
3. **Trading**: Full-featured EURUSD interface with all controls
4. **Feedback**: Visual indicators for connection status and data availability

## 🔮 Future Development Notes

### Planned Enhancements
- [ ] Multi-currency support (currently EURUSD only)
- [ ] Advanced charting with technical indicators
- [ ] Position management interface
- [ ] Trade history and performance analytics
- [ ] Risk management tools
- [ ] Alert system for price levels

### Technical Debt
- [ ] Replace simple data display with proper charting library
- [ ] Add comprehensive error boundaries
- [ ] Implement loading states for better UX
- [ ] Add unit tests for components
- [ ] Optimize bundle size and performance

## 🚀 Development Workflow

### Starting Development
```bash
cd frontend
npm install
npm run dev
```

### Building for Production
```bash
npm run build
npm run preview
```

### Key Files to Remember
- `Dashboard.tsx`: Main layout and navigation logic
- `PriceChart.tsx`: Trading interface and controls
- `store.ts`: State management setup
- `types/index.ts`: TypeScript definitions

## 📝 Recent Changes Summary

### Major Updates (Last Session)
- ✅ Default light mode instead of dark
- ✅ Dashboard landing page with welcome screen
- ✅ Dashboard button in currency navigation
- ✅ Removed circular icons from buttons
- ✅ Fixed BUY/SELL button colors (green/red always)
- ✅ Enhanced data availability indicators
- ✅ Professional styling throughout

### Styling Improvements
- Removed emoji icons from buttons
- Added white borders for better contrast
- Consistent black text on colored buttons
- Improved spacing and typography
- Better responsive design

---

**Last Updated**: September 5, 2025
**Status**: Ready for production use with EURUSD trading
**Next Steps**: Multi-currency expansion and advanced features
