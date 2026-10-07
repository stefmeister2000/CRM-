// Run after npm run build. Uses a local mock Data API and synthetic credentials.
// No hosted database, real CRM leads, email delivery or production secrets are used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { EXPORT_COLUMNS } from "../src/lib/current-export.ts";

const token = "a".repeat(64);
const sample = {
  id: "synthetic-lead",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-07T00:00:00Z",
  deleted_at: null,
  stage: "won",
  source: "website",
  campaign: "Synthetic campaign",
  value_estimate: 5000,
  notes:
    "Aanvraag website (2026-10-01T00:00:00Z): synthetic\nutm_source: meta\nutm_medium: paid_social",
};
let mode = "success";
let reads = 0;
const api = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  assert.equal(req.method, "GET");
  assert.equal(url.pathname, "/rest/v1/leads");
  assert.equal(url.searchParams.get("select"), EXPORT_COLUMNS);
  assert.equal(url.searchParams.get("order"), "id.asc");
  reads++;
  if (mode === "error") {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "Synthetic private database detail" }));
    return;
  }
  const count = mode === "limit" ? 1001 : mode === "truncated" ? 2 : 1;
  res.writeHead(200, { "content-type": "application/json", "content-range": `0-0/${count}` });
  res.end(JSON.stringify([sample]));
});
api.listen(0, "127.0.0.1");
await once(api, "listening");
const apiPort = api.address().port;

async function startApp(exportToken = token) {
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const appPort = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const child = spawn(process.execPath, [".output/server/index.mjs"], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(appPort),
      SUPABASE_URL: `http://127.0.0.1:${apiPort}`,
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic_test_only",
      CURRENT_EXPORT_TOKEN: exportToken,
      CURRENT_EXPORT_WORKSPACE_ID: "synthetic-workspace",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs = (logs + chunk).slice(-4000);
  });
  child.stderr.on("data", (chunk) => {
    logs = (logs + chunk).slice(-4000);
  });
  const endpoint = `http://127.0.0.1:${appPort}/api/integrations/current/export`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode != null) throw new Error(`Built CRM stopped: ${logs}`);
    try {
      await fetch(endpoint);
      return { child, endpoint };
    } catch {
      await delay(100);
    }
  }
  child.kill();
  throw new Error(`Built CRM did not start: ${logs}`);
}
async function stopApp(child) {
  if (child.exitCode == null) {
    child.kill();
    await once(child, "exit");
  }
}
let app;
try {
  app = await startApp();
  const get = (auth) => fetch(app.endpoint, { headers: auth ? { Authorization: auth } : {} });
  assert.equal((await get()).status, 401);
  assert.equal((await get("Bearer " + "b".repeat(64))).status, 401);
  assert.equal(reads, 0, "rejected credentials must not query the database");
  const success = await get("Bearer " + token);
  assert.equal(success.status, 200);
  assert.equal(success.headers.get("cache-control"), "private, no-store");
  assert.equal(success.headers.get("access-control-allow-origin"), null);
  const body = await success.json();
  assert.equal(body.complete, true);
  assert.equal(body.workspaceId, "synthetic-workspace");
  assert.equal(body.leads[0].valueEstimate, 5000);
  assert.equal(body.leads[0].wonAt, null);
  assert.equal(body.leads[0].paidRevenue, null);
  assert.equal("notes" in body.leads[0], false);
  assert.equal(body.leads[0].attribution.status, "legacy_utm_notes");
  mode = "limit";
  assert.equal((await get("Bearer " + token)).status, 409);
  mode = "truncated";
  assert.equal((await get("Bearer " + token)).status, 409);
  mode = "error";
  const error = await get("Bearer " + token);
  assert.equal(error.status, 503);
  assert.equal((await error.text()).includes("Synthetic private database detail"), false);
  await stopApp(app.child);
  app = undefined;
  app = await startApp("");
  assert.equal((await fetch(app.endpoint)).status, 503);
  console.log(
    "Current export production-route smoke checks passed: credentials, metadata, estimates, complete snapshots, limits, failure sanitization and disabled configuration.",
  );
} finally {
  if (app) await stopApp(app.child);
  await new Promise((resolve) => api.close(resolve));
}
