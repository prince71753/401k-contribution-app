// ===== FRONT-SIDE JS (in-place edited) =====

// ADDED: tiny safe DOM helpers
const q = (sel) => document.querySelector(sel);
const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const money = (n) => `$${fmt(n)}`;
const setText = (sel, txt) => { const n = q(sel); if (n) n.textContent = txt; };
const setVal  = (sel, v)   => { const n = q(sel); if (n) n.value = v; };
const show    = (sel, on)  => { const n = q(sel); if (n) n.classList.toggle('hidden', !on); };
// ADDED: numeric hygiene for free-typed fields ($, commas ok)
const num = (sel, fallback = 0) => {
  const n = q(sel);
  if (!n) return fallback;
  const v = Number(String(n.value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(v) ? v : fallback;
};

// IRS cap — adjust as needed (no catch-up logic here; you can add it later)
const IRS_EMPLOYEE_LIMIT_ANNUAL = 23000;

const state = { settings: { mode: 'percent', amount: 5 }, profile: null };
let paycheckOverridden = false; // ADDED

async function loadSettings() {
  const r = await fetch('/api/settings');
  const { ok, settings } = await r.json();
  if (ok) state.settings = settings;
}

async function loadYTD() {
  const r = await fetch('/api/ytd');
  const { ok, profile } = await r.json();
  if (ok) state.profile = profile;
}

function getPayPeriods() {
  return state.profile?.payPeriodsPerYear ?? 26;
}
function defaultPaycheck() {
  if (!state.profile) return 0;
  return state.profile.annualSalary / state.profile.payPeriodsPerYear;
}

function currentAnnualFromSettings() {
  const periods = getPayPeriods();
  if (state.settings.mode === 'dollar') {
    // annual dollars directly
    return Math.min(state.settings.amount, IRS_EMPLOYEE_LIMIT_ANNUAL);
  }
  // percent of paycheck * periods
  const paycheck = num('#paycheckInput', defaultPaycheck()); // CHANGED (was direct Number(...))
  const annual = (state.settings.amount / 100) * paycheck * periods;
  return Math.min(annual, IRS_EMPLOYEE_LIMIT_ANNUAL);
}

function enforceLimitsAndSyncUI() {
  const mode = state.settings.mode;
  const periods = getPayPeriods();
  let limitHit = false;

  if (mode === 'dollar') {
    const max = IRS_EMPLOYEE_LIMIT_ANNUAL;
    const dr = q('#dollarRange'), di = q('#dollarInput');
    if (dr) dr.max = String(max);
    if (di) di.max = String(max);
    if (state.settings.amount > max) {
      state.settings.amount = max;
      if (dr) dr.value = String(max);
      if (di) di.value = String(max);
      limitHit = true;
    }
  } else {
    const paycheck = num('#paycheckInput', defaultPaycheck()); // CHANGED
    const maxPercent = paycheck > 0 ? (IRS_EMPLOYEE_LIMIT_ANNUAL / (paycheck * periods)) * 100 : 0;
    const safeMax = Math.max(0, Math.min(100, Math.floor(maxPercent * 10) / 10));
    const pr = q('#percentRange'), pi = q('#percentInput');
    if (pr) pr.max = String(safeMax);
    if (pi) pi.max = String(safeMax);
    if (state.settings.amount > safeMax) {
      state.settings.amount = safeMax;
      if (pr) pr.value = String(safeMax);
      if (pi) pi.value = String(safeMax);
      limitHit = true;
    }
  }
  show('#limitMsg', limitHit); // ADDED (safe show/hide)
}

function renderSettingsUI() {
  const mode = state.settings.mode;
  const percentRadio = document.querySelector('input[type="radio"][value="percent"]');
  const dollarRadio = document.querySelector('input[type="radio"][value="dollar"]');
  if (percentRadio) percentRadio.checked = mode === 'percent';
  if (dollarRadio)  dollarRadio.checked  = mode === 'dollar';

  const percentControls = q('#percentControls');
  const dollarControls  = q('#dollarControls');
  if (percentControls) percentControls.classList.toggle('hidden', mode !== 'percent');
  if (dollarControls)  dollarControls.classList.toggle('hidden', mode !== 'dollar');

  if (mode === 'percent') {
    if (!q('#paycheckInput')?.value) setVal('#paycheckInput', String(defaultPaycheck())); // CHANGED: raw value to avoid commas breaking Number()
    setVal('#percentRange', state.settings.amount);
    setVal('#percentInput', state.settings.amount);
  } else {
    setVal('#dollarRange', state.settings.amount);
    setVal('#dollarInput', state.settings.amount);
  }

  enforceLimitsAndSyncUI();
}

function bindControls() {
  // Switch mode
  document.querySelectorAll('input[name="mode"]').forEach((el) => {
    el.addEventListener('change', () => {
      state.settings.mode = el.value;
      renderSettingsUI();
      renderYTD();
      updateProjection();
    });
  });

  // Percent controls
  const pr = q('#percentRange');
  const pi = q('#percentInput');
  const pch = q('#paycheckInput');

  if (pr) pr.addEventListener('input', () => {
    state.settings.amount = Number(pr.value || 0);
    if (pi) pi.value = pr.value;
    enforceLimitsAndSyncUI(); renderYTD(); updateProjection();
  });
  if (pi) pi.addEventListener('input', () => {
    state.settings.amount = Number(pi.value || 0);
    if (pr) pr.value = pi.value;
    enforceLimitsAndSyncUI(); renderYTD(); updateProjection();
  });

  if (pch) pch.addEventListener('input', () => {
    paycheckOverridden = true; // ADDED: user took control
    enforceLimitsAndSyncUI(); renderYTD(); updateProjection();
  });

  // Dollar controls (annual)
  const dr = q('#dollarRange');
  const di = q('#dollarInput');
  if (dr) dr.addEventListener('input', () => {
    state.settings.amount = Number(dr.value || 0);
    if (di) di.value = dr.value;
    enforceLimitsAndSyncUI(); renderYTD(); updateProjection();
  });
  if (di) di.addEventListener('input', () => {
    state.settings.amount = Number(di.value || 0);
    if (dr) dr.value = di.value;
    enforceLimitsAndSyncUI(); renderYTD(); updateProjection();
  });

  // Save
  const saveBtn = q('#saveBtn');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    setText('#saveStatus', 'Saving…');
    const r = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.settings)  // dollar = annual, percent = percent number
    });
    const j = await r.json();
    if (j.ok) {
      setText('#saveStatus', 'Saved!');
      setTimeout(()=> setText('#saveStatus',''), 1500);
      updateProjection();
    } else {
      setText('#saveStatus', 'Error: ' + j.error);
    }
  });

  // Projection inputs: live update (also re-enforce caps) // CHANGED
  ['#ageInput', '#salaryInput', '#retireInput', '#returnInput'].forEach(sel => {
    const n = q(sel);
    if (n) n.addEventListener('input', () => {
      if (sel === '#salaryInput' && !paycheckOverridden) {
        // ADDED: auto-derive paycheck from salary unless user overrode
        const per = state.profile?.payPeriodsPerYear ?? 26;
        const sal = num('#salaryInput', state.profile?.annualSalary ?? 0);
        setVal('#paycheckInput', String(sal / per));
      }
      enforceLimitsAndSyncUI();
      updateProjection();
    });
  });
}

