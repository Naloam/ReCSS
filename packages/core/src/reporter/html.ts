import { relative } from "node:path";

import type { AnalysisResult, UnusedClass } from "../types.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildRows(root: string, unused: UnusedClass[]): string {
  const rows: string[] = [];

  for (const item of unused) {
    for (const definition of item.definitions) {
      rows.push(
        `<tr><td>${escapeHtml(relative(root, definition.file) || definition.file)}</td><td>${definition.line}</td><td>.${escapeHtml(item.name)}</td><td>${escapeHtml(definition.selector)}</td></tr>`,
      );
    }
  }

  if (rows.length === 0) {
    return '<tr><td colspan="4">No unused classes found.</td></tr>';
  }

  return rows.join("\n");
}

export function renderHtmlReport(root: string, result: AnalysisResult): string {
  const { stats } = result.unused;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>ReCSS Analysis Report</title>
  <style>
    :root {
      --bg: #f6f8fb;
      --text: #1f2937;
      --muted: #6b7280;
      --surface: #ffffff;
      --border: #dbe1ea;
      --accent: #0f766e;
      --danger: #b42318;
      --warn: #b54708;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: linear-gradient(180deg, #f6f8fb 0%, #eef3f8 100%);
      color: var(--text);
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
    }
    header {
      padding: 24px;
      border-bottom: 1px solid var(--border);
      background: radial-gradient(circle at right top, rgba(15, 118, 110, 0.12), transparent 45%);
    }
    h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 0.02em;
    }
    .subtitle {
      margin-top: 8px;
      color: var(--muted);
      font-size: 14px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      background: #fbfcfe;
    }
    .card .label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .card .value {
      margin-top: 6px;
      font-weight: 600;
      font-size: 22px;
    }
    .danger { color: var(--danger); }
    .warn { color: var(--warn); }
    section {
      padding: 20px 24px 28px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      background: #fff;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
      vertical-align: top;
    }
    th {
      background: #f8fafc;
      font-weight: 600;
    }
    tr:last-child td { border-bottom: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>ReCSS Analysis Report</h1>
      <div class="subtitle">Unused class report generated from static analysis.</div>
    </header>

    <div class="stats">
      <div class="card">
        <div class="label">Total CSS Classes</div>
        <div class="value">${stats.totalCssClasses}</div>
      </div>
      <div class="card">
        <div class="label">Used Classes</div>
        <div class="value">${stats.usedClasses}</div>
      </div>
      <div class="card">
        <div class="label">Unused Classes</div>
        <div class="value danger">${stats.unusedClasses}</div>
      </div>
      <div class="card">
        <div class="label">Uncertain (Skipped)</div>
        <div class="value warn">${stats.uncertainClasses}</div>
      </div>
      <div class="card">
        <div class="label">Safelisted (Skipped)</div>
        <div class="value">${stats.safelistedClasses}</div>
      </div>
    </div>

    <section>
      <h2>Unused Classes</h2>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Line</th>
            <th>Class</th>
            <th>Selector</th>
          </tr>
        </thead>
        <tbody>
          ${buildRows(root, result.unused.unused)}
        </tbody>
      </table>
    </section>
  </div>
</body>
</html>`;
}
