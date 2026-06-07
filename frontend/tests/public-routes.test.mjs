import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadPublicRoutesModule() {
  const filePath = path.resolve("src/lib/public-routes.ts");
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

test("recognizes converter as a public route", async () => {
  const { getPublicClientRoute } = await loadPublicRoutesModule();

  assert.equal(getPublicClientRoute("/converter"), "/converter");
  assert.equal(getPublicClientRoute("/converter/"), "/converter");
});

test("keeps existing public client routes", async () => {
  const { getPublicClientRoute } = await loadPublicRoutesModule();

  assert.equal(getPublicClientRoute("/pxl-plus"), "/pxl-plus");
  assert.equal(getPublicClientRoute("/luckmail-code"), "/luckmail-code");
});

test("does not match nested converter paths", async () => {
  const { getPublicClientRoute } = await loadPublicRoutesModule();

  assert.equal(getPublicClientRoute("/converter/nested"), "");
});