function renderYTD() {
  const p = state.profile;
  if (!p) return;
  const periods = getPayPeriods();
  const annual = currentAnnualFromSettings(); // already capped
  const perPay = annual / periods;

  let currentSelectionText;
  if (state.settings.mode === 'percent') {
    const paycheck = num('#paycheckInput', defaultPaycheck()); // CHANGED
    currentSelectionText = `${fmt(state.settings.amount)}% of $${fmt(paycheck)} paycheck (capped annually)`;
  } else {
    currentSelectionText = `${money(annual)} per year`;
  }

  const stats = [
    ['Annual salary', money(p.annualSalary)],
    ['Pay periods / year', fmt(periods)],
    ['Current selection', currentSelectionText],
    ['Estimated contribution / paycheck', money(perPay)],
    ['YTD employee contributions', money(p.ytdContributions)],
    ['YTD employer match', money(p.ytdEmployerMatch)],
  ];

  const ytdEl = q('#ytd');
  if (!ytdEl) return;
  ytdEl.innerHTML = stats.map(([label, value]) =>
    `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`
  ).join('');
}

// ADDED: Assumptions & Disclaimers renderer (fills lists if present)
function renderAssumptions() {
  const a = q('#assumption-list');
  const f = q('#fineprint-list');
  if (!state.profile) return;

  const periods = getPayPeriods();
  const paycheck = num('#paycheckInput', defaultPaycheck());
  const mode = state.settings.mode;
  const pct  = state.settings.amount;

  if (a) {
    a.innerHTML = '';
    [
      `Assumes ${periods} pay periods/year.`,
      `Gross per paycheck used for percent mode: ${money(paycheck)}.`,
      mode === 'percent'
        ? `Employee: ${pct.toFixed(1)}% of paycheck; annual cap ${money(IRS_EMPLOYEE_LIMIT_ANNUAL)}.`
        : `Employee: fixed annual amount of ${money(Math.min(state.settings.amount, IRS_EMPLOYEE_LIMIT_ANNUAL))}.`,
      `Employer match/payroll logic per plan data from /api/ytd.`,
      `Projection assumes constant salary and constant average return (no volatility sequence risk).`
    ].forEach(t => { const li = document.createElement('li'); li.textContent = t; a.appendChild(li); });
  }

  if (f) {
    f.innerHTML = '';
    [
      `YTD figures reflect posted payrolls only and do not change with current slider selection.`,
      `Tool is a simplified estimator; not financial advice; actual results depend on market performance and plan rules.`,
      `IRS limits shown exclude catch-up; if applicable, accommodate separately.`
    ].forEach(t => { const li = document.createElement('li'); li.textContent = t; f.appendChild(li); });
  }
}

