import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = await readFile(
  path.join(root, ".github/workflows/cloudflare-preview.yml"),
  "utf8",
);

test("Cloudflare previews are static-only and fork-safe", () => {
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /zipball\/refs\/pull\/\$\{PR_NUMBER\}\/merge/);
  assert.match(workflow, /cp -R "\$source_dir\/docs\/\." preview\//);
  assert.match(workflow, /pages deploy preview/);
  assert.match(
    workflow,
    /https:\/\/pr-\$\{\{ github\.event\.pull_request\.number \}\}\.cottage44-menu-pages\.pages\.dev/,
  );
  assert.doesNotMatch(workflow, /actions\/checkout/);
  assert.doesNotMatch(workflow, /allow-unsafe-pr-checkout/);
});
