/**
 * PyScanner - Core Scanner Engine
 * Analyzes Python code for CWE Top 25 (2025) vulnerabilities
 * Uses Claude AI for deep semantic analysis
 */

const SYSTEM_PROMPT = `You are an expert SAST (Static Application Security Testing) engine specialized in Python security analysis.
Your task: analyze Python code and identify vulnerabilities from the CWE Top 25 (2025) list.

You MUST return ONLY a valid JSON object — no preamble, no markdown, no backticks.

Target CWE Top 25 (2025) — focus on Python-relevant ones:
- CWE-79:  XSS — unsanitized user input rendered in HTML/templates
- CWE-89:  SQL Injection — string concatenation/formatting in SQL queries
- CWE-352: CSRF — missing CSRF tokens in state-changing endpoints (Flask/Django)
- CWE-862: Missing Authorization — no permission checks on sensitive routes/functions
- CWE-22:  Path Traversal — unvalidated file paths from user input
- CWE-94:  Code Injection — eval(), exec(), compile() with user-controlled input
- CWE-434: Unrestricted File Upload — no validation of uploaded file type/content
- CWE-502: Deserialization — pickle.load/loads, yaml.load, marshal with untrusted data
- CWE-863: Incorrect Authorization — flawed permission logic, IDOR
- CWE-20:  Improper Input Validation — missing or weak validation of external input
- CWE-284: Improper Access Control — missing access control enforcement
- CWE-200: Sensitive Info Exposure — hardcoded secrets, keys, passwords, tokens, logging sensitive data
- CWE-306: Missing Authentication — unauthenticated access to critical functions
- CWE-918: SSRF — user-controlled URLs passed to requests/urllib/httplib
- CWE-78:  OS Command Injection — subprocess/os.system with shell=True + user input
- CWE-77:  Command Injection — shlex, popen with unsanitized input
- CWE-639: IDOR — direct object references without authorization check
- CWE-770: Resource Exhaustion — unbounded loops, no rate limiting, no timeouts

Also detect:
- Weak crypto: MD5, SHA1 for security purposes (CWE-327/328)
- Use of assert for security checks (CWE-617)
- Insecure random: random.random() for secrets (CWE-338)
- Open redirect (CWE-601)
- XML injection / XXE (CWE-611)

ANALYSIS METHODOLOGY (simulate AST traversal):
1. Parse imports to understand libraries in use
2. Identify function definitions and their parameters
3. Trace data flow from user-controlled sources:
   - request.args, request.form, request.data, request.json (Flask/Django)
   - input(), sys.argv, os.environ, sys.stdin
   - Database results used as new queries
   - File contents from user-uploaded files
4. Track tainted data through assignments, string operations, and function calls
5. Flag when tainted data reaches dangerous sinks without sanitization

SEVERITY RULES:
- critical: direct exploitation, no preconditions (SQLi, RCE, auth bypass)
- high: significant risk, minor conditions (stored XSS, path traversal, SSRF)
- medium: exploitable with context (CSRF, IDOR, weak crypto for passwords)
- low: best practice violation, defense-in-depth (missing validation, info exposure)

Return this exact JSON structure:
{
  "findings": [
    {
      "id": "unique-id-001",
      "type": "Vulnerability Name",
      "cwe": "CWE-XX",
      "cwe_name": "Full CWE Name",
      "line": 15,
      "column": 4,
      "code_snippet": "exact line of vulnerable code",
      "description": "Technical explanation of why this is dangerous and how it can be exploited",
      "severity": "critical|high|medium|low",
      "confidence": "high|medium|low",
      "data_flow": "source → transformation → sink description",
      "fix_description": "Specific fix recommendation",
      "references": ["https://cwe.mitre.org/data/definitions/XX.html"]
    }
  ],
  "ast_trace": [
    "Step 1: ...",
    "Step 2: ..."
  ],
  "safe_code": "Complete rewritten secure version of the code",
  "summary": {
    "total": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
    "scan_confidence": "high|medium|low",
    "notes": "Any important context about the analysis"
  },
  "sarif": {
    "version": "2.1.0",
    "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    "runs": [
      {
        "tool": {
          "driver": {
            "name": "PyScanner",
            "version": "1.0.0",
            "informationUri": "https://github.com/your-org/pyscanner",
            "rules": []
          }
        },
        "results": []
      }
    ]
  }
}

NEGATIVE EXAMPLES (these are safe, do NOT flag):
- cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))  # parameterized — safe
- hashlib.sha256(data).hexdigest()  # SHA-256 — safe
- secrets.token_hex(32)  # cryptographically secure random — safe
- subprocess.run(["ls", "-la", path], shell=False)  # no shell, no injection — safe

POSITIVE EXAMPLES (these ARE vulnerable, DO flag):
- cursor.execute("SELECT * FROM users WHERE name = '" + username + "'")  # CWE-89
- os.system("ping " + host)  # CWE-78
- open(request.args.get("file"))  # CWE-22
- pickle.loads(user_data)  # CWE-502
- eval(user_expression)  # CWE-94
- password = "hardcoded_secret_123"  # CWE-200
`;

