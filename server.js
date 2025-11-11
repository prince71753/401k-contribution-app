import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SETTINGS_PATH)) {
  // mode: 'percent' -> percent number; mode: 'dollar' -> ANNUAL dollars
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ mode: 'percent', amount: 5 }, null, 2));
}

// IRS annual cap (no catch-up here; add if needed)
const IRS_EMPLOYEE_LIMIT_ANNUAL = 23000;
const COMBINED_LIMIT_ANNUAL = 69000;
const MOCK_PROFILE = {
  name: "Alex Example",
  currentAge: 30,
  retirementAge: 65,
  annualSalary: 120000,
  payPeriodsPerYear: 26,          // bi-weekly
  employerMatch: { percent: 4, capPercent: 4 }, // up to 4% match
  ytdContributions: 8200,
  ytdEmployerMatch: 3200,
  ytdYear: new Date().getFullYear()
};

const readSettings = () => JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
const writeSettings = (obj) => fs.writeFileSync(SETTINGS_PATH, JSON.stringify(obj, null, 2));

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function send(res, code, data, headers={}) {
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

function serveStatic(req, res) {
  let pathname = url.parse(req.url).pathname;
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(__dirname, 'public', pathname);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    send(res, 403, { ok:false, error:'Forbidden' });
    return true;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const type = mime[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const { pathname, query } = parsed;

  // --- settings ---
  if (pathname === '/api/settings' && req.method === 'GET') {
    try { return send(res, 200, { ok: true, settings: readSettings() }); }
    catch (e) { return send(res, 500, { ok: false, error: e.message }); }
  }

  if (pathname === '/api/settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { mode, amount } = JSON.parse(body || '{}');

        if (!['percent','dollar'].includes(mode)) {
          return send(res, 400, { ok:false, error:"mode must be 'percent' or 'dollar'" });
        }
        const num = Number(amount);
        if (!Number.isFinite(num) || num < 0) {
          return send(res, 400, { ok:false, error:'amount must be non-negative' });
        }
        if (mode === 'percent' && num > 100) {
          return send(res, 400, { ok:false, error:'percent cannot exceed 100' });
        }

        // Persist: 'dollar' = ANNUAL dollars (cap at IRS), 'percent' = percent number
        const updated = { mode, amount: mode === 'dollar' ? Math.min(num, IRS_EMPLOYEE_LIMIT_ANNUAL) : num };
        writeSettings(updated);
        return send(res, 200, { ok:true, settings: updated });
      } catch (e) {
        return send(res, 500, { ok:false, error: e.message });
      }
    });
    return;
  }

  // --- ytd ---
  if (pathname === '/api/ytd' && req.method === 'GET') {
    return send(res, 200, { ok:true, profile: MOCK_PROFILE });
  }

  if (pathname === '/api/projection' && req.method === 'GET') {
    try {
      const settings = readSettings();
      const annualReturn = Math.min(Math.max(parseFloat(query.annualReturn ?? '0.05'), -0.2), 0.2);
      const currentAge = parseInt(query.currentAge ?? MOCK_PROFILE.currentAge, 10);
      const retirementAge = parseInt(query.retirementAge ?? MOCK_PROFILE.retirementAge, 10);
      const salary = parseFloat(query.salary ?? MOCK_PROFILE.annualSalary);
      const periods = parseInt(query.periods ?? MOCK_PROFILE.payPeriodsPerYear, 10);

      // NEW: prefer explicit paycheck sent by client; fallback to salary/period
      const paycheck = parseFloat(query.paycheck ?? (salary / periods));

      const years = Math.max(0, retirementAge - currentAge);
      const n = years * periods;
      const r = annualReturn / periods;

      // ----- Employee contribution (apply employee IRS cap; annual dollars) -----
      let annualEmployee;
      if (settings.mode === 'percent') {
        // percent of *paycheck* times periods (matches UI/YTD behavior)
        annualEmployee = paycheck * (settings.amount / 100) * periods;
      } else {
        annualEmployee = settings.amount; // annual dollars directly
      }
      annualEmployee = Math.max(0, Math.min(annualEmployee, IRS_EMPLOYEE_LIMIT_ANNUAL));
      const perPeriodEmployee = annualEmployee / periods;

      // ----- Employer match (cap is % of per-period base; use paycheck for consistency) -----
      const perPeriodBase = paycheck;
      const matchCapPerPeriod = (MOCK_PROFILE.employerMatch.capPercent / 100) * perPeriodBase;

      let perPeriodEmployer = Math.min(perPeriodEmployee, matchCapPerPeriod);
      let annualEmployer = perPeriodEmployer * periods;

      // Combined additions annual cap
      const combinedAnnual = annualEmployee + annualEmployer;
      if (combinedAnnual > COMBINED_LIMIT_ANNUAL) {
        annualEmployer = Math.max(0, COMBINED_LIMIT_ANNUAL - annualEmployee);
        perPeriodEmployer = annualEmployer / periods;
      }

      const fv = (A, rr, nn) => {
        if (nn <= 0) return 0;
        if (Math.abs(rr) < 1e-9) return A * nn;
        return A * ((Math.pow(1 + rr, nn) - 1) / rr);
      };

      const employeeFV = fv(perPeriodEmployee, r, n);
      const employerFV = fv(perPeriodEmployer, r, n);
      const totalFV = employeeFV + employerFV;

      return send(res, 200, {
        ok: true,
        inputs: { annualReturn, currentAge, retirementAge, salary, periods, paycheck, settings, annualEmployeeCapped: annualEmployee },
        perPeriod: { employee: perPeriodEmployee, employer: perPeriodEmployer },
        futureValue: { employeeFV, employerFV, totalFV, currency: 'USD', years }
      });
    } catch (e) {
      return send(res, 500, { ok:false, error: e.message });
    }
  }


  // static + fallback
  if (serveStatic(req, res)) return;
  const fallback = path.join(__dirname, 'public', 'index.html');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  fs.createReadStream(fallback).pipe(res);
});

server.listen(PORT, () => {
  console.log(`401(k) Contribution app running on http://localhost:${PORT}`);
});

