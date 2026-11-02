// Messages a teacher or parent can act on, from backend errors.
import { ApiError } from "./api";

export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "permission-denied") return e.message && !/^HTTP/.test(e.message) ? e.message : "You don't have access to that.";
    if (e.code === "not-found") return e.message && e.message !== "Not Found" ? e.message : "Not found.";
    if (e.code === "unavailable" || e.code === "internal") return "Can't reach the server. Check your connection and try again.";
    if (e.code === "resource-exhausted") return e.message || "Too many tries. Wait a minute and try again.";
    return e.message || "Something went wrong.";
  }
  return (e as Error)?.message || "Something went wrong.";
}
export const isPermissionDenied = (e: unknown) => e instanceof ApiError && e.code === "permission-denied";
