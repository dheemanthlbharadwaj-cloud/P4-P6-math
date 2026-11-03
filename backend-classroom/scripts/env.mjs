// Credentials of the CLASSROOM project and Netlify account only. The Netlify token never falls back to the game's
// credentials, so these scripts can't touch the game's Netlify account by mistake.
//   CLASSROOM_SETUP_SERVICE_ACCOUNT_B64  base64 key JSON of a service account that is Owner of the classroom project.
//                                        The setup key may also be the main service account (FIREBASE_SERVICE_ACCOUNT_B64)
//                                        once the owner has made it Owner of the classroom project. The project id is still
//                                        always the classroom one (PROJECT below), so the game's projects are never touched.
//   CLASSROOM_NETLIFY_AUTH_TOKEN         personal access token of the classroom's OWN Netlify account
//   CLASSROOM_PROJECT_ID                 default catapult-classroom
//   CLASSROOM_NETLIFY_SITE               default catapult-classroom-api
export const PROJECT = process.env.CLASSROOM_PROJECT_ID || "catapult-classroom";
export const SITE_NAME = process.env.CLASSROOM_NETLIFY_SITE || "catapult-classroom-api";
export const RUNTIME_SA_ID = "classroom-backend";
export const runtimeEmail = () => `${RUNTIME_SA_ID}@${PROJECT}.iam.gserviceaccount.com`;
export function setupKeyB64() {
  const v = process.env.CLASSROOM_SETUP_SERVICE_ACCOUNT_B64 || process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!v) throw new Error("Set CLASSROOM_SETUP_SERVICE_ACCOUNT_B64, or give the main service account (FIREBASE_SERVICE_ACCOUNT_B64) the Owner role on the classroom project.");
  return v;
}
export function netlifyToken() {
  const v = process.env.CLASSROOM_NETLIFY_AUTH_TOKEN;
  if (!v) throw new Error("Set CLASSROOM_NETLIFY_AUTH_TOKEN (a token of the classroom's own Netlify account) in the environment settings.");
  return v;
}