/**
 * Scan Python code for security vulnerabilities
 * @param {string} code - Python source code to analyze
 * @param {string} filename - Original filename (for context)
 *  * @param {Object} [options] - Anthropic request options
 * @param {string} [options.apiKey] - Anthropic API key
 * @param {string} [options.baseUrl] - Anthropic API base URL
 * @param {string} [options.anthropicVersion] - Anthropic API version
 * @param {string} [options.model] - Claude model name
 * @param {number} [options.maxTokens] - Maximum response tokens
 * @returns {Promise<Object>} - Scan results
 */
export async function scanPythonCode(
  code,
  filename = "unknown.py",
  options = {}
) {
  const {
    apiKey = process.env.ANTHROPIC_API_KEY,
    baseUrl =
      process.env.ANTHROPIC_BASE_URL ??
      "https://api.anthropic.com",
    anthropicVersion =
      process.env.ANTHROPIC_VERSION ??
      "2023-06-01",
    model =
      process.env.ANTHROPIC_MODEL ??
      "claude-sonnet-4-6",
    maxTokens = 4096,
  } = options;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required to scan Python code."
    );
  }
  const userMessage = `Analyze this Python file for security vulnerabilities: ${filename}

\`\`\`python
${code}
\`\`\`

Perform thorough AST-style analysis. Check ALL CWE Top 25 patterns listed. Return ONLY valid JSON.`;

  const apiUrl =
    `${baseUrl.replace(/\/$/, "")}/v1/messages`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": anthropicVersion,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Strip markdown fences if present
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let result;
  try {
    result = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Failed to parse scanner response as JSON: ${e.message}\n\nRaw: ${cleaned.slice(0, 500)}`);
  }

  // Enrich with metadata
  result.metadata = {
    filename,
    scanned_at: new Date().toISOString(),
    scanner_version: "1.0.0",
    lines_of_code: code.split("\n").length,
    model,
  };

  // Ensure SARIF rules are populated from findings
  if (result.sarif?.runs?.[0]) {
    const run = result.sarif.runs[0];
    const cwesSeen = new Set();
    const rules = [];
    const sarifResults = [];

    for (const finding of result.findings || []) {
      const ruleId = finding.cwe || "CWE-UNKNOWN";
      if (!cwesSeen.has(ruleId)) {
        cwesSeen.add(ruleId);
        rules.push({
          id: ruleId,
          name: finding.type,
          shortDescription: { text: finding.cwe_name || finding.type },
          helpUri: (finding.references || [])[0] || `https://cwe.mitre.org/data/definitions/${ruleId.replace("CWE-", "")}.html`,
          properties: { severity: finding.severity },
        });
      }

      sarifResults.push({
        ruleId,
        level: severityToSarifLevel(finding.severity),
        message: { text: finding.description },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: filename },
              region: {
                startLine: finding.line || 1,
                startColumn: finding.column || 1,
              },
            },
          },
        ],
        properties: {
          confidence: finding.confidence,
          "data-flow": finding.data_flow,
        },
      });
    }

    run.tool.driver.rules = rules;
    run.results = sarifResults;
  }

  return result;
}

