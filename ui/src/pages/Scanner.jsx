import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal, Play, RotateCcw, AlertTriangle, CheckCircle,
  Loader2, ChevronRight, Download, FileCode, Shield, TreePine, ShieldCheck
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import AstTraceView from '../components/scanner/AstTraceView';

const SAMPLE_CODES = {
  'sql_injection': `import sqlite3

def get_user(username):
    conn = sqlite3.connect('app.db')
    # Vulnerable: string concatenation in SQL
    query = "SELECT * FROM users WHERE name = '" + username + "'"
    return conn.execute(query).fetchall()`,

  'eval_injection': `from flask import request

@app.route('/calculate')
def calculate():
    expression = request.args.get('expr')
    # Vulnerable: eval with user input
    result = eval(expression)
    return str(result)`,

  'path_traversal': `from flask import request
import os

@app.route('/read')
def read_file():
    filename = request.args.get('file')
    # Vulnerable: no path sanitization
    with open('/uploads/' + filename) as f:
        return f.read()`,

  'xss_reflected': `from flask import Flask, request, make_response

app = Flask(__name__)

@app.route('/search')
def search():
    query = request.args.get('q', '')
    # Vulnerable: reflected XSS - user input echoed directly into response
    html = "<html><body><h1>Results for: " + query + "</h1></body></html>"
    return make_response(html)

@app.route('/greet')
def greet():
    name = request.args.get('name')
    # Vulnerable: render_template_string with user input
    from flask import render_template_string
    return render_template_string("<h1>Hello " + name + "</h1>")`,

  'xss_stored': `from flask import Flask, request
from models import db, Comment

app = Flask(__name__)

@app.route('/comment', methods=['POST'])
def add_comment():
    text = request.form.get('text')
    # Stores unsanitized user input into DB
    c = Comment(body=text)
    db.session.add(c)
    db.session.commit()
    return "saved"

@app.route('/comments')
def show_comments():
    comments = Comment.query.all()
    # Vulnerable: renders stored text without escaping — Stored XSS
    html = "".join(f"<p>{c.body}</p>" for c in comments)
    return f"<html><body>{html}</body></html>"`,

  'csrf': `from flask import Flask, request, session

app = Flask(__name__)

@app.route('/transfer', methods=['POST'])
def transfer():
    # Vulnerable: no CSRF token check on state-changing POST endpoint
    amount = request.form.get('amount')
    to_account = request.form.get('to')
    # perform transfer...
    return f"Transferred {amount} to {to_account}"

@app.route('/delete_account', methods=['POST'])
def delete_account():
    # Vulnerable: no @csrf_protect, no csrf_token validation
    user_id = request.form.get('user_id')
    # delete user...
    return "deleted"`,

  'missing_authz': `from flask import Flask, request
from models import db, User, AdminLog

app = Flask(__name__)

@app.route('/admin/delete_user', methods=['POST'])
def delete_user():
    # Vulnerable: no @login_required, no current_user check, no session check
    user_id = request.form.get('user_id')
    User.query.filter_by(id=user_id).delete()
    db.session.commit()
    return "User deleted"

@app.route('/admin/logs')
def view_logs():
    # Vulnerable: sensitive admin data returned without any authorization check
    logs = AdminLog.query.all()
    return str([l.to_dict() for l in logs])`,

  'os_command': `from flask import request
import subprocess, os

app_dir = "/var/app"

@app.route('/ping')
def ping():
    host = request.args.get('host')
    # Vulnerable: shell=True with user-controlled input
    result = subprocess.run("ping -c 1 " + host, shell=True, capture_output=True)
    return result.stdout.decode()

@app.route('/convert')
def convert():
    filename = request.args.get('file')
    # Vulnerable: os.system with user input
    os.system("convert " + filename + " output.png")
    return "done"`,

  'file_upload': `from flask import Flask, request
import os

app = Flask(__name__)
UPLOAD_FOLDER = '/var/uploads'

@app.route('/upload', methods=['POST'])
def upload():
    f = request.files['file']
    # Vulnerable: no extension check, saves any file type including .php/.py/.sh
    filepath = os.path.join(UPLOAD_FOLDER, f.filename)
    f.save(filepath)
    return "Uploaded"

@app.route('/upload2', methods=['POST'])
def upload2():
    f = request.files['document']
    # Vulnerable: relies only on user-provided content_type, not validated
    dest = os.path.join(UPLOAD_FOLDER, f.filename)
    with open(dest, 'wb') as out:
        out.write(f.read())
    return "saved"`,

  'ssrf': `from flask import Flask, request
import requests

app = Flask(__name__)

@app.route('/fetch')
def fetch_url():
    url = request.args.get('url')
    # Vulnerable: SSRF — attacker can force server to fetch internal resources
    resp = requests.get(url)
    return resp.text

@app.route('/proxy')
def proxy():
    target = request.form.get('target')
    # Vulnerable: no allowlist validation on target URL
    import urllib.request
    with urllib.request.urlopen(target) as r:
        return r.read().decode()`,

  'multi_vuln': `import sqlite3, pickle, subprocess
from flask import request

SECRET_KEY = "hardcoded_secret_123"

@app.route('/user')
def get_user():
    name = request.args.get('name')
    query = "SELECT * FROM users WHERE name = '" + name + "'"
    conn = sqlite3.connect('db.sqlite')
    return conn.execute(query).fetchall()

@app.route('/run')
def run_cmd():
    cmd = request.args.get('cmd')
    subprocess.run(cmd, shell=True)

@app.route('/load')
def load_data():
    data = request.get_data()
    return str(pickle.loads(data))`,

  'deserialization': `import pickle
import yaml
import marshal
from flask import request

@app.route('/load_session')
def load_session():
    cookie = request.cookies.get('session_data')
    # Vulnerable: deserializing untrusted user cookie with pickle
    session = pickle.loads(cookie.encode('latin-1'))
    return f"Welcome back, {session['username']}"

@app.route('/config')
def load_config():
    data = request.get_data()
    # Vulnerable: yaml.load without SafeLoader allows arbitrary code execution
    config = yaml.load(data)
    return str(config)

@app.route('/restore')
def restore_object():
    blob = request.files['backup'].read()
    # Vulnerable: marshal.loads on untrusted input
    obj = marshal.loads(blob)
    return str(obj)`,

  'sensitive_exposure': `from flask import Flask, request, jsonify
import logging

app = Flask(__name__)
logger = logging.getLogger(__name__)

# Vulnerable: hardcoded credentials in source code
DB_PASSWORD = "super_secret_p@ss123"
API_KEY = "sk-live-abc123def456ghi789"
JWT_SECRET = "my_jwt_secret_token"

@app.route('/debug')
def debug_info():
    # Vulnerable: exposing sensitive config to any user
    return jsonify({
        "db_host": "prod-db.internal",
        "db_password": DB_PASSWORD,
        "api_key": API_KEY,
        "secret": JWT_SECRET
    })

@app.route('/login', methods=['POST'])
def login():
    password = request.form.get('password')
    # Vulnerable: logging sensitive data
    logger.info(f"Login attempt with password: {password}")
    if password == DB_PASSWORD:
        return "OK"
    return "Fail"`,

  'input_validation': `from flask import Flask, request
import re

app = Flask(__name__)

@app.route('/transfer', methods=['POST'])
def transfer():
    amount = request.form.get('amount')
    to_account = request.form.get('to')
    # Vulnerable: no type/range validation — amount could be negative or huge
    db.execute("UPDATE accounts SET balance = balance - %s WHERE id = %s", (amount, current_user.id))
    db.execute("UPDATE accounts SET balance = balance + %s WHERE id = %s", (amount, to_account))
    return "done"

@app.route('/profile', methods=['POST'])
def update_profile():
    age = request.form.get('age')
    email = request.form.get('email')
    # Vulnerable: no validation on age (could be negative, string, or 99999)
    # Vulnerable: no email format validation
    db.execute("UPDATE users SET age = %s, email = %s WHERE id = %s", (age, email, current_user.id))
    return "updated"

@app.route('/redirect')
def redirect_url():
    url = request.args.get('next')
    # Vulnerable: open redirect — no validation that url is internal
    return redirect(url)`,

};

