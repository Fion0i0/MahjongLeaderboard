
import React, { useState, useEffect, useMemo } from 'react';
import { Game, Player, Round, PlayerYearlyStats, YearlyData, GeminiAnalysisResult } from './types';
import { subscribeToGames, addGame, deleteGame as deleteGameFromDB, saveDraftSession, loadDraftSession, clearDraftSession, DraftSession, signInAnonymousUser } from './firebaseService';
import { parseGameWithAI, analyzePerformanceWithAI } from './geminiService';
import { VIPMember, loadVIPList } from './VIP/vipList';
import { parseFanFromText } from './fanCalculator';
import iconImg from './icon.png';
import {
  parseSpecialHands,
  getSpecialHandRank,
  formatSpecialBreakdown,
  SpecialHandPicker,
  MahjongReferenceModal,
} from './mahjongReference';

// ─── Constants ──────────────────────────────────────────────────────────────────

const SEAT_LABELS = ['東', '北', '西', '南'];
const DEALER_ROTATION = [3, 0, 1, 2]; // 東→南→西→北: next dealer by seat index

// Cross layout: 3x3 grid mapping cell index → seat index
const CROSS_GRID: (number | null)[] = [null, 0, null, 3, null, 1, null, 2, null];

// ─── Helper Functions ───────────────────────────────────────────────────────────


