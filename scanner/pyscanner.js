#!/usr/bin/env node
/**
 * PyScanner CLI
 * Usage: pyscanner [options] <file.py|directory>
 */

import { scanPythonCode, formatTerminalOutput } from "./scanner.js";
import {
  readFile,
  writeFile,
  stat,
  readdir,
} from "node:fs/promises";
import { resolve, extname, basename, join } from "node:path";

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
      `Invalid output format: ${output}. Use one of: ${OUTPUT_FORMATS.join(", ")}`
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

async function collectPythonFiles(pathArg, ignoredDirectories) {
  const absolutePath = resolve(pathArg);

  let pathStats;

  try {
    pathStats = await stat(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Path not found: ${absolutePath}`);
    }

    throw error;
  }

  if (pathStats.isFile()) {
    if (extname(absolutePath) !== ".py") {
      throw new Error(`Not a Python file: ${absolutePath}`);
    }

    return [absolutePath];
  }

  if (!pathStats.isDirectory()) {
    return [];
  }

  async function walk(directory) {
    const entries = await readdir(directory, {
      withFileTypes: true,
    });

    const discoveredFiles = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(directory, entry.name);

        if (entry.isDirectory()) {
          const shouldIgnore =
            entry.name.startsWith(".") ||
            ignoredDirectories.has(entry.name);

          if (shouldIgnore) {
            return [];
          }

          return walk(fullPath);
        }

        if (entry.isFile() && entry.name.endsWith(".py")) {
          return [fullPath];
        }

        return [];
      })
    );

    return discoveredFiles.flat();
  }

  return walk(absolutePath);
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

  // Collect and read files
  let filePairs;

  if (opts.stdin) {
    if (opts.output === "text" && opts.color) {
      process.stderr.write("Reading from stdin...\n");
    }

    const code = await readStdin();
    filePairs = [{ path: "stdin", code }];
  } else {
    const collectedPaths = await Promise.all(
      opts.files.map((file) =>
        collectPythonFiles(file, opts.ignoredDirectories)
      )
    );

    const filePaths = collectedPaths.flat();

    filePairs = await Promise.all(
      filePaths.map(async (filePath) => ({
        path: filePath,
        code: await readFile(filePath, "utf8"),
      }))
    );
  }

  if (filePairs.length === 0) {
    console.error("No Python files found.");
    process.exit(2);
  }

   const failOnIdx = opts.failOn
    ? SEVERITY_ORDER.indexOf(opts.failOn)
    : 0;

  const scanResults = await Promise.all(
    filePairs.map(async ({ path: filePath, code }) => {
      if (opts.output === "text") {
        process.stderr.write(
          `\n⏳ Scanning ${basename(filePath)}...\n`
        );
      }

      try {
        const result = await scanPythonCode(
          code,
          basename(filePath)
        );

        result.findings = filterBySeverity(
          result.findings || [],
          opts.severity
        );
        result.summary = buildSummary(result.findings);

        if (!opts.includeSafeCode) {
          delete result.safe_code;
        }

        return {
          file: filePath,
          result,
        };
      } catch (error) {
        console.error(
          `❌ Error scanning ${filePath}: ${error.message}`
        );

        return {
          file: filePath,
          error,
        };
      }
    })
  );

  const failedScans = scanResults.filter(
    ({ error }) => error !== undefined
  );

  if (failedScans.length > 0 && opts.output !== "text") {
    process.exit(2);
  }

  const allResults = scanResults.filter(
    ({ result }) => result !== undefined
  );

  const hasHighSeverityFinding = allResults.some(
    ({ result }) =>
      result.findings.some(
        (finding) =>
          SEVERITY_ORDER.indexOf(finding.severity) >= failOnIdx
      )
  );

  if (opts.output === "text" && !opts.outFile) {
    for (const { result } of allResults) {
      const formatted = formatTerminalOutput(result, {
        color: opts.color,
        verbose: opts.verbose,
      });

      process.stdout.write(formatted);
    }
  }

  // Output JSON or SARIF
  if (opts.output === "json") {
    const output = allResults.length === 1
      ? allResults[0].result
      : { files: allResults.map(r => ({ file: r.file, ...r.result })) };
    const json = JSON.stringify(output, null, 2);
    if (opts.outFile) {
      await writeFile(opts.outFile, json, "utf8");
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
      await writeFile(opts.outFile, sarifJson, "utf8");
      console.error(`✅ SARIF written to ${opts.outFile}`);
    } else {
      process.stdout.write(sarifJson + "\n");
    }
  } else if (opts.output === "text" && opts.outFile) {
    const lines = allResults.map(r =>
      formatTerminalOutput(r.result, { color: false, verbose: opts.verbose })
    ).join("\n");
    await writeFile(opts.outFile, lines, "utf8");
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
