import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_EXPORT_MAX_LEADS,
  CURRENT_EXPORT_SETTING_KEY,
  buildCurrentExport,
  currentExportBearerToken,
  currentExportMethodNotAllowed,
  generateCurrentExportToken,
  handleCurrentExportRequest,
  resolveCurrentExportCompany,
} from "../src/lib/current-export.ts";
import { HEALTHFACTOR_COMPANY_ID, VERKOOP_STUDIO_COMPANY_ID } from "../src/lib/lead-categories.ts";

const verkoop = VERKOOP_STUDIO_COMPANY_ID;
const other = "11111111-1111-4111-8111-111111111111";
const verkoopToken = "a".repeat(64);
const otherToken = "0123456789abcdef".repeat(4);
const now = new Date("2026-10-25T09:00:00.000Z");

// Minimal PostgREST stand-in: app_settings and leads rows, filtered by eq().
function fakeDb({ settings = [], leads = [], settingsError = null, leadsError = null } = {}) {
  const queries = [];
  return {
    queries,
    from(table) {
      const query = { table, columns: null, filters: [], orders: [], limit: null };
      queries.push(query);
      const builder = {
        select: (columns) => ((query.columns = columns), builder),
        eq: (column, value) => (query.filters.push([column, value]), builder),
        order: (column, options) => (query.orders.push([column, options]), builder),
        limit: (count) => ((query.limit = count), builder),
        then: (resolve, reject) => {
          const source = table === "app_settings" ? settings : leads;
          const error = table === "app_settings" ? settingsError : leadsError;
          let rows = source.filter((row) => query.filters.every(([k, v]) => row[k] === v));
          if (table === "leads") {
            rows = [...rows].sort((a, b) =>
              a.created_at === b.created_at
                ? b.id.localeCompare(a.id)
                : Date.parse(b.created_at) - Date.parse(a.created_at),
            );
          }
          if (query.limit !== null) rows = rows.slice(0, query.limit);
          return Promise.resolve(error ? { data: null, error } : { data: rows, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return builder;
    },
  };
}

const settings = [
  { company_id: verkoop, key: CURRENT_EXPORT_SETTING_KEY, value: verkoopToken },
  { company_id: other, key: CURRENT_EXPORT_SETTING_KEY, value: otherToken },
  // A website intake token must never unlock the reporting export.
  { company_id: other, key: "inbound_lead_token", value: "b".repeat(64) },
];

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function lead(n, overrides = {}) {
  return {
    id: uuid(n),
    company_id: verkoop,
    created_at: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
    stage: "new",
    value_estimate: null,
    source: "website",
    campaign: null,
    deleted_at: null,
    // Contact columns exist in the table; the export must never pass them on.
    company: `Company ${n}`,
    contact_name: `Person ${n}`,
    email: `person${n}@example.invalid`,
    phone: "+32 470 00 00 00",
    notes: "Private note",
    ...overrides,
  };
}

function request(authorization, path = "/api/integrations/current/export", headers = {}) {
  return new Request(`https://crm.example.invalid${path}`, {
    headers: { ...(authorization ? { authorization } : {}), ...headers },
  });
}

function call(db, req, configured = true) {
  return handleCurrentExportRequest(req, {
    configured,
    admin: async () => db,
    now: () => now,
  });
}

test("reporting tokens are 64 lowercase hex characters", () => {
  const first = generateCurrentExportToken();
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(generateCurrentExportToken(), first);
});

test("malformed or missing credentials are rejected before any database lookup", async () => {
  const rejected = [
    null,
    "",
    verkoopToken,
    `Basic ${verkoopToken}`,
    `Bearer ${"a".repeat(63)}`,
    `Bearer ${"a".repeat(65)}`,
    `Bearer ${"g".repeat(64)}`,
    `Bearer ${"a".repeat(32)} ${"a".repeat(32)}`,
    `Bearer ${"a".repeat(32)}-${"a".repeat(31)}`,
    "Bearer ",
  ];
  for (const authorization of rejected) {
    const db = fakeDb({ settings });
    const response = await call(db, request(authorization));
    assert.equal(response.status, 401, String(authorization));
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(db.queries.length, 0, String(authorization));
  }
  assert.equal(currentExportBearerToken(`bearer  ${verkoopToken.toUpperCase()} `), verkoopToken);
  assert.equal(await resolveCurrentExportCompany(fakeDb({ settings }), "not-a-token"), null);
});

test("unknown, intake-only and ambiguous tokens are rejected", async () => {
  for (const token of ["c".repeat(64), "b".repeat(64)]) {
    const response = await call(fakeDb({ settings }), request(`Bearer ${token}`));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
  }
  const duplicated = fakeDb({
    settings: [
      { company_id: verkoop, key: CURRENT_EXPORT_SETTING_KEY, value: verkoopToken },
      { company_id: other, key: CURRENT_EXPORT_SETTING_KEY, value: verkoopToken },
    ],
  });
  assert.equal(await resolveCurrentExportCompany(duplicated, verkoopToken), null);
});

test("methods other than GET are refused with a JSON 405", async () => {
  const response = currentExportMethodNotAllowed();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
  assert.deepEqual(await response.json(), { error: "Method not allowed" });
});

test("missing server configuration and lookup failures return 503", async () => {
  const unconfigured = await call(fakeDb({ settings }), request(`Bearer ${verkoopToken}`), false);
  assert.equal(unconfigured.status, 503);
  const offline = await call(
    fakeDb({ settings, settingsError: new Error("offline") }),
    request(`Bearer ${verkoopToken}`),
  );
  assert.equal(offline.status, 503);
  const leadsOffline = await call(
    fakeDb({ settings, leadsError: new Error("offline") }),
    request(`Bearer ${verkoopToken}`),
  );
  assert.equal(leadsOffline.status, 503);
});

test("the token decides the workspace, never a caller-supplied company", async () => {
  const db = fakeDb({
    settings,
    leads: [lead(1), lead(2, { company_id: other, campaign: "Other company campaign" })],
  });
  const response = await call(
    db,
    request(`Bearer ${otherToken}`, `/api/integrations/current/export?workspaceId=${verkoop}`, {
      "x-crm-company-id": verkoop,
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type"), /^application\/json/);
  const body = await response.json();
  assert.equal(body.workspaceId, other);
  assert.deepEqual(
    body.leads.map((row) => row.id),
    [uuid(2)],
  );

  const tokenLookup = db.queries.find((q) => q.table === "app_settings");
  assert.deepEqual(tokenLookup.filters, [
    ["key", CURRENT_EXPORT_SETTING_KEY],
    ["value", otherToken],
  ]);
  const leadQuery = db.queries.find((q) => q.table === "leads");
  assert.deepEqual(leadQuery.filters, [["company_id", other]]);
  assert.deepEqual(leadQuery.orders, [
    ["created_at", { ascending: false }],
    ["id", { ascending: false }],
  ]);
  assert.equal(leadQuery.limit, CURRENT_EXPORT_MAX_LEADS + 1);
  for (const column of ["company", "contact_name", "email", "phone", "notes"]) {
    assert.ok(!leadQuery.columns.split(/,\s*/).includes(column), column);
  }
});

test("leads map to the Current contract, including soft-deleted leads", async () => {
  const db = fakeDb({
    settings,
    leads: [
      lead(1, {
        created_at: "2026-10-20T08:15:30.123456+00:00",
        stage: "won",
        value_estimate: 2500.5,
        source: "website",
        campaign: "verkoop.studio academy",
      }),
      lead(2, {
        stage: "lost",
        value_estimate: "1200.00",
        source: "linkedin",
        campaign: "Gent outreach",
        deleted_at: "2026-10-21T10:00:00+00:00",
      }),
      lead(3, { stage: "meeting", source: "csv" }),
    ],
  });
  const response = await call(db, request(`Bearer ${verkoopToken}`));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), [
    "schemaVersion",
    "complete",
    "workspaceId",
    "currency",
    "timezone",
    "generatedAt",
    "leads",
  ]);
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.complete, true);
  assert.equal(body.workspaceId, verkoop);
  assert.equal(body.currency, "EUR");
  assert.equal(body.timezone, "Europe/Brussels");
  assert.equal(body.generatedAt, now.toISOString());
  assert.deepEqual(body.leads, [
    {
      id: uuid(1),
      createdAt: "2026-10-20T08:15:30.123Z",
      stage: "won",
      valueEstimate: 2500.5,
      source: "website",
      campaign: "verkoop.studio academy",
      category: "Academy",
      deletedAt: null,
    },
    {
      id: uuid(3),
      createdAt: lead(3).created_at,
      stage: "meeting",
      valueEstimate: null,
      source: "csv",
      campaign: null,
      category: "Verkoop Studio",
      deletedAt: null,
    },
    {
      id: uuid(2),
      createdAt: lead(2).created_at,
      stage: "lost",
      valueEstimate: 1200,
      source: "linkedin",
      campaign: "Gent outreach",
      category: "Verkoop Studio",
      deletedAt: "2026-10-21T10:00:00.000Z",
    },
  ]);
});

test("categories follow lead-categories and are null for companies without them", () => {
  const healthfactor = buildCurrentExport(
    HEALTHFACTOR_COMPANY_ID,
    [lead(1, { company_id: HEALTHFACTOR_COMPANY_ID, campaign: "Healthfactor boksen" })],
    now,
  );
  assert.equal(healthfactor.leads[0].category, "Boksen");
  const plain = buildCurrentExport(
    other,
    [lead(1, { company_id: other, campaign: "academy" })],
    now,
  );
  assert.equal(plain.leads[0].category, null);
});

test("the export never contains contact details", async () => {
  const response = await call(
    fakeDb({ settings, leads: [lead(1), lead(2, { deleted_at: now.toISOString() })] }),
    request(`Bearer ${verkoopToken}`),
  );
  const text = await response.text();
  for (const secret of ["Company 1", "Person 1", "example.invalid", "+32", "Private note"]) {
    assert.ok(!text.includes(secret), secret);
  }
  const allowed = [
    "id",
    "createdAt",
    "stage",
    "valueEstimate",
    "source",
    "campaign",
    "category",
    "deletedAt",
  ];
  for (const row of JSON.parse(text).leads) assert.deepEqual(Object.keys(row), allowed);
});

test("more than 1000 leads returns the newest 1000 with complete=false", async () => {
  const rows = Array.from({ length: 1005 }, (_, i) => lead(i + 1, { campaign: "x".repeat(500) }));
  const db = fakeDb({ settings, leads: rows });
  const response = await call(db, request(`Bearer ${verkoopToken}`));
  const text = await response.text();
  const body = JSON.parse(text);
  assert.equal(body.complete, false);
  assert.equal(body.leads.length, CURRENT_EXPORT_MAX_LEADS);
  assert.equal(body.leads[0].id, uuid(1005));
  assert.equal(body.leads.at(-1).id, uuid(6));
  assert.equal(new Set(body.leads.map((row) => row.id)).size, CURRENT_EXPORT_MAX_LEADS);
  assert.equal(body.leads[0].campaign.length, 200);
  assert.ok(Buffer.byteLength(text) <= 2 * 1024 * 1024);

  const exact = buildCurrentExport(verkoop, rows.slice(0, CURRENT_EXPORT_MAX_LEADS), now);
  assert.equal(exact.complete, true);
  assert.equal(exact.leads.length, CURRENT_EXPORT_MAX_LEADS);
});

test("duplicate rows and rows from another company are never exported", () => {
  const result = buildCurrentExport(
    verkoop,
    [lead(1), lead(1), lead(2, { company_id: other })],
    now,
  );
  assert.deepEqual(
    result.leads.map((row) => row.id),
    [uuid(1)],
  );
});