function pickTopPlayers(
  statsArray: PlayerYearlyStats[],
  options: {
    getValue: (s: PlayerYearlyStats) => number;
    requirePositive?: boolean;
    formatValue?: (v: number) => string;
  }
): string[] {
  const { getValue, requirePositive = true, formatValue = (v) => String(v) } = options;

  const ranked = statsArray
    .map((stats) => ({ name: stats.name, value: getValue(stats) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  if (ranked.length === 0) return [];
  if (requirePositive && ranked[0].value <= 0) return [];

  return ranked.slice(0, 3).map((item) => `${item.name} (${formatValue(item.value)})`);
}

function pickBottomPlayers(
  statsArray: PlayerYearlyStats[],
  options: {
    getValue: (s: PlayerYearlyStats) => number;
    requireNegative?: boolean;
    formatValue?: (v: number) => string;
  }
): string[] {
  const { getValue, requireNegative = true, formatValue = (v) => String(v) } = options;

  const ranked = statsArray
    .map((stats) => ({ name: stats.name, value: getValue(stats) }))
    .sort((a, b) => a.value - b.value || a.name.localeCompare(b.name));

  if (ranked.length === 0) return [];
  if (requireNegative && ranked[0].value >= 0) return [];

  return ranked.slice(0, 3).map((item) => `${item.name} (${formatValue(item.value)})`);
}

function pickTopSpecialHands(statsArray: PlayerYearlyStats[]): string[] {
  const ranked = statsArray
    .map((stats) => ({
      name: stats.name,
      hand: stats.maxSingleHand?.name || '',
      rank: stats.maxSingleHand?.rank || 0,
    }))
    .filter((item) => item.hand && item.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));

  if (ranked.length === 0) return [];
  return ranked.slice(0, 3).map((item) => `${item.name} (${item.hand})`);
}

function pickTopConsecutiveDealer(games: Game[]): string[] {
  const maxStreaks = new Map<string, number>();

  for (const game of games) {
    let ds = 0, dk = 0;
    for (const round of game.rounds) {
      if (round.winType === 'draw') {
        dk++;
        const name = game.seats[ds];
        const prev = maxStreaks.get(name) || 0;
        if (dk > prev) maxStreaks.set(name, dk);
        continue;
      }
      const winners = round.winnerSeats && round.winnerSeats.length > 1
        ? round.winnerSeats : [round.winnerSeat];
      if (winners.includes(ds)) {
        dk++;
        const name = game.seats[ds];
        const prev = maxStreaks.get(name) || 0;
        if (dk > prev) maxStreaks.set(name, dk);
      } else {
        ds = DEALER_ROTATION[ds];
        dk = 0;
      }
    }
  }

  const ranked = [...maxStreaks.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (ranked.length === 0) return [];
  return ranked.slice(0, 3).map(([name, count]) => `${name} (連${count}莊)`);
}

function computeYearlyData(games: Game[]): YearlyData[] {
  if (games.length === 0) return [];

  const byYear = new Map<number, Map<string, PlayerYearlyStats>>();

  for (const game of games) {
    const year = new Date(game.date).getFullYear();
    if (!byYear.has(year)) byYear.set(year, new Map());
    const playerStats = byYear.get(year)!;

    let highestScore = Number.NEGATIVE_INFINITY;
    let lowestScore = Number.POSITIVE_INFINITY;

    game.players.forEach((player) => {
      if (player.score > highestScore) highestScore = player.score;
      if (player.score < lowestScore) lowestScore = player.score;
    });

    for (const player of game.players) {
      if (!playerStats.has(player.name)) {
        playerStats.set(player.name, {
          name: player.name,
          totalScore: 0,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          specialCount: 0,
          specialBreakdown: {},
          maxSingleHand: { name: '', rank: 0 },
        });
      }

      const stats = playerStats.get(player.name)!;
      const specialHands = parseSpecialHands(player.special);

      stats.totalScore += player.score;
      stats.gamesPlayed += 1;
      stats.specialCount += specialHands.length;

      specialHands.forEach((handName) => {
        const currentCount = stats.specialBreakdown[handName] || 0;
        stats.specialBreakdown[handName] = currentCount + 1;

        const handRank = getSpecialHandRank(handName);
        if (handRank > stats.maxSingleHand.rank) {
          stats.maxSingleHand = { name: handName, rank: handRank };
        }
      });

      if (player.score === highestScore) stats.wins += 1;
    }

    // Count actual 出統 from round data (loserSeat in chutong rounds)
    for (const round of (game.rounds || [])) {
      if (round.winType === 'chutong' && round.loserSeat !== undefined) {
        const loserName = game.seats[round.loserSeat];
        if (loserName && playerStats.has(loserName)) {
          playerStats.get(loserName)!.losses += 1;
        }
      }
    }
  }

  const years = [...byYear.keys()].sort((a, b) => b - a);

  return years.map((year) => {
    const statsMap = byYear.get(year)!;
    const stats = [...statsMap.values()];
    return { year, stats };
  });
}

function computeScoresFromRounds(seats: string[], rounds: Round[], baseRate: number): Player[] {
  const scores = [0, 0, 0, 0];
  const specials: string[][] = [[], [], [], []];

  let dealerSeat = 0;
  let dealerStreak = 0;

  for (const round of rounds) {
    const amount = round.fan * baseRate;
    const dealerExtra = (2 * dealerStreak + 1) * baseRate;

    // Draw: no score change, dealer stays with 連莊
    if (round.winType === 'draw') { dealerStreak++; continue; }

    const winners = round.winnerSeats && round.winnerSeats.length > 1
      ? round.winnerSeats : [round.winnerSeat];

    if (round.winType === 'zimo') {
      // Non-dealer 自摸: dealer pays extra (2N+1); dealer 自摸: no extra
      for (let i = 0; i < 4; i++) {
        if (i !== round.winnerSeat) {
          const extra = (i === dealerSeat && round.winnerSeat !== dealerSeat) ? dealerExtra : 0;
          scores[i] -= (amount + extra);
          scores[round.winnerSeat] += (amount + extra);
        }
      }
    } else if (round.loserSeat !== undefined) {
      if (winners.length > 1 && round.fans) {
        // 一炮雙響 / 一炮三響: loser pays each winner their individual fan
        for (let w = 0; w < winners.length; w++) {
          const winnerAmount = round.fans[w] * baseRate;
          scores[winners[w]] += winnerAmount;
          scores[round.loserSeat] -= winnerAmount;
        }
      } else {
        scores[round.winnerSeat] += amount;
        scores[round.loserSeat] -= amount;
      }
    }

    // Specials
    if (winners.length > 1 && round.specials) {
      winners.forEach((seat, idx) => {
        if (round.specials![idx]) specials[seat].push(round.specials![idx]);
      });
    } else if (round.special) {
      specials[round.winnerSeat].push(round.special);
    }

    // Update dealer: stays if any winner is dealer, rotates otherwise
    if (winners.includes(dealerSeat)) {
      dealerStreak++;
    } else {
      dealerSeat = DEALER_ROTATION[dealerSeat];
      dealerStreak = 0;
    }
  }

  return seats.map((name, i) => ({
    name,
    score: scores[i],
    special: specials[i].join(', '),
  }));
}

// ─── Inline Components ──────────────────────────────────────────────────────────

function Card({ children, className = '', onClick }: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  key?: React.Key;
}) {
  return (
    <div
      className={`bg-[#1A1D23] rounded-xl shadow-lg border border-[#2A2D33] p-3 sm:p-4 ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function Button({ children, onClick, variant = 'primary', className = '', disabled = false, type = 'button' }: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const base = 'px-4 py-2 rounded-xl font-medium transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    primary: 'bg-[#3df2bc] text-[#0B0E14] hover:bg-[#2fd8a5]',
    secondary: 'bg-[#2A2D33] text-[#E0E6ED] hover:bg-[#353840]',
    danger: 'bg-[#FF3131] text-white hover:bg-[#e02020]',
    ghost: 'bg-transparent text-[#707A8A] hover:text-[#E0E6ED] hover:bg-[#1A1D23]',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function NavButton({ active, onClick, icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-4 py-1 transition-all duration-200 ${
        active ? 'text-[#3df2bc]' : 'text-[#707A8A] hover:text-[#E0E6ED]'
      }`}
    >
      <i className={`fas ${icon} text-lg`} />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function TableInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-[#0B0E14] border border-[#2A2D33] rounded-lg px-3 py-2 text-[#E0E6ED] placeholder-[#707A8A] focus:outline-none focus:border-[#3df2bc] transition-all ${props.className || ''}`}
    />
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────────

export default function App() {
  // Home page
  const [showHome, setShowHome] = useState(true);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  // Data state
  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Navigation
  const [activeTab, setActiveTab] = useState<'record' | 'games' | 'review'>('record');
  const [reviewYear, setReviewYear] = useState<number | null>(null);

  // VIP list
  const [vipList, setVipList] = useState<VIPMember[]>([]);

  // Game Setup (before session starts)
  const [gameDate, setGameDate] = useState(new Date().toISOString().split('T')[0]);
  const [gameNote, setGameNote] = useState('30');
  const [baseRate, setBaseRate] = useState(10);
  const [seatAssignments, setSeatAssignments] = useState<(string | null)[]>([null, null, null, null]);
  const [selectingSeat, setSelectingSeat] = useState<number | null>(null);
  const [customName, setCustomName] = useState('');

  // Active Game Session
  const [gameSession, setGameSession] = useState<{
    date: string;
    note: string;
    baseRate: number;
    seats: string[];
    rounds: Round[];
    dealerSeat: number;
    dealerStreak: number;
  } | null>(null);

  // Round form
  const [roundWinners, setRoundWinners] = useState<number[]>([]);
  const [roundWinType, setRoundWinType] = useState<'zimo' | 'chutong' | null>(null);
  const [roundLoser, setRoundLoser] = useState<number | null>(null);
  const [roundFans, setRoundFans] = useState<Map<number, number>>(new Map());
  const [roundSpecials, setRoundSpecials] = useState<Map<number, string>>(new Map());
  const [fanCalcTexts, setFanCalcTexts] = useState<Map<number, string>>(new Map());
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [activeWinnerTab, setActiveWinnerTab] = useState<number | null>(null);

  const resetRoundForm = () => {
    setRoundWinners([]);
    setRoundWinType(null);
    setRoundLoser(null);
    setRoundFans(new Map());
    setRoundSpecials(new Map());
    setFanCalcTexts(new Map());
    setEditingRoundId(null);
    setActiveWinnerTab(null);
  };

  // AI mode
  const [aiMode, setAiMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiParsing, setIsAiParsing] = useState(false);

  // AI analysis
  const [aiAnalysis, setAiAnalysis] = useState<Record<number, GeminiAnalysisResult | null>>({});
  const [isAiAnalyzing, setIsAiAnalyzing] = useState<number | null>(null);

  // Mahjong reference modal
  const [showMahjong, setShowMahjong] = useState(false);

  // ─── Initialization ──────────────────────────────────────────────────────────

  useEffect(() => {
    setVipList(loadVIPList());
  }, []);

  useEffect(() => {
    if (showHome) return;
    const unsubscribe = subscribeToGames((firebaseGames) => {
      setGames(firebaseGames);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [showHome]);

  // Load draft session after PIN accepted
  useEffect(() => {
    if (showHome) return;
    const unsubscribe = loadDraftSession((draft) => {
      if (draft && draft.seats.length === 4) {
        setGameSession({
          ...draft,
          dealerSeat: (draft as any).dealerSeat ?? 0,
          dealerStreak: (draft as any).dealerStreak ?? 0,
        });
        setActiveTab('record');
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHome]);

  // Auto-save game session to Firebase on every change
  useEffect(() => {
    if (gameSession) {
      saveDraftSession(gameSession);
    }
  }, [gameSession]);

  // ─── Computed Data ──────────────────────────────────────────────────────────

  const yearlyData = useMemo(() => computeYearlyData(games), [games]);

  const knownPlayerNames = useMemo(() => {
    const names = new Set<string>();
    games.forEach((g) => g.players.forEach((p) => names.add(p.name)));
    return Array.from(names);
  }, [games]);

  const roundTransfers = useMemo(() => {
    if (!gameSession) return [];
    const { rounds, baseRate } = gameSession;
    const result: number[][] = [];
    let ds = 0, dk = 0;
    for (const round of rounds) {
      const t = [0, 0, 0, 0];
      if (round.winType === 'draw') { result.push(t); dk++; continue; }
      const winners = round.winnerSeats && round.winnerSeats.length > 1
        ? round.winnerSeats : [round.winnerSeat];
      if (round.winType === 'zimo') {
        const amount = round.fan * baseRate;
        const dealerExtra = (2 * dk + 1) * baseRate;
        for (let i = 0; i < 4; i++) {
          if (i !== round.winnerSeat) {
            const extra = (i === ds && round.winnerSeat !== ds) ? dealerExtra : 0;
            t[i] -= (amount + extra);
            t[round.winnerSeat] += (amount + extra);
          }
        }
      } else if (round.loserSeat !== undefined) {
        if (winners.length > 1 && round.fans) {
          for (let w = 0; w < winners.length; w++) {
            const winnerAmount = round.fans[w] * baseRate;
            t[winners[w]] += winnerAmount;
            t[round.loserSeat] -= winnerAmount;
          }
        } else {
          const amount = round.fan * baseRate;
          t[round.winnerSeat] += amount;
          t[round.loserSeat] -= amount;
        }
      }
      result.push(t);
      if (winners.includes(ds)) { dk++; } else { ds = DEALER_ROTATION[ds]; dk = 0; }
    }
    return result;
  }, [gameSession]);

  // ─── Seat Assignment Handlers ─────────────────────────────────────────────

  const assignSeat = (seatIndex: number, name: string) => {
    setSeatAssignments((prev) => {
      const next = [...prev];
      next[seatIndex] = name;
      return next;
    });
    setSelectingSeat(null);
    setCustomName('');
  };

  const clearSeat = (seatIndex: number) => {
    setSeatAssignments((prev) => {
      const next = [...prev];
      next[seatIndex] = null;
      return next;
    });
  };

  // ─── Game Session Handlers ────────────────────────────────────────────────

  const startGameSession = () => {
    const filledSeats = seatAssignments.filter(Boolean);
    if (filledSeats.length < 4) {
      alert('Please assign all 4 seats.');
      return;
    }
    const unique = new Set(filledSeats.map((n) => n!.toLowerCase()));
    if (unique.size < 4) {
      alert('Each seat must have a different player.');
      return;
    }

    setGameSession({
      date: gameDate,
      note: gameNote,
      baseRate,
      seats: seatAssignments as string[],
      rounds: [],
      dealerSeat: 0,
      dealerStreak: 0,
    });
  };

  const addRound = () => {
    if (roundWinType === null) {
      alert('Please select 有人出統, 又自摸 or 流局.');
      return;
    }

    // Draw: no winner/loser/fan needed
    if (roundWinType === 'draw') {
      const drawRound: Round = {
        id: editingRoundId || crypto.randomUUID(),
        winnerSeat: -1,
        winType: 'draw',
        fan: 0,
        special: '',
      };
      if (editingRoundId) {
        setGameSession((prev) =>
          prev ? { ...prev, rounds: prev.rounds.map((r) => r.id === editingRoundId ? drawRound : r) } : prev
        );
      } else {
        // Dealer stays, 連莊 on draw
        setGameSession((prev) =>
          prev ? { ...prev, rounds: [...prev.rounds, drawRound], dealerStreak: prev.dealerStreak + 1 } : prev
        );
      }
      resetRoundForm();
      return;
    }

    if (roundWinners.length === 0) {
      alert('Please select a winner.');
      return;
    }
    if (roundWinType === 'chutong' && roundLoser === null) {
      alert('Please select who discarded (出統者).');
      return;
    }
    for (const seat of roundWinners) {
      const fan = roundFans.get(seat) ?? 3;
      if (fan <= 0) {
        alert(`${gameSession!.seats[seat]} 台數 must be greater than 0.`);
        return;
      }
    }

    const firstWinner = roundWinners[0];
    const firstFan = roundFans.get(firstWinner) ?? 3;
    const firstSpecial = roundSpecials.get(firstWinner) ?? '';
    const isMultiWinner = roundWinners.length > 1;

    if (editingRoundId) {
      // Update existing round
      const updatedRound: Round = {
        id: editingRoundId,
        winnerSeat: firstWinner,
        winType: roundWinType,
        ...(roundWinType === 'chutong' ? { loserSeat: roundLoser! } : {}),
        fan: firstFan,
        special: firstSpecial,
        ...(isMultiWinner ? {
          winnerSeats: [...roundWinners],
          fans: roundWinners.map(s => roundFans.get(s) ?? 3),
          specials: roundWinners.map(s => roundSpecials.get(s) ?? ''),
        } : {}),
      };

      // Preserve dealerStreak from original round if it had one
      const original = gameSession!.rounds.find((r) => r.id === editingRoundId);
      if (original?.dealerStreak) {
        updatedRound.dealerStreak = original.dealerStreak;
      }

      setGameSession((prev) =>
        prev ? {
          ...prev,
          rounds: prev.rounds.map((r) => r.id === editingRoundId ? updatedRound : r),
        } : prev
      );
    } else {
      // Add new round — dealer stays if ANY winner is the dealer
      const dealerAmongWinners = roundWinners.includes(gameSession!.dealerSeat);
      const newStreak = dealerAmongWinners ? gameSession!.dealerStreak + 1 : 0;

      const newRound: Round = {
        id: crypto.randomUUID(),
        winnerSeat: firstWinner,
        winType: roundWinType,
        ...(roundWinType === 'chutong' ? { loserSeat: roundLoser! } : {}),
        fan: firstFan,
        special: firstSpecial,
        ...(dealerAmongWinners ? { dealerStreak: newStreak } : {}),
        ...(isMultiWinner ? {
          winnerSeats: [...roundWinners],
          fans: roundWinners.map(s => roundFans.get(s) ?? 3),
          specials: roundWinners.map(s => roundSpecials.get(s) ?? ''),
        } : {}),
      };

      const nextDealerSeat = dealerAmongWinners
        ? gameSession!.dealerSeat
        : DEALER_ROTATION[gameSession!.dealerSeat];

      setGameSession((prev) =>
        prev ? {
          ...prev,
          rounds: [...prev.rounds, newRound],
          dealerSeat: nextDealerSeat,
          dealerStreak: dealerAmongWinners ? newStreak : 0,
        } : prev
      );
    }

    resetRoundForm();
  };

  const editRound = (round: Round) => {
    setEditingRoundId(round.id);
    setRoundWinType(round.winType);
    setRoundLoser(round.loserSeat ?? null);

    if (round.winType === 'draw') {
      setRoundWinners([]);
      setRoundFans(new Map());
      setRoundSpecials(new Map());
      setFanCalcTexts(new Map());
      setActiveWinnerTab(null);
      return;
    }

    if (round.winnerSeats && round.winnerSeats.length > 1) {
      setRoundWinners(round.winnerSeats);
      const fansMap = new Map<number, number>();
      const specialsMap = new Map<number, string>();
      round.winnerSeats.forEach((seat, idx) => {
        fansMap.set(seat, round.fans?.[idx] ?? round.fan);
        specialsMap.set(seat, round.specials?.[idx] ?? '');
      });
      setRoundFans(fansMap);
      setRoundSpecials(specialsMap);
      setActiveWinnerTab(round.winnerSeats[0]);
    } else {
      setRoundWinners([round.winnerSeat]);
      setRoundFans(new Map([[round.winnerSeat, round.fan]]));
      setRoundSpecials(new Map([[round.winnerSeat, round.special]]));
      setActiveWinnerTab(round.winnerSeat);
    }
    setFanCalcTexts(new Map());
  };

  const deleteRound = (roundId: string) => {
    setGameSession((prev) => {
      if (!prev) return prev;
      const remaining = prev.rounds.filter((r) => r.id !== roundId);
      let ds = 0, dk = 0;
      for (const r of remaining) {
        if (r.winType === 'draw') { dk++; continue; }
        const winners = r.winnerSeats && r.winnerSeats.length > 1
          ? r.winnerSeats : [r.winnerSeat];
        if (winners.includes(ds)) { dk++; }
        else { ds = DEALER_ROTATION[ds]; dk = 0; }
      }
      return { ...prev, rounds: remaining, dealerSeat: ds, dealerStreak: dk };
    });
    if (editingRoundId === roundId) resetRoundForm();
  };

  const endGameAndSave = async () => {
    if (!gameSession) return;

    const players = computeScoresFromRounds(
      gameSession.seats,
      gameSession.rounds,
      gameSession.baseRate
    );

    // Strip undefined values from rounds (Firebase rejects undefined)
    const cleanRounds = gameSession.rounds.map((r) =>
      JSON.parse(JSON.stringify(r))
    );

    const game: Game = {
      id: crypto.randomUUID(),
      date: gameSession.date,
      note: gameSession.note,
      baseRate: gameSession.baseRate,
      seats: gameSession.seats,
      rounds: cleanRounds,
      players,
    };

    try {
      await addGame(game);
      await clearDraftSession();

      // Reset everything
      setGameSession(null);
      setGameDate(new Date().toISOString().split('T')[0]);
      setGameNote('');
      setBaseRate(1);
      setSeatAssignments([null, null, null, null]);
      setActiveTab('games');
    } catch (err) {
      console.error('Failed to save game:', err);
      alert('Failed to save game. Please try again.');
    }
  };

  const cancelGameSession = () => {
    if (gameSession && gameSession.rounds.length > 0) {
      if (!confirm('Discard this game session? All rounds will be lost.')) return;
    }
    setGameSession(null);
  };

  // ─── Other Handlers ───────────────────────────────────────────────────────

  const handleDeleteGame = async (gameId: string) => {
    if (!confirm('Delete this game?')) return;
    await deleteGameFromDB(gameId);
  };

  const resumeGame = (game: Game) => {
    if (gameSession) {
      if (!confirm('You have an active game session. Resume this game instead?')) return;
    }
    setGameSession({
      date: game.date,
      note: game.note,
      baseRate: game.baseRate,
      seats: game.seats,
      rounds: game.rounds || [],
      dealerSeat: (game as any).dealerSeat ?? 0,
      dealerStreak: (game as any).dealerStreak ?? 0,
    });
    deleteGameFromDB(game.id);
    setActiveTab('record');
  };

  const handleAiParse = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiParsing(true);
    try {
      const result = await parseGameWithAI(aiPrompt, knownPlayerNames);
      if (result) {
        const players = result.players.map((p) => ({
          name: p.name,
          score: p.score,
          special: p.special || '',
        }));
        const game: Game = {
          id: crypto.randomUUID(),
          date: result.date || new Date().toISOString().split('T')[0],
          note: result.note || '',
          baseRate: 0,
          seats: players.map((p) => p.name),
          rounds: [],
          players,
        };
        await addGame(game);
        setAiMode(false);
        setAiPrompt('');
        setActiveTab('games');
      } else {
        alert('Could not parse the input. Please try again with more detail.');
      }
    } catch {
      alert('AI parsing failed. Please try manual entry.');
    }
    setIsAiParsing(false);
  };

  const handleAiAnalyze = async (year: number) => {
    setIsAiAnalyzing(year);
    try {
      const yearGames = games.filter((g) => new Date(g.date).getFullYear() === year);
      const result = await analyzePerformanceWithAI(JSON.stringify(yearGames), year);
      setAiAnalysis((prev) => ({ ...prev, [year]: result }));
    } catch {
      alert('AI analysis failed. Please try again.');
    }
    setIsAiAnalyzing(null);
  };

  // ─── Home Page ──────────────────────────────────────────────────────────────

  const handlePinDigit = (digit: string) => {
    setPinError(false);
    const next = pin + digit;
    if (next.length <= 4) {
      setPin(next);
      if (next.length === 4) {
        if (next === '7749') {
          signInAnonymousUser().then(() => {
            setShowHome(false);
          }).catch(() => {
            alert('Authentication failed. Please try again.');
            setPin('');
          });
        } else {
          setPinError(true);
          setTimeout(() => { setPin(''); setPinError(false); }, 600);
        }
      }
    }
  };

  const handlePinDelete = () => {
    setPinError(false);
    setPin((prev) => prev.slice(0, -1));
  };

  if (showHome) {
    return (
      <div className="min-h-screen bg-[#0B0E14] flex flex-col items-center justify-center select-none px-4">
        <img
          src={iconImg}
          alt="App Icon"
          className="w-32 h-32 rounded-3xl shadow-2xl mb-4"
        />
        <h1 className="text-2xl font-bold text-[#E0E6ED] tracking-wide mb-8">
          漢奸撚麻雀醫館App
        </h1>

        {/* PIN dots */}
        <div className="flex gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                pinError
                  ? 'bg-[#FF3131]'
                  : i < pin.length
                    ? 'bg-[#3df2bc]'
                    : 'bg-[#2A2D33] border border-[#707A8A]'
              } ${pinError ? 'animate-shake' : ''}`}
            />
          ))}
        </div>

        <p className={`text-sm mb-6 ${pinError ? 'text-[#FF3131]' : 'text-[#707A8A]'}`}>
          {pinError ? '密碼錯誤' : '請輸入密碼'}
        </p>

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-3 max-w-[240px]">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key) => {
            if (key === '') return <div key="empty" />;
            return (
              <button
                key={key}
                onClick={() => key === '⌫' ? handlePinDelete() : handlePinDigit(key)}
                className="w-16 h-16 rounded-full bg-[#1A1D23] border border-[#2A2D33] text-[#E0E6ED] text-xl font-medium flex items-center justify-center hover:bg-[#2A2D33] active:scale-95 transition-all"
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Loading State ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center">
        <div className="text-[#3df2bc] text-xl font-bold animate-pulse">
          <i className="fas fa-mahjong mr-2" />
          Loading...
        </div>
      </div>
    );
  }

  // ─── Record Game Tab ────────────────────────────────────────────────────────

  const renderRecordTab = () => {
    // ── Active game session: round recording ──
    if (gameSession) {
      const scores = computeScoresFromRounds(
        gameSession.seats,
        gameSession.rounds,
        gameSession.baseRate
      );

      return (
        <div className="space-y-4">
          {/* Game header with player scores */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm text-[#3df2bc] font-semibold">{gameSession.date}</span>
                <span className="text-xs text-[#707A8A] ml-2">${gameSession.baseRate}/台</span>
                {gameSession.note && (
                  <span className="text-xs text-[#707A8A] ml-2">({gameSession.note})</span>
                )}
              </div>
              <Button variant="ghost" onClick={cancelGameSession} className="text-xs px-2 py-1">
                <i className="fas fa-xmark mr-1" />Cancel
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 max-w-[240px] sm:max-w-xs mx-auto place-items-center">
              {CROSS_GRID.map((seatIdx, cellIdx) => {
                if (seatIdx === null) {
                  return <div key={cellIdx} />;
                }
                const name = gameSession.seats[seatIdx];
                const vip = vipList.find((v) => v.name === name);
                const score = scores[seatIdx]?.score || 0;
                return (
                  <div key={cellIdx} className="flex flex-col items-center text-center">
                    {vip?.image ? (
                      <img
                        src={vip.image}
                        alt={name}
                        className="w-10 h-10 rounded-full object-cover mb-1"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#2A2D33] flex items-center justify-center mb-1 text-sm font-bold text-[#707A8A]">
                        {name[0]}
                      </div>
                    )}
                    <span className="text-xs text-[#FFD700]">
                      {SEAT_LABELS[seatIdx]}
                      {seatIdx === gameSession.dealerSeat && (
                        <span className="ml-0.5 text-[#FF6B35]">莊{gameSession.dealerStreak > 0 ? `(${gameSession.dealerStreak})` : ''}</span>
                      )}
                    </span>
                    <span className="text-xs font-medium text-[#E0E6ED] truncate w-full">
                      {name}
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        score > 0
                          ? 'text-[#3df2bc]'
                          : score < 0
                            ? 'text-[#FF3131]'
                            : 'text-[#707A8A]'
                      }`}
                    >
                      {score > 0 ? '+' : ''}
                      {score}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Add round form */}
          <Card>
            <h3 className="text-sm font-semibold text-[#E0E6ED] mb-3">食胡未?</h3>

            {/* Win type */}
            <div className="mb-3">
              <label className="block text-xs text-[#707A8A] mb-1">點食先</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRoundWinType('chutong');
                    setRoundLoser(null);
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    roundWinType === 'chutong'
                      ? 'bg-[#FF3131] text-white'
                      : 'bg-[#0B0E14] text-[#E0E6ED] border border-[#2A2D33]'
                  }`}
                >
                  有人出統
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRoundWinType('zimo');
                    setRoundLoser(null);
                    // Trim to single winner if multiple selected
                    if (roundWinners.length > 1) {
                      const first = roundWinners[0];
                      setRoundWinners([first]);
                      setRoundFans(new Map([[first, roundFans.get(first) ?? 3]]));
                      setRoundSpecials(new Map([[first, roundSpecials.get(first) ?? '']]));
                      setFanCalcTexts(new Map([[first, fanCalcTexts.get(first) ?? '']]));
                      setActiveWinnerTab(first);
                    }
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    roundWinType === 'zimo'
                      ? 'bg-[#FFD700] text-[#0B0E14]'
                      : 'bg-[#0B0E14] text-[#E0E6ED] border border-[#2A2D33]'
                  }`}
                >
                  又自摸 !!!
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRoundWinType('draw');
                    setRoundLoser(null);
                    setRoundWinners([]);
                    setRoundFans(new Map());
                    setRoundSpecials(new Map());
                    setFanCalcTexts(new Map());
                    setActiveWinnerTab(null);
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    roundWinType === 'draw'
                      ? 'bg-[#707A8A] text-white'
                      : 'bg-[#0B0E14] text-[#E0E6ED] border border-[#2A2D33]'
                  }`}
                >
                  流局
                </button>
              </div>
            </div>

            {/* Winner / Loser / Fan sections (hidden for draw) */}
            {roundWinType !== 'draw' && (<>
            <div className="mb-3">
              <label className="block text-xs text-[#707A8A] mb-1">
                邊個又食胡
                {roundWinType === 'chutong' && roundWinners.length === 2 && (
                  <span className="text-[#FFD700] ml-2">一炮雙響</span>
                )}
                {roundWinType === 'chutong' && roundWinners.length === 3 && (
                  <span className="text-[#FFD700] ml-2">一炮三響</span>
                )}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {gameSession.seats.map((name, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (roundWinType === 'chutong') {
                        // Multi-select mode for chutong
                        setRoundWinners(prev => {
                          if (prev.includes(i)) {
                            const next = prev.filter(w => w !== i);
                            setRoundFans(m => { const n = new Map(m); n.delete(i); return n; });
                            setRoundSpecials(m => { const n = new Map(m); n.delete(i); return n; });
                            setFanCalcTexts(m => { const n = new Map(m); n.delete(i); return n; });
                            if (activeWinnerTab === i) setActiveWinnerTab(next[0] ?? null);
                            return next;
                          } else if (prev.length < 3) {
                            setRoundFans(m => new Map(m).set(i, 3));
                            setRoundSpecials(m => new Map(m).set(i, ''));
                            setFanCalcTexts(m => new Map(m).set(i, ''));
                            setActiveWinnerTab(i);
                            if (roundLoser === i) setRoundLoser(null);
                            return [...prev, i];
                          }
                          return prev;
                        });
                      } else {
                        // Single-select mode for zimo or no type yet
                        if (roundWinners.includes(i) && roundWinners.length === 1) {
                          setRoundWinners([]);
                          setRoundFans(new Map());
                          setRoundSpecials(new Map());
                          setFanCalcTexts(new Map());
                          setActiveWinnerTab(null);
                        } else {
                          setRoundWinners([i]);
                          setRoundFans(new Map([[i, 3]]));
                          setRoundSpecials(new Map([[i, '']]));
                          setFanCalcTexts(new Map([[i, '']]));
                          setActiveWinnerTab(i);
                          if (roundLoser === i) setRoundLoser(null);
                        }
                      }
                    }}
                    className={`px-2 py-2 rounded-lg text-xs font-medium text-center transition-all ${
                      roundWinners.includes(i)
                        ? 'bg-[#3df2bc] text-[#0B0E14]'
                        : 'bg-[#0B0E14] text-[#E0E6ED] border border-[#2A2D33] hover:border-[#3df2bc]'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Loser (if chutong) */}
            {roundWinType === 'chutong' && (() => {
              const nonWinners = [0, 1, 2, 3].filter(i => !roundWinners.includes(i));
              // Auto-select loser when only 1 non-winner remains (一炮三響)
              if (nonWinners.length === 1 && roundLoser !== nonWinners[0]) {
                setTimeout(() => setRoundLoser(nonWinners[0]), 0);
              }
              return (
                <div className="mb-3">
                  <label className="block text-xs text-[#707A8A] mb-1">邊個又出統</label>
                  {nonWinners.length === 1 ? (
                    <div className="text-sm text-[#FF3131] font-medium px-3 py-2 bg-[#FF3131]/10 rounded-lg">
                      {gameSession.seats[nonWinners[0]]}
                    </div>
                  ) : (
                    <div className={`grid grid-cols-${nonWinners.length} gap-2`}>
                      {nonWinners.map(i => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setRoundLoser(i)}
                          className={`px-2 py-2 rounded-lg text-xs font-medium text-center transition-all ${
                            roundLoser === i
                              ? 'bg-[#FF3131] text-white'
                              : 'bg-[#0B0E14] text-[#E0E6ED] border border-[#2A2D33] hover:border-[#FF3131]'
                          }`}
                        >
                          {gameSession.seats[i]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Winner tabs for multi-winner */}
            {roundWinners.length > 1 && (
              <div className="mb-2">
                <label className="block text-xs text-[#707A8A] mb-1">
                  {roundWinners.length === 2 ? '一炮雙響' : '一炮三響'} — 每人台數
                </label>
                <div className="flex gap-2">
                  {roundWinners.map(seat => (
                    <button
                      key={seat}
                      type="button"
                      onClick={() => setActiveWinnerTab(seat)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        activeWinnerTab === seat
                          ? 'bg-[#3df2bc] text-[#0B0E14]'
                          : 'bg-[#0B0E14] text-[#E0E6ED] border border-[#2A2D33]'
                      }`}
                    >
                      {gameSession.seats[seat]}
                      <span className="ml-1 opacity-70">({roundFans.get(seat) ?? 3}台)</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Fan + Special (per active winner tab) */}
            {activeWinnerTab !== null && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-[#707A8A] mb-1">
                      {roundWinners.length > 1 ? `${gameSession.seats[activeWinnerTab]} 台數` : '台數'}
                    </label>
                    <TableInput
                      type="number"
                      min={1}
                      value={roundFans.get(activeWinnerTab) ?? 3}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setRoundFans(m => new Map(m).set(activeWinnerTab!, val));
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#707A8A] mb-1">食咩大牌</label>
                    <SpecialHandPicker
                      value={roundSpecials.get(activeWinnerTab) ?? ''}
                      onChange={(val) => setRoundSpecials(m => new Map(m).set(activeWinnerTab!, val))}
                    />
                  </div>
                </div>

                {/* Fan Calculator */}
                <div className="mb-3">
                  <label className="block text-xs text-[#707A8A] mb-1">
                    台數助手 <span className="text-[#3df2bc]">— 人工智障自動計算</span>
                  </label>
                  <input
                    type="text"
                    value={fanCalcTexts.get(activeWinnerTab) ?? ''}
                    onChange={(e) => {
                      const text = e.target.value;
                      const tab = activeWinnerTab!;
                      setFanCalcTexts(m => new Map(m).set(tab, text));
                      if (text.trim()) {
                        const result = parseFanFromText(text);
                        if (result.total > 0) setRoundFans(m => new Map(m).set(tab, result.total));
                      }
                    }}
                    placeholder="例: 莊家、連2、正花、碰中"
                    className="w-full bg-[#0B0E14] text-[#E0E6ED] border border-[#2A2D33] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3df2bc] placeholder-[#707A8A]"
                  />
                  {(fanCalcTexts.get(activeWinnerTab) ?? '').trim() && (() => {
                    const result = parseFanFromText(fanCalcTexts.get(activeWinnerTab) ?? '');
                    if (result.items.length === 0) return null;
                    return (
                      <div className="mt-1.5 bg-[#0B0E14] rounded-lg px-3 py-2 border border-[#2A2D33]">
                        <div className="text-xs text-[#707A8A]">
                          {result.items.map((item, idx) => (
                            <span key={idx}>
                              {idx > 0 && <span className="text-[#2A2D33] mx-1">+</span>}
                              <span className="text-[#E0E6ED]">{item.label}</span>
                              <span className="text-[#707A8A]">({item.value})</span>
                            </span>
                          ))}
                          <span className="text-[#2A2D33] mx-1">=</span>
                          <span className="text-[#3df2bc] font-bold">{result.total}台</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
            </>)}

            <div className="flex gap-2">
              {editingRoundId && (
                <Button
                  variant="secondary"
                  onClick={() => resetRoundForm()}
                  className="px-4"
                >
                  取消
                </Button>
              )}
              <Button onClick={addRound} className="flex-1">
                <i className={`fas ${editingRoundId ? 'fa-check' : 'fa-plus'} mr-2`} />
                {editingRoundId ? '更新' : '下局會更好'}
              </Button>
            </div>
          </Card>

          {/* Round history */}
          {gameSession.rounds.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-[#E0E6ED] mb-3">
                Rounds ({gameSession.rounds.length})
              </h3>
              <div className="space-y-2">
                {[...gameSession.rounds].reverse().map((round) => {
                  const idx = gameSession.rounds.indexOf(round);
                  const isMultiWinner = round.winnerSeats && round.winnerSeats.length > 1;
                  return (
                    <div
                      key={round.id}
                      className={`rounded-lg px-3 py-2 ${editingRoundId === round.id ? 'bg-[#3df2bc]/10 border border-[#3df2bc]/30' : 'bg-[#0B0E14]'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 text-sm">
                          <span className="text-[#707A8A]">#{idx + 1}</span>
                          {round.winType === 'draw' ? (
                            <span className="text-[#707A8A] font-medium ml-2">流局</span>
                          ) : isMultiWinner ? (
                            <>
                              <span className="text-[#FFD700] font-medium ml-2">
                                {round.winnerSeats!.length === 2 ? '一炮雙響' : '一炮三響'}
                              </span>
                              <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-[#FF3131]/20 text-[#FF3131]">
                                出統
                              </span>
                              {round.loserSeat !== undefined && (
                                <span className="text-[#FF3131] text-xs ml-1">
                                  ← {gameSession.seats[round.loserSeat]}
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="text-[#3df2bc] font-medium ml-2">
                                {gameSession.seats[round.winnerSeat]}
                              </span>
                              <span
                                className={`ml-1 text-xs px-1.5 py-0.5 rounded ${
                                  round.winType === 'zimo'
                                    ? 'bg-[#FFD700]/20 text-[#FFD700]'
                                    : 'bg-[#FF3131]/20 text-[#FF3131]'
                                }`}
                              >
                                {round.winType === 'zimo' ? '自摸' : '出統'}
                              </span>
                              {round.winType === 'chutong' && round.loserSeat !== undefined && (
                                <span className="text-[#FF3131] text-xs ml-1">
                                  ← {gameSession.seats[round.loserSeat]}
                                </span>
                              )}
                              <span className="text-[#E0E6ED] ml-2">{round.fan}台</span>
                              {round.special && (
                                <span className="text-[#FFD700] text-xs ml-2">{round.special}</span>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => editRound(round)}
                            className={`transition-colors px-2 ${editingRoundId === round.id ? 'text-[#3df2bc]' : 'text-[#707A8A] hover:text-[#3df2bc]'}`}
                          >
                            <i className="fas fa-pen text-xs" />
                          </button>
                          <button
                            onClick={() => deleteRound(round.id)}
                            className="text-[#707A8A] hover:text-[#FF3131] transition-colors px-2"
                          >
                            <i className="fas fa-xmark text-xs" />
                          </button>
                        </div>
                      </div>
                      {isMultiWinner && (
                        <div className="mt-1 text-xs">
                          {round.winnerSeats!.map((seat, wIdx) => (
                            <span key={seat}>
                              {wIdx > 0 && <span className="text-[#2A2D33] mx-1">|</span>}
                              <span className="text-[#3df2bc]">{gameSession.seats[seat]}</span>
                              <span className="text-[#E0E6ED] ml-1">{round.fans?.[wIdx] ?? round.fan}台</span>
                              {round.specials?.[wIdx] && (
                                <span className="text-[#FFD700] ml-1">{round.specials[wIdx]}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                      {roundTransfers[idx] && (
                        <div className="flex gap-3 mt-1 text-xs">
                          {gameSession.seats.map((name, i) => {
                            const val = roundTransfers[idx][i];
                            return (
                              <span key={i} className={val > 0 ? 'text-[#3df2bc]' : val < 0 ? 'text-[#FF3131]' : 'text-[#707A8A]'}>
                                {name} {val > 0 ? '+' : ''}{val}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* End game */}
          <Button
            onClick={endGameAndSave}
            className="w-full"
            disabled={gameSession.rounds.length === 0}
          >
            <i className="fas fa-flag-checkered mr-2" />
            完
          </Button>
        </div>
      );
    }

    // ── Game setup (no active session) ──
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#E0E6ED]">新一局</h2>
            <Button
              variant={aiMode ? 'primary' : 'secondary'}
              onClick={() => setAiMode(!aiMode)}
              className="text-sm px-3 py-1"
            >
              <i className={`fas ${aiMode ? 'fa-keyboard' : 'fa-wand-magic-sparkles'} mr-1`} />
              {aiMode ? 'Manual' : 'AI'}
            </Button>
          </div>

          {aiMode ? (
            <div className="space-y-3">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={
                  "e.g. 1月15日 Alan 500, Bob -200, Charlie 300, David -600, Alan打咗大三元\n\nor: Jan 15 game, Alan won 500, Bob lost 200..."
                }
                className="w-full bg-[#0B0E14] border border-[#2A2D33] rounded-lg px-3 py-3 text-[#E0E6ED] placeholder-[#707A8A] focus:outline-none focus:border-[#3df2bc] transition-all min-h-[120px] resize-none"
              />
              <Button
                onClick={handleAiParse}
                disabled={isAiParsing || !aiPrompt.trim()}
                className="w-full"
              >
                {isAiParsing ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-wand-magic-sparkles mr-2" />
                    Parse & Save with AI
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Date, Rate, Note */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                <div>
                  <label className="block text-xs text-[#707A8A] mb-1">良辰吉日</label>
                  <TableInput
                    type="date"
                    value={gameDate}
                    onChange={(e) => setGameDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#707A8A] mb-1">底</label>
                  <TableInput
                    type="number"
                    min={0}
                    step={10}
                    value={gameNote}
                    onChange={(e) => setGameNote(e.target.value)}
                    placeholder="e.g. 20"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-[#707A8A] mb-1">打幾大</label>
                  <TableInput
                    type="number"
                    min={10}
                    step={10}
                    value={baseRate}
                    onChange={(e) => setBaseRate(Number(e.target.value))}
                    placeholder="e.g. 10"
                  />
                </div>
              </div>

              {/* Seat assignments - cross layout */}
              <div>
                <h3 className="text-sm font-semibold text-[#E0E6ED] mb-2">簡靚位</h3>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {CROSS_GRID.map((seatIdx, cellIdx) => {
                    if (seatIdx === null) return <div key={cellIdx} />;
                    const label = SEAT_LABELS[seatIdx];
                    return (
                      <div
                        key={cellIdx}
                        className="bg-[#0B0E14] border border-[#2A2D33] rounded-xl p-2 sm:p-3"
                      >
                        <div className="flex items-center justify-center mb-2 relative">
                          <span className="text-sm font-bold text-[#FFD700]">{label}</span>
                          {seatAssignments[seatIdx] && (
                            <button
                              onClick={() => clearSeat(seatIdx)}
                              className="absolute right-0 text-[#707A8A] hover:text-[#FF3131] transition-colors"
                            >
                              <i className="fas fa-xmark text-xs" />
                            </button>
                          )}
                        </div>

                        {seatAssignments[seatIdx] ? (
                          /* Assigned player */
                          <div className="flex flex-col items-center gap-1">
                            {(() => {
                              const vip = vipList.find((v) => v.name === seatAssignments[seatIdx]);
                              return vip?.image ? (
                                <img
                                  src={vip.image}
                                  alt={seatAssignments[seatIdx]!}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-[#2A2D33] flex items-center justify-center text-xs font-bold text-[#707A8A]">
                                  {seatAssignments[seatIdx]![0]}
                                </div>
                              );
                            })()}
                            <span className="text-sm font-medium text-[#E0E6ED] text-center">
                              {seatAssignments[seatIdx]}
                            </span>
                          </div>
                        ) : selectingSeat === seatIdx ? (
                          /* VIP picker + custom name */
                          <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-1">
                              {vipList
                                .filter((v) => !seatAssignments.includes(v.name))
                                .map((vip) => (
                                  <button
                                    key={vip.name}
                                    onClick={() => assignSeat(seatIdx, vip.name)}
                                    className="flex flex-col items-center gap-0.5 p-1 rounded-lg hover:bg-[#2A2D33] transition-colors"
                                  >
                                    {vip.image ? (
                                      <img
                                        src={vip.image}
                                        alt={vip.name}
                                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#2A2D33] flex items-center justify-center text-xs font-bold text-[#707A8A]">
                                        {vip.name[0]}
                                      </div>
                                    )}
                                    <span className="text-[9px] sm:text-[10px] text-[#707A8A] truncate w-full text-center">
                                      {vip.name}
                                    </span>
                                  </button>
                                ))}
                            </div>
                            <div className="flex gap-1">
                              <TableInput
                                type="text"
                                placeholder="Or type name..."
                                value={customName}
                                onChange={(e) => setCustomName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && customName.trim()) {
                                    assignSeat(seatIdx, customName.trim());
                                  }
                                }}
                                className="text-xs"
                              />
                              <button
                                onClick={() => {
                                  if (customName.trim()) assignSeat(seatIdx, customName.trim());
                                }}
                                className="text-[#3df2bc] px-2 hover:bg-[#2A2D33] rounded-lg transition-colors"
                              >
                                <i className="fas fa-check text-xs" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Empty seat - tap to select */
                          <button
                            onClick={() => {
                              setSelectingSeat(seatIdx);
                              setCustomName('');
                            }}
                            className="w-full py-2 text-sm text-[#707A8A] hover:text-[#3df2bc] transition-colors"
                          >
                            <i className="fas fa-plus mr-1" />
                            參賽者
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Start game button */}
              <Button
                onClick={startGameSession}
                className="w-full"
                disabled={seatAssignments.filter(Boolean).length < 4}
              >
                <i className="fas fa-play mr-2" />
                開始戰爭
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  };

  // ─── All Games Tab ──────────────────────────────────────────────────────────

  const renderGamesTab = () => {
    if (games.length === 0) {
      return (
        <Card className="text-center py-8">
          <i className="fas fa-dice text-4xl text-[#707A8A] mb-3" />
          <p className="text-[#707A8A]">No games yet... Start by recording a game!</p>
        </Card>
      );
    }

    const sortedGames = [...games].reverse();

    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-[#E0E6ED] px-1">
          All Games <span className="text-sm text-[#707A8A] font-normal">({games.length})</span>
        </h2>
        {sortedGames.map((game) => {
          const specialPlayers = game.players.filter((p) => p.special);
          const roundCount = game.rounds?.length || 0;
          return (
            <Card key={game.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#3df2bc]">{game.date}</span>
                  {game.note && (
                    <span className="text-xs text-[#707A8A] bg-[#0B0E14] px-2 py-0.5 rounded-full">
                      {game.note}
                    </span>
                  )}
                  {roundCount > 0 && (
                    <span className="text-xs text-[#707A8A] bg-[#0B0E14] px-2 py-0.5 rounded-full">
                      {roundCount} rounds
                    </span>
                  )}
                  {game.baseRate > 0 && (
                    <span className="text-xs text-[#707A8A] bg-[#0B0E14] px-2 py-0.5 rounded-full">
                      ${game.baseRate}/台
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => resumeGame(game)}
                    className="text-[#707A8A] hover:text-[#3df2bc] transition-colors px-2 py-1"
                    title="Resume editing"
                  >
                    <i className="fas fa-pen-to-square text-xs" />
                  </button>
                  <button
                    onClick={() => handleDeleteGame(game.id)}
                    className="text-[#707A8A] hover:text-[#FF3131] transition-colors px-2 py-1"
                    title="Delete game"
                  >
                    <i className="fas fa-trash text-xs" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {game.players.map((player, i) => (
                  <span
                    key={i}
                    className={`text-sm px-2 py-1 rounded-lg ${
                      player.score > 0
                        ? 'bg-[#3df2bc]/10 text-[#3df2bc]'
                        : player.score < 0
                          ? 'bg-[#FF3131]/10 text-[#FF3131]'
                          : 'bg-[#2A2D33] text-[#E0E6ED]'
                    }`}
                  >
                    {player.name}{' '}
                    <span className="font-semibold">
                      {player.score > 0 ? '+' : ''}
                      {player.score}
                    </span>
                  </span>
                ))}
              </div>

              {specialPlayers.length > 0 && (
                <div className="text-xs text-[#FFD700]">
                  <i className="fas fa-star mr-1" />
                  {specialPlayers.map((p) => `${p.name}: ${p.special}`).join(' | ')}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  // ─── Yearly Review Tab ──────────────────────────────────────────────────────

  const renderReviewTab = () => {
    if (yearlyData.length === 0) {
      return (
        <Card className="text-center py-8">
          <i className="fas fa-chart-line text-4xl text-[#707A8A] mb-3" />
          <p className="text-[#707A8A]">Add games to generate yearly insights.</p>
        </Card>
      );
    }

    const selectedYear = reviewYear ?? yearlyData[0]?.year;
    const selectedData = yearlyData.find((d) => d.year === selectedYear);

    if (!selectedData) return null;

    return (
      <div className="space-y-6">
        {/* Year selector */}
        {yearlyData.length > 1 && (
          <div className="flex items-center gap-2 px-1">
            {yearlyData.map(({ year }) => (
              <button
                key={year}
                onClick={() => setReviewYear(year)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  year === selectedYear
                    ? 'bg-[#3df2bc] text-[#0B0E14]'
                    : 'bg-[#1A1D23] text-[#707A8A] border border-[#2A2D33] hover:text-[#E0E6ED]'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        )}
        {[selectedData].map(({ year, stats }) => {
          const mostMoneyWinTop3 = pickTopPlayers(stats, {
            getValue: (s) => s.totalScore,
            requirePositive: false,
            formatValue: (v) => String(v),
          });
          const mostLossesTop3 = pickTopPlayers(stats, {
            getValue: (s) => s.losses,
            requirePositive: true,
            formatValue: (v) => `${v}次`,
          });
          const mostMoneyLoseTop3 = pickBottomPlayers(stats, {
            getValue: (s) => s.totalScore,
            requireNegative: true,
            formatValue: (v) => String(v),
          });
          const maxSingleHandTop3 = pickTopSpecialHands(stats);
          const consecutiveDealerTop3 = pickTopConsecutiveDealer(
            games.filter((g) => new Date(g.date).getFullYear() === year)
          );
          const totalGamesInYear = games.filter((g) => new Date(g.date).getFullYear() === year).length;
          const mostAttendanceTop3 = pickTopPlayers(stats, {
            getValue: (s) => s.gamesPlayed,
            requirePositive: true,
            formatValue: (v) => totalGamesInYear > 0 ? `${Math.round((v / totalGamesInYear) * 100)}%` : String(v),
          });

          const analysis = aiAnalysis[year];

          return (
            <div key={year} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xl font-bold text-[#E0E6ED]">Year {year}</h2>
                <Button
                  variant="secondary"
                  onClick={() => handleAiAnalyze(year)}
                  disabled={isAiAnalyzing === year}
                  className="text-sm px-3 py-1"
                >
                  {isAiAnalyzing === year ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-1" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-wand-magic-sparkles mr-1" />
                      AI Analysis
                    </>
                  )}
                </Button>
              </div>

              {/* Metrics Table */}
              <Card>
                <h3 className="text-sm font-semibold text-[#707A8A] mb-3 uppercase tracking-wide">
                  Rankings
                </h3>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-[#2A2D33]">
                        <th className="text-left py-1.5 sm:py-2 pr-2 text-[#707A8A] font-medium whitespace-nowrap">頭銜</th>
                        <th className="text-left py-1.5 sm:py-2 pr-2 text-[#FFD700] font-medium"><i className="fas fa-trophy" /></th>
                        <th className="text-left py-1.5 sm:py-2 pr-2 text-[#C0C0C0] font-medium"><i className="fas fa-medal" /></th>
                        <th className="text-left py-1.5 sm:py-2 text-[#CD7F32] font-medium"><i className="fas fa-award" /></th>
                      </tr>
                    </thead>
                    <tbody className="text-[#E0E6ED]">
                      <tr className="border-b border-[#2A2D33]/50">
                        <td className="py-1.5 sm:py-2 pr-2 whitespace-nowrap">嬴哂啲錢</td>
                        <td className="py-1.5 sm:py-2 pr-2">{mostMoneyWinTop3[0] || '—'}</td>
                        <td className="py-1.5 sm:py-2 pr-2">{mostMoneyWinTop3[1] || '—'}</td>
                        <td className="py-1.5 sm:py-2">{mostMoneyWinTop3[2] || '—'}</td>
                      </tr>
                      <tr className="border-b border-[#2A2D33]/50">
                        <td className="py-1.5 sm:py-2 pr-2 whitespace-nowrap">出統王</td>
                        <td className="py-1.5 sm:py-2 pr-2">{mostLossesTop3[0] || '—'}</td>
                        <td className="py-1.5 sm:py-2 pr-2">{mostLossesTop3[1] || '—'}</td>
                        <td className="py-1.5 sm:py-2">{mostLossesTop3[2] || '—'}</td>
                      </tr>
                      <tr className="border-b border-[#2A2D33]/50">
                        <td className="py-1.5 sm:py-2 pr-2 whitespace-nowrap">輸哂啲錢</td>
                        <td className="py-1.5 sm:py-2 pr-2">{mostMoneyLoseTop3[0] || '—'}</td>
                        <td className="py-1.5 sm:py-2 pr-2">{mostMoneyLoseTop3[1] || '—'}</td>
                        <td className="py-1.5 sm:py-2">{mostMoneyLoseTop3[2] || '—'}</td>
                      </tr>
                      <tr className="border-b border-[#2A2D33]/50">
                        <td className="py-1.5 sm:py-2 pr-2 whitespace-nowrap">至尊雀聖</td>
                        <td className="py-1.5 sm:py-2 pr-2">{maxSingleHandTop3[0] || '—'}</td>
                        <td className="py-1.5 sm:py-2 pr-2">{maxSingleHandTop3[1] || '—'}</td>
                        <td className="py-1.5 sm:py-2">{maxSingleHandTop3[2] || '—'}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 sm:py-2 pr-2 whitespace-nowrap">連莊王</td>
                        <td className="py-1.5 sm:py-2 pr-2">{consecutiveDealerTop3[0] || '—'}</td>
                        <td className="py-1.5 sm:py-2 pr-2">{consecutiveDealerTop3[1] || '—'}</td>
                        <td className="py-1.5 sm:py-2">{consecutiveDealerTop3[2] || '—'}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 sm:py-2 pr-2 whitespace-nowrap">首席見證官</td>
                        <td className="py-1.5 sm:py-2 pr-2">{mostAttendanceTop3[0] || '—'}</td>
                        <td className="py-1.5 sm:py-2 pr-2">{mostAttendanceTop3[1] || '—'}</td>
                        <td className="py-1.5 sm:py-2">{mostAttendanceTop3[2] || '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Player Stats Table */}
              <Card>
                <h3 className="text-sm font-semibold text-[#707A8A] mb-3 uppercase tracking-wide">
                  Player Stats
                </h3>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs sm:text-sm min-w-[420px]">
                    <thead>
                      <tr className="border-b border-[#2A2D33]">
                        <th className="text-left py-1.5 sm:py-2 pr-2 text-[#707A8A] font-medium">Player</th>
                        <th className="text-right py-1.5 sm:py-2 px-1 text-[#707A8A] font-medium">Games</th>
                        <th className="text-right py-1.5 sm:py-2 px-1 text-[#707A8A] font-medium">Total</th>
                        <th className="text-right py-1.5 sm:py-2 px-1 text-[#707A8A] font-medium">Wins</th>
                        <th className="text-right py-1.5 sm:py-2 px-1 text-[#707A8A] font-medium">出統</th>
                        <th className="text-right py-1.5 sm:py-2 px-1 text-[#707A8A] font-medium">Special</th>
                        <th className="text-left py-1.5 sm:py-2 pl-2 text-[#707A8A] font-medium">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="text-[#E0E6ED]">
                      {[...stats]
                        .sort((a, b) => b.totalScore - a.totalScore)
                        .map((s) => (
                          <tr key={s.name} className="border-b border-[#2A2D33]/50">
                            <td className="py-1.5 sm:py-2 pr-2 font-medium whitespace-nowrap">{s.name}</td>
                            <td className="py-1.5 sm:py-2 px-1 text-right">{s.gamesPlayed}</td>
                            <td
                              className={`py-1.5 sm:py-2 px-1 text-right font-semibold ${
                                s.totalScore > 0
                                  ? 'text-[#3df2bc]'
                                  : s.totalScore < 0
                                    ? 'text-[#FF3131]'
                                    : ''
                              }`}
                            >
                              {s.totalScore > 0 ? '+' : ''}
                              {s.totalScore}
                            </td>
                            <td className="py-1.5 sm:py-2 px-1 text-right">{s.wins}</td>
                            <td className="py-1.5 sm:py-2 px-1 text-right">{s.losses}</td>
                            <td className="py-1.5 sm:py-2 px-1 text-right">{s.specialCount}</td>
                            <td className="py-1.5 sm:py-2 pl-2 text-xs text-[#707A8A]">
                              {formatSpecialBreakdown(s.specialBreakdown)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* AI Analysis Results */}
              {analysis && (
                <Card className="border-[#3df2bc]/30">
                  <h3 className="text-sm font-semibold text-[#3df2bc] mb-3">
                    <i className="fas fa-wand-magic-sparkles mr-1" />
                    AI Analysis
                  </h3>

                  <p className="text-[#E0E6ED] mb-4">{analysis.summary}</p>

                  {analysis.playerInsights.length > 0 && (
                    <div className="space-y-2 mb-4">
                      <h4 className="text-xs font-semibold text-[#707A8A] uppercase tracking-wide">
                        Player Insights
                      </h4>
                      {analysis.playerInsights.map((pi, i) => (
                        <div key={i} className="bg-[#0B0E14] rounded-lg p-3">
                          <span className="font-semibold text-[#3df2bc]">{pi.name}</span>
                          <span className="text-[#E0E6ED] ml-2">{pi.insight}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {analysis.funFacts.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-[#707A8A] uppercase tracking-wide mb-2">
                        Fun Facts
                      </h4>
                      <ul className="space-y-1">
                        {analysis.funFacts.map((fact, i) => (
                          <li key={i} className="text-sm text-[#E0E6ED]">
                            <span className="text-[#FFD700] mr-1">★</span> {fact}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Main Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#E0E6ED] pb-24">
      {/* Mahjong Reference Modal */}
      {showMahjong && <MahjongReferenceModal onClose={() => setShowMahjong(false)} />}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0B0E14]/95 backdrop-blur border-b border-[#2A2D33]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#E0E6ED]">
              漢奸撚麻雀龍龍榜
            </h1>
            <p className="text-xs text-[#707A8A]">Record games & review yearly performance</p>
          </div>
          <button
            onClick={() => setShowMahjong(true)}
            className="text-[#707A8A] hover:text-[#FFD700] transition-colors px-2 py-1"
            title="台數手冊"
          >
            <i className="fas fa-book text-lg" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {activeTab === 'record' && renderRecordTab()}
        {activeTab === 'games' && renderGamesTab()}
        {activeTab === 'review' && renderReviewTab()}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#1A1D23] border-t border-[#2A2D33] z-40">
        <div className="max-w-2xl mx-auto px-6 py-3 flex justify-around items-center">
          <NavButton
            active={activeTab === 'record'}
            onClick={() => setActiveTab('record')}
            icon="fa-plus-circle"
            label="Record"
          />
          <NavButton
            active={activeTab === 'games'}
            onClick={() => setActiveTab('games')}
            icon="fa-list"
            label="Games"
          />
          <NavButton
            active={activeTab === 'review'}
            onClick={() => setActiveTab('review')}
            icon="fa-trophy"
            label="Review"
          />
        </div>
      </nav>
    </div>
  );
}