const SAMPLE_LABELS = {
  sql_injection:   'SQL Injection',
  eval_injection:  'Code Injection',
  path_traversal:  'Path Traversal',
  xss_reflected:   'XSS Reflected',
  xss_stored:      'XSS Stored',
  csrf:            'CSRF',
  missing_authz:   'Missing Authz',
  os_command:      'OS Command Inj.',
  file_upload:     'File Upload',
  ssrf:            'SSRF',
  multi_vuln:      'Multi-Vuln',
  deserialization: 'Deserialization',
  sensitive_exposure: 'Info Exposure',
  input_validation: 'Input Validation',
};

const SAFE_CODES = {
  sql_injection: `import sqlite3

def get_user(username):
    conn = sqlite3.connect('app.db')
    # Safe: parameterized query prevents SQL injection
    query = "SELECT * FROM users WHERE name = ?"
    return conn.execute(query, (username,)).fetchall()`,

  eval_injection: `import ast
from flask import request

@app.route('/calculate')
def calculate():
    expression = request.args.get('expr')
    # Safe: literal_eval only parses Python literals, not arbitrary code
    result = ast.literal_eval(expression)
    return str(result)`,

  path_traversal: `from flask import request
import os

@app.route('/read')
def read_file():
    filename = request.args.get('file')
    # Safe: basename strips directory components, realpath resolves symlinks
    safe = os.path.realpath(
        os.path.join('/uploads', os.path.basename(filename))
    )
    if not safe.startswith('/uploads/'):
        raise PermissionError("Access denied")
    with open(safe) as f:
        return f.read()`,

  xss_reflected: `from flask import Flask, request
from markupsafe import escape

app = Flask(__name__)

@app.route('/search')
def search():
    query = request.args.get('q', '')
    # Safe: escape() converts special chars to HTML entities
    safe_query = escape(query)
    html = f"<html><body><h1>Results for: {safe_query}</h1></body></html>"
    return html

@app.route('/greet')
def greet():
    name = request.args.get('name')
    # Safe: using render_template with auto-escaping (Jinja2 default)
    from flask import render_template
    return render_template("greet.html", name=name)`,

  xss_stored: `from flask import Flask, request
from markupsafe import escape
from models import db, Comment

app = Flask(__name__)

@app.route('/comment', methods=['POST'])
def add_comment():
    text = request.form.get('text')
    # Sanitize before storing
    import bleach
    safe_text = bleach.clean(text)
    c = Comment(body=safe_text)
    db.session.add(c)
    db.session.commit()
    return "saved"

@app.route('/comments')
def show_comments():
    comments = Comment.query.all()
    # Safe: use Jinja2 template with auto-escaping
    from flask import render_template
    return render_template("comments.html", comments=comments)`,

  csrf: `from flask import Flask, request
from flask_wtf.csrf import CSRFProtect

app = Flask(__name__)
csrf = CSRFProtect(app)  # Enables CSRF protection globally

@app.route('/transfer', methods=['POST'])
def transfer():
    # Safe: CSRFProtect validates the token automatically on POST
    amount = request.form.get('amount')
    to_account = request.form.get('to')
    return f"Transferred {amount} to {to_account}"

@app.route('/delete_account', methods=['POST'])
def delete_account():
    # Safe: protected by CSRFProtect — invalid token → 400 error
    user_id = request.form.get('user_id')
    return "deleted"`,

  missing_authz: `from flask import Flask, request
from flask_login import login_required, current_user
from models import db, User, AdminLog

app = Flask(__name__)

@app.route('/admin/delete_user', methods=['POST'])
@login_required
def delete_user():
    # Safe: requires login + checks admin role
    if current_user.role != 'admin':
        return "Forbidden", 403
    user_id = request.form.get('user_id')
    User.query.filter_by(id=user_id).delete()
    db.session.commit()
    return "User deleted"

@app.route('/admin/logs')
@login_required
def view_logs():
    # Safe: authorization check before returning sensitive data
    if not current_user.is_admin:
        return "Forbidden", 403
    logs = AdminLog.query.all()
    return str([l.to_dict() for l in logs])`,

  os_command: `from flask import request
import subprocess, shlex

@app.route('/ping')
def ping():
    host = request.args.get('host')
    # Safe: shell=False + shlex.split prevents command injection
    result = subprocess.run(
        ["ping", "-c", "1", host],
        capture_output=True
    )
    return result.stdout.decode()

@app.route('/convert')
def convert():
    filename = request.args.get('file')
    # Safe: pass arguments as list, no shell
    import os
    safe_name = os.path.basename(filename)
    subprocess.run(["convert", safe_name, "output.png"])
    return "done"`,

  file_upload: `from flask import Flask, request
from werkzeug.utils import secure_filename
import os

app = Flask(__name__)
UPLOAD_FOLDER = '/var/uploads'
ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'pdf'}

def allowed_file(filename):
    return '.' in filename and \\
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT

@app.route('/upload', methods=['POST'])
def upload():
    f = request.files['file']
    # Safe: check extension allowlist + sanitize filename
    if not allowed_file(f.filename):
        return "File type not allowed", 400
    safe_name = secure_filename(f.filename)
    f.save(os.path.join(UPLOAD_FOLDER, safe_name))
    return "Uploaded"`,

  ssrf: `from flask import Flask, request
import requests
from urllib.parse import urlparse

app = Flask(__name__)
ALLOWED_HOSTS = {'api.example.com', 'cdn.example.com'}

@app.route('/fetch')
def fetch_url():
    url = request.args.get('url')
    # Safe: validate URL against allowlist before fetching
    parsed = urlparse(url)
    if parsed.hostname not in ALLOWED_HOSTS:
        return "Host not allowed", 403
    if parsed.scheme not in ('http', 'https'):
        return "Invalid scheme", 400
    resp = requests.get(url, timeout=5)
    return resp.text`,

  multi_vuln: `import sqlite3, json, subprocess
from flask import request
import os

SECRET_KEY = os.environ.get("SECRET_KEY")  # Safe: from env var

@app.route('/user')
def get_user():
    name = request.args.get('name')
    # Safe: parameterized query
    conn = sqlite3.connect('db.sqlite')
    return conn.execute("SELECT * FROM users WHERE name = ?", (name,)).fetchall()

@app.route('/run')
def run_cmd():
    # Safe: no user input in command, shell=False
    subprocess.run(["ls", "-la", "/var/app"], capture_output=True)

@app.route('/load')
def load_data():
    data = request.get_data()
    # Safe: json.loads instead of pickle.loads
    return str(json.loads(data))`,

  deserialization: `import json
import yaml
from flask import request

@app.route('/load_session')
def load_session():
    cookie = request.cookies.get('session_data')
    # Safe: json.loads only parses JSON data, no code execution
    session = json.loads(cookie)
    return f"Welcome back, {session['username']}"

@app.route('/config')
def load_config():
    data = request.get_data()
    # Safe: yaml.safe_load prevents arbitrary code execution
    config = yaml.safe_load(data)
    return str(config)

@app.route('/restore')
def restore_object():
    blob = request.files['backup'].read()
    # Safe: parse structured data with json instead of marshal
    obj = json.loads(blob)
    return str(obj)`,

  sensitive_exposure: `from flask import Flask, request, jsonify
import logging
import os

app = Flask(__name__)
logger = logging.getLogger(__name__)

# Safe: credentials loaded from environment variables
DB_PASSWORD = os.environ.get("DB_PASSWORD")
API_KEY = os.environ.get("API_KEY")

@app.route('/debug')
@login_required
def debug_info():
    # Safe: only non-sensitive config, behind auth
    return jsonify({
        "db_host": "prod-db.internal",
        "version": "1.2.3",
        "status": "healthy"
    })

@app.route('/login', methods=['POST'])
def login():
    password = request.form.get('password')
    # Safe: log the event without the actual password
    logger.info(f"Login attempt for user: {request.form.get('username')}")
    if check_password_hash(stored_hash, password):
        return "OK"
    return "Fail"`,

  input_validation: `from flask import Flask, request, redirect
import re

app = Flask(__name__)

@app.route('/transfer', methods=['POST'])
def transfer():
    amount = request.form.get('amount')
    to_account = request.form.get('to')
    # Safe: validate type and range
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return "Invalid amount", 400
    if amount <= 0 or amount > 10000:
        return "Amount out of range", 400
    db.execute("UPDATE accounts SET balance = balance - %s WHERE id = %s", (amount, current_user.id))
    return "done"

@app.route('/profile', methods=['POST'])
def update_profile():
    age = request.form.get('age')
    email = request.form.get('email')
    # Safe: validate age as integer in valid range
    try:
        age = int(age)
        assert 0 < age < 150
    except:
        return "Invalid age", 400
    # Safe: validate email format
    if not re.match(r'^[\\w.-]+@[\\w.-]+\\.\\w+$', email):
        return "Invalid email", 400
    db.execute("UPDATE users SET age = %s, email = %s WHERE id = %s", (age, email, current_user.id))
    return "updated"

@app.route('/redirect')
def redirect_url():
    url = request.args.get('next', '/')
    # Safe: only allow internal redirects
    if not url.startswith('/') or url.startswith('//'):
        url = '/'
    return redirect(url)`,
};