async function updateProjection() {
  if (!state.profile) return;
  const p = state.profile;

  const userSalary = num('#salaryInput', p.annualSalary);                 // CHANGED
  const annualReturnPct = num('#returnInput', 5);                         // CHANGED
  const paycheckNow = num('#paycheckInput', defaultPaycheck());           // CHANGED
  const theAge = Number(q('#ageInput')?.value || p.currentAge);
  const theRet = Number(q('#retireInput')?.value || p.retirementAge);

  const qsp = new URLSearchParams({
    annualReturn: String(annualReturnPct/100),
    currentAge: String(theAge),
    retirementAge: String(theRet),
    salary: String(userSalary),
    periods: String(p.payPeriodsPerYear),
    paycheck: String(paycheckNow) // keep server in sync with UI paycheck
  }).toString();

  const r = await fetch('/api/projection?' + qsp);
  const j = await r.json();
  if (!j.ok) return;
  const { perPeriod, futureValue } = j;

  const proj = q('#projection');
  if (proj) {
    proj.innerHTML = `
      <div class="grid stats">
        <div class="stat"><div class="label">Employee contr./paycheck</div><div class="value">${money(perPeriod.employee)}</div></div>
        <div class="stat"><div class="label">Employer match/paycheck</div><div class="value">${money(perPeriod.employer)}</div></div>
        <div class="stat"><div class="label">Years until retirement</div><div class="value">${futureValue.years}</div></div>
        <div class="stat"><div class="label">Projected balance at ${theRet}</div><div class="value">${money(futureValue.totalFV)}</div></div>
      </div>
      <small class="note">Applies annual IRS cap to employee contributions. Assumes constant salary & return.</small>
    `;
  }

  renderYTD();
  renderAssumptions(); // ADDED
}

async function init() {
  await Promise.all([loadSettings(), loadYTD()]);
  // Prefill projection fields
  if (q('#ageInput'))    q('#ageInput').value = state.profile.currentAge;
  if (q('#retireInput')) q('#retireInput').value = state.profile.retirementAge;
  if (q('#returnInput')) q('#returnInput').value = 5;
  if (q('#salaryInput')) q('#salaryInput').value = state.profile.annualSalary;

  // Prefill paycheck for percent mode (raw number, no commas) // CHANGED
  if (!q('#paycheckInput')?.value) setVal('#paycheckInput', String(defaultPaycheck()));

  renderSettingsUI();
  bindControls();
  renderYTD();
  updateProjection();
}

init();
