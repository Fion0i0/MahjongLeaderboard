# Mahjong Leaderboard

A lightweight app to record Mahjong games with friends and review yearly performance.

## Features

- Three separate app pages/tabs:
  - **Record Game**
  - **All Games**
  - **Yearly Review**
- Record games by date with as many players as needed.
- Capture each player's game score and special hands as text (e.g. 大三元, 大四喜, 十三幺).
- Support multiple special hands in one game using comma-separated text.
- Automatically compute yearly insights:
  - 嬴最多錢（Top 3）
  - 出統最多次（Top 3）
  - 輸最多（Top 3）
  - 單次嬴最多台（Top 3，按番型優先級，例如十三幺 > 大四喜）
- Yearly Review includes a dedicated metrics table (1st/2nd/3rd) and a detailed player stats table.
- Data is saved in browser local storage.

## Run locally

Open `index.html` directly in your browser, or serve this folder:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.
