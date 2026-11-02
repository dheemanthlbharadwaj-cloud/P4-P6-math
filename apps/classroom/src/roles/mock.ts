// ?mock=1 on any page: no sign-in and no backend; demo data in this browser's localStorage. ?mock=parent opens the parent
// view of the demo family. The flag is read once at load.
function readMock(): string | null {
  try {
    if (typeof window !== "undefined" && window.location?.search) return new URLSearchParams(window.location.search).get("mock");
  } catch { /* no window */ }
  return null;
}
const raw = readMock() ?? process.env.EXPO_PUBLIC_CLASSROOM_MOCK ?? null;
/** "staff" (teacher + admin demo) or "parent"; null = the real backend. */
export const MOCK_MODE: "staff" | "parent" | null = !raw || raw === "0" ? null : raw === "parent" ? "parent" : "staff";
export const MOCK_AREAS = MOCK_MODE !== null;