const severityColors = {
  critical: { text: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', dot: 'bg-destructive' },
  high:     { text: 'text-chart-5',     bg: 'bg-chart-5/10',     border: 'border-chart-5/30',     dot: 'bg-chart-5' },
  medium:   { text: 'text-chart-4',     bg: 'bg-chart-4/10',     border: 'border-chart-4/30',     dot: 'bg-chart-4' },
  low:      { text: 'text-primary',     bg: 'bg-primary/10',     border: 'border-primary/30',     dot: 'bg-primary' },
};

function downloadSarif(sarif) {
  const blob = new Blob([JSON.stringify(sarif, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'results.sarif';
  a.click();
  URL.revokeObjectURL(url);
}

export default function Scanner() {
  const [code, setCode] = useState('');
  const [activeTab, setActiveTab] = useState('custom');
  const [output, setOutput] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [rightTab, setRightTab] = useState('terminal'); // 'terminal' | 'ast' | 'sarif'
  const outputRef = useRef(null);

  const scrollOutput = () =>
    setTimeout(() => outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' }), 50);

  const addLine = (line, delay = 0) =>
    new Promise((res) => setTimeout(() => { setOutput((p) => [...p, line]); scrollOutput(); res(); }, delay));

  const runScan = async () => {
    setScanning(true);
    setResult(null);
    setOutput([]);
    setExpandedIdx(null);

    await addLine({ type: 'cmd',  text: '$ python pyVulnScan.py --file input.py --ast --format sarif' }, 0);
    await addLine({ type: 'info', text: '[*] Initializing PyVulnScan v1.0.0' }, 200);
    await addLine({ type: 'info', text: '[*] Parsing source code → ast.parse(code)' }, 500);
    await addLine({ type: 'info', text: '[*] Walking AST nodes → ast.walk(tree)' }, 800);
    await addLine({ type: 'info', text: '[*] Applying SAST detection rules...' }, 1100);

    let scanResult = null;
    try {
      const response = await base44.functions.invoke('scanPythonCode', { code });
      scanResult = response.data?.response ?? response.data;
    } catch (err) {
      await addLine({ type: 'error', text: `[ERROR] Scan failed: ${err.message}` }, 1400);
      setScanning(false);
      return;
    }

    const findings = scanResult?.findings ?? [];
    const summary = scanResult?.summary ?? {};

    await addLine({ type: 'info', text: `[*] Lines analyzed: ${summary.linesAnalyzed ?? code.split('\n').length}` }, 1300);
    await addLine({ type: 'divider' }, 1450);

    if (findings.length === 0) {
      await addLine({ type: 'success', text: '[✓] No vulnerabilities detected.' }, 1500);
      await addLine({ type: 'success', text: '[✓] Scan complete — code looks safe!' }, 1700);
    } else {
      for (let i = 0; i < findings.length; i++) {
        const f = findings[i];
        const lvl = f.severity === 'critical' || f.severity === 'high' ? 'error' : 'warn';
        await addLine({
          type: lvl,
          text: `[${f.severity.toUpperCase()}] ${f.ruleName} at line ${f.line}: ${f.snippet}`,
        }, 1500 + i * 300);
        await addLine({
          type: 'dim',
          text: `         ${f.cwe ?? ''} ${f.owasp ? '| ' + f.owasp : ''}`,
        }, 1550 + i * 300);
      }

      await addLine({ type: 'divider' }, 1600 + findings.length * 300);
      await addLine({
        type: 'error',
        text: `[!] Scan complete. Found ${findings.length} issue${findings.length !== 1 ? 's' : ''} (${summary.critical ?? 0} critical, ${summary.high ?? 0} high, ${summary.medium ?? 0} medium, ${summary.low ?? 0} low)`,
      }, 1700 + findings.length * 300);
      await addLine({ type: 'info', text: '[*] SARIF report ready → click "Download SARIF" to export' }, 1900 + findings.length * 300);
    }

    setResult(scanResult);
    setScanning(false);
    if (activeTab === 'custom' && scanResult?.safe_code) {
      setRightTab('safe');
    } else if (scanResult?.ast_trace?.steps?.length) {
      setRightTab('ast');
    }
  };

  const reset = () => {
    setOutput([]);
    setResult(null);
    setExpandedIdx(null);
    setRightTab('terminal');
  };

  const findings = result?.findings ?? [];

  return (
    <div className="h-full flex flex-col p-4 gap-3 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center shrink-0 gap-3 relative">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">Live Scanner</span>
          <span className="hidden sm:inline text-xs text-muted-foreground">— real AST-based SAST analysis</span>
        </div>
        <div className="flex items-center gap-3 absolute left-1/2 -translate-x-1/2">
          <span className="text-sm font-bold tracking-wide" style={{ background: 'linear-gradient(135deg, #a78bfa, #c4b5fd, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', textShadow: 'none', filter: 'drop-shadow(0 0 8px rgba(167,139,250,0.4))' }}>
            Select Vulnerability to Scan
          </span>
          <select
            value={activeTab}
            onChange={(e) => {
              const k = e.target.value;
              setActiveTab(k);
              setCode(k === 'custom' ? '' : SAMPLE_CODES[k]);
              reset();
            }}
            className="cursor-pointer rounded-lg px-4 py-2 text-sm font-bold outline-none transition-all"
            style={{ background: 'linear-gradient(135deg, hsl(160 100% 38%), hsl(160 100% 28%))', color: '#000', border: '2px solid hsl(160 100% 50%)', boxShadow: '0 0 14px hsl(160 100% 40% / 0.5)' }}
          >
            <option value="custom">Custom Code (free input)</option>
            <optgroup label="── Vulnerability Samples ──">
              {Object.keys(SAMPLE_CODES).map((k) => (
                <option key={k} value={k}>{SAMPLE_LABELS[k] ?? k.replace(/_/g, ' ')}</option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      {/* Main grid */}
      <div className="flex-1 grid lg:grid-cols-2 gap-3 min-h-0">

        {/* ── Left: code editor ── */}
        <div className="flex flex-col min-h-0 bg-card border border-border/60 rounded-xl overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/30 border-b border-border/50 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-chart-4/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-primary/50" />
            <span className="text-xs text-muted-foreground font-mono ml-1">input.py</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={reset}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
              <button
                onClick={runScan}
                disabled={scanning}
                className="flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground rounded text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {scanning ? 'Analyzing...' : 'Run Scan'}
              </button>
            </div>
          </div>
          <div className="flex flex-1 min-h-0">
            <div className="select-none py-3 pr-2 pl-3 bg-muted/20 border-r border-border/30 text-right font-mono text-xs text-muted-foreground/40 leading-6 min-w-[32px]">
              {code.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            <textarea
              className="flex-1 p-3 bg-transparent font-mono text-[13px] resize-none outline-none leading-6 text-foreground/85 overflow-auto placeholder:text-muted-foreground/30"
              value={code}
              onChange={(e) => { setCode(e.target.value); reset(); }}
              spellCheck={false}
              placeholder={activeTab === 'custom' ? '# Paste your Python code here and click Run Scan...\n# The scanner will detect vulnerabilities and generate a secure fixed version.' : ''}
            />
          </div>
        </div>

        {/* ── Right: tabbed panel ── */}
        <div className="flex flex-col min-h-0 bg-card border border-border/60 rounded-xl overflow-hidden">

          {/* Tab bar */}
          <div className="flex items-center gap-0 border-b border-border/50 bg-muted/30 shrink-0">
            {[
              { id: 'terminal', label: 'Terminal', icon: Terminal },
              { id: 'ast',      label: 'AST Trace', icon: TreePine },
              { id: 'findings', label: `Findings${findings.length ? ` (${findings.length})` : ''}`, icon: AlertTriangle },
              { id: 'sarif',    label: 'SARIF JSON', icon: FileCode },
              { id: 'safe', label: 'Safe Version ✓', icon: ShieldCheck },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setRightTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 transition-colors ${
                  rightTab === id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
            <div className="ml-auto px-3 flex items-center gap-2">
              {result?.sarif && (
                <button
                  onClick={() => downloadSarif(result.sarif)}
                  className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
                >
                  <Download className="w-3 h-3" /> SARIF
                </button>
              )}
              <div className={`w-2 h-2 rounded-full ${scanning ? 'bg-chart-4 animate-pulse' : result ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">

            {/* Terminal */}
            {rightTab === 'terminal' && (
              <div ref={outputRef} className="h-full overflow-y-auto p-3 font-mono text-[11px] leading-5 space-y-px">
                {output.length === 0 && (
                  <span className="text-muted-foreground/35">Press "Run Scan" to start real AST analysis via backend...</span>
                )}
                {output.map((line, i) => {
                  if (line.type === 'divider') return <div key={i} className="border-t border-border/25 my-1.5" />;
                  return (
                    <div key={i} className={
                      line.type === 'cmd'     ? 'text-primary font-bold' :
                      line.type === 'error'   ? 'text-destructive' :
                      line.type === 'warn'    ? 'text-chart-4' :
                      line.type === 'success' ? 'text-primary' :
                      line.type === 'dim'     ? 'text-muted-foreground/50' :
                      'text-muted-foreground'
                    }>
                      {line.text}
                    </div>
                  );
                })}
                {scanning && (
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }} className="text-muted-foreground/40">█</motion.span>
                )}
              </div>
            )}

            {/* AST Trace */}
            {rightTab === 'ast' && (
              <AstTraceView
                astTrace={result?.ast_trace}
                findings={findings}
                code={code}
              />
            )}

            {/* Findings */}
            {rightTab === 'findings' && (
              <div className="h-full overflow-y-auto">
                {!result ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">Run a scan first</div>
                ) : findings.length === 0 ? (
                  <div className="flex items-center gap-2 m-4 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span className="text-sm text-primary font-medium">No vulnerabilities detected — code looks safe!</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-muted/10">
                      {['critical','high','medium','low'].map((s) => {
                        const count = findings.filter(f => f.severity === s).length;
                        if (!count) return null;
                        const sc = severityColors[s];
                        return <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${sc.bg} ${sc.text}`}>{count} {s}</span>;
                      })}
                    </div>
                    {findings.map((f, idx) => {
                      const sc = severityColors[f.severity] ?? severityColors.medium;
                      return (
                        <div key={idx}>
                          <button
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/25 transition-colors text-left"
                            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                          >
                            <div className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
                            <span className={`text-[11px] font-bold shrink-0 w-14 ${sc.text}`}>{f.severity.toUpperCase()}</span>
                            <span className="text-xs font-medium text-foreground flex-1 truncate">{f.ruleName}</span>
                            <span className="text-[11px] text-muted-foreground shrink-0 font-mono">:{f.line}</span>
                            {f.cwe && <span className="text-[10px] text-muted-foreground/60 shrink-0 hidden sm:block">{f.cwe}</span>}
                            <ChevronRight className={`w-3 h-3 text-muted-foreground shrink-0 transition-transform ${expandedIdx === idx ? 'rotate-90' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {expandedIdx === idx && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className={`overflow-hidden border-t border-border/20 ${sc.bg}`}
                              >
                                <div className="px-4 py-3 space-y-2">
                                  <p className="text-xs text-foreground/80 leading-relaxed">{f.message}</p>
                                  <pre className={`text-[11px] font-mono px-2 py-1 rounded border ${sc.border} bg-background/50 overflow-x-auto`}>{f.snippet}</pre>
                                  <div className="flex items-start gap-1.5">
                                    <Shield className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                                    <p className="text-[11px] text-primary leading-relaxed">{f.fix}</p>
                                  </div>
                                  {f.owasp && (
                                    <div className="flex gap-2 text-[10px] text-muted-foreground/60">
                                      {f.cwe && <span>{f.cwe}</span>}
                                      <span>{f.owasp}</span>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* SARIF JSON */}
            {rightTab === 'sarif' && (
              <div className="h-full overflow-y-auto">
                {!result?.sarif ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground/40 text-xs">Run a scan first</div>
                ) : (
                  <pre className="p-3 text-[10px] font-mono text-muted-foreground leading-4 overflow-x-auto">
                    {JSON.stringify(result.sarif, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Safe Version */}
            {rightTab === 'safe' && (() => {
              const safeCode = activeTab === 'custom' ? result?.safe_code : SAFE_CODES[activeTab];
              if (!safeCode) return (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground/50">
                  <ShieldCheck className="w-8 h-8 opacity-30" />
                  <p className="text-xs">{scanning ? 'Generating safe version...' : 'Run a scan to see the secure version of your code'}</p>
                </div>
              );
              return (
                <div className="h-full flex flex-col min-h-0">
                  <div className="shrink-0 px-3 py-2 bg-primary/5 border-b border-primary/20 flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-bold text-primary">Secure Version</span>
                    <span className="text-[10px] text-muted-foreground">
                      {activeTab === 'custom' ? '— AI-generated fix based on detected vulnerabilities' : '— how to fix the vulnerabilities above'}
                    </span>
                  </div>
                  <div className="flex flex-1 min-h-0 overflow-auto">
                    <div className="select-none py-3 pr-2 pl-3 bg-muted/20 border-r border-border/30 text-right font-mono text-xs text-muted-foreground/40 leading-6 min-w-[32px]">
                      {safeCode.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
                    </div>
                    <pre className="flex-1 p-3 font-mono text-[13px] leading-6 text-primary/80 overflow-x-auto whitespace-pre">
                      {safeCode}
                    </pre>
                  </div>
                </div>
              );
            })()}

          </div>
        </div>
      </div>
    </div>
  );
}