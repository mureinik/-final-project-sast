#!/usr/bin/env node
/**
 * PyScanner — GitHub Action Entrypoint
 * Reads inputs from GitHub Actions environment variables,
 * scans Python files, and sets outputs + annotations.
 */

import { scanPythonCode, formatTerminalOutput } from "./scanner.js";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, extname, join, relative } from "path";

// GitHub Actions helpers
function setOutput(name, value) {
  const encodedValue = String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  process.stdout.write(`::set-output name=${name}::${encodedValue}\n`);
}

function setFailed(message) {
  process.stdout.write(`::error::${message}\n`);
  process.exit(1);
}

function annotation(level, file, line, col, title, message) {
  // level: error | warning | notice
  const msg = message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/,/g, "%2C").replace(/::/g, "%3A%3A");
  const t = title.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/,/g, "%2C").replace(/::/g, "%3A%3A");
  process.stdout.write(`::${level} file=${file},line=${line},col=${col},title=${t}::${msg}\n`);
}

function groupStart(title) {
  process.stdout.write(`::group::${title}\n`);
}

function groupEnd() {
  process.stdout.write(`::endgroup::\n`);
}

function collectPythonFiles(dir) {
  const files = [];
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory() && !["__pycache__", ".git", "node_modules", ".venv", "venv", "env"].includes(entry.name)) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".py")) {
        files.push(full);
      }
    }
  }
  walk(dir);
  return files;
}

async function main() {
  // Read GitHub Action inputs (set via env vars in action.yml)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const scanPath = process.env.INPUT_PATH || ".";
  const outputFormat = process.env.INPUT_OUTPUT_FORMAT || "sarif";
  const sarifFile = process.env.INPUT_SARIF_FILE || "pyscanner-results.sarif";
  const minSeverity = process.env.INPUT_MIN_SEVERITY || "low";
  const failOn = process.env.INPUT_FAIL_ON || "high";
  const annotate = process.env.INPUT_ANNOTATE !== "false";
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();

  if (!apiKey) {
    setFailed("ANTHROPIC_API_KEY secret is not set. Add it to your repository secrets.");
    return;
  }

  const severityOrder = ["low", "medium", "high", "critical"];
  const minIdx = severityOrder.indexOf(minSeverity);
  const failOnIdx = severityOrder.indexOf(failOn);

  const scanDir = resolve(workspace, scanPath);
  if (!existsSync(scanDir)) {
    setFailed(`Scan path does not exist: ${scanDir}`);
    return;
  }

  const pythonFiles = collectPythonFiles(scanDir);
  console.log(`\n🔍 PyScanner found ${pythonFiles.length} Python file(s) to analyze\n`);

  if (pythonFiles.length === 0) {
    console.log("No Python files found. Exiting successfully.");
    setOutput("total_findings", "0");
    setOutput("critical_findings", "0");
    setOutput("high_findings", "0");
    process.exit(0);
  }

  const allResults = [];
  let totalFindings = 0;
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let shouldFail = false;

  const sarifRuns = [];

  for (const filePath of pythonFiles) {
    const relPath = relative(workspace, filePath);
    groupStart(`Scanning ${relPath}`);

    try {
      const code = readFileSync(filePath, "utf8");
      const result = await scanPythonCode(code, relPath);

      // Filter by min severity
      result.findings = (result.findings || []).filter(
        (f) => severityOrder.indexOf(f.severity) >= minIdx
      );

      const fileFindings = result.findings.length;
      totalFindings += fileFindings;

      for (const f of result.findings) {
        const sIdx = severityOrder.indexOf(f.severity);
        if (f.severity === "critical") criticalCount++;
        else if (f.severity === "high") highCount++;
        else if (f.severity === "medium") mediumCount++;
        else if (f.severity === "low") lowCount++;

        if (sIdx >= failOnIdx) shouldFail = true;

        // GitHub annotation
        if (annotate) {
          const level = sIdx >= 2 ? "error" : sIdx === 1 ? "warning" : "notice";
          annotation(
            level,
            relPath,
            f.line || 1,
            f.column || 1,
            `[${f.cwe}] ${f.type}`,
            f.description
          );
        }
      }

      // Print findings to log
      if (fileFindings > 0) {
        console.log(formatTerminalOutput(result, { color: false, verbose: true }));
      } else {
        console.log(`  ✅ ${relPath}: No findings`);
      }

      allResults.push({ file: relPath, result });
      if (result.sarif?.runs) {
        sarifRuns.push(...result.sarif.runs);
      }
    } catch (err) {
      process.stdout.write(`::warning::Error scanning ${relPath}: ${err.message}\n`);
    }

    groupEnd();
  }

  // Write SARIF file
  const sarifOutput = {
    version: "2.1.0",
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    runs: sarifRuns,
  };

  const sarifPath = resolve(workspace, sarifFile);
  writeFileSync(sarifPath, JSON.stringify(sarifOutput, null, 2));
  console.log(`\n📄 SARIF report written to: ${sarifFile}`);

  // Summary
  console.log(`\n${"═".repeat(50)}`);
  console.log(`PyScanner Summary`);
  console.log(`${"═".repeat(50)}`);
  console.log(`Files scanned:     ${pythonFiles.length}`);
  console.log(`Total findings:    ${totalFindings}`);
  console.log(`  🔴 Critical:     ${criticalCount}`);
  console.log(`  🟠 High:         ${highCount}`);
  console.log(`  🟡 Medium:       ${mediumCount}`);
  console.log(`  🔵 Low:          ${lowCount}`);
  console.log(`Fail threshold:    ${failOn}`);
  console.log(`${"═".repeat(50)}\n`);

  // Set outputs
  setOutput("total_findings", String(totalFindings));
  setOutput("critical_findings", String(criticalCount));
  setOutput("high_findings", String(highCount));
  setOutput("medium_findings", String(mediumCount));
  setOutput("low_findings", String(lowCount));
  setOutput("sarif_file", sarifFile);

  if (shouldFail) {
    setFailed(`PyScanner found ${totalFindings} vulnerability/vulnerabilities at or above '${failOn}' severity.`);
  } else {
    console.log("✅ PyScanner passed — no findings at or above the fail threshold.");
    process.exit(0);
  }
}

main().catch((err) => {
  setFailed(`PyScanner action error: ${err.message}`);
});
