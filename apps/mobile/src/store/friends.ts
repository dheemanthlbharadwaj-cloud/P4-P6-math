import { create } from "zustand";
import type { PublicProfile } from "@p6/shared";

// In-memory cache of friends' public profiles (map avatars). Empty offline → UI hides gracefully.
interface FriendsState {
  friends: PublicProfile[];
  set: (f: PublicProfile[]) => void;
  reset: () => void;
}
export const useFriends = create<FriendsState>((set) => ({ friends: [], set: (friends) => set({ friends }), reset: () => set({ friends: [] }) }));
