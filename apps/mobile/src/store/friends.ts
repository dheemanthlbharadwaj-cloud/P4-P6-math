import { create } from "zustand";
import type { PublicProfile } from "@p6/shared";

// In-memory cache of friends' public profiles (map avatars) and where each stands on each map (`spots`: friend uid →
// topic id → levelKey of the furthest level they completed there). Replaced by every refresh from the backend.
interface FriendsState {
  friends: PublicProfile[];
  spots: Record<string, Record<string, string>>;
  set: (f: PublicProfile[], spots?: Record<string, Record<string, string>>) => void;
  reset: () => void;
}
export const useFriends = create<FriendsState>((set) => ({
  friends: [],
  spots: {},
  set: (friends, spots = {}) => set({ friends, spots }),
  reset: () => set({ friends: [], spots: {} }),
}));
