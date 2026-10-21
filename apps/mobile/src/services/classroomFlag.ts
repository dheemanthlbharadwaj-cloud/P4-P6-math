// Dev mock switch for the classroom: EXPO_PUBLIC_CLASSROOM_MOCK=1, or ?mock=1 (full) / ?mock=empty (in no class) on web.
// Imported by app/_layout.tsx so it is read when the app loads: in-app navigation drops the query string, and route files
// load lazily on web.
import type { MockMode } from "./classroomMock";

function readMock(): MockMode | null {
  let v: string | null | undefined = process.env.EXPO_PUBLIC_CLASSROOM_MOCK;
  try {
    if (typeof window !== "undefined" && window.location?.search) v = new URLSearchParams(window.location.search).get("mock") ?? v;
  } catch { /* no window */ }
  if (!v || v === "0") return null;
  return v === "empty" || v === "none" ? "empty" : "full";
}
export const MOCK: MockMode | null = readMock();
