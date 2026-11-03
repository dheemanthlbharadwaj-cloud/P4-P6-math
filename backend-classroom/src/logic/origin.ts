// Browsers may call the API only from the classroom site (and local test builds). Extra: ALLOWED_ORIGINS (comma-separated).
const ALLOWED = new Set([
  "https://catapult-classroom.web.app", "https://catapult-classroom.firebaseapp.com",
  "https://catapultclassroom.web.app", "https://catapultclassroom.firebaseapp.com",
  ...(process.env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
]);
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
export const originAllowed = (o: string | null) => !o || ALLOWED.has(o) || LOCAL.test(o);
