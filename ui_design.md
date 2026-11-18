# ApexScan AI — UI/UX Design System & Blueprint

This document acts as the official design blueprint and styling guide for the **ApexScan AI** workspace. It outlines the core visual system, UI components, interaction models, and details to guide future improvements and updates.

---

## 🎨 1. Core Visual System (The Obsidian Design System)

The visual theme is inspired by modern developer-centric, high-frequency terminal UIs. It combines deep obsidian tones, glassmorphism layers, and vibrant cyber accents to represent high-tech AI capability.

### Colors & Accents

| Token | Hex Code | Utility / Meaning |
| :--- | :--- | :--- |
| **Primary Background** | `#0A0D14` | Deep obsidian backdrop of the entire application. |
| **Card Background** | `rgba(16, 20, 30, 0.65)` | Glassmorphic overlays with backdrop blurs. |
| **Border Medium** | `rgba(255, 255, 255, 0.08)` | Subtle separators between cards and panels. |
| **Electric Indigo** | `#6366F1` | Brand accents, buttons, and AI-related action alerts. |
| **Neon Cyan** | `#06B6D4` | Scanner hits, secondary accents, and confidence rings. |
| **Emerald Green** | `#10B981` | BULLISH status, BUY/LIGHT BUY badges, and profitable statistics. |
| **Amber Yellow** | `#F59E0B` | NEUTRAL status, WATCH signals, and pending tasks. |
| **Rose Red** | `#EF4444` | RISK_OFF status, REJECT signals, and stop loss levels. |

### Typography

- **Headings & Tickers**: `'Space Grotesk'`, sans-serif. Gives a clean, futuristic, and geometric look.
- **Body & Text**: `'Inter'`, sans-serif. Highly readable at small font sizes (0.75rem - 0.9rem).
- **Monospaced Values**: `'JetBrains Mono'`, monospace. Used for tickers, live prices, quantities, and numeric percentages to prevent visual alignment shifting.

---

## 📊 2. Component Guidelines

### A. The Setup Card (`SetupCard.tsx`)
A compact dashboard module representing a single trade setup detected by the AI agent scans.

1. **Title Row**:
   - Ticker symbol (e.g. `TCS`) in bold Space Grotesk.
   - Sector badge (e.g. `IT`) in muted text.
   - Dynamic watch/bookmark badge.
2. **AI Confidence Ring**:
   - A circular SVG progress bar showing a rating out of 10.
   - Green (7+), Yellow (5-6), Red (<5).
3. **Trigger Matrix**:
   - **LTP** (Last Traded Price).
   - **Buy Zone** range (e.g. `₹3,400 - ₹3,420`).
   - **Targets** (Target 1 / Target 2).
   - **Stop Loss** level.
4. **Interactive Sparkline**:
   - SVG polyline drawing the daily candle trend.
5. **R:R (Risk-to-Reward) & Signal Badge**:
   - Pill indicating reward ratio (e.g. `1:2.4 R:R`).
   - Action buttons: "Details" (opens modal) and "Save" (adds to Watchlist).

### B. Interactive Sector Heatmap (`SectorHeatmap.tsx`)
A 3x3 dashboard component reflecting sector strength based on scanning data.

- **Visuals**: Displays strength metrics mapped to color gradients (Green for strong positive flow, Red for weak/negative flow).
- **Interactivity**: Clicking a sector tile filters the main dashboard setups grid immediately. Clicking again resets the filter.

### C. Trade Detail Modal (`TradeDetailModal.tsx`)
A dual-panel details overlay that opens on card click.

- **Left Panel (Market Chart)**:
  - Candlestick visualizer using Lightweight Charts.
  - Pre-applied indicators: SMA20, SMA50, SMA200, EMA20.
  - RSI panel at the bottom.
  - Color-coded target (green dashed line), entry (blue dashed line), and stop loss (red dashed line) lines.
- **Right Panel (Position Planner)**:
  - Risk calculator allowing users to enter account capital and stop loss risk (e.g., 1%, 2%) to calculate recommended shares.
  - Multi-agent AI debate panel displaying arguments for and against the trade setup from different system personas.

---

## 🛰️ 3. Page Templates

### A. Main Dashboard Page (`DashboardPage.tsx`)
- **Top Sticky Navbar**: Constant regime check (`BULLISH`, `NEUTRAL`, `RISK_OFF`) and FII/DII Net Flow.
- **Left Column (Main)**: Market diagnostic brief banner, swing/intraday mode switch, filter tabs, setups card grid.
- **Right Column (Sidebar)**: Sector Heatmap, Institutional Flow Summary, Economic Events Calendar.

### B. Watchlist Page (`WatchlistPage.tsx`)
- Displays active user targets in trigger range.
- Integrates the same `SetupCard` layout so users can click to open TradingView charts and technical statistics.

### C. Portfolio & Risk Dashboard (`PortfolioPage.tsx`)
- **Compounding Equity Curve Chart**: Recharts area graph rendering real growth starting from a simulated baseline of ₹100,000.
- **Holdings News Radar**: Shows negative news, positive news, or regulatory flags from parsing engines.
- **Exposure Clusters**: Highlights capital concentration warning messages (e.g. "You have 45% capital in Banks. Consider trimming").

---

## 🚀 4. Future UI Improvement Suggestions

When planning future upgrades, focus on these enhancement vectors:

1. **Real-time WebSockets**:
   - Replace the 60-second polling for quotes with live websocket tickers to make the CMP (Current Market Price) update instantly on cards.
2. **Chart Customization**:
   - Allow users to toggle individual moving averages, adjust chart intervals (e.g. 5m, 15m, 1h, 1d), or draw target lines manually.
3. **Advanced Risk Modeling**:
   - Add a correlation coefficient matrix in the Portfolio page to visually connect holdings (e.g. Bank Nifty holdings vs Nifty IT holdings).
4. **Push Web Notifications**:
   - Add a push notification bell sound or Telegram webhook alerts directly from the browser when a watchlisted stock enters its buy zone.
5. **Dark/Light Mode Toggle**:
   - Although optimized for dark obsidian mode, a light-slate clean paper theme option could enhance readability for some users.
