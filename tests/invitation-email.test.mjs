import test from "node:test";
import assert from "node:assert/strict";
import {
  createInvitationSender,
  invitationMessage,
  inviteMemberByEmail,
} from "../src/lib/invitation-email.server.ts";

const mail = {
  id: "invitation-123",
  email: "colleague@example.test",
  fullName: "Test Colleague",
  companyName: "Healthfactor",
  url: "https://crm.example.com/accept-invite#company_invite=company-token&token_hash=auth-token",
};
const config = {
  apiKey: "test-key",
  from: "Sales CRM <invite@example.test>",
  sleep: async () => {},
};

test("invitation email escapes user-controlled content and keeps the personal link intact", () => {
  const result = invitationMessage({
    ...mail,
    companyName: '<img src=x onerror="alert(1)">\nCompany',
    fullName: "<script>hello</script>",
  });
  assert.ok(!result.html.includes("<script>"));
  assert.ok(!result.html.includes("<img"));
  assert.ok(!result.subject.includes("\n"));
  assert.match(result.html, /lang="nl"/);
  assert.match(result.html, /role="presentation"/);
  assert.ok(result.html.includes(mail.url.replaceAll("&", "&amp;")));
  assert.ok(result.text.includes(mail.url));
  assert.ok(result.text.includes("alleen toegang tot dit bedrijf"));
});

test("missing email configuration fails before creating a sender", () => {
  for (const missing of [
    { ...config, apiKey: undefined },
    { ...config, from: undefined },
    { ...config, from: "sender\nBcc:other" },
  ]) {
    assert.throws(() => createInvitationSender(missing), /RESEND_API_KEY/);
  }
});

test("transient failures retry the identical email with one idempotency key", async () => {
  const requests = [];
  const sender = createInvitationSender({
    ...config,
    fetchImpl: async (url, init) => {
      requests.push({ url, ...init });
      if (requests.length === 1) throw new Error("timeout with private provider details");
      return requests.length === 2
        ? new Response("busy", { status: 429 })
        : Response.json({ id: "sent-123" });
    },
  });
  assert.deepEqual(await sender(mail), { status: "sent", messageId: "sent-123" });
  assert.equal(requests.length, 3);
  assert.equal(new Set(requests.map((r) => r.body)).size, 1);
  assert.equal(new Set(requests.map((r) => r.headers["Idempotency-Key"])).size, 1);
  assert.equal(requests[0].headers["Idempotency-Key"], "company-invitation/invitation-123");
  assert.equal(requests[0].redirect, "error");
  assert.deepEqual(JSON.parse(requests[0].body).to, [mail.email]);
});

test("permanent rejection, exhausted retries and malformed success never report sent", async () => {
  for (const status of [403, 500, 200]) {
    let attempts = 0;
    const send = createInvitationSender({
      ...config,
      fetchImpl: async () => {
        attempts++;
        return Response.json({ error: "PRIVATE provider details" }, { status });
      },
    });
    assert.deepEqual(await send(mail), { status: "unconfirmed" });
    assert.equal(attempts, status === 403 ? 1 : 3);
  }
});

function clients({
  companyName = "Healthfactor",
  isAdmin = true,
  existing = false,
  provisioningError = null,
} = {}) {
  const calls = [];
  const client = {
    from: (table) => ({
      select: (columns) => ({
        eq: (key, id) => ({
          single: async () => {
            calls.push(["company", table, columns, key, id]);
            return { data: companyName ? { name: companyName } : null, error: null };
          },
        }),
      }),
    }),
    rpc: async (name) => {
      calls.push([name]);
      return name === "has_role"
        ? { data: isAdmin, error: null }
        : { data: { id: "invitation-123", token: "company-token" }, error: provisioningError };
    },
  };
  const admin = {
    auth: {
      admin: {
        generateLink: async () => {
          calls.push(["generateLink"]);
          return {
            data: { user: { id: "user" }, properties: { hashed_token: "auth-token" } },
            error: existing ? { code: "email_exists", message: "already registered" } : null,
          };
        },
      },
    },
  };
  return { client, admin, calls };
}
const input = { email: mail.email, fullName: mail.fullName, role: "rep" };

test("every company's invitation uses its database name and sends only after persistence", async () => {
  for (const [companyId, companyName, existing] of [
    ["healthfactor-id", "Healthfactor", false],
    ["verkoop-id", "Verkoop Studio", true],
    ["future-company", "Future Company", false],
  ]) {
    const { client, admin, calls } = clients({ companyName, existing });
    const result = await inviteMemberByEmail(
      client,
      admin,
      "owner",
      input,
      "https://crm.example.com",
      companyId,
      async (received) => {
        calls.push(["email", received]);
        return { status: "sent", messageId: "message" };
      },
    );
    assert.equal(calls[0][4], companyId);
    assert.equal(calls.at(-2)[0], "invite_company_member");
    assert.equal(calls.at(-1)[1].companyName, companyName);
    const fragment = new URLSearchParams(new URL(calls.at(-1)[1].url).hash.slice(1));
    assert.equal(fragment.get("company_invite"), "company-token");
    assert.equal(fragment.has("token_hash"), !existing);
    assert.equal(result.delivery.status, "sent");
    assert.equal(result.companyName, companyName);
  }
});

test("unauthorized or failed company invitations never send email", async () => {
  for (const options of [
    { isAdmin: false },
    { companyName: null },
    { provisioningError: { message: "denied" } },
  ]) {
    const { client, admin } = clients(options);
    let sends = 0;
    await assert.rejects(
      inviteMemberByEmail(
        client,
        admin,
        "owner",
        input,
        "https://crm.example.com",
        "company",
        async () => {
          sends++;
        },
      ),
    );
    assert.equal(sends, 0);
  }
});

test("email failure retains a usable company invitation for manual sharing", async () => {
  const { client, admin } = clients();
  const result = await inviteMemberByEmail(
    client,
    admin,
    "owner",
    input,
    "https://crm.example.com",
    "company",
    async () => ({ status: "unconfirmed" }),
  );
  assert.equal(result.delivery.status, "unconfirmed");
  assert.equal(
    new URLSearchParams(new URL(result.url).hash.slice(1)).get("company_invite"),
    "company-token",
  );
});
