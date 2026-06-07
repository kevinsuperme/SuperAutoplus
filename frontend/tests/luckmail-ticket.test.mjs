import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadLuckMailTicketModule() {
  const filePath = path.resolve("src/lib/luckmail-ticket.ts");
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

test("parses email and token from LuckMail ticket text", async () => {
  const { parseLuckMailTicketPreview, resolveLuckMailDisplayEmail } =
    await loadLuckMailTicketModule();

  const preview = parseLuckMailTicketPreview(
    "jadelee7905@outlook.com----tok_894d7778268489752c2c077e7ac6a603",
  );

  assert.equal(preview.valid, true);
  assert.equal(preview.email, "jadelee7905@outlook.com");
  assert.equal(preview.token, "tok_894d7778268489752c2c077e7ac6a603");
  assert.equal(resolveLuckMailDisplayEmail(preview, ""), "jadelee7905@outlook.com");
});

test("shows token-only placeholder until LuckMail returns the email", async () => {
  const { parseLuckMailTicketPreview, resolveLuckMailDisplayEmail } =
    await loadLuckMailTicketModule();

  const preview = parseLuckMailTicketPreview("tok_894d7778268489752c2c077e7ac6a603");

  assert.equal(preview.valid, true);
  assert.equal(preview.tokenOnly, true);
  assert.equal(resolveLuckMailDisplayEmail(preview, ""), "提交后识别邮箱");
  assert.equal(
    resolveLuckMailDisplayEmail(preview, "jadelee7905@outlook.com"),
    "jadelee7905@outlook.com",
  );
});

test("does not show token-only placeholder for invalid LuckMail text", async () => {
  const { parseLuckMailTicketPreview, resolveLuckMailDisplayEmail } =
    await loadLuckMailTicketModule();

  const preview = parseLuckMailTicketPreview("jadelee7905@outlook.com tok_abc");

  assert.equal(preview.valid, false);
  assert.equal(preview.tokenOnly, false);
  assert.equal(resolveLuckMailDisplayEmail(preview, ""), "-");
});
