import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadSessionTokenModule() {
  const filePath = path.resolve("src/lib/session-token.ts");
  const source = await readFile(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2023,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    compiled,
    { exports: module.exports, module },
    { filename: filePath },
  );
  return module.exports;
}

test("extracts accessToken from ChatGPT session JSON", async () => {
  const { extractAccessTokenFromSessionText } = await loadSessionTokenModule();

  assert.equal(
    extractAccessTokenFromSessionText(
      JSON.stringify({ user: { email: "user@example.com" }, accessToken: "ac_json_token" }),
    ),
    "ac_json_token",
  );
});

test("extracts nested access_token from session-like JSON", async () => {
  const { extractAccessTokenFromSessionText } = await loadSessionTokenModule();

  assert.equal(
    extractAccessTokenFromSessionText(
      JSON.stringify({ session: { tokens: { access_token: "ac_nested_token" } } }),
    ),
    "ac_nested_token",
  );
});

test("accepts a pasted raw token string", async () => {
  const { extractAccessTokenFromSessionText } = await loadSessionTokenModule();

  assert.equal(
    extractAccessTokenFromSessionText("ac_raw_token"),
    "ac_raw_token",
  );
});

test("returns an empty string for invalid JSON-like text", async () => {
  const { extractAccessTokenFromSessionText } = await loadSessionTokenModule();

  assert.equal(extractAccessTokenFromSessionText('{"accessToken":'), "");
});
