#!/usr/bin/env node
/**
 * PyScanner CLI
 * Usage: pyscanner [options] <file.py|directory>
 */

import { scanPythonCode, formatTerminalOutput } from "./scanner.js";
import { readFileSync, writeFileSync, statSync, readdirSync, existsSync } from "fs";
import { resolve, extname, basename, join } from "path";

import packageJson from "./package.json" with { type: "json" };

const VERSION = packageJson.version;

// Allon: There's a lot of boilreplate code here to handle CLI argument parsing.
// Might be easier to use a 3rd party like https://www.npmjs.com/package/argparse to handle this
function printHelp() {
  console.log(`
PyScanner v${VERSION} — Python SAST Scanner (CWE Top 25, 2025)

USAGE:
  pyscanner [options] <file.py>
  pyscanner [options] <directory>
  cat file.py | pyscanner --stdin

OPTIONS:
  -h, --help              Show this help message
  -v, --version           Show version
  --verbose               Show AST trace, fix suggestions, safe code
  --no-color              Disable color output
  --output <format>       Output format: text (default), json, sarif
  --out-file <path>       Write output to file instead of stdout
  --severity <level>      Only report findings at or above: critical, high, medium, low
  --fail-on <level>       Exit with code 1 if findings at or above this severity
  --stdin                 Read Python code from stdin
  --include-safe-code     Include fixed safe code in JSON/SARIF output

EXAMPLES:
  pyscanner app.py
  pyscanner --output json --out-file results.json app.py
  pyscanner --output sarif --out-file results.sarif src/
  pyscanner --fail-on high --severity medium app.py
  cat vulnerable.py | pyscanner --stdin --output json

EXIT CODES:
  0 - No findings (or all below --fail-on threshold)
  1 - Findings at or above --fail-on threshold (default: any finding)
  2 - Scanner error
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    files: [],
    verbose: false,
    color: true,
    output: "text",
    outFile: null,
    severity: "low",
    failOn: null,
    stdin: false,
    includeSafeCode: false,
  };

  const severityOrder = ["low", "medium", "high", "critical"];

  // Allon: specifically, there's a bug here in handling duplicate or contradicting arguments. E.g., think of:
  // pyscanner --fail-on high --fail-on low app.py
  // Only the last --fail-on will be handled.
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
    else if (a === "-v" || a === "--version") { console.log(`PyScanner v${VERSION}`); process.exit(0); }
    else if (a === "--verbose") opts.verbose = true;
    else if (a === "--no-color") opts.color = false;
    else if (a === "--stdin") opts.stdin = true;
    else if (a === "--include-safe-code") opts.includeSafeCode = true;
    else if (a === "--output" && args[i+1]) opts.output = args[++i];
    else if (a === "--out-file" && args[i+1]) opts.outFile = args[++i];
    else if (a === "--severity" && args[i+1]) opts.severity = args[++i];
    else if (a === "--fail-on" && args[i+1]) opts.failOn = args[++i];
    else if (!a.startsWith("-")) opts.files.push(a);
  }

  if (!severityOrder.includes(opts.severity)) {
    console.error(`Invalid severity: ${opts.severity}. Use: low, medium, high, critical`);
    process.exit(2);
  }

  return opts;
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

// Allon: Worth considering using async I/O, and returning a Promise from here
function collectPythonFiles(pathArg) {
  const abs = resolve(pathArg);
  if (!existsSync(abs)) {
    console.error(`Path not found: ${abs}`);
    process.exit(2);
  }
  const stat = statSync(abs);
  if (stat.isFile()) {
    if (extname(abs) !== ".py") {
      console.error(`Not a Python file: ${abs}`);
      process.exit(2);
    }
    return [abs];
  }
  if (stat.isDirectory()) {
    const files = [];
    function walk(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        // Allon: I'd externalize the directories to be ignored to a config option, with these as the default
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "__pycache__") {
          walk(full);
        } else if (entry.isFile() && entry.name.endsWith(".py")) {
          files.push(full);
        }
      }
    }
    walk(abs);
    return files;
  }
  return [];
}

function filterBySeverity(findings, minSeverity) {
  // Allon: I'd extract a global severityOrder instead of redefining it multiple times
  const order = ["low", "medium", "high", "critical"];
  const minIdx = order.indexOf(minSeverity);
  return findings.filter((f) => order.indexOf(f.severity) >= minIdx);
}

function buildSummary(findings) {
  // Allon: Here's a neat trick to initialize the summaries and not duplicate the severity names, if you have a global
  // seveirtyOrder variable:
  // const summary = Object.fromEntries(severityOrder.map(x => [x, 0]))
  // And then you can add on the total
  const summary = { total: findings.length, critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    if (summary[f.severity] !== undefined) summary[f.severity]++;
  }
  return summary;
}

async function main() {
  const opts = parseArgs(process.argv);

  // Allon: This is part of the argument handling logic, it should be in `parseArgs`
  if (!opts.stdin && opts.files.length === 0) {
    printHelp();
    process.exit(0);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY environment variable is not set.");
    console.error("   Export it: export ANTHROPIC_API_KEY=sk-ant-...");
    process.exit(2);
  }

  // Collect files
  let filePairs = []; // [{path, code}]

  if (opts.stdin) {
    if (opts.output === "text" && opts.color) process.stderr.write("Reading from stdin...\n");
    const code = await readStdin();
    filePairs.push({ path: "stdin", code });
  } else {
    for (const f of opts.files) {
      for (const fp of collectPythonFiles(f)) {
        // Allon: Consider using async-io here
        filePairs.push({ path: fp, code: readFileSync(fp, "utf8") });
      }
    }
  }

  if (filePairs.length === 0) {
    console.error("No Python files found.");
    process.exit(2);
  }

  const allResults = [];
  let hasHighSeverityFinding = false;
  const failOnOrder = ["low", "medium", "high", "critical"];
  const failOnIdx = opts.failOn ? failOnOrder.indexOf(opts.failOn) : 0;

  for (const { path: fp, code } of filePairs) {
    if (opts.output === "text") {
      process.stderr.write(`\n⏳ Scanning ${basename(fp)}...\n`);
    }

    try {
      // Allon: this is going to be pretty slow. Instead, I'd return a promise from `scanPythonCode` and
      // use Promise.all to wait on all of them in parallel
      // Moreover, it makes sense to have a single system prompt and an array of use prompts, one per file,
      // and send them all in a single request to the Anthropic API. This will reduce the number of API calls and
      // speed up the scanning process.
      // With the current design, the same system prompt is sent for every scanned file
      const result = await scanPythonCode(code, basename(fp));

      // Filter by severity
      result.findings = filterBySeverity(result.findings || [], opts.severity);
      result.summary = buildSummary(result.findings);

      if (!opts.includeSafeCode) {
        delete result.safe_code;
      }

      allResults.push({ file: fp, result });

      // Allon: you can break after finding the first vuln that has sufficient severity.
      // Alternatively, a more concise way of writing this could be something like
      // const hashHighSeverityFinding =
      //   result.findings.some(f => failOnOrder.indexOf(f.severity) >= failOnIdx);

      // Check fail-on
      if (opts.failOn) {
        for (const f of result.findings) {
          if (failOnOrder.indexOf(f.severity) >= failOnIdx) {
            hasHighSeverityFinding = true;
          }
        }
      // Allon: You don't need the else branch.
      // If opts.failOn is a false-y, failOnIdx is initialized to 0, and the block above still works
      } else if (result.findings.length > 0) {
        hasHighSeverityFinding = true;
      }

      // Print text output per file
      if (opts.output === "text") {
        const formatted = formatTerminalOutput(result, {
          color: opts.color,
          verbose: opts.verbose,
        });
        if (opts.outFile) {
          // accumulate for later
        } else {
          process.stdout.write(formatted);
        }
      }
    } catch (err) {
      console.error(`❌ Error scanning ${fp}: ${err.message}`);
      if (opts.output !== "text") process.exit(2);
    }
  }

  // Output JSON or SARIF
  if (opts.output === "json") {
    const output = allResults.length === 1
      ? allResults[0].result
      : { files: allResults.map(r => ({ file: r.file, ...r.result })) };
    const json = JSON.stringify(output, null, 2);
    if (opts.outFile) {
      writeFileSync(opts.outFile, json);
      console.error(`✅ JSON written to ${opts.outFile}`);
    } else {
      process.stdout.write(json + "\n");
    }
  } else if (opts.output === "sarif") {
    // Merge all SARIF results
    const merged = {
      version: "2.1.0",
      $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
      runs: allResults.flatMap(r => r.result.sarif?.runs || []),
    };
    const sarifJson = JSON.stringify(merged, null, 2);
    if (opts.outFile) {
      writeFileSync(opts.outFile, sarifJson);
      console.error(`✅ SARIF written to ${opts.outFile}`);
    } else {
      process.stdout.write(sarifJson + "\n");
    }
  } else if (opts.output === "text" && opts.outFile) {
    const lines = allResults.map(r =>
      formatTerminalOutput(r.result, { color: false, verbose: opts.verbose })
    ).join("\n");
    writeFileSync(opts.outFile, lines);
    console.error(`✅ Report written to ${opts.outFile}`);
  }

  // Print multi-file summary
  if (opts.output === "text" && allResults.length > 1) {
    const totalFindings = allResults.reduce((s, r) => s + (r.result.findings?.length || 0), 0);
    console.log(`\n📊 Scanned ${allResults.length} files — ${totalFindings} total finding(s)\n`);
  }

  process.exit(hasHighSeverityFinding ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
