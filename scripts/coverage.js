import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePaths = [
  path.join(root, "docs/menu.js"),
  path.join(root, "docs/admin/admin.js"),
];
const outputDirectory = path.join(root, "coverage");

export function buildCoverageReport(source, scriptEntries, relativeSource = "docs/menu.js") {
  const mergedRanges = new Map();
  const functions = new Map();

  for (const script of scriptEntries) {
    for (const fn of script.functions) {
      for (const range of fn.ranges) {
        const key = `${range.startOffset}:${range.endOffset}`;
        const current = mergedRanges.get(key);
        if (!current || range.count > current.count) {
          mergedRanges.set(key, range);
        }
      }

      const outerRange = fn.ranges[0];
      if (!outerRange || (fn.functionName === "" && outerRange.startOffset === 0)) {
        continue;
      }

      const line = source.slice(0, outerRange.startOffset).split("\n").length;
      const baseName = fn.functionName || "anonymous";
      const key = `${line}:${baseName}`;
      const current = functions.get(key);
      if (!current || outerRange.count > current.count) {
        functions.set(key, { line, name: baseName, count: outerRange.count });
      }
    }
  }

  const ranges = [...mergedRanges.values()];
  const lineHits = [];
  let offset = 0;
  for (const [index, line] of source.split("\n").entries()) {
    let executable = false;
    let hit = false;
    for (let position = offset; position < offset + line.length; position += 1) {
      if (/\s/.test(source[position])) {
        continue;
      }
      executable = true;
      let narrowestRange;
      for (const range of ranges) {
        if (
          range.startOffset <= position &&
          position < range.endOffset &&
          (!narrowestRange ||
            range.endOffset - range.startOffset <
              narrowestRange.endOffset - narrowestRange.startOffset ||
            (range.endOffset - range.startOffset ===
              narrowestRange.endOffset - narrowestRange.startOffset &&
              range.count > narrowestRange.count))
        ) {
          narrowestRange = range;
        }
      }
      if (narrowestRange?.count > 0) {
        hit = true;
      }
    }
    if (executable) {
      lineHits.push({ line: index + 1, hit });
    }
    offset += line.length + 1;
  }

  const sortedFunctions = [...functions.values()].sort(
    (left, right) => left.line - right.line || left.name.localeCompare(right.name),
  );
  const namedFunctions = sortedFunctions.map((fn, index) => ({
    ...fn,
    lcovName: fn.name === "anonymous" ? `anonymous_${index + 1}` : fn.name,
  }));

  const linesHit = lineHits.filter(({ hit }) => hit).length;
  const functionsHit = namedFunctions.filter(({ count }) => count > 0).length;
  const percentage = (hit, total) =>
    total === 0 ? "n/a" : `${((hit / total) * 100).toFixed(2)}%`;

  const lcov = [
    "TN:",
    `SF:${relativeSource}`,
    ...namedFunctions.flatMap(({ line, lcovName, count }) => [
      `FN:${line},${lcovName}`,
      `FNDA:${count},${lcovName}`,
    ]),
    `FNF:${namedFunctions.length}`,
    `FNH:${functionsHit}`,
    ...lineHits.map(({ line, hit }) => `DA:${line},${hit ? 1 : 0}`),
    `LF:${lineHits.length}`,
    `LH:${linesHit}`,
    "end_of_record",
    "",
  ].join("\n");

  const summary = [
    `${relativeSource}:`,
    `  Lines: ${percentage(linesHit, lineHits.length)} (${linesHit}/${lineHits.length})`,
    `  Functions: ${percentage(functionsHit, namedFunctions.length)} (${functionsHit}/${namedFunctions.length})`,
  ].join("\n");

  return { lcov, summary };
}

async function writeCoverageReport(coverageDirectory) {
  const coverageFiles = (await readdir(coverageDirectory)).filter((file) =>
    file.endsWith(".json"),
  );
  const reports = [];

  for (const file of coverageFiles) {
    const report = JSON.parse(
      await readFile(path.join(coverageDirectory, file), "utf8"),
    );
    for (const sourcePath of sourcePaths) {
      const sourceUrl = pathToFileURL(sourcePath).href;
      const sourceEntries = (report.result ?? []).filter(
        (script) => script.url === sourceUrl ||
          script.url === path.relative(root, sourcePath),
      );
      if (sourceEntries.length > 0) {
        reports.push({
          sourcePath,
          sourceEntries,
        });
      }
    }
  }

  if (reports.length === 0) {
    throw new Error("Node did not report V8 coverage for the frontend scripts");
  }

  const reportByPath = new Map();
  for (const report of reports) {
    reportByPath.set(report.sourcePath, report.sourceEntries);
  }
  const reportResults = [];
  for (const sourcePath of sourcePaths) {
    const sourceEntries = reportByPath.get(sourcePath);
    if (!sourceEntries) {
      continue;
    }
    const source = await readFile(sourcePath, "utf8");
    reportResults.push(buildCoverageReport(
      source,
      sourceEntries,
      path.relative(root, sourcePath).split(path.sep).join("/"),
    ));
  }
  const lcov = reportResults.map(({ lcov: result }) => result).join("");
  const summary = [
    "JavaScript source coverage (Node.js built-in V8 coverage)",
    "Scope: docs/menu.js and docs/admin/admin.js. HTML, CSS, and inline HTML scripts are not measured.",
    ...reportResults.map(({ summary: result }) => result),
    "LCOV report: coverage/lcov.info",
    "",
  ].join("\n");
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, "lcov.info"), lcov),
    writeFile(path.join(outputDirectory, "summary.txt"), summary),
  ]);
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag: "a" });
  }
}

async function runCoverage() {
  const rawCoverageDirectory = await mkdtemp(
    path.join(os.tmpdir(), "cottage44-v8-coverage-"),
  );
  const testFiles = (await readdir(path.join(root, "test")))
    .filter((file) => /\.test\.(?:js|ts)$/.test(file))
    .sort()
    .map((file) => path.join("test", file));
  let testExitCode = 1;

  try {
    const testRun = spawnSync(
      process.execPath,
      ["--import", "tsx", "--test", ...testFiles],
      {
        cwd: root,
        env: { ...process.env, NODE_V8_COVERAGE: rawCoverageDirectory },
        stdio: "inherit",
      },
    );
    if (testRun.error) {
      throw testRun.error;
    }
    testExitCode = testRun.status ?? 1;

    await writeCoverageReport(rawCoverageDirectory);
  } finally {
    await rm(rawCoverageDirectory, { recursive: true, force: true });
  }

  process.exitCode = testExitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCoverage();
}