function severityToSarifLevel(severity) {
  const map = { critical: "error", high: "error", medium: "warning", low: "note" };
  return map[severity] || "warning";
}

/**
 * Format scan results for terminal output
 */
export function formatTerminalOutput(result, opts = {}) {
  const { color = true, verbose = false } = opts;
  const lines = [];

  const c = color
    ? {
        reset: "\x1b[0m",
        bold: "\x1b[1m",
        red: "\x1b[31m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        green: "\x1b[32m",
        cyan: "\x1b[36m",
        gray: "\x1b[90m",
        bgRed: "\x1b[41m",
        bgYellow: "\x1b[43m",
      }
    : Object.fromEntries(
        ["reset","bold","red","yellow","blue","green","cyan","gray","bgRed","bgYellow"].map(k => [k, ""])
      );

  const severityColor = {
    critical: c.red + c.bold,
    high: c.red,
    medium: c.yellow,
    low: c.blue,
  };

  const severityIcon = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵" };

  lines.push("");
  lines.push(`${c.bold}╔══════════════════════════════════════════════════╗${c.reset}`);
  lines.push(`${c.bold}║         PyScanner — CWE Top 25 Analysis          ║${c.reset}`);
  lines.push(`${c.bold}╚══════════════════════════════════════════════════╝${c.reset}`);
  lines.push("");

  if (result.metadata) {
    lines.push(`${c.gray}  File:    ${result.metadata.filename}${c.reset}`);
    lines.push(`${c.gray}  Lines:   ${result.metadata.lines_of_code}${c.reset}`);
    lines.push(`${c.gray}  Scanned: ${result.metadata.scanned_at}${c.reset}`);
    lines.push("");
  }

  const findings = result.findings || [];

  if (findings.length === 0) {
    lines.push(`${c.green}${c.bold}  ✅ No vulnerabilities found!${c.reset}`);
    lines.push(`${c.gray}  The code appears secure against CWE Top 25 patterns.${c.reset}`);
  } else {
    const s = result.summary || {};
    lines.push(`${c.bold}  SUMMARY:${c.reset}  ${findings.length} finding(s) — ` +
      `${s.critical ? `${c.red}${s.critical} critical${c.reset} ` : ""}` +
      `${s.high ? `${c.red}${s.high} high${c.reset} ` : ""}` +
      `${s.medium ? `${c.yellow}${s.medium} medium${c.reset} ` : ""}` +
      `${s.low ? `${c.blue}${s.low} low${c.reset}` : ""}`);
    lines.push("");

    for (const f of findings) {
      const sc = severityColor[f.severity] || c.gray;
      const icon = severityIcon[f.severity] || "•";
      lines.push(`  ${icon} ${sc}[${f.severity?.toUpperCase()}]${c.reset} ${c.bold}${f.type}${c.reset}  ${c.cyan}${f.cwe}${c.reset}`);
      lines.push(`     ${c.gray}Line ${f.line}${f.column ? `:${f.column}` : ""}${c.reset}  Confidence: ${f.confidence || "unknown"}`);
      if (f.code_snippet) {
        lines.push(`     ${c.gray}Code: ${c.reset}${f.code_snippet}`);
      }
      lines.push(`     ${f.description}`);
      if (f.data_flow) {
        lines.push(`     ${c.gray}Flow: ${c.reset}${f.data_flow}`);
      }
      if (verbose && f.fix_description) {
        lines.push(`     ${c.green}Fix:  ${c.reset}${f.fix_description}`);
      }
      lines.push("");
    }
  }

  if (verbose && result.ast_trace?.length) {
    lines.push(`${c.bold}  AST TRACE:${c.reset}`);
    for (const step of result.ast_trace) {
      lines.push(`    ${c.gray}${step}${c.reset}`);
    }
    lines.push("");
  }

  lines.push(`${c.bold}${"═".repeat(52)}${c.reset}`);
  lines.push("");

  return lines.join("\n");
}
