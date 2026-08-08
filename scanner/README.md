# 🛡️ PyScanner — Python SAST Scanner

**Static Application Security Testing for Python, powered by Claude AI**
Covers all **CWE Top 25 (2025)** vulnerability patterns.



## Features

- 🔍 **Deep semantic analysis** — not just regex patterns, but true data-flow tracing
- 📋 **CWE Top 25 (2025)** coverage — all 25 weakness categories
- 🖥️ **CLI tool** — scan files or entire directories locally
- ⚙️ **GitHub Action** — drop into any CI/CD pipeline
- 📄 **SARIF output** — integrates with GitHub Code Scanning
- 🔧 **Safe code suggestions** — auto-generated secure replacements
- 📍 **PR Annotations** — inline findings on pull requests



## CWE Coverage

| Rank | CWE | Vulnerability | Detected |
| --- | --- | --- | --- |
| 1 | [CWE-79](https://cwe.mitre.org/data/definitions/79.html) | Cross-site Scripting (XSS) | ✅ |
| 2 | [CWE-89](https://cwe.mitre.org/data/definitions/89.html) | SQL Injection | ✅ |
| 3 | [CWE-352](https://cwe.mitre.org/data/definitions/352.html) | CSRF | ✅ |
| 4 | [CWE-862](https://cwe.mitre.org/data/definitions/862.html) | Missing Authorization | ✅ |
| 5 | [CWE-787](https://cwe.mitre.org/data/definitions/787.html) | Out-of-bounds Write | ⚠️ Python-limited |
| 6 | [CWE-22](https://cwe.mitre.org/data/definitions/22.html) | Path Traversal | ✅ |
| 7 | [CWE-416](https://cwe.mitre.org/data/definitions/416.html) | Use After Free | ⚠️ Python-limited |
| 8 | [CWE-125](https://cwe.mitre.org/data/definitions/125.html) | Out-of-bounds Read | ⚠️ Python-limited |
| 9 | [CWE-78](https://cwe.mitre.org/data/definitions/78.html) | OS Command Injection | ✅ |
| 10 | [CWE-94](https://cwe.mitre.org/data/definitions/94.html) | Code Injection (eval/exec) | ✅ |
| 12 | [CWE-434](https://cwe.mitre.org/data/definitions/434.html) | Unrestricted File Upload | ✅ |
| 15 | [CWE-502](https://cwe.mitre.org/data/definitions/502.html) | Insecure Deserialization | ✅ |
| 17 | [CWE-863](https://cwe.mitre.org/data/definitions/863.html) | Incorrect Authorization | ✅ |
| 18 | [CWE-20](https://cwe.mitre.org/data/definitions/20.html) | Improper Input Validation | ✅ |
| 19 | [CWE-284](https://cwe.mitre.org/data/definitions/284.html) | Improper Access Control | ✅ |
| 20 | [CWE-200](https://cwe.mitre.org/data/definitions/200.html) | Sensitive Information Exposure | ✅ |
| 21 | [CWE-306](https://cwe.mitre.org/data/definitions/306.html) | Missing Authentication | ✅ |
| 22 | [CWE-918](https://cwe.mitre.org/data/definitions/918.html) | SSRF | ✅ |
| 23 | [CWE-77](https://cwe.mitre.org/data/definitions/77.html) | Command Injection | ✅ |
| 24 | [CWE-639](https://cwe.mitre.org/data/definitions/639.html) | IDOR / Authorization Bypass | ✅ |
| 25 | [CWE-770](https://cwe.mitre.org/data/definitions/770.html) | Resource Exhaustion | ✅ |

> ⚠️ Memory-safety CWEs (787, 416, 125, 120, 121, 122) are less relevant to pure Python but flagged when using ctypes or C extensions.



## Installation (CLI)

### Prerequisites
- Node.js 26+
- An [Anthropic API key](https://console.anthropic.com/)

### Install from npm (once published)
```bash
npm install -g pyscanner
```

### Install from source
```bash
git clone https://github.com/Final-project-Static-Security-Analysis/-final-project-sast.git
cd -final-project-sast/scanner
npm install
npm link
```

### Set API key
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
# Or add to ~/.bashrc / ~/.zshrc
```


## CLI Usage

```bash
# Scan a single file
pyscanner app.py

# Scan a directory (recursive)
pyscanner src/

# Show fix suggestions and AST trace
pyscanner --verbose app.py

# Only report high and critical
pyscanner --severity high app.py

# Export as SARIF
pyscanner --output sarif --out-file results.sarif src/

# Export as JSON
pyscanner --output json --out-file results.json app.py

# Fail with exit code 1 if high/critical found (for CI)
pyscanner --fail-on high app.py && echo "Clean!" || echo "Issues found!"

# Read from stdin
cat app.py | pyscanner --stdin
git diff HEAD~1 -- '*.py' | pyscanner --stdin

# Include safe code rewrite in JSON output
pyscanner --output json --include-safe-code app.py
```

### Exit codes
| Code | Meaning |
|------|---------|
| `0` | No findings (or all below `--fail-on` threshold) |
| `1` | Findings at or above threshold |
| `2` | Scanner error |

## 🐳 Docker Usage

Build the Docker image:

```bash
docker build -t pyscanner .
```

Scan a local Python file:

```bash
docker run -it --rm \
  -e ANTHROPIC_API_KEY=<your_api_key> \
  -v "$(pwd)/../samples:/workspace" \
  pyscanner /workspace/test_vulnerable.py
```

Generate a SARIF report:

```bash
docker run -it --rm \
  -e ANTHROPIC_API_KEY=<your_api_key> \
  -v "$(pwd)/../samples:/workspace" \
  pyscanner \
  --output sarif \
  --out-file /workspace/results.sarif \
  /workspace/test_vulnerable.py
```

The Docker image allows running the scanner locally without installing Node.js or project dependencies. A valid Anthropic API key is required for vulnerability analysis.

## Supported Execution Modes

* 🖥️ CLI Scanner
* 🐳 Docker Container
* ⚙️ GitHub Action
* 📄 SARIF Export
* 🔍 GitHub Code Scanning Integration


## GitHub Action Usage

### Basic setup

Add to `.github/workflows/security.yml`:

```yaml
name: Security Scan

on: [push, pull_request]

permissions:
  security-events: write
  contents: read

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: PyScanner
        id: scan
        uses: Final-project-Static-Security-Analysis/-final-project-sast/scanner@main
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          fail_on: high

      - name: Upload to Code Scanning
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: pyscanner-results.sarif
```

### Add `ANTHROPIC_API_KEY` to GitHub Secrets

1. Go to **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `ANTHROPIC_API_KEY`, Value: your key

### Action inputs

| Input | Default | Description |
|-------|---------|-------------|
| `anthropic_api_key` | *required* | Your Anthropic API key |
| `path` | `.` | Directory or file to scan |
| `min_severity` | `low` | Minimum severity to report |
| `fail_on` | `high` | Fail CI at this severity or above |
| `output_format` | `sarif` | `sarif`, `json`, or `text` |
| `sarif_file` | `pyscanner-results.sarif` | SARIF output path |
| `annotate` | `true` | Show inline PR annotations |

### Action outputs

| Output | Description |
|--------|-------------|
| `total_findings` | Total findings count |
| `critical_findings` | Critical count |
| `high_findings` | High count |
| `medium_findings` | Medium count |
| `low_findings` | Low count |
| `sarif_file` | Path to SARIF file |

---

## Output Formats

### Text (default)
```
╔══════════════════════════════════════════════════╗
║         PyScanner — CWE Top 25 Analysis          ║
╚══════════════════════════════════════════════════╝

  File:    app.py
  Lines:   87
  Scanned: 2025-06-21T10:00:00.000Z

  SUMMARY:  3 finding(s) — 1 critical  1 high  1 medium

  🔴 [CRITICAL] SQL Injection  CWE-89
     Line 24:4  Confidence: high
     Code: cursor.execute("SELECT * FROM users WHERE name = '" + username + "'")
     User input flows directly into SQL query without parameterization...
     Flow: request.args.get('username') → string concatenation → cursor.execute()
```

### JSON
Full structured output with findings, AST trace, SARIF, and optionally safe code.

### SARIF
[SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/) format — integrates directly with GitHub Code Scanning, VS Code, and other security tools.



## Architecture

```text
scanner/
├── scanner.js        # Core analysis engine
├── pyscanner.js      # CLI entry point
├── entrypoint.js     # GitHub Action entry point
├── action.yml        # GitHub Action definition
├── Dockerfile        # Docker container
├── package.json
└── README.md
```




## License
MIT
