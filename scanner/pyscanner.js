#!/usr/bin/env node
/**
 * PyScanner CLI
 * Usage: pyscanner [options] <file.py|directory>
 */

import { scanPythonCode, formatTerminalOutput } from "./scanner.js";
import { readFileSync, writeFileSync, statSync, readdirSync, existsSync } from "fs";
import { resolve, extname, basename, join } from "path";

import packageJson from "./package.json" with { type: "json" };
import { parseArgs as parseNodeArgs } from "node:util";

const VERSION = packageJson.version;
const SEVERITY_ORDER = ["low", "medium", "high", "critical"];

const OUTPUT_FORMATS = ["text", "json", "sarif"];
const DEFAULT_IGNORED_DIRECTORIES = [
  "node_modules",
  "__pycache__",
  ".git",
  ".venv",
  "venv",
  "env",
];


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
  --ignore-dir <name>     Additional directory to ignore (repeatable)

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

function argumentError(message) {
  console.error(`Argument error: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  let parsed;

  try {
    parsed = parseNodeArgs({
      args: argv.slice(2),
      allowPositionals: true,
      strict: true,
      tokens: true,
      options: {
        help: {
          type: "boolean",
          short: "h",
        },
        version: {
          type: "boolean",
          short: "v",
        },
        verbose: {
          type: "boolean",
        },
        "no-color": {
          type: "boolean",
        },
        output: {
          type: "string",
        },
        "out-file": {
          type: "string",
        },
        severity: {
          type: "string",
        },
        "fail-on": {
          type: "string",
        },
        stdin: {
          type: "boolean",
        },
        "include-safe-code": {
          type: "boolean",
        },
        "ignore-dir": {
          type: "string",
          multiple: true,
        },
      },
    });
  } catch (error) {
    argumentError(error.message);
  }

  const { values, positionals, tokens } = parsed;

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (values.version) {
    console.log(`PyScanner v${VERSION}`);
    process.exit(0);
  }

  const singleValueOptions = new Set([
    "output",
    "out-file",
    "severity",
    "fail-on",
  ]);
  const seenOptions = new Set();

  for (const token of tokens) {
    if (
      token.kind !== "option" ||
      !singleValueOptions.has(token.name)
    ) {
      continue;
    }

    if (seenOptions.has(token.name)) {
      argumentError(`--${token.name} may only be provided once.`);
    }

    seenOptions.add(token.name);
  }

  const output = values.output ?? "text";
  const severity = values.severity ?? "low";
  const failOn = values["fail-on"] ?? null;
  const stdin = values.stdin ?? false;

  if (!OUTPUT_FORMATS.includes(output)) {
    argumentError(
      `Invalid output format: ${output}. Use: ${OUTPUT_FORMATS.join(", ")}`
    );
  }

  if (!SEVERITY_ORDER.includes(severity)) {
    argumentError(
      `Invalid severity: ${severity}. Use: ${SEVERITY_ORDER.join(", ")}`
    );
  }

  if (failOn !== null && !SEVERITY_ORDER.includes(failOn)) {
    argumentError(
      `Invalid fail-on severity: ${failOn}. Use: ${SEVERITY_ORDER.join(", ")}`
    );
  }

  if (stdin && positionals.length > 0) {
    argumentError("--stdin cannot be combined with file or directory paths.");
  }

  if (!stdin && positionals.length === 0) {
    printHelp();
    process.exit(0);
  }

  return {
    files: positionals,
    verbose: values.verbose ?? false,
    color: !(values["no-color"] ?? false),
    output,
    outFile: values["out-file"] ?? null,
    severity,
    failOn,
    stdin,
    includeSafeCode: values["include-safe-code"] ?? false,
    ignoredDirectories: new Set([
      ...DEFAULT_IGNORED_DIRECTORIES,
      ...(values["ignore-dir"] ?? []),
    ]),
  };
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
  const minIdx = SEVERITY_ORDER.indexOf(minSeverity);
  return findings.filter(
    (finding) => SEVERITY_ORDER.indexOf(finding.severity) >= minIdx
  );
}

function buildSummary(findings) {
  const summary = {
    total: findings.length,
    ...Object.fromEntries(
      SEVERITY_ORDER.map((severity) => [severity, 0])
    ),
  };

  for (const f of findings) {
    if (summary[f.severity] !== undefined) summary[f.severity]++;
  }

  return summary;
}

async function main() {
  const opts = parseArgs(process.argv);


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
 const failOnIdx = opts.failOn
  ? SEVERITY_ORDER.indexOf(opts.failOn)
  : 0;

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

      hasHighSeverityFinding =
  hasHighSeverityFinding ||
  result.findings.some(
    (finding) =>
      SEVERITY_ORDER.indexOf(finding.severity) >= failOnIdx
  );

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
