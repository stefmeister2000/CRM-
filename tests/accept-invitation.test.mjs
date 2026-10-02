import test from "node:test";
import assert from "node:assert/strict";
import { finishInvitation } from "../src/lib/accept-invitation.ts";

function fixture() {
  const calls = [];
  const values = new Map();
  const progress = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  const state = {
    userId: "recipient",
    verifyError: null,
    roleError: null,
    roles: [{ role: "rep" }],
    passwordError: null,
  };
  const client = {
    auth: {
      verifyOtp: async (input) => {
        calls.push(["verify", input]);
        return { data: { user: { id: "recipient" }, session: {} }, error: state.verifyError };
      },
      getUser: async () => ({ data: { user: { id: state.userId } }, error: null }),
      updateUser: async (input) => {
        calls.push(["password", input]);
        return { error: state.passwordError };
      },
    },
    from: () => ({
      select: () => ({ eq: async () => ({ data: state.roles, error: state.roleError }) }),
    }),
  };
  return { calls, values, progress, state, client };
}
const password = "Long-password-42!";
const run = (f) => finishInvitation(f.client, "test-token", password, password, f.progress);

test("accepts a valid invitation, sets password and clears completion marker", async () => {
  const f = fixture();
  assert.equal(await run(f), "recipient");
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    ["verify", "password"],
  );
  assert.equal(f.values.size, 0);
});
test("bad confirmation and short password do not consume token", async () => {
  const f = fixture();
  await assert.rejects(
    finishInvitation(f.client, "token", password, "different", f.progress),
    /hetzelfde/,
  );
  await assert.rejects(
    finishInvitation(f.client, "token", "short", "short", f.progress),
    /8 tekens/,
  );
  await assert.rejects(finishInvitation(f.client, "", password, password, f.progress), /volledige/);
  assert.equal(f.calls.length, 0);
});
test("password failure can be retried after reload without reusing one-time token", async () => {
  const f = fixture();
  f.state.passwordError = { message: "Password policy rejected" };
  await assert.rejects(run(f), /Password policy/);
  assert.equal(f.values.size, 1);
  for (const [key, value] of f.values) {
    assert.ok(!key.includes("test-token"));
    assert.equal(value, "recipient");
  }
  // A new call with only persisted progress represents a remounted page.
  f.state.passwordError = null;
  assert.equal(await run(f), "recipient");
  assert.equal(f.calls.filter((c) => c[0] === "verify").length, 1);
  assert.equal(f.values.size, 0);
});
test("a different invitation cannot reuse previous verification", async () => {
  const f = fixture();
  f.state.passwordError = { message: "try again" };
  await assert.rejects(run(f));
  await assert.rejects(finishInvitation(f.client, "another-token", password, password, f.progress));
  assert.equal(f.calls.filter((c) => c[0] === "verify").length, 2);
});
test("resuming with another signed-in account never changes its password", async () => {
  const f = fixture();
  f.state.passwordError = { message: "try again" };
  await assert.rejects(run(f));
  f.state.userId = "another-user";
  f.state.passwordError = null;
  await assert.rejects(run(f), /sessie/);
  assert.equal(f.calls.filter((c) => c[0] === "password").length, 1);
});
test("expired or used links show actionable error without setting password", async () => {
  const f = fixture();
  f.state.verifyError = { message: "expired", status: 403 };
  await assert.rejects(run(f), /verlopen/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.values.size, 0);
});
test("network failure does not tell user their invitation expired", async () => {
  const f = fixture();
  f.state.verifyError = { message: "offline", name: "AuthRetryableFetchError", status: 0 };
  await assert.rejects(run(f), /verbinding/);
  assert.equal(f.values.size, 0);
});
test("revoked access cannot finish onboarding even with verified token", async () => {
  const f = fixture();
  f.state.roles = [];
  await assert.rejects(run(f), /geen CRM-toegang/);
  assert.equal(f.calls.filter((c) => c[0] === "password").length, 0);
});
test("temporary role lookup failure can be retried without consuming token twice", async () => {
  const f = fixture();
  f.state.roleError = { message: "offline" };
  await assert.rejects(run(f), /gecontroleerd/);
  f.state.roleError = null;
  await run(f);
  assert.equal(f.calls.filter((c) => c[0] === "verify").length, 1);
});
