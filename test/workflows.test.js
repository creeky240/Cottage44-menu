import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewWorkflow = await readFile(
  path.join(root, ".github/workflows/cloudflare-preview.yml"),
  "utf8",
);

test("Cloudflare fork previews download static PR files without unsafe checkout", () => {
  assert.match(previewWorkflow, /pull_request_target:/);
  assert.match(previewWorkflow, /zipball\/refs\/pull\/\$\{PR_NUMBER\}\/merge/);
  assert.match(previewWorkflow, /cp -R "\$source_dir\/docs\/\." preview\//);
  assert.match(previewWorkflow, /pages deploy preview/);
  assert.match(
    previewWorkflow,
    /https:\/\/pr-\$\{\{ github\.event\.pull_request\.number \}\}\.cottage44-menu-pages\.pages\.dev/,
  );
  assert.doesNotMatch(previewWorkflow, /actions\/checkout/);
  assert.doesNotMatch(previewWorkflow, /allow-unsafe-pr-checkout/);
});
