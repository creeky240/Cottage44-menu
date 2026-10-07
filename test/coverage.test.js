import assert from "node:assert/strict";
import test from "node:test";
import { buildCoverageReport } from "../scripts/coverage.js";

test("creates LCOV line and function metrics from Node V8 ranges", () => {
  const source = "covered();\nuncovered();\n";
  const { lcov, summary } = buildCoverageReport(source, [
    {
      functions: [
        {
          functionName: "",
          ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }],
        },
        {
          functionName: "covered",
          ranges: [{ startOffset: 0, endOffset: 10, count: 1 }],
        },
        {
          functionName: "uncovered",
          ranges: [{ startOffset: 11, endOffset: 23, count: 0 }],
        },
      ],
    },
  ]);

  assert.match(lcov, /FNDA:1,covered/);
  assert.match(lcov, /FNDA:0,uncovered/);
  assert.match(lcov, /DA:1,1/);
  assert.match(lcov, /DA:2,0/);
  assert.match(lcov, /LF:2/);
  assert.match(lcov, /LH:1/);
  assert.match(summary, /Lines: 50\.00% \(1\/2\)/);
  assert.match(summary, /Functions: 50\.00% \(1\/2\)/);
  assert.match(summary, /docs\/menu\.js:/);
});
