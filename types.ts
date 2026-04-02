
export interface Player {
  name: string;
  score: number;
  special: string;
}

export interface Round {
  id: string;
  winnerSeat: number;
  winType: 'zimo' | 'chutong' | 'draw';
  loserSeat?: number;
  fan: number;
  special: string;
  dealerStreak?: number;
  isLeopard?: boolean;
  // 七搶一 pre-settlement: 7-flower player receives from 1-flower player
  sevenFlowers?: { winnerSeat: number; loserSeat: number };
  // Multi-winner fields (一炮雙響 / 一炮三響)
  winnerSeats?: number[];
  fans?: number[];
  specials?: string[];
}

export interface Game {
  id: string;
  date: string;
  note: string;
  baseRate: number;
  seats: string[];
  rounds: Round[];
  players: Player[];
}

export interface PlayerYearlyStats {
  name: string;
  totalScore: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  specialCount: number;
  specialBreakdown: Record<string, number>;
  maxSingleHand: {
    name: string;
    rank: number;
  };
}

export interface YearlyData {
  year: number;
  stats: PlayerYearlyStats[];
}

export interface GeminiGameResult {
  date: string;
  note: string;
  players: {
    name: string;
    score: number;
    special: string;
  }[];
}

export interface GeminiAnalysisResult {
  summary: string;
  playerInsights: {
    name: string;
    insight: string;
  }[];
  funFacts: string[];
}
