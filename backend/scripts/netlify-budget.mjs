#!/usr/bin/env node
// Netlify credit guard (free plan: 300 credits per billing period; each production deploy costs 15, which is what
// uses them up here). Counts this period's production deploys on every site of the account, plus bandwidth.
//
//   node backend/scripts/netlify-budget.mjs          print the estimate
//   import { assertNetlifyBudget } from "./netlify-budget.mjs"; await assertNetlifyBudget("backend")
//
// The deploy scripts call assertNetlifyBudget() first: it refuses when one more deploy would leave less than RESERVE
// credits (kept for traffic and emergencies) unless --force is passed. Bandwidth and function traffic also cost
// credits but their rates aren't in the API; the estimate counts deploys only and prints bandwidth for reference.
import { fileURLToPath } from "node:url";

export const PLAN_CREDITS = 300;
export const DEPLOY_CREDITS = 15;
export const RESERVE = 45; // ~3 deploys' worth left for traffic / an emergency fix

const TOKEN = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_SECRET;

async function nl(path) {
  const r = await fetch(`https://api.netlify.com/api/v1${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`Netlify ${path}: HTTP ${r.status}`);
  return r.json();
}

export async function netlifyBudget() {
  if (!TOKEN) throw new Error("Set NETLIFY_AUTH_TOKEN or NETLIFY_SECRET.");
  const [account] = await nl("/accounts");
  const start = account.current_usage_period_start ?? account.current_billing_period_start;
  const end = account.next_usage_period_start;
  const plan = account.plan_credits ?? PLAN_CREDITS;
  const sites = await nl("/sites?filter=all&per_page=100");
  const perSite = [];
  for (const s of sites) {
    const deploys = await nl(`/sites/${s.id}/deploys?per_page=100`);
    const n = deploys.filter((d) => d.context === "production" && d.state !== "error" && new Date(d.created_at) >= new Date(start)).length;
    perSite.push({ site: s.name, deploys: n });
  }
  const bw = await nl(`/accounts/${account.slug}/bandwidth`).catch(() => null);
  const deployCredits = perSite.reduce((a, s) => a + s.deploys, 0) * DEPLOY_CREDITS;
  return { plan, start, end, perSite, deployCredits, left: plan - deployCredits, bandwidthMB: bw ? Math.round(bw.used / 1e6) : null };
}

/** Throws unless one more production deploy leaves at least RESERVE credits (or --force is passed). */
export async function assertNetlifyBudget(what) {
  const b = await netlifyBudget();
  const after = b.left - DEPLOY_CREDITS;
  console.log(`Netlify credits (estimate, deploys only): ${b.deployCredits}/${b.plan} used this period (resets ${String(b.end).slice(0, 10)}); after this ${what} deploy: ${after} left.`);
  if (after < RESERVE && !process.argv.includes("--force")) {
    throw new Error(`Refusing the ${what} deploy: it would leave ${after} Netlify credits (< ${RESERVE} reserve). Batch changes or wait for the reset; --force overrides.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const b = await netlifyBudget();
  console.log(JSON.stringify(b, null, 2));
}
