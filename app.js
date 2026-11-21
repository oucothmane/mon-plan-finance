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

  // Les dépenses suivies au quotidien ont la catégorie « Vie courante & Sorties »
  // Toutes les autres sont des charges fixes mensuelles.
  const DAILY_CATEGORY = 'Vie courante & Sorties';
  const FIXED_CATEGORY = 'Fixes & Logement';

  const TAB_TITLES = {
    mois: 'Mes dépenses',
    budget: 'Mon budget',
    epargne: 'Mon épargne',
    reglages: 'Réglages'
  };

  const TABS = Object.keys(TAB_TITLES);

  const DEFAULT_STATE = {
    patrimoine: 5000,
    epargneAsFixedMigrated: true,
    incomes: [
      { id: 1, name: 'Salaire', amount: 2000 }
    ],
    expenses: [
      { id: 101, name: 'Loyer', category: FIXED_CATEGORY, amount: 700 },
      { id: 102, name: 'Épargne', category: FIXED_CATEGORY, amount: 690 },
      { id: 103, name: 'Transports', category: FIXED_CATEGORY, amount: 80 },
      { id: 104, name: 'Téléphone & Internet', category: FIXED_CATEGORY, amount: 50 },
      { id: 105, name: 'Salle de sport', category: FIXED_CATEGORY, amount: 30 },
      { id: 106, name: 'Courses', category: DAILY_CATEGORY, amount: 300, real: 0 },
      { id: 107, name: 'Sorties & Resto', category: DAILY_CATEGORY, amount: 150, real: 0 }
    ],
    history: []
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

  function formatShortDate(isoString) {
    try {
      const d = isoString ? new Date(isoString) : new Date();
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } catch (e) {
      return '';
    }
  }

  function isSavingsExpense(item) {
    if (!item || item.category === DAILY_CATEGORY) return false;
    return /épargne|epargne|livret|pea|invest|côté|cote/i.test(item.name || '');
  }

  // ==========================================================================
  // 3. ÉTAT DE L'APPLICATION (LOCALSTORAGE)
  // ==========================================================================

  let state = loadState();
  let currentTab = 'mois';
  let openEnvelopeId = null;
  let lastAction = null;
  let monthBannerDismissed = false;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.incomes) && Array.isArray(saved.expenses)) {
        const merged = Object.assign(clone(DEFAULT_STATE), saved);
        if (!Array.isArray(merged.history)) merged.history = [];
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
              category: FIXED_CATEGORY,
              amount: unallocated
            });
          }
          merged.epargneAsFixedMigrated = true;
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

  function getFixedExpenses() {
    return state.expenses.filter((x) => x.category !== DAILY_CATEGORY);
  }

  function getFixedSavingsAmount() {
    return sumAmounts(getFixedExpenses().filter(isSavingsExpense));
  }

  function findItem(listName, id) {
    return state[listName].find((x) => String(x.id) === String(id));
  }

  function syncPatrimoineInput() {
    if ($('patri')) $('patri').value = formatInputAmount(state.patrimoine);
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
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const todayNum = now.getDate();
    const monthPace = todayNum / daysInMonth;
    const daysRemaining = Math.max(1, daysInMonth - todayNum + 1);

    if (!state.month) {
      state.month = yearMonth(now);
      saveState();
    }

    const envelopes = getDailyEnvelopes();
    const plannedDaily = sumAmounts(envelopes);
    const spentDaily = envelopes.reduce((acc, x) => acc + (Number(x.real) || 0), 0);
    const remainingDaily = round2(plannedDaily - spentDaily);

    if (state.month !== yearMonth(now) && spentDaily === 0 && (!state.history || !state.history.length)) {
      state.month = yearMonth(now);
      saveState();
    }

    const showMonthBanner = state.month !== yearMonth(now) && !monthBannerDismissed;
    $('monthBanner').hidden = !showMonthBanner;
    if (showMonthBanner) {
      const monthName = now.toLocaleDateString('fr-FR', { month: 'long' });
      $('monthTitle').textContent = `Nouveau mois (${monthName})`;
    }

    const globalStatus = getPaceStatus(spentDaily, plannedDaily, monthPace);
    $('leftLab').textContent = globalStatus.level === 'bad' ? 'Dépassé de' : 'Reste à dépenser ce mois';
    $('leftBig').textContent = formatEur(Math.abs(remainingDaily));
    $('leftBig').className = 'big' + (globalStatus.level === 'bad' ? ' bad' : '');
    $('dayPill').textContent = `J${todayNum}/${daysInMonth}`;

    $('allMeter').className =
      'meter' +
      (globalStatus.level === 'bad' ? ' is-bad' : globalStatus.level === 'warn' ? ' is-warn' : '');
    $('allMeter').firstElementChild.style.width =
      (plannedDaily > 0 ? Math.min(100, (spentDaily / plannedDaily) * 100) : 0) + '%';
    $('allMeter').lastElementChild.style.left = monthPace * 100 + '%';

    if (!envelopes.length) {
      $('allLine').textContent = 'Ajoute un poste dans l’onglet Budget pour commencer.';
    } else if (remainingDaily > 0) {
      const perDay = Math.floor(remainingDaily / daysRemaining);
      $('allLine').innerHTML = `Soit <b>~${formatEur(perDay)} / jour</b> · ${formatEur(spentDaily)} utilisés sur ${formatEur(plannedDaily)}`;
    } else if (Math.abs(remainingDaily) < 0.005) {
      $('allLine').innerHTML = `Balance du mois à <b>0 €</b> · ${formatEur(plannedDaily)} répartis`;
    } else {
      $('allLine').innerHTML = `<b>${formatEur(spentDaily)}</b> dépensés sur ${formatEur(plannedDaily)} prévus`;
    }

    const transferMoisBtn = $('transferRemMoisBtn');
    if (transferMoisBtn) {
      if (remainingDaily > 0) {
        transferMoisBtn.hidden = false;
        transferMoisBtn.textContent = `+ Mettre le reste (${formatEur(remainingDaily)}) dans Patrimoine → 0 €`;
      } else {
        transferMoisBtn.hidden = true;
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
    const hasActivity = history.length > 0 || spentDaily > 0;
    $('monthLogCard').hidden = !hasActivity;
    $('logCount').textContent = history.length
      ? `${history.length} opération${history.length > 1 ? 's' : ''}`
      : 'Remise à zéro';

    $('monthLogList').innerHTML = history
      .slice()
      .reverse()
      .map((entry) => {
        const noteHtml = entry.note ? ` <span>· ${escapeHtml(entry.note)}</span>` : '';
        const amtPrefix = entry.isPatrimoineTransfer ? '+' : '−';
        const amtClass = entry.isPatrimoineTransfer ? 'log-amt pos' : 'log-amt';
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

  function renderBudgetLists() {
    const dailyList = getDailyEnvelopes();
    const fixedList = getFixedExpenses();

    $('dailyExpensesList').innerHTML =
      dailyList.map((x) => buildSimpleRowHtml('expenses', x)).join('') ||
      '<p class="hint">Aucun poste quotidien.</p>';

    $('fixedExpensesList').innerHTML =
      fixedList.map((x) => buildSimpleRowHtml('expenses', x)).join('') ||
      '<p class="hint">Aucune charge fixe.</p>';

    $('incomes').innerHTML =
      state.incomes.map((x) => buildSimpleRowHtml('incomes', x)).join('') ||
      '<p class="hint">Aucun revenu.</p>';

    renderDerivedNumbers();
  }

  function renderDerivedNumbers() {
    const totalIncome = sumAmounts(state.incomes);
    const dailyEnvelopes = getDailyEnvelopes();
    const fixedExpenses = getFixedExpenses();

    const totalDailyPlanned = sumAmounts(dailyEnvelopes);
    const totalFixedPlanned = sumAmounts(fixedExpenses);
    const totalOutPlanned = round2(totalDailyPlanned + totalFixedPlanned);
    const budgetBalance = round2(totalIncome - totalOutPlanned);

    const fixedSavings = getFixedSavingsAmount();
    const savingsPct = totalIncome > 0 ? Math.round((fixedSavings / totalIncome) * 100) : 0;

    const totalDailySpent = dailyEnvelopes.reduce((a, x) => a + (Number(x.real) || 0), 0);
    const remainingDaily = round2(totalDailyPlanned - totalDailySpent);

    // Onglet Budget : Entrées − Sorties = Balance (objectif : 0 €)
    $('b-in').textContent = formatEur(totalIncome);
    $('b-out').textContent = formatEur(totalOutPlanned);

    const balBtn = $('balanceToZeroBtn');
    if (Math.abs(budgetBalance) < 0.005) {
      $('b-bal').textContent = formatEur(0);
      $('b-bal').className = 'pos';
      if (balBtn) balBtn.hidden = true;
    } else if (budgetBalance > 0) {
      $('b-bal').textContent = '+' + formatEur(budgetBalance);
      $('b-bal').className = 'warn';
      if (balBtn) {
        balBtn.hidden = false;
        balBtn.textContent = `+ Mettre ces ${formatEur(budgetBalance)} en Épargne fixe (Balance → 0 €)`;
      }
    } else {
      $('b-bal').textContent = formatEur(budgetBalance);
      $('b-bal').className = 'bad';
      const savItem = fixedExpenses.find(isSavingsExpense);
      if (balBtn && savItem && savItem.amount >= Math.abs(budgetBalance)) {
        balBtn.hidden = false;
        balBtn.textContent = `Ajuster l’Épargne fixe (${formatEur(budgetBalance)}) pour rester à 0 €`;
      } else if (balBtn) {
        balBtn.hidden = true;
      }
    }

    $('varTotal').textContent = formatEur(totalDailyPlanned);
    $('fixTotal').textContent = formatEur(totalFixedPlanned);
    $('incTotal').textContent = formatEur(totalIncome);

    // Onglet Épargne : Épargne fixe + Reste du mois + Patrimoine
    $('s-monthly').textContent = `${formatEur(fixedSavings)} / mois`;
    $('s-monthly').className = 'big ' + (fixedSavings > 0 ? 'pos' : '');
    if ($('s-pctPill')) {
      const showPct = totalIncome > 0 && fixedSavings > 0;
      $('s-pctPill').hidden = !showPct;
      if (showPct) $('s-pctPill').textContent = `${savingsPct} %`;
    }
    $('s-rate').textContent =
      totalIncome > 0 && fixedSavings > 0
        ? `Inclus dans tes Charges fixes · ${savingsPct} % de tes revenus`
        : 'Ajoute une ligne « Épargne » dans tes Charges fixes (onglet Budget)';

    $('s-real').textContent = formatEur(Math.max(0, remainingDaily));
    $('s-real').className = remainingDaily > 0 ? 'pos' : '';

    const yearlySavings = Math.max(0, fixedSavings * 12);
    $('s-year').textContent = `+ ${formatEur(yearlySavings)} / an`;

    const addRemBtn = $('addRemToPatriBtn');
    if (addRemBtn) {
      if (remainingDaily > 0) {
        addRemBtn.hidden = false;
        addRemBtn.textContent = `+ Ajouter le reste du mois (${formatEur(remainingDaily)}) au patrimoine → 0 €`;
      } else {
        addRemBtn.hidden = true;
      }
    }

    const addSavBtn = $('addSavToPatriBtn');
    if (fixedSavings > 0) {
      addSavBtn.hidden = false;
      addSavBtn.textContent = `+ Ajouter mon épargne fixe (${formatEur(fixedSavings)}) au patrimoine`;
    } else {
      addSavBtn.hidden = true;
    }

    const livingExpenses = round2(totalOutPlanned - fixedSavings);
    const refExpenses = livingExpenses > 0 ? livingExpenses : totalOutPlanned;
    const safetyMonths = refExpenses > 0 ? state.patrimoine / refExpenses : 0;
    $('k-mat').textContent = safetyMonths.toFixed(1).replace('.', ',') + ' mois';
    $('k-mat').className = safetyMonths >= 3 ? 'pos' : safetyMonths >= 1 ? 'warn' : 'bad';
    if ($('matMeter')) {
      const pct = Math.min(100, Math.max(0, (safetyMonths / 6) * 100));
      $('matMeter').className =
        'meter' + (safetyMonths < 1 ? ' is-bad' : safetyMonths < 3 ? ' is-warn' : '');
      $('matMeter').firstElementChild.style.width = pct + '%';
    }

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
    const spentDaily = envelopes.reduce((a, x) => a + (Number(x.real) || 0), 0);
    const remainingDaily = round2(plannedDaily - spentDaily);

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

  function balanceBudgetToZero() {
    const totalIncome = sumAmounts(state.incomes);
    const totalOut = sumAmounts(state.expenses);
    const diff = round2(totalIncome - totalOut);
    if (Math.abs(diff) < 0.005) return;

    let savItem = getFixedExpenses().find(isSavingsExpense);
    if (savItem) {
      savItem.amount = Math.max(0, round2((Number(savItem.amount) || 0) + diff));
    } else if (diff > 0) {
      state.expenses.unshift({
        id: Date.now(),
        name: 'Épargne',
        category: FIXED_CATEGORY,
        amount: diff
      });
    }
    saveState();
    renderBudgetLists();
    showToast('Balance équilibrée à 0 € ✓');
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

  function resetMonthCounters() {
    state.expenses.forEach((x) => {
      x.real = 0;
    });
    state.history = [];
    state.month = yearMonth(new Date());
    lastAction = null;
    openEnvelopeId = null;
    saveState();
    renderDerivedNumbers();
    showToast('Compteurs du mois remis à zéro');
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
        if (!Array.isArray(state.history)) state.history = [];
        lastAction = null;
        openEnvelopeId = null;
        monthBannerDismissed = false;

        if (importedTheme === 'light' || importedTheme === 'dark' || importedTheme === 'auto') {
          setTheme(importedTheme);
        }
        saveState();
        syncPatrimoineInput();
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
    } else if (btn.id === 'newMonthBtn') {
      if (confirm('Remettre toutes les dépenses du mois à zéro ?')) {
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
        saveState();
        renderBudgetLists();
        showToast(`${item.name} supprimé`);
      }
    } else if (btn.id === 'transferRemMoisBtn' || btn.id === 'addRemToPatriBtn') {
      transferRemainderToPatrimoine();
    } else if (btn.id === 'balanceToZeroBtn') {
      balanceBudgetToZero();
    } else if (btn.id === 'addSavToPatriBtn') {
      const fixedSavings = getFixedSavingsAmount();
      if (fixedSavings > 0 && confirm(`Ajouter ton épargne fixe (${formatEur(fixedSavings)}) à ton patrimoine ?`)) {
        state.patrimoine = round2((Number(state.patrimoine) || 0) + fixedSavings);
        saveState();
        syncPatrimoineInput();
        renderDerivedNumbers();
        showToast(`+${formatEur(fixedSavings)} ajoutés au patrimoine ✓`);
      }
    } else if (data.look) {
      setTheme(data.look);
    } else if (btn.id === 'exportJson') {
      const todayStr = `${yearMonth(new Date())}-${pad2(new Date().getDate())}`;
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
        saveState();
        syncPatrimoineInput();
        renderBudgetLists();
        showToast('Application réinitialisée');
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
    } else if (el.id === 'patri') {
      state.patrimoine = Math.max(0, round2(parseAmount(el.value)));
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
    }
  });

  document.addEventListener('focusout', (event) => {
    const el = event.target;
    if (el.dataset && el.dataset.edit && el.dataset.edit.endsWith('|amount')) {
      el.value = formatInputAmount(parseAmount(el.value));
    } else if (el.id === 'patri') {
      syncPatrimoineInput();
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
    state.expenses.push({ id: Date.now(), name, category: FIXED_CATEGORY, amount });
    $('f-n').value = '';
    $('f-a').value = '';
    saveState();
    renderBudgetLists();
  });

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
  const rawDate = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  $('date').textContent = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  syncPatrimoineInput();
  const initialHashTab = (location.hash || '').replace('#', '');
  goToTab(TABS.includes(initialHashTab) ? initialHashTab : 'mois');

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      renderMoisView();
    }
  });
})();
