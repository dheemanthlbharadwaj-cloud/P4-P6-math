import { create } from "zustand";
import type { User } from "firebase/auth";

// Non-persisted: Firebase persists the session itself (AsyncStorage). `ready` flips after the first auth callback.
interface AuthState {
  user: User | null;
  ready: boolean;
  setUser: (u: User | null) => void;
}
export const useAuth = create<AuthState>((set) => ({ user: null, ready: false, setUser: (user) => set({ user, ready: true }) }));
