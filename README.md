# HongKongers Mahjong Dragonboard (Beta)

A lightweight app to record Hong Kong-style Mahjong games with friends and review yearly performance.

## Tech Stack

- **Vite** + **React 19** + **TypeScript**
- **Firebase Realtime Database** for cloud data persistence & real-time sync
- **Gemini AI** for natural language game entry & performance analysis
- **TailwindCSS** for styling (dark theme)

## Features

### Record Game
- 4-player seat assignment with VIP profile pictures
- Round-by-round recording: winner, win type (出統/自摸), fan count, special hands, and 連莊 streak
- Pop-up alert "邊個又出統" when selecting 出統
- Configurable game settings: 良辰吉日 (date), 底 (base amount), 打幾大 (rate per fan)
- Rate adjusts in units of 10 (e.g. 10, 20, 30, 40)
- 台數手冊 — reference modal for all hand types and fan values
- 台數助手 — AI-assisted fan calculator from natural language input
- Special hand picker with add/remove counters, ordered by fan value (16台 → 5台)
- Draft auto-save to Firebase — resume in-progress games after closing the browser

### All Games
- View all completed games sorted by date
- Resume/edit saved games by clicking the edit icon
- Delete games

### Yearly Review
- Year selector to switch between years (defaults to newest)
- Auto-computed rankings with trophy/medal/award icons:
  - 嬴哂啲錢 (most money won)
  - 出統王 (most times dealing in)
  - 輸哂啲錢 (most money lost)
  - 至尊雀聖 (highest single special hand)
  - 連莊王 (longest consecutive dealer streak)
  - 全勤者 (highest attendance rate)
- Detailed player stats table: games played, total score, wins, losses, specials
- AI-powered yearly analysis with player insights and fun facts

### General
- Mobile-responsive design with compact layouts for phone screens
- Real-time sync across devices via Firebase

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
