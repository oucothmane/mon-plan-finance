/* ==========================================================================
   Mon Plan Finance — Logique minimaliste (app.js)
   Parcours épuré en 4 onglets :
   1. Dépenses (Ce mois : reste à dépenser, ajout en 1 tap, postes & historique)
   2. Budget (Dépenses du quotidien, Charges fixes, Revenus)
   3. Épargne (Combien je mets de côté + Mon patrimoine)
   4. Réglages (Apparence, Export/Import, Réinitialisation)
   ========================================================================== */

(function () {
  'use strict';

  // ==========================================================================
  // 1. CONFIGURATION & DONNÉES PAR DÉFAUT
  // ==========================================================================

  const STORAGE_KEY = 'mon_plan_finance_v1';
  const THEME_KEY = 'mon_plan_finance_apparence';

  // Les dépenses suivies au quotidien ont la catégorie « Vie courante & Sorties »,
  // l'épargne a sa propre section « Épargne », et les autres sont des charges fixes en mini-sections.
  const DAILY_CATEGORY = 'Vie courante & Sorties';
  const FIXED_CATEGORY = 'Fixes & Logement';
  const SAVINGS_CATEGORY = 'Épargne';

  const FIXED_GROUPS = [
    {
      key: 'logement',
      label: 'Logement',
      icon: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>'
    },
    {
      key: 'abonnement',
      label: 'Abonnements',
      icon: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'
    },
    {
      key: 'assurance',
      label: 'Assurances',
      icon: '<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/>'
    },
    {
      key: 'credit',
      label: 'Crédit',
      icon: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18"/>'
    },
    {
      key: 'autres',
      label: 'Autres',
      icon: '<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>'
    }
  ];

  const FIXED_GROUP_KEYS = FIXED_GROUPS.map((g) => g.key);
  const FIXED_GROUP_MAP = Object.fromEntries(FIXED_GROUPS.map((g) => [g.key, g]));

  const TAB_TITLES = {
    mois: 'Mes dépenses',
    budget: 'Mon budget',
    reglages: 'Réglages'
  };

  const TABS = Object.keys(TAB_TITLES);

  const DEFAULT_STATE = {
    patrimoine: 5000,
    patrimoineGoal: 0,
    overdraft: 0,
    cycleStart: '',
    epargneAsFixedMigrated: true,
    incomes: [
      { id: 1, name: 'Salaire', amount: 2000 }
    ],
    expenses: [
      { id: 101, name: 'Loyer', category: FIXED_CATEGORY, group: 'logement', amount: 700 },
      { id: 102, name: 'Épargne', category: SAVINGS_CATEGORY, amount: 690 },
      { id: 103, name: 'Transports', category: FIXED_CATEGORY, group: 'abonnement', amount: 80 },
      { id: 104, name: 'Téléphone & Internet', category: FIXED_CATEGORY, group: 'abonnement', amount: 50 },
      { id: 105, name: 'Salle de sport', category: FIXED_CATEGORY, group: 'abonnement', amount: 30 },
      { id: 106, name: 'Courses', category: DAILY_CATEGORY, amount: 300, real: 0 },
      { id: 107, name: 'Sorties & Resto', category: DAILY_CATEGORY, amount: 150, real: 0 }
    ],
    history: [],
    archives: [],
    savingsAddedMonth: '',
    lastExport: ''
  };

  // ==========================================================================
  // 2. FONCTIONS UTILITAIRES
  // ==========================================================================

  const $ = (id) => document.getElementById(id);
  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const pad2 = (n) => String(n).padStart(2, '0');
  const round2 = (n) => Math.round(n * 100) / 100;

  function parseAmount(value) {
    const cleaned = String(value == null ? '' : value)
      .replace(/\s/g, '')
      .replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isFinite(parsed) ? parsed : 0;
  }

  function formatEur(value) {
    const num = round2(Number(value) || 0);
    const decimals = Number.isInteger(num) ? 0 : 2;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  }

  function formatInputAmount(value) {
    return String(round2(Number(value) || 0)).replace('.', ',');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sumAmounts(list) {
    return list.reduce((total, item) => total + (Number(item.amount) || 0), 0);
  }

  function yearMonth(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1);
  }

  function todayIso() {
    const d = new Date();
    return `${yearMonth(d)}-${pad2(d.getDate())}`;
  }

  function parseLocalIso(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const dt = new Date(y, m - 1, d);
    if (isNaN(dt.getTime()) || dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
      return null;
    }
    return dt;
  }

  function addOneMonthLocal(date) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    const lastDayNext = new Date(y, m + 2, 0).getDate();
    return new Date(y, m + 1, Math.min(d, lastDayNext));
  }

  function diffLocalDays(fromDate, toDate) {
    const utcFrom = Date.UTC(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
    const utcTo = Date.UTC(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
    return Math.round((utcTo - utcFrom) / 86400000);
  }

  function formatMonthLabel(ym) {
    try {
      const [y, m] = String(ym || '').split('-').map(Number);
      if (!y || !m) return String(ym || '');
      const label = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', {
        month: 'long',
        year: 'numeric'
      });
      return label.charAt(0).toUpperCase() + label.slice(1);
    } catch (e) {
      return String(ym || '');
    }
  }

  function formatShortDate(isoString) {
    try {
      const d = isoString ? new Date(isoString) : new Date();
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } catch (e) {
      return '';
    }
  }

  function formatCycleArchiveLabel(startIso, endIso) {
    const startTxt = formatShortDate(startIso + 'T12:00:00');
    const endTxt = formatShortDate(endIso + 'T12:00:00');
    if (!startTxt) return formatMonthLabel(String(endIso || '').slice(0, 7));
    if (!endTxt || startIso === endIso) return `Cycle du ${startTxt}`;
    return `${startTxt} → ${endTxt}`;
  }

  function normalizeText(str) {
    return String(str == null ? '' : str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function inferFixedGroup(name) {
    const t = normalizeText(name);
    if (!t) return 'autres';
    if (/\b(assur\w*|mutuelle|prevoyance|apple\s*care|applecare|garantie)\b/.test(t)) {
      return 'assurance';
    }
    if (/\b(credit\w*|pret\w*|emprunt\w*|mensualit\w*|remboursement\w*|leasing|loa|lld|dette\w*|cofidis|cetelem|sofinco|floa)\b/.test(t)) {
      return 'credit';
    }
    if (/\b(loyer|logement|appart\w*|maison|electricit\w*|edf|engie|eau|veolia|gaz|chauffage|energie|syndic|copro\w*|charges?\s*(loc|copro|immeuble)|taxe\s*(habitation|fonciere)|foncier\w*|parking|garage|box\s*auto)\b/.test(t)) {
      return 'logement';
    }
    if (/\b(abonnement\w*|abo|telephone|tel|mobile|forfait|free|sfr|orange|bouygues|sosh|red|b&you|internet|fibre|wifi|box|salle|sport|fitness|basic\s*fit|gym|prime|amazon|youtube|spotify|deezer|netflix|disney|canal|apple\s*(music|tv|one)|icloud|google\s*one|chatgpt|openai|claude|bevel|whoop|strava|transport\w*|navigo|metro|ratp|sncf|pass|streaming|presse|journal)\b/.test(t)) {
      return 'abonnement';
    }
    return 'autres';
  }

  function isSavingsName(name) {
    return /\b(epargne|livret|pea|cto|pel|cel|invest\w*|bourse|etf|crypto|cote)\b/.test(
      normalizeText(name)
    );
  }

  function isSavingsExpense(item) {
    if (!item || item.category === DAILY_CATEGORY) return false;
    if (item.category === SAVINGS_CATEGORY) return true;
    if (item.group === 'epargne') return true;
    if (FIXED_GROUP_KEYS.includes(item.group)) return false;
    return isSavingsName(item.name);
  }

  function getFixedGroup(item) {
    if (item && FIXED_GROUP_KEYS.includes(item.group)) return item.group;
    return inferFixedGroup(item && item.name);
  }

  function ensureFixedGroups(expenses) {
    let changed = false;
    if (!Array.isArray(expenses)) return false;
    expenses.forEach((item) => {
      if (!item || item.category === DAILY_CATEGORY) return;
      if (isSavingsExpense(item)) {
        if (item.category !== SAVINGS_CATEGORY) {
          item.category = SAVINGS_CATEGORY;
          changed = true;
        }
        if ('group' in item) {
          delete item.group;
          changed = true;
        }
        return;
      }
      if (!FIXED_GROUP_KEYS.includes(item.group)) {
        item.group = inferFixedGroup(item.name);
        changed = true;
      }
    });
    return changed;
  }

  function renderHeaderDate() {
    const rawDate = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    if ($('date')) $('date').textContent = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  }

  // ==========================================================================
  // 3. ÉTAT DE L'APPLICATION (LOCALSTORAGE)
  // ==========================================================================

  let state = loadState();
  let currentTab = 'mois';
  let openEnvelopeId = null;
  let overdraftOpen = false;
  let logFilter = 'all';
  let lastAction = null;
  let monthBannerDismissed = false;
  const collapsedFixedGroups = new Set();
  let selectedFixGroup = 'logement';
  let fixGroupManual = false;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.incomes) && Array.isArray(saved.expenses)) {
        const merged = Object.assign(clone(DEFAULT_STATE), saved);
        if (!Array.isArray(merged.history)) merged.history = [];
        if (!Array.isArray(merged.archives)) merged.archives = [];
        merged.patrimoineGoal = Math.max(0, round2(Number(merged.patrimoineGoal) || 0));
        merged.overdraft = Math.max(0, round2(Number(merged.overdraft) || 0));
        merged.cycleStart = parseLocalIso(merged.cycleStart) ? merged.cycleStart : '';
        if (typeof merged.savingsAddedMonth !== 'string') merged.savingsAddedMonth = '';
        if (typeof merged.lastExport !== 'string') merged.lastExport = '';
        let dirty = false;
        if (!saved.epargneAsFixedMigrated) {
          const hasSavingsLine = merged.expenses.some(isSavingsExpense);
          if (!hasSavingsLine) {
            const unallocated = Math.max(
              0,
              round2(sumAmounts(merged.incomes) - sumAmounts(merged.expenses))
            );
            merged.expenses.unshift({
              id: Date.now(),
              name: 'Épargne',
              category: SAVINGS_CATEGORY,
              amount: unallocated
            });
          }
          merged.epargneAsFixedMigrated = true;
          dirty = true;
        }
        if (ensureFixedGroups(merged.expenses)) dirty = true;
        if (dirty) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          } catch (e) {}
        }
        return merged;
      }
    } catch (e) {}
    return clone(DEFAULT_STATE);
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function getDailyEnvelopes() {
    return state.expenses.filter((x) => x.category === DAILY_CATEGORY);
  }

  function getSavingsExpenses() {
    return state.expenses.filter(isSavingsExpense);
  }

  function getFixedExpenses() {
    return state.expenses.filter((x) => x.category !== DAILY_CATEGORY && !isSavingsExpense(x));
  }

  function getOverdraft() {
    return Math.max(0, round2(Number(state.overdraft) || 0));
  }

  function getCycleInfo(now) {
    const ref = now || new Date();
    const startDate = parseLocalIso(state.cycleStart);
    if (startDate) {
      const nextDate = addOneMonthLocal(startDate);
      const totalDays = Math.max(28, diffLocalDays(startDate, nextDate));
      const elapsed = Math.max(0, diffLocalDays(startDate, ref));
      const dayNum = elapsed + 1;
      return {
        isCustom: true,
        startIso: state.cycleStart,
        totalDays,
        dayNum,
        pace: Math.min(1, dayNum / totalDays),
        daysRemaining: Math.max(1, totalDays - dayNum + 1),
        isOverdue: dayNum > totalDays
      };
    }
    const totalDays = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
    const dayNum = ref.getDate();
    return {
      isCustom: false,
      startIso: '',
      totalDays,
      dayNum,
      pace: dayNum / totalDays,
      daysRemaining: Math.max(1, totalDays - dayNum + 1),
      isOverdue: false
    };
  }

  function getCurrentPeriodKey() {
    return parseLocalIso(state.cycleStart) ? state.cycleStart : yearMonth(new Date());
  }

  function getFixedSavingsAmount() {
    return sumAmounts(getSavingsExpenses());
  }

  function findItem(listName, id) {
    return state[listName].find((x) => String(x.id) === String(id));
  }

  function syncPatrimoineInput() {
    if ($('patri')) $('patri').value = formatInputAmount(state.patrimoine);
  }

  function syncPatrimoineGoalInput() {
    if ($('patriGoal')) {
      $('patriGoal').value = state.patrimoineGoal > 0 ? formatInputAmount(state.patrimoineGoal) : '';
    }
  }

  function needsBackup() {
    const hasData =
      (Array.isArray(state.history) && state.history.length > 0) ||
      (Array.isArray(state.archives) && state.archives.length > 0);
    if (!hasData) return false;
    if (!state.lastExport) return true;
    const last = new Date(state.lastExport + 'T00:00:00');
    if (isNaN(last.getTime())) return true;
    const diffDays = (Date.now() - last.getTime()) / 86400000;
    return diffDays >= 14;
  }

  function renderBackupHint() {
    if ($('bkHint')) {
      $('bkHint').textContent = state.lastExport
        ? `Dernière sauvegarde exportée : ${formatShortDate(state.lastExport + 'T12:00:00')}. Tout reste sur ton téléphone.`
        : 'Aucune sauvegarde exportée pour le moment. Tout est enregistré uniquement sur ton téléphone.';
    }
    if ($('menuBtn')) {
      $('menuBtn').classList.toggle('has-dot', needsBackup());
    }
  }

  // ==========================================================================
  // 4. THÈME & APPARENCE
  // ==========================================================================

  let currentTheme = 'auto';

  function setTheme(mode) {
    if (mode === 'light' || mode === 'dark') {
      document.documentElement.setAttribute('data-theme', mode);
    } else {
      mode = 'auto';
      document.documentElement.removeAttribute('data-theme');
    }
    currentTheme = mode;

    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch (e) {}

    document.querySelectorAll('[data-look]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.look === mode));
    });

    const isDark =
      mode === 'dark' ||
      (mode === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);

    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      const color =
        mode === 'auto'
          ? /dark/.test(meta.media)
            ? '#000000'
            : '#F2F2F7'
          : isDark
          ? '#000000'
          : '#F2F2F7';
      meta.setAttribute('content', color);
    });
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = $('toast');
    if (!el || !msg) return;
    el.textContent = msg;
    el.hidden = false;
    el.classList.remove('is-show');
    void el.offsetWidth;
    el.classList.add('is-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('is-show');
      setTimeout(() => {
        if (!el.classList.contains('is-show')) el.hidden = true;
      }, 240);
    }, 2000);
  }

  let initialTheme = 'auto';
  try {
    initialTheme = localStorage.getItem(THEME_KEY) || 'auto';
  } catch (e) {}
  setTheme(initialTheme);

  // ==========================================================================
  // 5. ONGLET 1 : « DÉPENSES » (CE MOIS)
  // ==========================================================================

  function getPaceStatus(spent, planned, monthPace) {
    if (spent > planned + 0.004) {
      return { level: 'bad', text: `Dépassé de ${formatEur(spent - planned)}` };
    }
    if (planned > 0 && spent + 0.004 < planned && spent > planned * monthPace + planned * 0.1) {
      return { level: 'warn', text: `Reste ${formatEur(planned - spent)}` };
    }
    return { level: 'ok', text: `Reste ${formatEur(Math.max(0, planned - spent))}` };
  }

  function buildMeterHtml(spent, planned, monthPace, level) {
    const toneClass = level === 'bad' ? ' is-bad' : level === 'warn' ? ' is-warn' : '';
    const fillPercent = planned > 0 ? Math.min(100, (spent / planned) * 100) : 0;
    const pacePercent = monthPace * 100;
    return (
      `<span class="meter${toneClass}">` +
      `<i style="width:${fillPercent}%"></i>` +
      `<u style="left:${pacePercent}%"></u>` +
      `</span>`
    );
  }

  function renderMoisView() {
    const now = new Date();
    const cycle = getCycleInfo(now);
    const todayNum = cycle.dayNum;
    const monthPace = cycle.pace;
    const daysRemaining = cycle.daysRemaining;

    if (!state.month) {
      state.month = yearMonth(now);
      saveState();
    }

    const envelopes = getDailyEnvelopes();
    const plannedDaily = sumAmounts(envelopes);
    const overdraft = getOverdraft();
    const netPlannedDaily = round2(plannedDaily - overdraft);
    const spentDaily = envelopes.reduce((acc, x) => acc + (Number(x.real) || 0), 0);
    const remainingDaily = round2(netPlannedDaily - spentDaily);

    if (
      !cycle.isCustom &&
      state.month !== yearMonth(now) &&
      spentDaily === 0 &&
      overdraft === 0 &&
      (!state.history || !state.history.length)
    ) {
      state.month = yearMonth(now);
      saveState();
    }

    const showMonthBanner = !cycle.isCustom && state.month !== yearMonth(now) && !monthBannerDismissed;
    $('monthBanner').hidden = !showMonthBanner;
    if (showMonthBanner) {
      const monthName = now.toLocaleDateString('fr-FR', { month: 'long' });
      $('monthTitle').textContent = `Nouveau mois (${monthName})`;
    }

    const globalStatus = getPaceStatus(spentDaily, netPlannedDaily, monthPace);
    if (cycle.isCustom) {
      const startShort = formatShortDate(cycle.startIso + 'T12:00:00');
      $('leftLab').textContent =
        globalStatus.level === 'bad'
          ? `Dépassé de · depuis le ${startShort}`
          : `Reste à dépenser · depuis le ${startShort}`;
    } else {
      $('leftLab').textContent =
        globalStatus.level === 'bad' ? 'Dépassé de' : 'Reste à dépenser ce mois';
    }
    $('leftBig').textContent = formatEur(Math.abs(remainingDaily));
    $('leftBig').className = 'big' + (globalStatus.level === 'bad' ? ' bad' : '');
    $('dayPill').textContent = `J${todayNum}`;
    $('dayPill').classList.remove('is-warn');
    if ($('startCycleBtn')) {
      $('startCycleBtn').classList.toggle('is-due', !cycle.isCustom);
    }

    $('allMeter').className =
      'meter' +
      (globalStatus.level === 'bad' ? ' is-bad' : globalStatus.level === 'warn' ? ' is-warn' : '');
    const meterPct =
      remainingDaily < -0.004 || (overdraft > 0 && netPlannedDaily <= 0)
        ? 100
        : netPlannedDaily > 0
        ? Math.min(100, (spentDaily / netPlannedDaily) * 100)
        : 0;
    $('allMeter').firstElementChild.style.width = meterPct + '%';
    $('allMeter').lastElementChild.style.left = monthPace * 100 + '%';

    if (!envelopes.length) {
      $('allLine').hidden = false;
      $('allLine').textContent = 'Ajoute un poste dans l’onglet Budget pour commencer.';
    } else {
      if (netPlannedDaily <= 0 && remainingDaily < -0.004) {
        $('allLine').hidden = false;
        $('allLine').textContent = `Découvert (${formatEur(overdraft)}) supérieur au budget (${formatEur(plannedDaily)})`;
      } else {
        $('allLine').hidden = true;
      }
    }

    const overdraftWrap = $('overdraftWrap');
    if (overdraftWrap) {
      overdraftWrap.hidden = !envelopes.length;
      if (envelopes.length) {
        const toggleBtn = $('overdraftToggle');
        const labEl = $('overdraftLab');
        const valEl = $('overdraftVal');
        const hintEl = $('overdraftHint');
        const editForm = $('overdraftEdit');
        const zeroBtn = $('overdraftZeroBtn');

        toggleBtn.classList.toggle('is-active', overdraft > 0);
        toggleBtn.setAttribute('aria-expanded', String(overdraftOpen));
        labEl.textContent = overdraft > 0 ? 'Découvert déduit' : 'Découvert';
        valEl.hidden = !(overdraft > 0);
        if (overdraft > 0) valEl.textContent = `−${formatEur(overdraft)}`;
        hintEl.textContent = overdraftOpen
          ? 'Fermer ▴'
          : overdraft > 0
          ? 'Modifier ▾'
          : '+ Ajouter';
        editForm.hidden = !overdraftOpen;
        if (zeroBtn) zeroBtn.hidden = !(overdraft > 0);
      }
    }

    const hasEnvelopes = envelopes.length > 0;
    $('addCard').hidden = !hasEnvelopes;
    $('lines').hidden = !hasEnvelopes;

    // Boutons d'ajout en 1 tap
    $('addChips').innerHTML = envelopes
      .map(
        (env) =>
          `<button type="button" class="chip" data-add="${env.id}">+ ${escapeHtml(env.name)}</button>`
      )
      .join('');

    $('undoRow').hidden = !lastAction;
    if (lastAction) {
      $('undoText').textContent = `${formatEur(lastAction.amount)} → ${lastAction.name}`;
    }

    // Jauges par poste
    $('lines').innerHTML = envelopes
      .map((env) => {
        const spent = Number(env.real) || 0;
        const planned = Number(env.amount) || 0;
        const status = getPaceStatus(spent, planned, monthPace);
        const isOpen = String(openEnvelopeId) === String(env.id);

        return (
          `<button type="button" class="line" data-line="${env.id}" aria-expanded="${isOpen}">` +
          `<span class="line-top">` +
          `<span class="line-name">${escapeHtml(env.name)}</span>` +
          `<span class="line-amt"><b>${formatEur(spent)}</b> / ${formatEur(planned)}</span>` +
          `</span>` +
          buildMeterHtml(spent, planned, monthPace, status.level) +
          `<span class="line-foot">` +
          `<span class="line-sub${
            status.level === 'bad' ? ' bad' : status.level === 'warn' ? ' warn' : ''
          }">${status.text}</span>` +
          `<span class="line-hint">${isOpen ? 'Fermer ▴' : 'Modifier ▾'}</span>` +
          `</span>` +
          `</button>` +
          (isOpen
            ? `<div class="line-edit">` +
              `<label for="lineIn">Modifier le total dépensé pour « ${escapeHtml(env.name)} »</label>` +
              `<span class="amt"><input type="text" inputmode="decimal" autocomplete="off" id="lineIn" value="${formatInputAmount(
                spent
              )}"><span>€</span></span>` +
              `<button type="button" class="btn" data-line-ok="${env.id}">OK</button>` +
              `<button type="button" class="ghost-btn" data-line-zero="${env.id}">Remettre à 0</button>` +
              `</div>`
            : '')
        );
      })
      .join('');

    // Historique repliable (affiché uniquement s'il y a des dépenses ou des compteurs > 0)
    const history = Array.isArray(state.history) ? state.history : [];
    const hasActivity = history.length > 0 || spentDaily > 0 || overdraft > 0;
    $('monthLogCard').hidden = !hasActivity;
    $('logCount').textContent = history.length
      ? `${history.length} opération${history.length > 1 ? 's' : ''}`
      : 'Remise à zéro';

    const distinctPosts = [];
    history.forEach((h) => {
      if (h.postName && !distinctPosts.includes(h.postName)) distinctPosts.push(h.postName);
    });
    if (logFilter !== 'all' && !distinctPosts.includes(logFilter)) logFilter = 'all';

    if ($('logFilters')) {
      const showFilters = distinctPosts.length > 1;
      $('logFilters').hidden = !showFilters;
      if (showFilters) {
        $('logFilters').innerHTML =
          `<button type="button" class="log-chip" data-logfilter="all" aria-pressed="${logFilter === 'all'}">Tous</button>` +
          distinctPosts
            .map(
              (name) =>
                `<button type="button" class="log-chip" data-logfilter="${escapeHtml(name)}" aria-pressed="${logFilter === name}">${escapeHtml(name)}</button>`
            )
            .join('');
      }
    }

    const filteredHistory =
      logFilter === 'all' ? history : history.filter((h) => h.postName === logFilter);

    if ($('logFilterSub')) {
      if (logFilter !== 'all' && filteredHistory.length > 0) {
        const subTotal = round2(filteredHistory.reduce((a, h) => a + (Number(h.amount) || 0), 0));
        $('logFilterSub').hidden = false;
        $('logFilterSub').textContent = `${filteredHistory.length} opération${
          filteredHistory.length > 1 ? 's' : ''
        } · Total : ${formatEur(subTotal)}`;
      } else {
        $('logFilterSub').hidden = true;
      }
    }

    $('monthLogList').innerHTML = filteredHistory
      .slice()
      .reverse()
      .map((entry) => {
        const noteHtml = entry.note ? ` <span>· ${escapeHtml(entry.note)}</span>` : '';
        const isPos = !!(entry.isPatrimoineTransfer || entry.isFixedSavingsTransfer);
        const amtPrefix = isPos ? '+' : '−';
        const amtClass = isPos ? 'log-amt pos' : 'log-amt';
        return (
          `<div class="log-item">` +
          `<div class="log-info">` +
          `<div class="log-title">${escapeHtml(entry.postName)}${noteHtml}</div>` +
          `<div class="log-date">${escapeHtml(formatShortDate(entry.date))}</div>` +
          `</div>` +
          `<div class="log-right">` +
          `<span class="${amtClass}">${amtPrefix}${formatEur(entry.amount)}</span>` +
          `<button type="button" class="del-btn" data-del-log="${entry.id}" aria-label="Supprimer">×</button>` +
          `</div>` +
          `</div>`
        );
      })
      .join('');
  }

  // ==========================================================================
  // 6. ONGLET 2 : « BUDGET » & ONGLET 3 : « ÉPARGNE »
  // ==========================================================================

  function buildSimpleRowHtml(listName, item) {
    const rowKey = listName + '|' + item.id;
    return (
      `<div class="erow">` +
      `<input class="name" type="text" autocomplete="off" value="${escapeHtml(
        item.name
      )}" data-edit="${rowKey}|name" aria-label="Nom">` +
      `<span class="amt"><input type="text" inputmode="decimal" autocomplete="off" value="${formatInputAmount(
        item.amount
      )}" data-edit="${rowKey}|amount" aria-label="Montant"><span>€</span></span>` +
      `<button type="button" class="del-btn" data-del="${rowKey}" aria-label="Supprimer ${escapeHtml(
        item.name
      )}">×</button>` +
      `</div>`
    );
  }

  function buildFixedRowHtml(item) {
    const rowKey = 'expenses|' + item.id;
    const groupKey = getFixedGroup(item);
    const optionsHtml = FIXED_GROUPS.map(
      (g) =>
        `<option value="${g.key}"${g.key === groupKey ? ' selected' : ''}>${escapeHtml(
          g.label
        )}</option>`
    ).join('');
    return (
      `<div class="erow">` +
      `<input class="name" type="text" autocomplete="off" value="${escapeHtml(
        item.name
      )}" data-edit="${rowKey}|name" aria-label="Nom">` +
      `<span class="amt"><input type="text" inputmode="decimal" autocomplete="off" value="${formatInputAmount(
        item.amount
      )}" data-edit="${rowKey}|amount" aria-label="Montant"><span>€</span></span>` +
      `<label class="group-pick" title="Changer de mini-section">` +
      `<svg class="ic" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h11M11 4l4 3-4 3M20 17H9M13 14l-4 3 4 3"/></svg>` +
      `<select data-edit-group="${rowKey}" aria-label="Section pour ${escapeHtml(item.name)}">` +
      optionsHtml +
      `</select>` +
      `</label>` +
      `<button type="button" class="del-btn" data-del="${rowKey}" aria-label="Supprimer ${escapeHtml(
        item.name
      )}">×</button>` +
      `</div>`
    );
  }

  function renderFixGroupChips() {
    const host = $('fixGroupChips');
    if (!host) return;
    host.innerHTML = FIXED_GROUPS.map(
      (g) =>
        `<button type="button" class="fix-chip" data-fix-pick="${g.key}" aria-pressed="${
          g.key === selectedFixGroup
        }"><i></i>${escapeHtml(g.label)}</button>`
    ).join('');
  }

  function renderBudgetLists() {
    const dailyList = getDailyEnvelopes();
    const fixedList = getFixedExpenses();
    const savingsList = getSavingsExpenses();

    $('dailyExpensesList').innerHTML =
      dailyList.map((x) => buildSimpleRowHtml('expenses', x)).join('') ||
      '<p class="hint">Aucun poste quotidien.</p>';

    if (!fixedList.length) {
      $('fixedExpensesList').innerHTML = '<p class="hint">Aucune charge fixe.</p>';
    } else {
      const grouped = Object.fromEntries(FIXED_GROUP_KEYS.map((k) => [k, []]));
      fixedList.forEach((item) => {
        grouped[getFixedGroup(item)].push(item);
      });
      $('fixedExpensesList').innerHTML = FIXED_GROUPS.filter((g) => grouped[g.key].length > 0)
        .map((g) => {
          const items = grouped[g.key];
          const subtotal = sumAmounts(items);
          const isCollapsed = collapsedFixedGroups.has(g.key);
          return (
            `<div class="fix-group${isCollapsed ? ' is-collapsed' : ''}" data-group="${g.key}">` +
            `<button type="button" class="fix-group-head" data-fix-toggle="${g.key}" aria-expanded="${!isCollapsed}">` +
            `<span class="fix-group-left">` +
            `<span class="fix-group-ic"><svg class="ic" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">${g.icon}</svg></span>` +
            `<span class="fix-group-title">${escapeHtml(g.label)}</span>` +
            `<span class="fix-group-count">${items.length}</span>` +
            `</span>` +
            `<span class="fix-group-right">` +
            `<span class="fix-group-total" data-fix-group-total="${g.key}">${formatEur(subtotal)}</span>` +
            `<svg class="ic fix-group-chev" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>` +
            `</span>` +
            `</button>` +
            `<div class="fix-group-body">` +
            items.map(buildFixedRowHtml).join('') +
            `</div>` +
            `</div>`
          );
        })
        .join('');
    }

    renderFixGroupChips();

    if ($('savingsExpensesList')) {
      $('savingsExpensesList').innerHTML =
        savingsList.map((x) => buildSimpleRowHtml('expenses', x)).join('') ||
        '<p class="hint">Aucune épargne mensuelle.</p>';
    }

    $('incomes').innerHTML =
      state.incomes.map((x) => buildSimpleRowHtml('incomes', x)).join('') ||
      '<p class="hint">Aucun revenu.</p>';

    renderDerivedNumbers();
  }

  function renderDerivedNumbers() {
    const totalIncome = sumAmounts(state.incomes);
    const dailyEnvelopes = getDailyEnvelopes();
    const fixedExpenses = getFixedExpenses();
    const savingsExpenses = getSavingsExpenses();

    const totalDailyPlanned = sumAmounts(dailyEnvelopes);
    const totalFixedPlanned = sumAmounts(fixedExpenses);
    const fixedSavings = sumAmounts(savingsExpenses);
    const totalOutPlanned = round2(totalDailyPlanned + totalFixedPlanned + fixedSavings);
    const budgetBalance = round2(totalIncome - totalOutPlanned);

    const overdraft = getOverdraft();
    const totalDailySpent = dailyEnvelopes.reduce((a, x) => a + (Number(x.real) || 0), 0);
    const remainingDaily = round2(totalDailyPlanned - overdraft - totalDailySpent);

    // Onglet Budget : Entrées − Sorties = Balance (objectif : 0 €)
    $('b-in').textContent = formatEur(totalIncome);
    $('b-out').textContent = formatEur(totalOutPlanned);

    if (Math.abs(budgetBalance) < 0.005) {
      $('b-bal').textContent = formatEur(0);
      $('b-bal').className = 'pos';
    } else if (budgetBalance > 0) {
      $('b-bal').textContent = '+' + formatEur(budgetBalance);
      $('b-bal').className = 'warn';
    } else {
      $('b-bal').textContent = formatEur(budgetBalance);
      $('b-bal').className = 'bad';
    }

    // Barre proportionnelle du budget (Fixes / Épargne / Quotidien)
    if ($('budgetBar') && $('budgetLegend')) {
      const hasBudgetOut = totalOutPlanned > 0;
      $('budgetBar').hidden = !hasBudgetOut;
      $('budgetLegend').hidden = !hasBudgetOut;
      if (hasBudgetOut) {
        const pFix = Math.round((totalFixedPlanned / totalOutPlanned) * 100);
        const pSav = Math.round((fixedSavings / totalOutPlanned) * 100);
        const pVar = Math.max(0, 100 - pFix - pSav);
        if ($('barFix')) $('barFix').style.width = (totalFixedPlanned / totalOutPlanned) * 100 + '%';
        if ($('barSav')) $('barSav').style.width = (fixedSavings / totalOutPlanned) * 100 + '%';
        if ($('barVar')) $('barVar').style.width = (totalDailyPlanned / totalOutPlanned) * 100 + '%';
        const parts = [];
        if (totalFixedPlanned > 0) parts.push(`<span><i class="bdot bseg-fix"></i>Fixes ${pFix} %</span>`);
        if (fixedSavings > 0) parts.push(`<span><i class="bdot bseg-sav"></i>Épargne ${pSav} %</span>`);
        if (totalDailyPlanned > 0) parts.push(`<span><i class="bdot bseg-var"></i>Quotidien ${pVar} %</span>`);
        $('budgetLegend').innerHTML = parts.join('');
      }
    }

    $('varTotal').textContent = formatEur(totalDailyPlanned);
    $('fixTotal').textContent = formatEur(totalFixedPlanned);
    if ($('savTotal')) $('savTotal').textContent = formatEur(fixedSavings);
    $('incTotal').textContent = formatEur(totalIncome);

    // Sous-totaux en direct par mini-section des charges fixes
    const groupTotals = Object.fromEntries(FIXED_GROUP_KEYS.map((k) => [k, 0]));
    fixedExpenses.forEach((item) => {
      const key = getFixedGroup(item);
      groupTotals[key] = round2((groupTotals[key] || 0) + (Number(item.amount) || 0));
    });
    document.querySelectorAll('[data-fix-group-total]').forEach((el) => {
      const key = el.dataset.fixGroupTotal;
      if (key in groupTotals) el.textContent = formatEur(groupTotals[key]);
    });

    // Archives des mois précédents
    const archives = Array.isArray(state.archives) ? state.archives : [];
    if ($('archivesCard')) {
      $('archivesCard').hidden = archives.length === 0;
      if ($('archivesCount')) {
        $('archivesCount').textContent = `${archives.length} période${archives.length > 1 ? 's' : ''}`;
      }
      if ($('clearArchivesBtn')) {
        $('clearArchivesBtn').hidden = archives.length < 2;
      }
      if ($('archivesList')) {
        $('archivesList').innerHTML = archives
          .slice()
          .reverse()
          .map((a, revIdx) => {
            const origIdx = archives.length - 1 - revIdx;
            const archOverdraft = Math.max(0, round2(Number(a.overdraft) || 0));
            const diff = round2((Number(a.planned) || 0) - archOverdraft - (Number(a.spent) || 0));
            const diffTxt =
              diff >= 0
                ? `<span class="pos">Reste ${formatEur(diff)}</span>`
                : `<span class="bad">Dépassé de ${formatEur(-diff)}</span>`;
            const odTxt = archOverdraft > 0 ? ` · Découvert : ${formatEur(archOverdraft)}` : '';
            const archTitle = a.label || formatMonthLabel(a.month);
            return (
              `<div class="arch-item">` +
              `<div class="arch-body">` +
              `<div class="arch-top"><b>${escapeHtml(archTitle)}</b>${diffTxt}</div>` +
              `<div class="arch-sub">Dépensé : ${formatEur(a.spent)} / ${formatEur(a.planned)}${odTxt}</div>` +
              `</div>` +
              `<button type="button" class="del-btn" data-del-arch="${origIdx}" aria-label="Supprimer ${escapeHtml(archTitle)}">×</button>` +
              `</div>`
            );
          })
          .join('');
      }
    }

    renderBackupHint();
    renderMoisView();
  }

  // ==========================================================================
  // 7. NAVIGATION, ACTIONS & ÉVÉNEMENTS
  // ==========================================================================

  function setMenuOpen(open) {
    const m = $('appMenu');
    const b = $('menuBtn');
    if (m) m.hidden = !open;
    if (b) b.setAttribute('aria-expanded', String(!!open));
  }

  function goToTab(tabName) {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    setMenuOpen(false);
    currentTab = TABS.includes(tabName) ? tabName : 'mois';
    TABS.forEach((t) => {
      $('view-' + t).hidden = t !== currentTab;
    });
    document.querySelectorAll('.tab, .menu-item').forEach((btn) => {
      if (btn.dataset.tab === currentTab) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });
    if ($('menuBtn')) {
      $('menuBtn').classList.toggle('is-active', currentTab === 'reglages');
    }
    $('screenTitle').textContent = TAB_TITLES[currentTab];
    renderBudgetLists();
    window.scrollTo(0, 0);
  }

  function addDailyExpense(envelopeId) {
    const envelope = findItem('expenses', envelopeId);
    const amount = round2(parseAmount($('addAmt').value));
    const note = ($('addNote').value || '').trim();

    if (!envelope) return;
    if (!(amount > 0)) {
      $('addHint').hidden = false;
      $('addHint').textContent = 'Tape d’abord le montant ci-dessus.';
      $('addAmt').focus();
      return;
    }

    envelope.real = round2((Number(envelope.real) || 0) + amount);

    if (!Array.isArray(state.history)) state.history = [];
    const logEntry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      expenseId: envelope.id,
      postName: envelope.name,
      amount: amount,
      note: note,
      date: new Date().toISOString()
    };
    state.history.push(logEntry);

    lastAction = {
      logId: logEntry.id,
      expenseId: envelope.id,
      amount: amount,
      name: envelope.name
    };

    $('addAmt').value = '';
    $('addNote').value = '';
    $('addAmt').blur();
    $('addNote').blur();
    $('addHint').hidden = true;

    saveState();
    renderDerivedNumbers();
    showToast(`−${formatEur(amount)} · ${envelope.name} ✓`);
  }

  function transferRemainderToPatrimoine() {
    const envelopes = getDailyEnvelopes();
    const plannedDaily = sumAmounts(envelopes);
    const overdraft = getOverdraft();
    const spentDaily = envelopes.reduce((a, x) => a + (Number(x.real) || 0), 0);
    const remainingDaily = round2(plannedDaily - overdraft - spentDaily);

    if (!(remainingDaily > 0)) return;
    if (
      !confirm(
        `Ajouter le reste du mois (${formatEur(remainingDaily)}) à ton patrimoine et remettre le reste à dépenser à 0 € ?`
      )
    ) {
      return;
    }

    let leftToAllocate = remainingDaily;
    const snapshots = [];
    envelopes.forEach((env) => {
      const currentReal = Number(env.real) || 0;
      const planned = Number(env.amount) || 0;
      const room = Math.max(0, round2(planned - currentReal));
      if (room > 0 && leftToAllocate > 0) {
        const add = Math.min(room, leftToAllocate);
        snapshots.push({ id: env.id, added: add });
        env.real = round2(currentReal + add);
        leftToAllocate = round2(leftToAllocate - add);
      }
    });

    state.patrimoine = round2((Number(state.patrimoine) || 0) + remainingDaily);

    if (!Array.isArray(state.history)) state.history = [];
    const logEntry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      isPatrimoineTransfer: true,
      snapshots: snapshots,
      postName: 'Reste du mois → Patrimoine',
      amount: remainingDaily,
      note: 'Balance soldée à 0 €',
      date: new Date().toISOString()
    };
    state.history.push(logEntry);

    lastAction = {
      logId: logEntry.id,
      amount: remainingDaily,
      name: 'Patrimoine'
    };

    saveState();
    syncPatrimoineInput();
    renderDerivedNumbers();
    showToast(`+${formatEur(remainingDaily)} ajoutés au patrimoine ✓`);
  }

  function deleteHistoryEntry(logId) {
    if (!Array.isArray(state.history)) return;
    const entry = state.history.find((h) => String(h.id) === String(logId));
    if (!entry) return;

    if (entry.isPatrimoineTransfer) {
      state.patrimoine = Math.max(
        0,
        round2((Number(state.patrimoine) || 0) - (Number(entry.amount) || 0))
      );
      if (Array.isArray(entry.snapshots)) {
        entry.snapshots.forEach((s) => {
          const env = findItem('expenses', s.id);
          if (env) {
            env.real = Math.max(0, round2((Number(env.real) || 0) - (Number(s.added) || 0)));
          }
        });
      }
      syncPatrimoineInput();
    } else if (entry.isFixedSavingsTransfer) {
      state.patrimoine = Math.max(
        0,
        round2((Number(state.patrimoine) || 0) - (Number(entry.amount) || 0))
      );
      if (entry.month && state.savingsAddedMonth === entry.month) {
        state.savingsAddedMonth = '';
      }
      syncPatrimoineInput();
    } else {
      const envelope = findItem('expenses', entry.expenseId);
      if (envelope) {
        envelope.real = Math.max(0, round2((Number(envelope.real) || 0) - (Number(entry.amount) || 0)));
      }
    }

    state.history = state.history.filter((h) => String(h.id) !== String(logId));
    if (lastAction && String(lastAction.logId) === String(logId)) {
      lastAction = null;
    }

    saveState();
    renderDerivedNumbers();
  }

  function resetMonthCounters(options) {
    const startNewCycle = !!(options && options.startNewCycle);
    const envelopes = getDailyEnvelopes();
    const plannedDaily = sumAmounts(envelopes);
    const overdraft = getOverdraft();
    const spentDaily = envelopes.reduce((a, x) => a + (Number(x.real) || 0), 0);
    const hasHistory = Array.isArray(state.history) && state.history.length > 0;
    const prevMonth = state.month || yearMonth(new Date());
    const prevCycleStart = parseLocalIso(state.cycleStart) ? state.cycleStart : '';
    const todayStr = todayIso();

    if (spentDaily > 0 || overdraft > 0 || hasHistory) {
      if (!Array.isArray(state.archives)) state.archives = [];
      const cycleKey = prevCycleStart || prevMonth;
      const archEntry = {
        month: prevMonth,
        cycleKey: cycleKey,
        planned: round2(plannedDaily),
        overdraft: round2(overdraft),
        spent: round2(spentDaily),
        patrimoine: round2(Number(state.patrimoine) || 0)
      };
      if (prevCycleStart) {
        archEntry.label = formatCycleArchiveLabel(prevCycleStart, todayStr);
      }
      const idx = state.archives.findIndex((a) =>
        a.cycleKey ? a.cycleKey === cycleKey : !prevCycleStart && a.month === prevMonth
      );
      if (idx >= 0) state.archives[idx] = archEntry;
      else state.archives.push(archEntry);
      if (state.archives.length > 24) state.archives.splice(0, state.archives.length - 24);
    }

    state.expenses.forEach((x) => {
      x.real = 0;
    });
    state.overdraft = 0;
    state.history = [];
    state.month = yearMonth(new Date());
    if (startNewCycle) {
      state.cycleStart = todayStr;
      monthBannerDismissed = true;
    }
    lastAction = null;
    openEnvelopeId = null;
    overdraftOpen = false;
    logFilter = 'all';
    saveState();
    renderDerivedNumbers();
    showToast(
      startNewCycle
        ? 'Salaire reçu · compteur démarré (J1) ✓'
        : 'Mois archivé · compteurs remis à zéro'
    );
  }

  function startSalaryCycle() {
    const envelopes = getDailyEnvelopes();
    const spentDaily = envelopes.reduce((a, x) => a + (Number(x.real) || 0), 0);
    const overdraft = getOverdraft();
    const hasHistory = Array.isArray(state.history) && state.history.length > 0;
    const hasActivity = spentDaily > 0 || overdraft > 0 || hasHistory;
    const todayStr = todayIso();

    if (hasActivity) {
      if (
        !confirm(
          'Salaire reçu ? Archiver la période en cours et redémarrer le compteur à zéro aujourd’hui (J1) ?'
        )
      ) {
        return;
      }
      resetMonthCounters({ startNewCycle: true });
      return;
    }

    if (state.cycleStart === todayStr) {
      showToast('Le compteur a déjà démarré aujourd’hui (J1)');
      return;
    }

    if (!confirm('Salaire reçu ? Démarrer le compteur aujourd’hui (J1) ?')) {
      return;
    }
    state.cycleStart = todayStr;
    state.month = yearMonth(new Date());
    monthBannerDismissed = true;
    saveState();
    renderDerivedNumbers();
    showToast('Salaire reçu · compteur démarré (J1) ✓');
  }

  async function deliverFile(content, filename, mimeType) {
    try {
      const file = new File([content], filename, { type: mimeType });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        showToast('Sauvegarde exportée ✓');
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }

    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Sauvegarde exportée ✓');
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed || !Array.isArray(parsed.incomes) || !Array.isArray(parsed.expenses)) {
          throw new Error('Invalid format');
        }
        if (!confirm('Remplacer tes données actuelles par cette sauvegarde ?')) return;

        const importedTheme = parsed.theme;
        const cleanData = Object.assign({}, parsed);
        delete cleanData.theme;

        state = Object.assign(clone(DEFAULT_STATE), cleanData);
        state.patrimoine = Math.max(0, round2(Number(state.patrimoine) || 0));
        state.patrimoineGoal = Math.max(0, round2(Number(state.patrimoineGoal) || 0));
        state.overdraft = Math.max(0, round2(Number(state.overdraft) || 0));
        state.cycleStart = parseLocalIso(state.cycleStart) ? state.cycleStart : '';
        if (!Array.isArray(state.history)) state.history = [];
        if (!Array.isArray(state.archives)) state.archives = [];
        if (typeof state.savingsAddedMonth !== 'string') state.savingsAddedMonth = '';
        if (typeof state.lastExport !== 'string') state.lastExport = '';
        ensureFixedGroups(state.expenses);
        lastAction = null;
        openEnvelopeId = null;
        overdraftOpen = false;
        logFilter = 'all';
        monthBannerDismissed = false;

        if (importedTheme === 'light' || importedTheme === 'dark' || importedTheme === 'auto') {
          setTheme(importedTheme);
        }
        saveState();
        syncPatrimoineInput();
        syncPatrimoineGoalInput();
        renderBudgetLists();
        showToast('Sauvegarde importée ✓');
      } catch (err) {
        alert('Fichier non reconnu.');
      }
    };
    reader.readAsText(file);
  }

  // --- Clics ---
  document.addEventListener('click', (event) => {
    if (event.target && event.target.id === 'menuBackdrop') {
      setMenuOpen(false);
      return;
    }
    const btn = event.target.closest('button');
    if (!btn) return;
    if (btn.id === 'menuBtn') {
      const m = $('appMenu');
      setMenuOpen(m ? m.hidden : false);
      return;
    }
    const data = btn.dataset;

    if (data.tab) {
      goToTab(data.tab);
    } else if (data.qamt) {
      const cur = Math.max(0, round2(parseAmount($('addAmt').value)));
      const next = round2(cur + Number(data.qamt));
      $('addAmt').value = formatInputAmount(next);
      $('addHint').hidden = true;
    } else if (data.add) {
      addDailyExpense(data.add);
    } else if (data.logfilter != null) {
      logFilter = data.logfilter;
      renderMoisView();
    } else if (btn.id === 'undoBtn') {
      if (lastAction && lastAction.logId) {
        deleteHistoryEntry(lastAction.logId);
      }
      lastAction = null;
      saveState();
      renderDerivedNumbers();
      showToast('Opération annulée');
    } else if (data.delLog) {
      deleteHistoryEntry(data.delLog);
      showToast('Opération supprimée');
    } else if (data.delArch != null) {
      const idx = Number(data.delArch);
      if (Array.isArray(state.archives) && Number.isInteger(idx) && idx >= 0 && idx < state.archives.length) {
        const target = state.archives[idx];
        const title = target.label || formatMonthLabel(target.month);
        if (confirm(`Supprimer l’archive « ${title} » ?`)) {
          state.archives.splice(idx, 1);
          saveState();
          renderDerivedNumbers();
          showToast('Archive supprimée');
        }
      }
    } else if (btn.id === 'clearArchivesBtn') {
      if (Array.isArray(state.archives) && state.archives.length > 0 && confirm('Effacer toutes les archives des mois précédents ?')) {
        state.archives = [];
        saveState();
        renderDerivedNumbers();
        showToast('Archives effacées');
      }
    } else if (data.line) {
      openEnvelopeId = String(openEnvelopeId) === data.line ? null : data.line;
      renderMoisView();
    } else if (data.lineOk) {
      const env = findItem('expenses', data.lineOk);
      if (env) {
        env.real = Math.max(0, round2(parseAmount($('lineIn').value)));
        lastAction = null;
        openEnvelopeId = null;
        saveState();
        renderDerivedNumbers();
        showToast(`${env.name} mis à jour ✓`);
      }
    } else if (data.lineZero) {
      const env = findItem('expenses', data.lineZero);
      if (env) {
        env.real = 0;
        if (Array.isArray(state.history)) {
          state.history = state.history.filter((h) => String(h.expenseId) !== String(env.id));
        }
        lastAction = null;
        openEnvelopeId = null;
        saveState();
        renderDerivedNumbers();
        showToast(`${env.name} remis à 0 €`);
      }
    } else if (btn.id === 'startCycleBtn') {
      startSalaryCycle();
    } else if (btn.id === 'overdraftToggle') {
      overdraftOpen = !overdraftOpen;
      renderMoisView();
      if (overdraftOpen && $('overdraftIn')) {
        const od = getOverdraft();
        $('overdraftIn').value = od > 0 ? formatInputAmount(od) : '';
        $('overdraftIn').focus();
      }
    } else if (btn.id === 'overdraftZeroBtn') {
      state.overdraft = 0;
      overdraftOpen = false;
      saveState();
      renderDerivedNumbers();
      showToast('Découvert remis à 0 €');
    } else if (btn.id === 'newMonthBtn') {
      if (confirm('Archiver cette période et remettre toutes les dépenses à zéro ?')) {
        resetMonthCounters();
      }
    } else if (data.month === 'reset') {
      resetMonthCounters();
    } else if (data.month === 'keep') {
      state.month = yearMonth(new Date());
      monthBannerDismissed = true;
      saveState();
      renderMoisView();
    } else if (data.del) {
      const [listName, id] = data.del.split('|');
      const item = findItem(listName, id);
      if (item && confirm(`Supprimer « ${item.name} » ?`)) {
        state[listName] = state[listName].filter((y) => y !== item);
        if (String(openEnvelopeId) === String(item.id)) openEnvelopeId = null;
        if (logFilter === item.name) logFilter = 'all';
        saveState();
        renderBudgetLists();
        showToast(`${item.name} supprimé`);
      }
    } else if (data.fixToggle) {
      const key = data.fixToggle;
      const box = btn.closest('.fix-group');
      if (collapsedFixedGroups.has(key)) {
        collapsedFixedGroups.delete(key);
        if (box) box.classList.remove('is-collapsed');
        btn.setAttribute('aria-expanded', 'true');
      } else {
        collapsedFixedGroups.add(key);
        if (box) box.classList.add('is-collapsed');
        btn.setAttribute('aria-expanded', 'false');
      }
    } else if (data.fixPick && FIXED_GROUP_KEYS.includes(data.fixPick)) {
      selectedFixGroup = data.fixPick;
      fixGroupManual = true;
      renderFixGroupChips();
    } else if (btn.id === 'transferRemMoisBtn' || btn.id === 'addRemToPatriBtn') {
      transferRemainderToPatrimoine();
    } else if (btn.id === 'addSavToPatriBtn') {
      const fixedSavings = getFixedSavingsAmount();
      const curPeriod = getCurrentPeriodKey();
      const alreadyDone = state.savingsAddedMonth === curPeriod;
      const promptMsg = alreadyDone
        ? `Tu as déjà ajouté ton épargne fixe sur cette période. Ajouter encore ${formatEur(fixedSavings)} à ton patrimoine ?`
        : `Ajouter ton épargne fixe (${formatEur(fixedSavings)}) à ton patrimoine ?`;
      if (fixedSavings > 0 && confirm(promptMsg)) {
        state.patrimoine = round2((Number(state.patrimoine) || 0) + fixedSavings);
        state.savingsAddedMonth = curPeriod;
        if (!Array.isArray(state.history)) state.history = [];
        const noteLabel = parseLocalIso(curPeriod)
          ? `Depuis le ${formatShortDate(curPeriod + 'T12:00:00')}`
          : formatMonthLabel(curPeriod);
        const logEntry = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          isFixedSavingsTransfer: true,
          month: curPeriod,
          postName: 'Épargne fixe → Patrimoine',
          amount: fixedSavings,
          note: noteLabel,
          date: new Date().toISOString()
        };
        state.history.push(logEntry);
        lastAction = {
          logId: logEntry.id,
          amount: fixedSavings,
          name: 'Patrimoine'
        };
        saveState();
        syncPatrimoineInput();
        renderDerivedNumbers();
        showToast(`+${formatEur(fixedSavings)} ajoutés au patrimoine ✓`);
      }
    } else if (data.look) {
      setTheme(data.look);
    } else if (btn.id === 'exportJson') {
      const todayStr = todayIso();
      state.lastExport = todayStr;
      saveState();
      renderBackupHint();
      const payload = Object.assign({ theme: currentTheme }, state);
      deliverFile(
        JSON.stringify(payload, null, 2),
        `mon-plan-finance-${todayStr}.json`,
        'application/json'
      );
    } else if (btn.id === 'importBtn') {
      $('imp').click();
    } else if (btn.id === 'resetBtn') {
      if (confirm('Tout effacer et revenir aux valeurs de départ ?')) {
        state = clone(DEFAULT_STATE);
        lastAction = null;
        openEnvelopeId = null;
        overdraftOpen = false;
        logFilter = 'all';
        saveState();
        syncPatrimoineInput();
        syncPatrimoineGoalInput();
        renderBudgetLists();
        showToast('Application réinitialisée');
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const m = $('appMenu');
      if (m && !m.hidden) setMenuOpen(false);
      if (overdraftOpen) {
        overdraftOpen = false;
        renderMoisView();
      }
    }
  });

  // --- Saisies en direct ---
  document.addEventListener('input', (event) => {
    const el = event.target;
    if (el.dataset.edit) {
      const [listName, id, field] = el.dataset.edit.split('|');
      const item = findItem(listName, id);
      if (!item) return;
      item[field] = field === 'amount' ? Math.max(0, round2(parseAmount(el.value))) : el.value;
      saveState();
      renderDerivedNumbers();
    } else if (el.id === 'f-n' && !fixGroupManual) {
      const val = el.value.trim();
      if (val) {
        const guessed = inferFixedGroup(val);
        if (guessed !== selectedFixGroup) {
          selectedFixGroup = guessed;
          renderFixGroupChips();
        }
      }
    } else if (el.id === 'patri') {
      state.patrimoine = Math.max(0, round2(parseAmount(el.value)));
      saveState();
      renderDerivedNumbers();
    } else if (el.id === 'patriGoal') {
      state.patrimoineGoal = Math.max(0, round2(parseAmount(el.value)));
      saveState();
      renderDerivedNumbers();
    }
  });

  document.addEventListener('change', (event) => {
    const el = event.target;
    if (el.id === 'imp') {
      const file = el.files && el.files[0];
      el.value = '';
      if (file) importJSON(file);
    } else if (el.dataset && el.dataset.editGroup) {
      const [listName, id] = el.dataset.editGroup.split('|');
      const item = findItem(listName, id);
      const nextGroup = el.value;
      if (item && FIXED_GROUP_KEYS.includes(nextGroup)) {
        item.group = nextGroup;
        collapsedFixedGroups.delete(nextGroup);
        saveState();
        renderBudgetLists();
        showToast(`${item.name} → ${FIXED_GROUP_MAP[nextGroup].label}`);
      }
    }
  });

  document.addEventListener('focusout', (event) => {
    const el = event.target;
    if (el.dataset && el.dataset.edit && el.dataset.edit.endsWith('|amount')) {
      el.value = formatInputAmount(parseAmount(el.value));
    } else if (el.id === 'patri') {
      syncPatrimoineInput();
    } else if (el.id === 'patriGoal') {
      syncPatrimoineGoalInput();
    }
  });

  // Validation clavier dans l'ajout de dépense
  $('addForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const envelopes = getDailyEnvelopes();
    if (envelopes.length === 1) {
      addDailyExpense(envelopes[0].id);
    } else if (parseAmount($('addAmt').value) > 0) {
      $('addAmt').blur();
      $('addNote').blur();
    }
  });

  // Validation du découvert mensuel
  if ($('overdraftEdit')) {
    $('overdraftEdit').addEventListener('submit', (event) => {
      event.preventDefault();
      const val = round2(Math.abs(parseAmount($('overdraftIn').value)));
      state.overdraft = val;
      overdraftOpen = false;
      $('overdraftIn').blur();
      saveState();
      renderDerivedNumbers();
      showToast(val > 0 ? `Découvert de ${formatEur(val)} déduit ✓` : 'Découvert remis à 0 €');
    });
  }

  // Formulaires d'ajout dans Budget
  $('varExpForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('v-n').value.trim();
    const amount = Math.max(0, round2(parseAmount($('v-a').value)));
    if (!name) return;
    state.expenses.push({ id: Date.now(), name, category: DAILY_CATEGORY, amount, real: 0 });
    $('v-n').value = '';
    $('v-a').value = '';
    saveState();
    renderBudgetLists();
  });

  $('fixExpForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('f-n').value.trim();
    const amount = Math.max(0, round2(parseAmount($('f-a').value)));
    if (!name) return;
    const group = FIXED_GROUP_KEYS.includes(selectedFixGroup) ? selectedFixGroup : inferFixedGroup(name);
    state.expenses.push({ id: Date.now(), name, category: FIXED_CATEGORY, group, amount });
    collapsedFixedGroups.delete(group);
    $('f-n').value = '';
    $('f-a').value = '';
    fixGroupManual = false;
    saveState();
    renderBudgetLists();
    showToast(`${name} · ${FIXED_GROUP_MAP[group].label} ✓`);
  });

  if ($('savExpForm')) {
    $('savExpForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const name = $('s-n').value.trim();
      const amount = Math.max(0, round2(parseAmount($('s-a').value)));
      if (!name) return;
      state.expenses.push({ id: Date.now(), name, category: SAVINGS_CATEGORY, amount });
      $('s-n').value = '';
      $('s-a').value = '';
      saveState();
      renderBudgetLists();
      showToast(`${name} ajouté en Épargne ✓`);
    });
  }

  $('incForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('i-n').value.trim();
    const amount = Math.max(0, round2(parseAmount($('i-a').value)));
    if (!name) return;
    state.incomes.push({ id: Date.now(), name, amount });
    $('i-n').value = '';
    $('i-a').value = '';
    saveState();
    renderBudgetLists();
  });

  // --- Démarrage ---
  renderHeaderDate();
  syncPatrimoineInput();
  syncPatrimoineGoalInput();
  const initialHashTab = (location.hash || '').replace('#', '');
  goToTab(TABS.includes(initialHashTab) ? initialHashTab : 'mois');

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      renderHeaderDate();
      renderDerivedNumbers();
    }
  });
})();
