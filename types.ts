
export interface Player {
  name: string;
  score: number;
  special: string;
}

export interface Round {
  id: string;
  winnerSeat: number;
  winType: 'zimo' | 'chutong';
  loserSeat?: number;
  fan: number;
  special: string;
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
