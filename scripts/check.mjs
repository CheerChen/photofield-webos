import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join } from "node:path";

function walk(dir, accept) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path, accept));
    else if (accept(path)) files.push(path);
  }
  return files.sort();
}

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

const syntaxFiles = [
  ...walk("js", (path) => extname(path) === ".js"),
  "tvkit/js/webos-platform.js",
];
for (const file of syntaxFiles) run(["--check", file]);

const tests = [
  ...walk("tests", (path) => path.endsWith(".test.mjs") && !path.includes("/e2e/")),
  "tvkit/tests/webos-platform.test.mjs",
];
for (const file of tests) run([file]);

console.log(`check.mjs OK (${syntaxFiles.length} scripts, ${tests.length} tests)`);
