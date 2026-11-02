// Credentials of the CLASSROOM project and Netlify account only. These scripts never fall back to the game's
// credentials, so they can't touch the game's Netlify account or Firebase projects by mistake.
//   CLASSROOM_SETUP_SERVICE_ACCOUNT_B64  base64 key JSON of a service account that is Owner of the classroom project
//   CLASSROOM_NETLIFY_AUTH_TOKEN         personal access token of the classroom's OWN Netlify account
//   CLASSROOM_PROJECT_ID                 default catapult-classroom
//   CLASSROOM_NETLIFY_SITE               default catapult-classroom-api
export const PROJECT = process.env.CLASSROOM_PROJECT_ID || "catapult-classroom";
export const SITE_NAME = process.env.CLASSROOM_NETLIFY_SITE || "catapult-classroom-api";
export const RUNTIME_SA_ID = "classroom-backend";
export const runtimeEmail = () => `${RUNTIME_SA_ID}@${PROJECT}.iam.gserviceaccount.com`;
export function setupKeyB64() {
  const v = process.env.CLASSROOM_SETUP_SERVICE_ACCOUNT_B64;
  if (!v) throw new Error("Set CLASSROOM_SETUP_SERVICE_ACCOUNT_B64 (a key of a service account that is Owner of the classroom project) in the environment settings.");
  return v;
}
export function netlifyToken() {
  const v = process.env.CLASSROOM_NETLIFY_AUTH_TOKEN;
  if (!v) throw new Error("Set CLASSROOM_NETLIFY_AUTH_TOKEN (a token of the classroom's own Netlify account) in the environment settings.");
  return v;
}
