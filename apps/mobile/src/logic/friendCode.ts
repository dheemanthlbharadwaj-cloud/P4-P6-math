/** Friend codes are typed by children: ignore spaces and case. */
export function normalizeFriendCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}
