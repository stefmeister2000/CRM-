import test from "node:test";
import assert from "node:assert/strict";
import { invitationUrl, inviteMember, removeMember } from "../src/lib/team-management.ts";

const input = { email: "colleague@example.com", fullName: "Colleague", role: "rep" };
function clients({
  isAdmin = true,
  checkError = null,
  setupError = null,
  generateError = null,
} = {}) {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      return name === "has_role" ? { data: isAdmin, error: checkError } : { error: setupError };
    },
  };
  const admin = {
    auth: {
      admin: {
        generateLink: async (args) => {
          calls.push(["generateLink", args]);
          return {
            data: { user: { id: "invited" }, properties: { hashed_token: "secret-token" } },
            error: generateError,
          };
        },
      },
    },
  };
  return { client, admin, calls };
}

test("invite tokens stay in the fragment on the configured CRM origin", () => {
  const url = new URL(invitationUrl("https://crm.example.com/path?x=1", "token&value"));
  assert.equal(url.pathname, "/accept-invite");
  assert.equal(url.search, "");
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("token_hash"), "token&value");
  for (const invalid of [
    undefined,
    "http://crm.example.com",
    "javascript:alert(1)",
    "https://user:pass@example.com",
  ]) {
    assert.throws(() => invitationUrl(invalid));
  }
  assert.match(invitationUrl("http://localhost:5173"), /^http:\/\/localhost:5173/);
});
test("non-admins cannot generate invitations or remove people", async () => {
  const { client, admin, calls } = clients({ isAdmin: false });
  await assert.rejects(
    inviteMember(client, admin, "rep", input, "https://crm.example.com"),
    /beheerders/,
  );
  await assert.rejects(removeMember(client, "rep", "other"), /beheerders/);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["has_role", "has_role"],
  );
});
test("auth check failures fail closed", async () => {
  const { client, admin, calls } = clients({ checkError: { message: "offline" } });
  await assert.rejects(
    inviteMember(client, admin, "owner", input, "https://crm.example.com"),
    /offline/,
  );
  assert.equal(calls.length, 1);
});
test("invite returns a shareable link only after profile and role setup succeeds", async () => {
  const { client, admin, calls } = clients();
  const result = await inviteMember(client, admin, "owner", input, "https://crm.example.com");
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["has_role", "generateLink", "configure_crm_invitation"],
  );
  assert.equal(calls[1][1].type, "invite");
  assert.equal(calls[1][1].password, undefined);
  assert.deepEqual(calls[2][1], {
    _user_id: "invited",
    _full_name: "Colleague",
    _team: "",
    _role: "rep",
  });
  assert.equal(result.url, "https://crm.example.com/accept-invite#token_hash=secret-token");
});
test("missing public URL prevents creating even an auth account", async () => {
  const { client, admin, calls } = clients();
  await assert.rejects(inviteMember(client, admin, "owner", input, undefined), /CRM_PUBLIC_URL/);
  assert.equal(calls.length, 1);
});
test("provider and provisioning errors do not expose an invitation or delete accounts", async () => {
  for (const option of [
    { generateError: { message: "exists" } },
    { setupError: { message: "migration required" } },
  ]) {
    const { client, admin } = clients(option);
    await assert.rejects(
      inviteMember(client, admin, "owner", input, "https://crm.example.com"),
      /exists|migration required/,
    );
  }
});
test("self-removal never reaches the database mutation", async () => {
  const { client, calls } = clients();
  await assert.rejects(removeMember(client, "owner", "owner"), /jezelf/);
  assert.equal(calls.length, 1);
});
test("member removal uses the atomic access-revocation function and propagates errors", async () => {
  const { client, calls } = clients();
  assert.deepEqual(await removeMember(client, "owner", "rep"), { ok: true });
  assert.deepEqual(calls[1], ["remove_crm_member", { _user_id: "rep" }]);
  await assert.rejects(
    removeMember(clients({ setupError: { message: "already removed" } }).client, "owner", "rep"),
    /already removed/,
  );
});
