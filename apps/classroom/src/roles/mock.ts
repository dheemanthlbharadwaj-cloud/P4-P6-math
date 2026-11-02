// ?mock=1 on any page: no sign-in and no backend; every area runs on its own demo data (teacher/admin mocks in
// localStorage, the student mock built from the real question bundle). The flag is read once at load.
function readMock(): string | null {
  try {
    if (typeof window !== "undefined" && window.location?.search) return new URLSearchParams(window.location.search).get("mock");
  } catch { /* no window */ }
  return null;
}
const raw = readMock() ?? process.env.EXPO_PUBLIC_CLASSROOM_MOCK ?? null;
/** "full" (a class with posts, tests and homework) or "empty" (a student in no class); null = real backend. */
export const MOCK_MODE: "full" | "empty" | null = !raw || raw === "0" ? null : raw === "empty" ? "empty" : "full";
export const MOCK_AREAS = MOCK_MODE !== null;
/** Carries the mock flag into links that open a new tab. */
export const mockQuery = (): string => (MOCK_MODE ? `?mock=${MOCK_MODE === "empty" ? "empty" : "1"}` : "");
