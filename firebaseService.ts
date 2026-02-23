import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, push, remove } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";
import { Game, Round } from "./types";

const firebaseConfig = {
  apiKey: "AIzaSyAKtQM_ZMi29qZnC8GS6twOJdXaLsbr3nI",
  authDomain: "mahjongtest-c81c9.firebaseapp.com",
  databaseURL: "https://mahjongtest-c81c9-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mahjongtest-c81c9",
  storageBucket: "mahjongtest-c81c9.firebasestorage.app",
  messagingSenderId: "1023545401466",
  appId: "1:1023545401466:web:726c52ff784b03910a1bc3",
  measurementId: "G-NPT3HS4EEF"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

export const signInAnonymousUser = async (): Promise<void> => {
  await signInAnonymously(auth);
};

const gamesRef = ref(database, 'games');

const toArray = <T>(obj: any): T[] => {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  return Object.keys(obj).map(key => obj[key]);
};

export const subscribeToGames = (callback: (games: Game[]) => void) => {
  return onValue(gamesRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const gamesArray: Game[] = Object.keys(data).map(key => {
        const game = data[key];
        return {
          ...game,
          id: key,
          baseRate: game.baseRate || 0,
          players: toArray(game.players),
          rounds: toArray(game.rounds),
          seats: toArray(game.seats),
        };
      });
      gamesArray.sort((a, b) => a.date.localeCompare(b.date));
      callback(gamesArray);
    } else {
      callback([]);
    }
  });
};

export const addGame = async (game: Game): Promise<string> => {
  const newGameRef = push(gamesRef);
  const gameWithId = { ...game, id: newGameRef.key };
  await set(newGameRef, gameWithId);
  return newGameRef.key!;
};

export const updateGame = async (game: Game): Promise<void> => {
  const gameRef = ref(database, `games/${game.id}`);
  await set(gameRef, game);
};

export const deleteGame = async (gameId: string): Promise<void> => {
  const gameRef = ref(database, `games/${gameId}`);
  await remove(gameRef);
};

// Draft session (in-progress game)
export interface DraftSession {
  date: string;
  note: string;
  baseRate: number;
  seats: string[];
  rounds: Round[];
}

const draftRef = ref(database, 'draftSession');

export const saveDraftSession = async (session: DraftSession): Promise<void> => {
  await set(draftRef, session);
};

export const loadDraftSession = (callback: (session: DraftSession | null) => void) => {
  return onValue(draftRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      callback({
        ...data,
        rounds: toArray(data.rounds),
        seats: toArray(data.seats),
      });
    } else {
      callback(null);
    }
  });
};

export const clearDraftSession = async (): Promise<void> => {
  await remove(draftRef);
};

export { database };
