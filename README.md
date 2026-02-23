# Mahjong Leaderboard

A lightweight app to record Mahjong games with friends and review yearly performance.

## Tech Stack

- **Vite** + **React 19** + **TypeScript**
- **Firebase Realtime Database** for cloud data persistence & real-time sync
- **Gemini AI** for natural language game entry & performance analysis
- **TailwindCSS** for styling (dark theme)

## Features

- Three tabs via bottom navigation:
  - **Record Game** - Manual entry or AI-powered natural language input
  - **All Games** - View, edit, and delete game records
  - **Yearly Review** - Auto-computed rankings & detailed player stats
- Record games by date with as many players as needed.
- Capture each player's game score and special hands (e.g. 大三元, 大四喜, 十三幺).
- AI-powered game entry: describe a game in natural language (English/Cantonese/Mandarin).
- AI-powered yearly analysis with player insights and fun facts.
- Automatically compute yearly insights:
  - 嬴最多錢 (Top 3)
  - 出統最多次 (Top 3)
  - 輸最多 (Top 3)
  - 單次嬴最多台 (Top 3)
- Real-time sync across devices via Firebase.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure Firebase: edit `firebaseService.ts` and replace the placeholder config with your Firebase project credentials.

3. Configure Gemini AI: edit `.env.local` and set your API key:

```
GEMINI_API_KEY=your_key_here
```

4. Start the dev server:

```bash
npm run dev
```

Then visit `http://localhost:3000`.

## Build

```bash
npm run build
npm run preview
```
