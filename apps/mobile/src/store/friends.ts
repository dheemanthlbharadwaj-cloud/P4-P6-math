import { create } from "zustand";
import type { PublicProfile } from "@p6/shared";
import { SAMPLE_FRIENDS, SHOW_SAMPLES } from "../dev/samples";

// In-memory cache of friends' public profiles (map avatars). Starts with the sample friends while SHOW_SAMPLES is on;
// the real list from the backend replaces it.
interface FriendsState {
  friends: PublicProfile[];
  set: (f: PublicProfile[]) => void;
  reset: () => void;
}
const initialFriends = (): PublicProfile[] => (SHOW_SAMPLES ? [...SAMPLE_FRIENDS] : []);
export const useFriends = create<FriendsState>((set) => ({ friends: initialFriends(), set: (friends) => set({ friends }), reset: () => set({ friends: initialFriends() }) }));
