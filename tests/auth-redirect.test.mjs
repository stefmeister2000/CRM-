import test from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../src/lib/auth-redirect.ts";
test("auth next accepts local paths and keeps OAuth consent query", () => {
  assert.equal(
    safeNext("/oauth/consent?authorization_id=123"),
    "/oauth/consent?authorization_id=123",
  );
});
test("auth next rejects external and browser-normalized external URLs", () => {
  for (const value of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    undefined,
  ])
    assert.equal(safeNext(value), undefined);
});
