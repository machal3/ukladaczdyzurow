import { dateKey, daysInMonth, weekday, limitDay, shiftsForDay, scoreMonth, PRIORITIES, PRIORITY_ORDER, availOf, breaksRule, LEVELS, ROLES, roleOf, badOf, BAD, history, parseTable, matchPerson, personLog, PAST_WEIGHT, listPeople, missedWishes, lastResortDays, sandwichDays, thuSunDays, monthStats, limitClash } from './scheduler.js';
import { runScheduler } from './scheduler-client.js';
import { cloudLoad, cloudSave, cloudLogout, cloudRpc, cloudReload, ZAPISY_URL } from './cloud.js';
import { pdf, docx } from './export.js';

const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const STORE = 'dyzury-v1';
const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/></svg>'; // Lucide „sliders-horizontal” = limity i prośby osoby
const COG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>'; // Lucide „settings” = ustawienia osoby
const CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>'; // jak „Dostępność” w oknie osoby
const HIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>'; // Lucide „history” = historia dyżurów
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'; // jak w chipach filtrów
const CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const WEEKEND_LIMIT = 2; // domyślny limit dyżurów Pt/So/Nd w miesiącu, gdy osoba nie ustawiła własnego

const SHIFT_ORDER = ['OITN', 'PN2', 'PN1'];
const shiftRank = (s) => { const i = SHIFT_ORDER.indexOf(s.name.trim().toUpperCase()); return i < 0 ? SHIFT_ORDER.length : i; };
const cloud = await cloudLoad(); // null = tryb lokalny (tylko localStorage)
let state = cloud?.data ?? load() ?? {
  people: ['Anna Kowalska', 'Jan Nowak', 'Piotr Wiśniewski', 'Maria Zając', 'Tomasz Lis'].map(person),
  shifts: [
    { id: uid(), name: 'OITN', days: [0, 1, 2, 3, 4, 5, 6] },
    { id: uid(), name: 'PN2', days: [0, 1, 2, 3, 4, 5, 6] },
    { id: uid(), name: 'PN1', days: [0, 1, 2, 3, 4, 5, 6] },
  ],
  schedule: {}, // { 'YYYY-MM-DD': { shiftId: personId } }
  manual: {},   // ręczne przypisania — zachowane przy ponownym układaniu
};
migrate();
// domyślne pola i migracje zapisanych danych — po wczytaniu i po odświeżeniu z chmury (reload)
function migrate() {
  state.avail ??= {}; // { personId: { 'YYYY-MM-DD': poziom 0-4 } } — patrz LEVELS
  state.stamps ??= {}; // { personId: czas ISO } — ostatnia zmiana osoby w Zapisach; stawia tylko serwer, klient odsyła bez zmian (patrz save_state)
  state.limits ??= {}; // { personId: { shiftId: maks. dyżurów w miesiącu, '*': maks. łącznie, we: maks. Pt/So/Nd, d56: maks. So + Nd łącznie } } — brak = bez limitu (we: WEEKEND_LIMIT)
  state.mins ??= {}; // { personId: { shiftId / d4-d6 / d56 / we / '*': minimum dyżurów w miesiącu } } — idzie do generateMonth jako limits[pid].min
  state.wants ??= {}; // { personId: { shiftId / d4-d6 / d56 / we / '*': ile dyżurów chce w miesiącu } } — prośby, miękkie (patrz generateMonth)
  // korekty administratora w trybie Zapisów — obok wpisów osoby (avail/wants), wygrywają przy układaniu; osoba ich nie widzi (osoba_load ich nie wysyła)
  state.availAdm ??= {}; // { personId: { 'YYYY-MM-DD': poziom 0-4 } }
  state.wantsAdm ??= {}; // { personId: { klucz jak w wants: liczba } }
  state.gotowe ??= {}; // { 'YYYY-MM': true } — grafik gotowy: widzą go osoby w Zapisach, „Ułóż miesiąc” zablokowany
  state.uwagi ??= {}; // { personId: { 'YYYY-MM': komentarz osoby z Zapisów (zwykły tekst, ≤ 500 znaków) } }
  state.bad ??= {}; // { 'YYYY-MM-DD': gównianość 0-3 } — patrz BAD/badOf; osoba: person.past 0-3
  state.asDay ??= {}; // { 'YYYY-MM-DD': 0-6 } — dzień liczony do limitów i próśb jak inny dzień tygodnia (patrz limitDay)
  state.rules ??= []; // [{ id, who, with, places: [shiftId] }] — patrz breaksRule
  state.priority = [...new Set([...(state.priority ?? []), ...PRIORITY_ORDER])].filter((k) => k in PRIORITIES); // kolejność kryteriów układania
  state.aliases ??= {}; // { 'imię z importowanej tabeli' (małe litery): personId } — zapamiętane połączenia z importu
  for (const p of state.people) p.prestige ??= 1; // 0 = Rezydent, 1–2 = Starszy asystent, p.boss = Kierownik — patrz ROLES/roleOf; p.gone = usunięta (zostaje dla przeszłych dyżurów)
  // jednorazowa migracja zapisanych danych: stare domyślne miejsca → OITN, PN1, PN2 (id zostają, więc grafik i limity też)
  if (!state.miejscaV2) {
    const rename = { 'Oddział': 'OITN', 'SOR': 'PN1' };
    for (const s of state.shifts) s.name = rename[s.name] ?? s.name;
    for (const name of ['OITN', 'PN1', 'PN2'])
      if (!state.shifts.some((s) => s.name === name)) state.shifts.push({ id: uid(), name, days: [0, 1, 2, 3, 4, 5, 6] });
    state.miejscaV2 = true;
    save();
  }
  // kolejność miejsc w całym interfejsie (i w Zapisach — osoba_load wysyła je w tej kolejności): SHIFT_ORDER, inne za nimi
  state.shifts.sort((a, b) => shiftRank(a) - shiftRank(b));
}
if (cloud && !cloud.data) save();
const zapisy = !!(cloud && ZAPISY_URL); // Zapisy na dyżury: karta w oknie osoby, wiersz w ustawieniach, pole „otwarte od” // pusta chmura → wysyłamy to, co było w tej przeglądarce
const now = new Date();
const next = new Date(now.getFullYear(), now.getMonth() + 1); // start na następnym miesiącu
let view = { y: next.getFullYear(), m: next.getMonth(), who: null, bad: false, q: '', role: null, none: false, sort: 'surname' }; // who: osoba, której dostępność edytujemy; bad: tryb oceny gównianości dni; q/role/none/sort: szukanie, filtry i sortowanie w zakładce Osoby (patrz listPeople)
let prevWho = null; // tryb sprzed otwarcia okna osoby
let personPart = 'settings'; // okno osoby: 'settings' (funkcja, komentarze, konto) albo 'limits' (miejsca, min./limit/prośba)
let back = 'settings'; // karta, na którą wraca „Gotowe” — ta, z której włączono tryb
let generation = null;
let brush = { avail: null, bad: null }; // pędzel w pasku #status (null = po kolei), patrz $('#calendar').onclick
const WANT_LABEL = { '*': 'łącznie', we: 'Pt/So/Nd', d56: 'So + Nd', d4: 'piątki', d5: 'soboty', d6: 'niedziele' }; // reszta = nazwa miejsca
const stopGeneration = () => {
  if (!generation) return;
  generation.controller.abort();
  generation = null;
  syncReady();
  $('#cancel-generate').hidden = true;
  $('#generation-status').textContent = 'Układanie anulowane. Grafik pozostaje bez zmian.';
};

// „Gotowe” publikuje oglądany miesiąc (Zapisy pokazują osobom tylko gotowe miesiące) i blokuje „Ułóż miesiąc”.
// ponytail: ręczne poprawki gotowego miesiąca dalej działają i osoby widzą je od razu
const monthKeyOf = () => dateKey(view.y, view.m, 1).slice(0, 7);
function syncReady() {
  const ready = !!state.gotowe[monthKeyOf()];
  $('#generate').disabled = !!generation || ready;
  $('#generate').title = ready ? 'Grafik jest gotowy — najpierw „Cofnij gotowość”' : 'Ułóż automatycznie cały miesiąc (ręczne dyżury zostają)';
  $('#publish').disabled = !!generation;
  $('#publish').setAttribute('aria-pressed', ready);
  $('#publish span').textContent = ready ? 'Cofnij gotowość' : 'Gotowe';
  $('#publish').title = ready ? 'Cofnij gotowość — grafik wróci do edycji' : 'Gotowe — grafik widzą osoby w Zapisach; „Ułóż miesiąc” jest wtedy zablokowany';
}

function uid() { return Math.random().toString(36).slice(2, 10); }
function person(name) { return { id: uid(), name, prestige: 1 }; }
function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }
function save() { const json = JSON.stringify(state); try { localStorage.setItem(STORE, json); } catch {} cloudSave(json); }
const $ = (s) => document.querySelector(s);
const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const monthKeys = () => Array.from({ length: daysInMonth(view.y, view.m) }, (_, i) => dateKey(view.y, view.m, i + 1));
const dyzury = (n) => `${n} ${n === 1 ? 'dyżur' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'dyżury' : 'dyżurów'}`;
const team = () => state.people.filter((p) => !p.gone); // aktywne osoby
const sameName = (a, b) => a.localeCompare(b, 'pl', { sensitivity: 'base' }) === 0;
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
let statsWho = null, statDetail = {}; // osoba w oknie #pstat i treść okien z ostatniego renderStats
// Dostępność i prośby do układania i podglądu: wpis osoby, na nim korekta administratora (patrz availAdm/wantsAdm)
const over = (own, adm) => Object.fromEntries([...new Set([...Object.keys(own), ...Object.keys(adm)])].map((pid) => [pid, { ...own[pid], ...adm[pid] }]));
const effAvail = () => over(state.avail, state.availAdm);
const effWants = () => over(state.wants, state.wantsAdm);
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k]).map((k) => [k, obj[k]]));

function render() {
  const { y, m } = view;
  if (generation && (generation.y !== y || generation.m !== m)) stopGeneration();
  const monthName = new Date(y, m).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  $('#month-label').textContent = monthName;
  $('#today').classList.toggle('here', y === now.getFullYear() && m === now.getMonth());
  syncReady();

  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const nameOf = Object.fromEntries(state.people.map((p) => [p.id, p.name]));
  const av = effAvail();

  const dayNames = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
  let html = dayNames.map((d) => `<div class="dow">${d}</div>`).join('');
  html += '<div class="cell empty"></div>'.repeat(weekday(y, m, 1));
  let empty = 0, slots = 0;
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(y, m, d);
    const day = state.schedule[key] || {};
    const lvl = view.who && availOf(av, view.who, key);
    const b = badOf(state.bad, y, m, d);
    const as = limitDay(state.asDay, y, m, d), moved = as !== weekday(y, m, d); // dzień liczony do limitów jak inny
    const rows = view.bad ? `<button class="avail ${['lvl-2', 'lvl-1', 'lvl-0', 'bad-3'][b]}" data-bad="${d}">${BAD[b]}</button>` +
      `<select data-as-day="${key}" aria-label="${d} ${monthName}: limity i prośby liczone jak dzień">${DAYS.map((n, i) => `<option value="${i}" ${i === as ? 'selected' : ''}>${i === weekday(y, m, d) ? `Limity: zwykły ${n}` : `Limity jak ${n}`}</option>`).join('')}</select>` :
      view.who ? availButton(key, lvl) :
      shiftsForDay(state.shifts, y, m, d).map((s) => {
      const pid = nameOf[day[s.id]] ? day[s.id] : '';
      slots++;
      if (!pid) empty++;
      const manual = state.manual[key]?.[s.id] ? 'manual' : '';
      const why = !pid ? '' : availOf(av, pid, key) === 0 ? ' — ta osoba nie może tego dnia' :
        state.limits[pid]?.[s.id] === 0 ? ' — ta osoba nie dyżuruje na tym miejscu' :
        state.limits[pid]?.[`d${as}`] === 0 ? ' — ta osoba nie dyżuruje w ten dzień tygodnia' :
        breaksRule(state.rules, day, pid, s.id) ? ' — łamie warunek' : '';
      const clash = why && 'clash';
      const pref = pid ? ` — ${LEVELS[availOf(av, pid, key)]}` : ''; // dostępność osoby tego dnia: kropka przed imieniem
      return `<label class="slot ${pid ? '' : 'unfilled'} ${manual} ${clash}" title="${esc(s.name)}${pid ? ` — ${esc(nameOf[pid])}${pref}` : ' — wybierz osobę'}${manual && ' — wpisany ręcznie'}${why}">
        <span class="slot-label">${esc(s.name)}</span>
        <span class="slot-name" aria-hidden="true">${pid ? `<i class="avail-dot avail-dot-${availOf(av, pid, key)}"></i>${esc(nameOf[pid])}` : 'Wybierz osobę'}</span>
        <input data-key="${key}" data-shift="${s.id}" value="${pid ? esc(nameOf[pid]) : ''}" placeholder="—" autocomplete="off" role="combobox" aria-controls="picker" aria-label="${esc(s.name)}, ${d} ${monthName}${pref}">
      </label>`;
    }).join('');
    html += `<div class="cell burden-${b} ${key === todayKey ? 'today' : ''}">
      <div class="day-heading"><div class="num" aria-label="${dayNames[weekday(y, m, d)]}, ${d} ${monthName} — ${BAD[b]}">${d}</div><span class="day-name">${dayNames[weekday(y, m, d)]}</span>${moved ? `<span class="as-label" title="Limity i prośby liczone jak ${dayNames[as].toLowerCase()}">jak ${DAYS[as]}</span>` : ''}${key === todayKey ? '<span class="today-label">Dzisiaj</span>' : ''}</div><div class="day-slots">${rows}</div></div>`;
  }
  html += '<div class="cell empty"></div>'.repeat((7 - (weekday(y, m, 1) + daysInMonth(y, m)) % 7) % 7); // domknięcie ostatniego tygodnia
  $('#calendar').innerHTML = html;

  // Wydruk (pionowo, jedna kartka): dzień pod dniem, miejsca w kolumnach — widoczny tylko w @media print
  const { title, cols, rows: sheetRows } = sheet();
  $('#print-sheet').innerHTML = `<h2>${esc(title)}</h2><table><colgroup><col class="c-d"><col class="c-wd"></colgroup><thead><tr><th colspan="2">Dzień</th>${cols.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>` +
    sheetRows.map((r) => `<tr class="${r.wd >= 5 ? 'we' : ''} ${r.wd === 0 ? 'mon' : ''}"><td class="d">${r.d}</td><td class="wd">${DAYS[r.wd]}</td>${r.names.map((n) =>
      `<td>${n === '' ? '' : n ? esc(n) : '<span class="none">—</span>'}</td>`).join('')}</tr>`).join('') + '</tbody></table>';

  // Statystyki miesiąca
  const count = Object.fromEntries(team().map((p) => [p.id, 0]));
  for (const k of monthKeys()) for (const pid of Object.values(state.schedule[k] || {})) if (pid in count) count[pid]++;
  const shown = listPeople(team(), count, view), filtered = view.q.trim() || view.role || view.none;
  // podświetlony przycisk = to, co jest otwarte: tryb dostępności albo okno osoby (⚙ ustawienia / „Limity”)
  const on = (id) => id === view.who && !$('#person').open, open = (id, part) => id === view.who && $('#person').open && personPart === part;
  $('#people').innerHTML = shown.map((p) => `<li class="${on(p.id) ? 'on' : ''}">
      <span class="avatar ${p.prestige ? '' : 'rez'}" aria-hidden="true">${esc(initials(p.name))}</span>
      <span class="id"><button class="who ${on(p.id) ? 'on' : ''}" data-who="${p.id}" aria-pressed="${on(p.id)}" title="Dostępność w grafiku">${esc(p.name)}</button><span class="sub">${ROLES[roleOf(p)]}${hasFixes(p.id) ? ' · <span class="fix-tag" title="Masz korekty dostępności (ten miesiąc) lub próśb tej osoby — osoba ich nie widzi">korekty</span>' : ''}</span></span>
      <button class="x" data-del-person="${p.id}" aria-label="Usuń ${esc(p.name)}">×</button>
      <span class="foot"><span class="icons"><button class="edit icon" data-who="${p.id}" aria-pressed="${on(p.id)}" aria-label="Dostępność: ${esc(p.name)}" title="Dostępność w grafiku">${CAL}</button>
      <button class="edit icon" data-edit="${p.id}" aria-pressed="${open(p.id, 'settings')}" aria-label="Ustawienia: ${esc(p.name)}" title="Ustawienia: funkcja, kanapka, komentarze, konto w Zapisach">${COG}</button></span>
      <button class="edit" data-limits="${p.id}" aria-pressed="${open(p.id, 'limits')}" aria-label="Limity i prośby: ${esc(p.name)}" title="Miejsca, minima, limity i prośby">${GEAR}<span>Limity</span></button></span></li>`).join('') ||
    (team().length ? '<li class="no-match"><b>Nikt nie pasuje</b><span>Zmień wyszukiwanie lub filtry.</span><button type="button" class="outline" data-clear-filters>Wyczyść filtry</button></li>' : '');
  $('#people-count').textContent = filtered ? `Pokazano ${shown.length} z ${team().length}` : '';
  for (const b of document.querySelectorAll('[data-filter]')) b.setAttribute('aria-pressed', b.dataset.filter === 'none' ? view.none : b.dataset.filter === view.role);
  // Okno osoby: ustawienia (limity i prośby obowiązują w każdym miesiącu); liczby i historia — zakładka Statystyki
  const who = state.people.find((p) => p.id === view.who);
  // Treść budujemy tylko przy otwarciu: przebudowa przy każdej zmianie pola zabiera fokus,
  // zamyka klawiaturę na telefonie i przewija okno do góry. Pola same pokazują zapisaną wartość.
  if (who && $('#person').open && $('#person-body').dataset.key !== view.who + personPart + jawnie) {
    $('#person-body').dataset.key = view.who + personPart + jawnie;
    $('#person-title').textContent = personPart === 'limits' ? `${who.name} — limity i prośby` : who.name;
    // ustawienia: karty jedna pod drugą. Limity (tylko administrator) i prośby (wpisuje osoba) osobno — te same wiersze w obu tabelach.
    const vals = { limit: state.limits, min: state.mins, want: state.wants, wantAdm: state.wantsAdm };
    const num = (kind, key, ph, label) => `<input type="number" min="0" step="1" placeholder="${ph}" data-${kind === 'wantAdm' ? 'want-adm' : kind}="${key}" value="${vals[kind][who.id]?.[key] ?? ''}" aria-label="${label}">`;
    const field = (name, hint, control) => `<label class="field"><span>${name}${hint ? `<small>${hint}</small>` : ''}</span>${control}</label>`;
    // tabela liczb: Łącznie i Pt/So/Nd na wierzchu, rzadziej używane wiersze zwinięte (rozwinięte, gdy coś w nich jest);
    // cols = [[nagłówek, podpis]], cell(key, ph, label) = komórki wiersza, objs = dane, od których zależy rozwinięcie grup
    const counts = (cols, cell, objs) => {
      const head = `<thead><tr><td></td>${cols.map(([n, sub]) => `<th scope="col">${n}<small>${sub}</small></th>`).join('')}</tr></thead>`;
      const row = (name, key, ph, label) => `<tr><th scope="row">${name}</th>${cell(key, ph, label)}</tr>`;
      const custom = (keys) => keys.some((k) => objs.some((o) => o[who.id]?.[k] != null));
      const group = (name, open, rows) => `<details class="limits-group" ${open ? 'open' : ''}><summary><span>${name}</span>${CHEV}</summary>` +
        `<table class="counts">${head}<tbody>${rows}</tbody></table></details>`;
      return `<table class="counts">${head}<tbody>${row('Łącznie', '*', '∞', 'łącznie') + row('Pt/So/Nd', 'we', WEEKEND_LIMIT, 'Pt/So/Nd')}</tbody></table>` +
        group(`Na miejscach <small>${esc(state.shifts.map((s) => s.name).join(', '))}</small>`, custom(state.shifts.map((s) => s.id)),
          state.shifts.map((s) => row(esc(s.name), s.id, '∞', esc(s.name))).join('')) +
        group('Weekendy w szczegółach <small>So + Nd, osobno Pt / So / Nd</small>', custom(['d56', 'd4', 'd5', 'd6']),
          row('So + Nd', 'd56', '∞', 'soboty i niedziele łącznie') + `<tr class="sub"><th colspan="${cols.length + 1}" scope="rowgroup">Ten sam dzień weekendu</th></tr>` +
          ['Pt', 'So', 'Nd'].map((n, i) => row(n, `d${i + 4}`, '∞', `ten sam dzień ${n}`)).join(''));
    };
    const own = (k) => state.wants[who.id]?.[k] ?? '—';
    const card = (title, sub, body, tag = '') => `<section><header class="card-head"><h4>${title}${tag && `<span class="card-tag">${tag}</span>`}</h4>${sub ? `<p>${sub}</p>` : ''}</header>${body}</section>`;
    $('#person-body').innerHTML = '<div class="person-grid">' + (personPart === 'settings' ?
      card('Osoba', '', field('Funkcja', '', `<select data-prestige>${ROLES.map((r, i) => `<option value="${i}" ${i === roleOf(who) ? 'selected' : ''}>${r}</option>`).join('')}</select>`) +
        field('Ostatnio gówniane', 'dyżury spoza grafiku, 0–3', `<select data-past>${BAD.map((_, i) => `<option value="${i}" ${i === (who.past ?? 0) ? 'selected' : ''}>${i}</option>`).join('')}</select>`) +
        field('Kanapka PN1 So + Pn', 'włączone = woli ten układ', `<input type="checkbox" role="switch" data-pn1sandwich ${who.pn1Sandwich === false ? '' : 'checked'}>`)) +
      (komentarze(who.id) ? card('Komentarze z Zapisów', 'Osoba dopisała je do swoich dyżurów w danym miesiącu.', komentarze(who.id)) : '') +
      (zapisy ? card('Konto w Zapisach', 'Osoba sama wpisuje dostępność i prośby w aplikacji Zapisy na dyżury.', '<div id="konto"></div>') : '') :
      card('Dyżuruje na', 'Kliknij miejsce, by je wykluczyć (Limit 0) lub znów dopuścić.',
        `<div class="place-chips" role="group" aria-label="Dyżuruje na">${state.shifts.map((s) =>
          `<button type="button" class="chip" data-place="${s.id}" aria-pressed="true" title="Kliknij, by wykluczyć lub dopuścić ${esc(s.name)} (Limit 0)">${CHECK}<span>${esc(s.name)}</span></button>`).join('')}</div>`, zapisy ? 'tylko Ty' : '') +
      card('Limity', `Twarde granice liczby dyżurów w miesiącu — obowiązują w każdym miesiącu.${zapisy ? ' Ustawiasz je tylko Ty, osoba ich nie widzi.' : ''}`,
        counts([['Min.', 'najmniej'], ['Limit', 'najwyżej']], (k, ph, l) => `<td>${num('min', k, '—', `Minimum: ${l}`)}</td><td>${num('limit', k, ph, `Limit: ${l}`)}</td>`, [state.mins, state.limits]) +
        '<p class="hint">Min. i Limit działają zawsze — także 0. Puste pole = wartość domyślna (szara, ∞ = bez limitu). Jeśli nie znajdzie grafiku zgodnego z limitami, zachowa poprzedni.</p>', zapisy ? 'tylko Ty' : '') +
      (zapisy ? card('Prośby', jawnie ? 'Ile dyżurów osoba chce w miesiącu — tylko to, o co prosi w Zapisach. Zmieniasz wprost jej prośbę: zobaczy ją jak swoją, a Twoja korekta w tym wierszu znika. Inne prośby ustawisz w trybie Korekta.'
        : 'Ile dyżurów osoba chce w miesiącu — w Zapisach wpisuje sama tylko Łącznie i So + Nd. Korekta zastępuje jej prośbę przy układaniu, a osoba widzi dalej swoją.',
        modeSwitch() + (jawnie // tylko wiersze z Zapisów — bez mieszania kolumn do edycji
          ? `<table class="counts"><thead><tr><td></td><th scope="col">Osoba<small>widzi w Zapisach</small></th><th scope="col">Korekta<small>Twoja</small></th></tr></thead><tbody>${OSOBA_WANTS.map((k) =>
            `<tr><th scope="row">${WANT_NAME[k]}</th><td>${num('want', k, '—', `Prośba osoby: ${WANT_NAME[k]}`)}</td><td class="own" data-adm-cell="${k}">${state.wantsAdm[who.id]?.[k] ?? '—'}</td></tr>`).join('')}</tbody></table>`
          : counts([['Osoba', 'z Zapisów'], ['Korekta', 'Twoja']], (k, ph, l) => `<td class="own">${own(k)}</td><td>${num('wantAdm', k, own(k), `Korekta prośby: ${l}`)}</td>`, [state.wants, state.wantsAdm])) +
        `<p class="hint">${jawnie ? 'Puste pole = osoba nie ma prośby.' : 'Puste pole korekty = obowiązuje prośba osoby (szara).'} Prośba to docelowa liczba: algorytm ogranicza zarówno niedobór, jak i nadmiar. Domyślny 1 w ten sam dzień weekendu jest preferencją.</p>` +
        '<button type="button" class="ghost outline restore-wants" data-restore-wants hidden>Przywróć prośby osoby</button>', 'wpisuje osoba')
      : card('Prośby', 'Ile dyżurów osoba chce w miesiącu — miękko, w granicach limitów.',
        counts([['Prośba', 'docelowo']], (k, ph, l) => `<td>${num('want', k, '—', `Prośba: ${l}`)}</td>`, [state.wants]) +
        '<p class="hint">Prośba to docelowa liczba: algorytm ogranicza zarówno niedobór, jak i nadmiar. Domyślny 1 w ten sam dzień weekendu jest preferencją.</p>'))) +
      '</div>';
  }
  if (who && $('#person').open) personStatus(who.id);
  const shiftName = Object.fromEntries(state.shifts.map((s) => [s.id, s.name]));
  $('#rules').innerHTML = state.rules.map((r) => `<li>
      <span>Gdy <b>${esc(nameOf[r.who])}</b> dyżuruje z <b>${esc(nameOf[r.with])}</b>, jest w: ${esc(r.places.map((id) => shiftName[id]).filter(Boolean).join(', ') || '—')}</span>
      <button class="x" data-del-rule="${r.id}" aria-label="Usuń warunek">×</button></li>`).join('');
  const people = (name, label) => `<select name="${name}" aria-label="${label}" required><option value="">${label}…</option>` +
    team().map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') + '</select>';
  $('#add-rule').innerHTML = `<label>Gdy ${people('who', 'Osoba')}</label><label>dyżuruje z ${people('with', 'Z kim')}</label>
    <fieldset><legend>to jest w:</legend>${state.shifts.map((s) =>
      `<label class="chk"><input type="checkbox" name="places" value="${s.id}">${esc(s.name)}</label>`).join('')}</fieldset>
    <button>Dodaj warunek</button>`;
  $('#priority').innerHTML = state.priority.map((k, i) => `<li><span><em class="rank">${i + 1}</em>${PRIORITIES[k]}</span>
      <button class="x" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Wyżej: ${PRIORITIES[k]}">↑</button>
      <button class="x" data-up="${i + 1}" ${i < state.priority.length - 1 ? '' : 'disabled'} aria-label="Niżej: ${PRIORITIES[k]}">↓</button></li>`).join('');
  // pędzel: „Po kolei” = każdy klik daje następny poziom (strzałki), poziom = klik i przeciąganie wpisują właśnie jego
  const chips = (mode, levels, names, cls) => `<span class="cycle" role="group" aria-label="Pędzel">` +
    `<button type="button" class="brush" data-brush="${mode}" data-lvl="" aria-pressed="${brush[mode] === null}" title="Każdy klik w dzień: następny poziom">Po kolei</button>` +
    levels.map((lvl, i) => `<button type="button" class="brush ${cls[i]}" data-brush="${mode}" data-lvl="${lvl}" aria-pressed="${brush[mode] === lvl}" title="Klik i przeciąganie po dniach wpisuje: ${names[i]}">${names[i]}</button>`).join('<span aria-hidden="true">→</span>') + '</span>';
  const done = '<button data-done>Gotowe</button>';
  const how = '<span class="hint"> — klikaj dni albo wybierz poziom i przeciągnij myszą po dniach:</span>';
  $('#status').innerHTML = view.bad ? `<span class="who"><b>Gównianość dni</b>${how}</span>${chips('bad', [0, 1, 2, 3], BAD, ['lvl-2', 'lvl-1', 'lvl-0', 'bad-3'])}<span class="hint">Pod spodem: limity i prośby liczone jak inny dzień tygodnia (np. święto jak Nd).</span>${done}` :
    view.who ? `<span class="who"><b>Dostępność: ${esc(nameOf[view.who])}</b>${stamp(view.who)}${fixInfo()}${how}</span>${modeSwitch()}${chips('avail', [2, 3, 4, 0, 1], [2, 3, 4, 0, 1].map((i) => LEVELS[i]), ['lvl-2', 'lvl-3', 'lvl-4', 'lvl-0', 'lvl-1'])}${fixes().length ? '<button class="ghost" data-restore>Przywróć wpisy osoby</button>' : ''}${done}` :
    empty === slots && slots ? '<span>Pusty grafik — <b>Ułóż miesiąc</b> wypełni go automatycznie; każde pole możesz też wpisać ręcznie.</span>' :
    empty ? `<span>Obsadzone <b class="ok">${slots - empty} z ${slots}</b></span><span class="progress" role="progressbar" aria-label="Obsadzone dyżury" aria-valuenow="${Math.round((slots - empty) / slots * 100)}"><i style="width:${(slots - empty) / slots * 100}%"></i></span>` +
      `<span>wolne: <b>${empty}</b></span><button class="ghost" data-jump>Pokaż pierwszy wolny →</button>` : '';
  if (zapisy && !view.who && !view.bad) $('#status').insertAdjacentHTML('beforeend', zapisyInfo(y, m));
  $('#status').classList.toggle('info', !!view.who || view.bad || empty === slots);
  $('#status').classList.toggle('pinned', !!view.who || !!view.bad); // pasek pędzla przypięty pod nagłówkiem
  $('#calendar').classList.toggle('painting', !!view.who || view.bad); // bez zaznaczania tekstu przy przeciąganiu
  // Uwagi do oglądanego miesiąca: niespełnione prośby, dni „Chcę” bez dyżuru, dyżury „W ostateczności”, kanapki, Czw + Nd —
  // liczone na bieżąco, więc zmiana wariantu lub ręczna poprawka od razu się tu odbija
  {
    const gaps = scoreMonth(y, m, state.schedule, state.shifts, team(), {}, {}, effWants(), {}, state.asDay).gaps;
    const label = (k) => WANT_LABEL[k] ?? shiftName[k] ?? k;
    const wish = missedWishes(y, m, state.schedule, team(), av);
    const last = lastResortDays(y, m, state.schedule, team(), av);
    const sw = sandwichDays(y, m, state.schedule, state.shifts, team(), av);
    const ts = thuSunDays(y, m, state.schedule, team(), av);
    // w pustym miesiącu nie ma jeszcze czego oceniać; komentarze osób są w oknie osoby i w Statystykach
    const blank = empty === slots;
    const who = team().filter((p) => !blank && (wish[p.id] || last[p.id] || sw[p.id] || ts[p.id] || gaps.some((g) => g.pid === p.id)));
    const n = who.length;
    $('#want-gaps').classList.toggle('all-ok', !n);
    // przy klikaniu dostępności osoby uwagi tylko przeszkadzają
    $('#want-gaps').hidden = !!view.who || blank && !n;
    $('#want-gaps .head').innerHTML = `<span class="count">${n || '✓'}</span><b>Uwagi</b><span class="hint">${n ? 'prośby, dni „Chcę”, „W ostateczności”, kanapki i Czw + Nd' : 'wszystko się zgadza'}</span>`;
    const days = (ds) => ds?.map((d) => `${d}.${String(m + 1).padStart(2, '0')}`).join(', ');
    const nums = (pid, f) => gaps.filter((g) => g.pid === pid && f(g)).map((g) => `${esc(label(g.k))}: <b>${g.got}</b> zamiast ${g.want}`).join('<br>');
    const dm = (key) => `${+key.slice(8)}.${key.slice(5, 7)}`;
    const pairs = (ps) => ps?.map(([a, b]) => `${dm(a)} i ${dm(b)}`).join(', ');
    const row = (cls, tag, text) => text ? `<p><span class="${cls}">${tag}</span><span>${text}</span></p>` : '';
    $('#want-gaps ul').innerHTML = who.map((p) => `<li><b>${esc(p.name)}</b>` +
      (blank ? '' :
      row('few', 'Za mało', nums(p.id, (g) => g.got < g.want)) +
      row('over', 'Za dużo', nums(p.id, (g) => g.got > g.want)) +
      row('lvl-3', '„Chcę” bez dyżuru', days(wish[p.id])) +
      row('lvl-1', '„W ostateczności”', days(last[p.id])) +
      row('lvl-2', 'Kanapki', pairs(sw[p.id])) +
      row('lvl-2', 'Czw + Nd', pairs(ts[p.id]))) + '</li>').join('');
  }
  $('#bad-mode').setAttribute('aria-pressed', view.bad);
  if (document.activeElement !== $('#zapisy-od')) $('#zapisy-od').value = state.zapisyOd ?? '';
  if (document.body.dataset.tab === 'stats') renderStats();
}

// Zapisy na dyżury: kiedy osoba ostatnio sama zmieniła dostępność/prośby (state.stamps stawia serwer)
const when = (iso) => iso ? new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const stamp = (pid) => state.stamps[pid] ? ` <small class="stamp">zmienione w Zapisach: ${when(state.stamps[pid])}</small>` : '';
// Tryb Zapisów: gdzie idą zmiany administratora — false = korekty (availAdm/wantsAdm, osoba ich nie widzi),
// true = wprost we wpisach osoby (avail/wants, widzi je w Zapisach; z próśb tylko OSOBA_WANTS). Na sesję; start zawsze na korektach.
let jawnie = false;
// O co osoba może prosić w Zapisach (WANT_ROWS tam, osoba_save w bazie): łącznie i So + Nd; resztę próśb ustawiasz tylko korektą
const OSOBA_WANTS = ['*', 'd56'];
const WANT_NAME = { '*': 'Łącznie', d56: 'So + Nd' }; // nazwy wierszy jak w tabelach okna osoby
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.97 0 8.4 3.62 9.94 6.65a1 1 0 0 1 0 .7 10.8 10.8 0 0 1-1.44 2.49"/><path d="M14.08 14.16a3 3 0 0 1-4.24-4.24"/><path d="M17.48 17.5A10.75 10.75 0 0 1 2.06 12.35a1 1 0 0 1 0-.7 10.8 10.8 0 0 1 4.45-5.14"/><path d="m2 2 20 20"/></svg>';
const modeSwitch = () => !zapisy ? '' : '<span class="seg" role="group" aria-label="Gdzie zapisują się Twoje zmiany">' +
  `<button type="button" data-jawnie="0" aria-pressed="${!jawnie}" title="Zmiany zapisują się obok jako Twoje korekty — osoba w Zapisach ich nie widzi">${EYE_OFF}<span>Korekta</span></button>` +
  `<button type="button" data-jawnie="1" aria-pressed="${jawnie}" title="Zmiany trafiają wprost do wpisów osoby — zobaczy je w Zapisach">${EYE}<span>Wpis osoby</span></button></span>`;
// Korekty administratora (tryb Zapisów): dni oglądanego miesiąca z korektą dostępności osoby
const fixes = (pid = view.who) => monthKeys().filter((k) => state.availAdm[pid]?.[k] !== undefined);
const hasFixes = (pid) => fixes(pid).length > 0 || Object.keys(state.wantsAdm[pid] ?? {}).length > 0;
const fixInfo = (n = fixes().length) => !zapisy ? '' : ` <small class="stamp">${state.stamps[view.who] ? '· ' : ''}${jawnie
  ? `${n ? `korekty: ${n} ${n === 1 ? 'dzień' : 'dni'} · ` : ''}zmiany trafią do wpisów osoby — zobaczy je w Zapisach`
  : `${n ? `korekty: ${n} ${n === 1 ? 'dzień' : 'dni'}` : 'zmiany zapiszą się jako Twoje korekty'}, niewidoczne dla osoby`}</small>`;
// dzień w trybie dostępności; korekta ma przerywaną obwódkę i pod spodem to, co wpisała osoba
function availButton(key, lvl) {
  if (state.availAdm[view.who]?.[key] === undefined) return `<button class="avail lvl-${lvl}" data-avail="${key}">${LEVELS[lvl]}</button>`;
  const own = LEVELS[availOf(state.avail, view.who, key)];
  return `<button class="avail lvl-${lvl} adm" data-avail="${key}" title="Twoja korekta — osoba wpisała: ${own}">${LEVELS[lvl]}<small>osoba: ${own}</small></button>`;
}
// Pierwsza zmiana wpisów osoby, która korzysta z Zapisów (ma stamp): ostrzeżenie, raz na osobę i rodzaj w tej sesji.
// Zmiana idzie do korekt (availAdm/wantsAdm) albo — przełącznik „Wpis osoby” — wprost do wpisów osoby (osobne ostrzeżenie).
const warned = new Set();
const needsWarning = (what) => zapisy && !!state.stamps[view.who] && !warned.has(view.who + what + jawnie);
function mayCorrect(what) {
  if (!needsWarning(what)) return true;
  const name = state.people.find((p) => p.id === view.who).name, avail = what === 'avail';
  const open = !avail || zapisyClosed(view.y, view.m) ? '' : jawnie ? '\n\nZapisy na ten miesiąc są jeszcze otwarte — osoba może Twoją zmianę jeszcze zmienić.'
    : '\n\nZapisy na ten miesiąc są jeszcze otwarte — osoba może jeszcze zmieniać swoje wpisy, ale Twoja korekta i tak ma pierwszeństwo.';
  const how = jawnie ? 'Zmienisz wpis osoby: zobaczy go w Zapisach jak swój. Twoja korekta w zmienianym miejscu (jeśli jest) zostanie usunięta.'
    : 'Twoja zmiana zapisze się obok jako korekta: liczy się przy układaniu, a osoba w Zapisach dalej widzi tylko swój wpis.';
  if (!confirm(`${avail ? 'Dostępność' : 'Prośby'}: ${name} — wpisane przez osobę w Zapisach.\n\nZmienić mimo to? ${how}${open}`)) return false;
  warned.add(view.who + what + jawnie);
  return true;
}
// komentarz osoby z Zapisów do oglądanego miesiąca ('' = brak) — zwykły tekst, zawsze przez esc()
// okno osoby: wszystkie komentarze od bieżącego miesiąca (starsze zostają w danych, ale już nie są potrzebne)
const komentarze = (pid) => Object.entries(state.uwagi[pid] ?? {}).filter(([k, t]) => k >= dateKey(now.getFullYear(), now.getMonth(), 1).slice(0, 7) && t.trim()).sort()
  .map(([k, t]) => `<p class="note-text"><b>${new Date(+k.slice(0, 4), +k.slice(5) - 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}:</b> ${esc(t.trim())}</p>`).join('');
const uwaga = (pid) => state.uwagi[pid]?.[dateKey(view.y, view.m, 1).slice(0, 7)]?.trim() ?? '';
const ZAPISY_DO = 10; // dzień poprzedniego miesiąca — jak zapisy_od w supabase-zapisy.sql (repo Zapisów)
// Termin zapisów (pilnuje baza): osoby zmieniają miesiąc do 10. dnia poprzedniego; state.zapisyOd zamyka wcześniejsze miesiące
const zapisyClosed = (y, m) => dateKey(now.getFullYear(), now.getMonth(), now.getDate()) > dateKey(y, m - 1, ZAPISY_DO) ||
  dateKey(y, m, 1).slice(0, 7) < (state.zapisyOd ?? '');
function zapisyInfo(y, m) {
  return `<span class="zapisy-info">${zapisyClosed(y, m) ? 'Zapisy osób zamknięte' :
    `Zapisy osób na ten miesiąc: otwarte do ${new Date(y, m - 1, ZAPISY_DO).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}`}</span>`;
}

function update(fn) { stopGeneration(); fn(); save(); render(); }

// Okno osoby: chipy miejsc (dozwolone = bez Limitu 0) — odświeżane przy każdej zmianie, bez przebudowy pól
function personStatus(pid) {
  for (const b of document.querySelectorAll('#person [data-place]')) b.setAttribute('aria-pressed', state.limits[pid]?.[b.dataset.place] !== 0);
  const restore = $('#person [data-restore-wants]'); // tylko gdy są korekty próśb
  if (restore) restore.hidden = !Object.keys(state.wantsAdm[pid] ?? {}).length;
  markClash();
}

// Sprzeczne Min./Limit podświetlane od razu, z wartości w polach (też niezatwierdzonych); pusty Limit Pt/So/Nd = WEEKEND_LIMIT
function markClash() {
  const vals = (kind) => Object.fromEntries([...document.querySelectorAll(`#person [data-${kind}]`)]
    .filter((el) => el.value !== '' && Number.isInteger(+el.value) && +el.value >= 0).map((el) => [el.dataset[kind], +el.value]));
  const lim = { we: WEEKEND_LIMIT, ...vals('limit') }, min = vals('min'), bad = limitClash(lim, min, state.shifts.map((s) => s.id));
  for (const el of document.querySelectorAll('#person :is([data-limit], [data-min])')) {
    const k = el.dataset.limit ?? el.dataset.min, on = bad.has(k) && ('min' in el.dataset ? min[k] > 0 : lim[k] != null);
    el.toggleAttribute('aria-invalid', on);
    el.title = on ? 'Sprzeczne z innymi limitami lub minimami tej osoby' : '';
  }
}

// Okno osoby → „Konto w Zapisach”: stan kont z admin_konta (raz przy otwarciu okna), nowy PIN widać tylko raz
let konta = null, kontoPin = null; // konta: { konta: [{ pid, last_login, last_change }], fails24h } | { error } | null = wczytuje
const fetchKonta = () => cloudRpc('admin_konta', {}).catch((e) => ({ error: e.message }));
async function openKonto() { konta = kontoPin = null; renderKonto(); konta = await fetchKonta(); renderKonto(); }
function renderKonto() {
  const el = $('#konto'), k = konta?.konta?.find((x) => x.pid === view.who);
  if (!el) return;
  el.innerHTML = !konta ? '<p class="hint">Wczytuję…</p>' : konta.error ? `<p class="hint">Nie udało się wczytać: ${esc(konta.error)}</p>` :
    `<dl class="konto"><dt>Konto</dt><dd>${k ? 'ma PIN' : 'bez konta'}</dd><dt>Ostatnie logowanie</dt><dd>${when(k?.last_login)}</dd><dt>Ostatnia zmiana w Zapisach</dt><dd>${when(k?.last_change)}</dd></dl>` +
    (kontoPin ? `<p class="new-pin">Nowy PIN: <b>${kontoPin}</b> <button type="button" class="outlined" data-konto="copy">Skopiuj</button></p>` +
      '<p class="hint">PIN widać tylko teraz — przekaż go osobie. Stary PIN i zalogowane sesje przestały działać.</p>' : '') +
    `<div class="konto-actions"><button type="button" class="outlined" data-konto="pin">${k ? 'Nadaj nowy PIN' : 'Nadaj PIN'}</button>` +
    (k ? '<button type="button" class="ghost outline" data-konto="del">Usuń konto</button>' : '') + '</div>';
}
// 6 losowych cyfr bez łatwych do zgadnięcia: ≤ 2 różne cyfry, ciąg rosnący/malejący (123456, 987654), abcabc
// ponytail: % 10 na 32 bitach ma pomijalne (~10⁻⁹) przesunięcie rozkładu
function randomPin() {
  for (;;) {
    const d = [...crypto.getRandomValues(new Uint32Array(4))].map((x) => x % 10);
    const steps = new Set(d.slice(1).map((x, i) => (x - d[i] + 10) % 10));
    if (new Set(d).size > 2 && !(steps.size === 1 && (steps.has(1) || steps.has(9)))) return d.join(''); // bez 1111, 1212, 1234, 4321
  }
}
async function kontoAction(btn) {
  const pid = view.who, name = state.people.find((p) => p.id === pid).name, has = konta?.konta?.some((k) => k.pid === pid);
  if (btn.dataset.konto === 'copy') return navigator.clipboard.writeText(kontoPin).then(() => { btn.textContent = 'Skopiowano'; }, () => prompt('Skopiuj PIN:', kontoPin));
  if (btn.dataset.konto === 'del' && !confirm(`Usunąć konto ${name} w Zapisach? PIN i sesje przestaną działać; wpisana dostępność zostaje.`)) return;
  if (btn.dataset.konto === 'pin' && has && !confirm(`Nadać ${name} nowy PIN? Stary przestanie działać.`)) return;
  btn.disabled = true;
  try {
    if (btn.dataset.konto === 'del') { await cloudRpc('admin_usun_konto', { osoba: pid }); kontoPin = null; }
    else for (let i = 0; ; i++) { // PIN-y się nie powtarzają: zajęty → losuj jeszcze raz
      const nowy = randomPin();
      try { await cloudRpc('admin_set_pin', { osoba: pid, nowy }); kontoPin = nowy; break; }
      catch (e) { if (!/zajęty/.test(e.message) || i >= 4) throw e; }
    }
    konta = await fetchKonta();
  } catch (e) { alert(`Nie udało się: ${e.message}`); }
  renderKonto();
}

// Świeże dane z chmury (np. zmiany osób z Zapisów): po powrocie na kartę i przyciskiem „Odśwież dane”.
// Nie w trakcie układania ani przy otwartym oknie osoby — wynik i pola dotyczyłyby starego stanu.
async function reload() {
  if (generation || $('#person').open) return 'Teraz nie — trwa układanie albo otwarte jest okno osoby.';
  const data = await cloudReload();
  if (!data || generation || $('#person').open) return 'Zmiany jeszcze się zapisują — spróbuj za chwilę.';
  state = data;
  migrate();
  if (!team().some((p) => p.id === view.who)) view.who = null; // osoba usunięta na innym komputerze
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
  render();
  return 'Odświeżono.';
}

$('#prev').onclick = () => { $('#panel-variants').hidden = true; view = { ...view, ...(view.m ? { m: view.m - 1 } : { y: view.y - 1, m: 11 }) }; render(); };
// „Dzisiaj” wraca do bieżącego miesiąca; na telefonie (kalendarz = lista dni) też przewija do dzisiejszego dnia
$('#today').onclick = () => {
  $('#panel-variants').hidden = true; view = { ...view, y: now.getFullYear(), m: now.getMonth() }; render();
  if (matchMedia('(max-width: 760px)').matches) $('.today')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
};
$('#next').onclick = () => { $('#panel-variants').hidden = true; view = { ...view, ...(view.m < 11 ? { m: view.m + 1 } : { y: view.y + 1, m: 0 }) }; render(); };

$('#cancel-generate').onclick = stopGeneration;
$('#publish').onclick = () => {
  const k = monthKeyOf(), name = $('#month-label').textContent;
  if (state.gotowe[k] ? !confirm(`Cofnąć gotowość grafiku na ${name}? Osoby przestaną go widzieć w Zapisach, a „Ułóż miesiąc” znów zadziała.`)
    : !confirm(`Grafik na ${name} gotowy? Osoby zobaczą go w Zapisach, a „Ułóż miesiąc” zostanie zablokowany do cofnięcia gotowości.`)) return;
  update(() => { if (state.gotowe[k]) delete state.gotowe[k]; else state.gotowe[k] = true; });
};
$('#generate').onclick = async () => {
  if (generation || state.gotowe[monthKeyOf()]) return;
  view.who = null;
  view.bad = false;
  $('#panel-variants').hidden = true;
  render();
  const job = { controller: new AbortController(), y: view.y, m: view.m };
  generation = job;
  syncReady();
  $('#cancel-generate').hidden = false;
  $('#generation-status').textContent = 'Układam grafik… Możesz nadal korzystać ze strony.';
  const keys = monthKeys();
  const h = history(state.schedule, state.bad, view.y, view.m);
  const people = team().map((p) => ({ ...p, hist: h.pts[p.id] ?? 0, tragic: h.tragic[p.id] }));
  // przeszłe dyżury usuniętych osób zostają, jak ręczne
  const locked = pick(state.manual, keys), gone = new Set(state.people.filter((p) => p.gone).map((p) => p.id));
  const today = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  for (const k of keys) if (k < today) for (const [sid, pid] of Object.entries(state.schedule[k] || {}))
    if (gone.has(pid)) (locked[k] = { ...locked[k] })[sid] = pid;
  // 2 ostatnie dni poprzedniego i 2 pierwsze następnego miesiąca: blokują dzień po dniu i odpoczynek po OITN na przełomie, nie liczą się do limitów
  for (const k of [dateKey(view.y, view.m, -1), dateKey(view.y, view.m, 0), dateKey(view.y, view.m + 1, 1), dateKey(view.y, view.m + 1, 2)])
    if (state.schedule[k]) locked[k] = state.schedule[k];
  let variants;
  try {
    variants = await runScheduler([job.y, job.m, state.shifts, people, locked, effAvail(),
      Object.fromEntries(team().map((p) => [p.id, { we: WEEKEND_LIMIT, ...state.limits[p.id], min: state.mins[p.id] }])), state.rules, state.bad, effWants(), { order: state.priority, asDay: state.asDay }], {
      signal: job.controller.signal,
      onProgress: (progress) => { if (generation === job) $('#generation-status').textContent = progress.message; },
    });
  } catch (error) {
    if (generation !== job || error.name === 'AbortError') return;
    $('#generation-status').textContent = 'Nie udało się ułożyć grafiku. Poprzedni pozostaje bez zmian.';
    alert(`${error.message}\nPoprzedni grafik pozostaje bez zmian.`);
    return;
  } finally {
    if (generation === job) {
      generation = null;
      syncReady();
      $('#cancel-generate').hidden = true;
    }
  }
  if (job.controller.signal.aborted) return;
  $('#generation-status').textContent = `Gotowe. Nieobsadzone: ${variants[0].score.unfilled}. Odchylenie od próśb: ${variants[0].score.wants}.`;
  const prev = Object.fromEntries(keys.map((k) => [k, state.schedule[k]]));
  const apply = (i) => update(() => Object.assign(state.schedule, variants[i].schedule));
  apply(0);
  $('#panel-variants').hidden = variants.length < 2;
  if (variants.length < 2) return;
  // Kilka dobrych grafików → panel wyboru nad kalendarzem; zaznaczenie od razu pokazuje wariant
  $('#variants-list').innerHTML = variants.map(({ score: s }, i) => `<label class="variant"><input type="radio" name="variant" value="${i}" ${i ? '' : 'checked'}>
    <b>Wariant ${i + 1}</b><span class="hint">nieobsadzone ${s.unfilled} · ${s.min ? `brak do minimum ${s.min} · ` : ''}„W ostateczności” ${s.lastResort} · kanapki ${s.sandwich} ·
    odchylenie od próśb ${s.wants} · różnica liczby dyżurów ${s.spread}</span></label>`).join('');
  $('#variants-list').onchange = (e) => apply(+e.target.value);
  $('#variants-undo').onclick = () => update(() => {
    for (const k of keys) if (prev[k]) state.schedule[k] = prev[k]; else delete state.schedule[k];
    $('#panel-variants').hidden = true;
  });
};
$('#variants-ok').onclick = () => { $('#panel-variants').hidden = true; };

// Zakładki: Grafik / Osoby / Statystyki / Układanie (priorytety, warunki, gównianość) / Instrukcja
// Każda zakładka pamięta swoje przewinięcie; ponowne kliknięcie aktywnej wraca na górę.
const scrolls = {};
function showTab(tab) {
  const cur = document.body.dataset.tab;
  scrolls[cur] = tab === cur ? 0 : scrollY;
  document.body.dataset.tab = tab;
  for (const b of document.querySelectorAll('button[data-tab]')) b.setAttribute('aria-pressed', b.dataset.tab === tab);
  if (tab === 'stats') renderStats(); // budowana tylko, gdy widoczna
  scrollTo({ top: scrolls[tab] ?? 0, behavior: 'instant' }); // instant: html ma scroll-behavior: smooth
}
$('.tabs').onclick = $('.app-header').onclick =(e) => { const t = e.target.closest('[data-tab]'); if (t) showTab(t.dataset.tab); };

// „Gotowe” kończy dostępność/gównianość i wraca na kartę, z której je włączono
// Przełącznik Korekta / Wpis osoby. W oknie osoby karta się przebudowuje — przełącznik zostaje w tym samym miejscu ekranu.
function setMode(e) {
  const b = e.target.closest('[data-jawnie]');
  if (!b || jawnie === (b.dataset.jawnie === '1')) return;
  const top = b.getBoundingClientRect().top, inPerson = !!b.closest('#person');
  jawnie = !jawnie;
  render();
  const same = inPerson && $(`#person [data-jawnie="${b.dataset.jawnie}"]`);
  if (same) { $('#person-body').scrollTop += same.getBoundingClientRect().top - top; same.focus({ preventScroll: true }); }
}
$('#status').onclick = (e) => {
  setMode(e);
  if ('done' in e.target.dataset) { view.who = null; view.bad = false; brush = { avail: null, bad: null }; showTab(back); render(); }
  if ('restore' in e.target.dataset && confirm(`Usunąć Twoje korekty dostępności z tego miesiąca (${fixes().length})? Znów będzie obowiązywać to, co osoba wpisała w Zapisach.`))
    update(() => { for (const k of fixes()) delete state.availAdm[view.who][k]; });
  if (e.target.dataset.brush) { brush[e.target.dataset.brush] = e.target.dataset.lvl === '' ? null : +e.target.dataset.lvl; render(); }
  if ('jump' in e.target.dataset) { // pierwszy nieobsadzony dyżur: przewiń i ustaw kursor
    const input = $('#calendar .slot.unfilled input');
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input?.focus({ preventScroll: true });
  }
};
$('#bad-mode').onclick = () => { view.bad = !view.bad; view.who = null; back = 'settings'; if (view.bad) showTab('calendar'); render(); };

// Klik w dzień w trybie dostępności: Mogę → Chcę → Muszę → Nie mogę → W ostateczności → Mogę
// W trybie gównianości: 0 → 1 → 2 → 3 → 0 (wartość równa domyślnej nie jest zapisywana)
// Z wybranym pędzlem klik wpisuje jego poziom; przeciągnięcie myszą wpisuje poziom pierwszego dnia we wszystkie mijane dni.
const dayButton = (t) => t.closest?.('[data-bad], [data-avail]');
const nextLevel = (el) => el.dataset.bad ? brush.bad ?? (badOf(state.bad, view.y, view.m, +el.dataset.bad) + 1) % BAD.length
  : brush.avail ?? (availOf(effAvail(), view.who, el.dataset.avail) + 1) % LEVELS.length;
const paintDay = (el, lvl) => update(() => {
  if (el.dataset.bad) {
    const d = +el.dataset.bad, key = dateKey(view.y, view.m, d);
    delete state.bad[key];
    if (lvl !== badOf(state.bad, view.y, view.m, d)) state.bad[key] = lvl;
  } else if (zapisy && !jawnie) { // korekta obok wpisu osoby; ten sam poziom co u osoby = bez korekty
    const a = (state.availAdm[view.who] ??= {});
    if (lvl === availOf(state.avail, view.who, el.dataset.avail)) delete a[el.dataset.avail]; else a[el.dataset.avail] = lvl;
  } else {
    const a = (state.avail[view.who] ??= {});
    if (lvl === 2) delete a[el.dataset.avail]; else a[el.dataset.avail] = lvl;
    delete state.availAdm[view.who]?.[el.dataset.avail]; // jawny wpis: obowiązuje to, co widać — bez korekty na nim
  }
});
let paint = null, skipClick = false; // paint = { lvl, last: dzień } podczas przeciągania; klik po nim już nic nie zmienia
$('#calendar').onclick = (e) => {
  const el = dayButton(e.target);
  if (el && !skipClick && (!el.dataset.avail || mayCorrect('avail'))) paintDay(el, nextLevel(el));
};
// ponytail: malowanie tylko myszą/piórem — palcem przeciąganie przewija stronę; dotyk = pojedyncze stuknięcia (z pędzlem)
$('#calendar').addEventListener('pointerdown', (e) => {
  const el = dayButton(e.target);
  if (!el || e.pointerType === 'touch' || e.button !== 0) return;
  if (el.dataset.avail && needsWarning('avail')) return; // najpierw ostrzeżenie (w onclick) — okno przerwałoby przeciąganie
  paint = { lvl: nextLevel(el), last: el.dataset.bad ?? el.dataset.avail };
  skipClick = true;
  paintDay(el, paint.lvl);
});
$('#calendar').addEventListener('pointerover', (e) => {
  const el = paint && dayButton(e.target);
  if (!el || (el.dataset.bad ?? el.dataset.avail) === paint.last) return;
  paint.last = el.dataset.bad ?? el.dataset.avail;
  paintDay(el, paint.lvl);
});
for (const type of ['pointerup', 'pointercancel']) addEventListener(type, () => { paint = null; setTimeout(() => { skipClick = false; }); });

// Tryb oceny dni: „Limity jak …” — dzień liczony do limitów i próśb jak inny dzień tygodnia (prawdziwy = bez wpisu)
$('#calendar').addEventListener('change', (e) => {
  const key = e.target.dataset.asDay;
  if (!key) return;
  update(() => {
    const [y, m, d] = key.split('-').map(Number);
    if (+e.target.value === weekday(y, m - 1, d)) delete state.asDay[key]; else state.asDay[key] = +e.target.value;
  });
});

$('#clear').onclick = () => {
  if (!confirm('Wyczyścić grafik tego miesiąca (łącznie z ręcznymi zmianami)?')) return;
  update(() => { for (const k of monthKeys()) { delete state.schedule[k]; delete state.manual[k]; } });
};

$('#print').onclick = () => window.print(); // wydruk / „Zapisz jako PDF” — obsługuje przeglądarka, patrz @media print w style.css

// Tabela wydruku i eksportu: miejsca w kolejności SHIFT_ORDER, jak w całym interfejsie.
// names: '' = miejsce nie działa tego dnia, null = nieobsadzone.
function sheet() {
  const { y, m } = view, nameOf = Object.fromEntries(state.people.map((p) => [p.id, p.name]));
  const cols = state.shifts.filter((s) => s.days.length);
  const month = new Date(y, m).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  const rows = Array.from({ length: daysInMonth(y, m) }, (_, i) => {
    const d = i + 1, wd = weekday(y, m, d), day = state.schedule[dateKey(y, m, d)] || {};
    return { d, wd, names: cols.map((s) => !s.days.includes(wd) ? '' : nameOf[day[s.id]] ?? null) };
  });
  return { title: `Grafik dyżurów — ${month[0].toUpperCase() + month.slice(1)}`, cols, rows, file: `grafik-${dateKey(y, m, 1).slice(0, 7)}` };
}
const sheetTable = () => {
  const { title, cols, rows, file } = sheet();
  return { file, table: { title, head: ['Dzień', '', ...cols.map((s) => s.name)],
    rows: rows.map((r) => ({ cells: [String(r.d), DAYS[r.wd], ...r.names.map((n) => n ?? '—')], we: r.wd >= 5, mon: r.wd === 0 })) } };
};
const download = (url, name) => { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); };
// krój z wydruku do osadzenia w PDF/Word, pobierany przy pierwszym eksporcie
let fontsP;
const fonts = () => fontsP ??= Promise.all(['Regular', 'Bold'].map(async (w) => {
  const r = await fetch(`fonts/PlusJakartaSans-${w}.ttf`);
  if (!r.ok) throw new Error(`font ${w}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
})).then(([regular, bold]) => ({ regular, bold }), (e) => { fontsP = null; throw e; });
$('#export-pdf').onclick = async () => {
  const { file, table } = sheetTable(), url = URL.createObjectURL(new Blob([pdf(table, await fonts())], { type: 'application/pdf' }));
  if (!window.open(url, '_blank')) download(url, `${file}.pdf`); // zablokowane okno → zwykłe pobranie
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
$('#export-docx').onclick = async () => {
  const { file, table } = sheetTable(), url = URL.createObjectURL(new Blob([docx(table, await fonts())], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  download(url, `${file}.docx`);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

// Pole osoby: po kliknięciu czyści się i pokazuje własną listę osób, wpisywanie ją filtruje
// (bez wielkości liter i polskich znaków). Enter/klik wybiera, Esc lub brak dopasowania przywraca poprzednią wartość.
const picker = document.createElement('ul');
picker.id = 'picker'; picker.className = 'picker'; picker.role = 'listbox'; picker.hidden = true;
document.body.append(picker);
const fold = (t) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l');
let field = null, hits = [], active = 0;

// Dostępność osoby p w dzień key i kolizja z twardą zasadą na miejscu shift (why = '' gdy brak) — podpowiedź w #picker
function slotInfo(p, key, shift) {
  const [y, mo, d] = key.split('-').map(Number), m = mo - 1;
  const lvl = availOf(effAvail(), p.id, key), oitn = state.shifts.find((s) => s.name === 'OITN')?.id;
  const on = (k, except) => Object.entries(state.schedule[k] || {}).some(([sid, pid]) => pid === p.id && sid !== except);
  const why = lvl === 0 ? 'Nie mogę' : state.limits[p.id]?.[shift] === 0 ? 'nie na tym miejscu' :
    state.limits[p.id]?.[`d${limitDay(state.asDay, y, m, d)}`] === 0 ? 'nie w ten dzień tygodnia' :
    on(key, shift) ? 'już ma dyżur tego dnia' : on(dateKey(y, m, d - 1)) ? 'dyżur dzień wcześniej' : on(dateKey(y, m, d + 1)) ? 'dyżur dzień później' :
    weekday(y, m, d - 2) >= 5 && state.schedule[dateKey(y, m, d - 2)]?.[oitn] === p.id ? 'odpoczynek po OITN' :
    shift === oitn && weekday(y, m, d) >= 5 && on(dateKey(y, m, d + 2)) ? 'dyżur 2 dni po OITN' : '';
  return { lvl, why };
}

function showPicker() {
  const q = fold(field.value.trim()), { key, shift } = field.dataset;
  // najpierw bez kolizji (Muszę, Chcę, Mogę, W ostateczności), osoby z kolizją na końcu — nadal do wybrania ręcznie
  const info = Object.fromEntries(team().map((p) => [p.id, slotInfo(p, key, shift)]));
  const rank = (p) => (info[p.id].why ? 10 : 0) + 4 - info[p.id].lvl;
  hits = [{ id: '', name: '—' }, ...team().sort((a, b) => rank(a) - rank(b))].filter((p) => !q || (p.id && fold(p.name).includes(q)));
  active = q ? 0 : Math.max(0, hits.findIndex((p) => p.name === field.dataset.was));
  const tag = (p) => { const x = info[p.id]; return !x ? '' : x.why ? `<small class="pill lvl-0">${x.why}</small>` : x.lvl !== 2 ? `<small class="pill lvl-${x.lvl}">${LEVELS[x.lvl]}</small>` : ''; };
  picker.innerHTML = hits.map((p, i) => `<li role="option" data-i="${i}" class="${info[p.id]?.why ? 'clash' : ''}" ${i === active ? 'aria-selected="true"' : ''}><span>${esc(p.name)}</span>${tag(p)}</li>`).join('') ||
    '<li class="none">Brak takiej osoby</li>';
  const r = field.closest('.slot').getBoundingClientRect();
  Object.assign(picker.style, { left: `${r.left + scrollX}px`, top: `${r.bottom + scrollY + 2}px`, minWidth: `${r.width}px` });
  picker.hidden = false;
  picker.querySelector('[aria-selected]')?.scrollIntoView({ block: 'nearest' });
}

function choose(p) {
  const f = field, { key, shift, was } = f.dataset;
  picker.hidden = true;
  f.blur(); // przed zapisem: update() przerysowuje grafik
  if (!p || p.name === was) { f.value = was; return; }
  f.value = p.name;
  update(() => {
    for (const obj of [state.schedule, state.manual]) {
      obj[key] ??= {};
      if (p.id) obj[key][shift] = p.id; else delete obj[key][shift];
    }
  });
}

$('#calendar').addEventListener('focusin', (e) => {
  if (!e.target.dataset.shift) return;
  field = e.target;
  field.dataset.was = field.value;
  field.placeholder = field.value || '—';
  field.value = '';
  showPicker();
});
$('#calendar').addEventListener('input', (e) => { if (e.target === field) showPicker(); });
$('#calendar').addEventListener('keydown', (e) => {
  if (e.target !== field || picker.hidden || !hits.length && e.key !== 'Escape') return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
    picker.querySelectorAll('li').forEach((li, i) => li.toggleAttribute('aria-selected', i === active));
    picker.querySelector('[aria-selected]')?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') { e.preventDefault(); choose(hits[active]); }
  else if (e.key === 'Escape') { choose(null); }
});
// wyjście z pola: jedno dopasowanie wystarczy (np. „kow” + Tab), inaczej wraca poprzednia wartość
$('#calendar').addEventListener('focusout', (e) => {
  if (e.target !== field) return;
  if (!picker.hidden) choose(field.value.trim() ? hits.length === 1 ? hits[0] : hits.find((p) => fold(p.name) === fold(field.value.trim())) : null);
  field.placeholder = '—';
  field = null;
});
picker.onmousedown = (e) => e.preventDefault(); // pole zachowuje fokus do czasu wyboru
picker.onclick = (e) => { const i = e.target.closest('[data-i]')?.dataset.i; if (i && field) choose(hits[i]); };

$('#add-person').onsubmit = (e) => {
  e.preventDefault();
  const name = e.target.name.value.trim().replace(/\s+/g, ' ');
  if (!name) return;
  const same = state.people.find((p) => sameName(p.name, name));
  if (same && !same.gone) return alert(`${same.name} już jest na liście.`);
  // usunięta osoba o tym samym imieniu wraca — z historią dyżurów
  update(() => { if (same) delete same.gone; else state.people.push(person(name)); });
  e.target.reset();
};

$('#add-rule').onsubmit = (e) => {
  e.preventDefault();
  const f = e.target;
  const places = [...f.querySelectorAll('[name=places]:checked')].map((c) => c.value);
  if (f.who.value === f.with.value) return alert('Wybierz dwie różne osoby.');
  if (!places.length) return alert('Zaznacz co najmniej jedno miejsce.');
  update(() => state.rules.push({ id: uid(), who: f.who.value, with: f.with.value, places }));
};

$('main').onclick = (e) => {
  const { delPerson, delRule, who, up, filter, log, stat } = e.target.dataset, edit = e.target.dataset.edit ?? e.target.dataset.limits;
  if (stat) { statsWho = stat; showStat(); $('#pstat').showModal(); }
  if (log) { // historia osoby w osobnym oknie, żeby nie rozpychała Statystyk
    const p = state.people.find((x) => x.id === log);
    $('#log-title').textContent = p.name;
    $('#log-body').innerHTML = logHtml(p);
    $('#log').showModal();
  }
  if (filter === 'none') { view.none = !view.none; render(); }
  else if (filter) { view.role = view.role === filter ? null : filter; render(); }
  if ('clearFilters' in e.target.dataset) { Object.assign(view, { q: '', role: null, none: false }); $('#people-q').value = ''; render(); }
  if (up) update(() => { const i = +up; [state.priority[i - 1], state.priority[i]] = [state.priority[i], state.priority[i - 1]]; });
  if (e.target.dataset.go) showTab(e.target.dataset.go);
  if (delRule) update(() => { state.rules = state.rules.filter((r) => r.id !== delRule); });
  // imię = tryb dostępności w kalendarzu; „Ustawienia” / „Limity” = okno osoby (po zamknięciu wraca poprzedni tryb, chyba że „Dostępność →”)
  if (who) { view.who = view.who === who ? null : who; view.bad = false; back = document.body.dataset.tab; if (view.who) showTab('calendar'); render(); }
  if (edit) {
    personPart = 'limits' in e.target.dataset ? 'limits' : 'settings';
    prevWho = view.who; view.who = edit; view.bad = false; $('#person').returnValue = ''; $('#person-body').dataset.key = ''; $('#person').showModal(); render();
    if (zapisy && personPart === 'settings') openKonto();
  }
  if (delPerson && confirm(`Usunąć ${state.people.find((p) => p.id === delPerson).name}? Przeszłe dyżury zostaną w grafiku, przyszłe zostaną zwolnione.`)) update(() => {
    if (zapisy) cloudRpc('admin_usun_konto', { osoba: delPerson }).catch((e) => alert(`Nie usunięto konta w Zapisach: ${e.message}`));
    state.people.find((p) => p.id === delPerson).gone = true;
    const today = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
    for (const obj of [state.schedule, state.manual]) for (const [k, day] of Object.entries(obj))
      if (k >= today) for (const sid in day) if (day[sid] === delPerson) delete day[sid];
    delete state.avail[delPerson];
    delete state.limits[delPerson];
    delete state.wants[delPerson];
    delete state.availAdm[delPerson];
    delete state.wantsAdm[delPerson];
    delete state.mins[delPerson];
    delete state.uwagi[delPerson];
    state.rules = state.rules.filter((r) => r.who !== delPerson && r.with !== delPerson);
    if (view.who === delPerson) view.who = null;
  });
};

// przyciski w oknie osoby ze Statystyk działają jak te na stronie; „Dostępność” przełącza na kalendarz, więc zamyka okno
$('#pstat').addEventListener('click', (e) => { if (e.target.dataset.who) $('#pstat').close(); $('main').onclick(e); });

$('#people-q').oninput = (e) => { view.q = e.target.value; render(); };
$('#people-sort').onchange = (e) => { view.sort = e.target.value; render(); };

$('#person').onclose = () => { if ($('#person').returnValue !== 'avail') view.who = prevWho; render(); };
$('#person').onclick = (e) => {
  setMode(e);
  if ('restoreWants' in e.target.dataset) { // wszystkie korekty próśb osoby → znów obowiązuje to, co wpisała w Zapisach
    const n = Object.keys(state.wantsAdm[view.who] ?? {}).length;
    if (confirm(`Usunąć Twoje korekty próśb tej osoby (${n})? Znów będzie obowiązywać to, co osoba wpisała w Zapisach.`))
      update(() => { delete state.wantsAdm[view.who]; delete $('#person-body').dataset.key; }); // przebudowa pól korekty
  }
  if (e.target.dataset.go) showTab(e.target.dataset.go);
  if (e.target.dataset.konto) kontoAction(e.target);
  const place = e.target.closest('[data-place]')?.dataset.place; // chip miejsca: wyklucz (Limit 0) ↔ dopuść (puste pole)
  if (place) update(() => {
    const l = (state.limits[view.who] ??= {});
    if (l[place] === 0) delete l[place]; else l[place] = 0;
    $(`#person [data-limit="${place}"]`).value = l[place] ?? '';
  });
};
// Enter w polu liczby zatwierdza wartość zamiast zamykać okno (formularz method="dialog")
$('#person').onkeydown = (e) => { if (e.key === 'Enter' && e.target.type === 'number') { e.preventDefault(); e.target.blur(); } };
$('#person').oninput = (e) => { if (e.target.matches('[data-limit], [data-min]')) markClash(); };
$('#person').onchange = (e) => {
  if ('past' in e.target.dataset)
    return update(() => { state.people.find((p) => p.id === view.who).past = +e.target.value; });
  if ('pn1sandwich' in e.target.dataset) // brak pola = włączone
    return update(() => { state.people.find((p) => p.id === view.who).pn1Sandwich = e.target.checked; });
  if ('prestige' in e.target.dataset)
    return update(() => { const p = state.people.find((p) => p.id === view.who), i = +e.target.value; p.boss = i > 2; p.prestige = p.boss ? i - 2 : i; });
  const kind = ['limit', 'min', 'want', 'wantAdm'].find((k) => k in e.target.dataset);
  if (!kind) return;
  const sid = e.target.dataset[kind], obj = { limit: state.limits, min: state.mins, want: state.wants, wantAdm: state.wantsAdm }[kind];
  let n = e.target.value === '' ? null : Number(e.target.value);
  const undo = () => { e.target.value = obj[view.who]?.[sid] ?? ''; };
  if (n !== null && (!Number.isInteger(n) || n < 0)) {
    alert('Wpisz nieujemną liczbę całkowitą albo pozostaw pole puste.');
    return undo();
  }
  if (kind === 'wantAdm') {
    if (!mayCorrect('wants')) return undo();
    if (n === state.wants[view.who]?.[sid]) { n = null; e.target.value = ''; } // tyle samo co prośba osoby = bez korekty
  }
  const own = kind === 'want' && zapisy; // przełącznik „Wpis osoby”: prośba osoby wprost, korekta w tym wierszu znika
  if (own && !mayCorrect('wants')) return undo();
  update(() => {
    const l = (obj[view.who] ??= {});
    if (n !== null) l[sid] = n; else delete l[sid];
    if (own) delete state.wantsAdm[view.who]?.[sid];
  });
  if (own) $(`#person [data-adm-cell="${sid}"]`).textContent = '—';
};

// Historia osoby p: każdy dyżur z oglądanego miesiąca i 3 poprzednich — data, miejsce, dostępność, gównianość, przerwa, ręczny/zaplanowany
function logHtml(p) {
  const pid = p.id;
  const shiftName = Object.fromEntries(state.shifts.map((s) => [s.id, s.name]));
  const today = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const log = personLog(state.schedule, state.bad, pid, view.y, view.m);
  const monthName = (y, m) => new Date(y, m).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  const sum = (list) => {
    const per = {};
    for (const x of list) per[x.sid] = (per[x.sid] || 0) + 1;
    return { n: list.length, bad: list.reduce((a, x) => a + x.bad, 0),
      we: list.filter((x) => limitDay(state.asDay, +x.key.slice(0, 4), x.key.slice(5, 7) - 1, +x.key.slice(8)) >= 4).length, // Pt/So/Nd (też dni liczone jak Pt/So/Nd)
      places: Object.entries(per).map(([sid, n]) => `${esc(shiftName[sid] ?? '(usunięte miejsce)')} ${n}`).join(' · ') };
  };
  const all = sum(log);
  const tile = (label, value, sub) => `<div class="kpi"><span class="kpi-label">${label}</span><b class="kpi-value">${value}</b><span class="kpi-sub">${sub}</span></div>`;
  let html = `<div class="kpis">${tile('Dyżury', all.n, all.places || 'brak dyżurów')}${tile('Pt/So/Nd', all.we, 'z wszystkich dyżurów')}${tile('Gównianość', `${all.bad}<small> pkt</small>`, 'suma z dyżurów')}</div>`;
  for (let i = 0; i < 4; i++) {
    const t = new Date(view.y, view.m - i), y = t.getFullYear(), m = t.getMonth();
    const list = log.filter((x) => x.key.startsWith(dateKey(y, m, 1).slice(0, 8))).reverse(); // najnowsze na górze
    const s = sum(list);
    html += `<section class="log-month"><h4>${monthName(y, m)}<small>${list.length ? `${dyzury(s.n)} · ${s.places} · Pt/So/Nd ${s.we} · ${s.bad} pkt` : 'brak dyżurów'}</small></h4>` + (!list.length ? '' :
      `<ul class="log">` + list.map((x) => { // wiersz listy MD3: dzień · miejsce + opis · dostępność
        const d = +x.key.slice(8), lvl = availOf(effAvail(), pid, x.key);
        const sub = [`${BAD[x.bad]} dzień`, x.gap !== null && `przerwa ${x.gap === 1 ? '1 dzień' : `${x.gap} dni`}`,
          state.manual[x.key]?.[x.sid] === pid && 'ręczny', x.key > today && 'zaplanowany'].filter(Boolean).join(' · ');
        return `<li class="${weekday(y, m, d) > 4 ? 'weekend' : ''}"><span class="day"><b>${d}</b>${DAYS[weekday(y, m, d)]}</span>` +
          `<span class="what"><b>${esc(shiftName[x.sid] ?? '(usunięte miejsce)')}</b><small>${sub}</small></span>` +
          `<span class="pill lvl-${lvl}">${LEVELS[lvl]}</span></li>`;
      }).join('') + '</ul>') + '</section>';
  }
  return html;
}

// Zakładka Statystyki: kto ile dyżurów dostał w oglądanym miesiącu i dlaczego. Budowana tylko, gdy widoczna.
// Powody to te same czynniki, których używa układanie (dostępność, funkcja, limity/prośby, obciążenie z historii, ręczne wpisy, warunki).
function renderStats() {
  const { y, m } = view, ppl = team();
  if (!ppl.length) { $('#stats').innerHTML = '<div class="panel"><h3>Statystyki</h3><p class="lead">Dodaj osoby w zakładce Układanie.</p></div>'; return; }
  const monthName = new Date(y, m).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  const st = monthStats(y, m, state.schedule, state.shifts, ppl, effAvail(), state.bad, state.asDay, state.manual);
  const W = effWants(), wantDev = scoreMonth(y, m, state.schedule, state.shifts, ppl, {}, {}, W, {}, state.asDay).wants;
  const h = history(state.schedule, state.bad, y, m);
  const nameOf = Object.fromEntries(state.people.map((p) => [p.id, p.name]));
  const num = (x) => x.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
  const dni = (n) => `${n} ${n === 1 ? 'dzień' : 'dni'}`;
  const start = (p) => (p.past ?? 0) * PAST_WEIGHT + (h.pts[p.id] ?? 0); // obciążenie sprzed miesiąca, jak w układaniu
  const totals = ppl.map((p) => st.people[p.id].total);
  const avg = totals.reduce((a, b) => a + b, 0) / ppl.length, maxN = Math.max(1, ...totals);
  const avgStart = ppl.reduce((a, p) => a + start(p), 0) / ppl.length;
  const maxBad = Math.max(1, ...ppl.map((p) => start(p) + st.people[p.id].bad));
  const pct = st.slots ? Math.round(st.filled / st.slots * 100) : 0;
  const bar = (part, cls = '') => `<span class="meter ${cls}" aria-hidden="true"><i style="width:${Math.min(100, part * 100)}%"></i></span>`;
  const tile = (label, value, sub, cls = '') => `<div class="kpi ${cls}"><span class="kpi-label">${label}</span><b class="kpi-value">${value}</b><span class="kpi-sub">${sub}</span></div>`;

  let html = `<div class="panel stats-top"><h3>Statystyki — ${monthName}</h3>
    <p class="lead">Kto ile dyżurów dostał i dlaczego. Kliknij osobę, by zobaczyć powody i limity; „Historia” pokazuje jej dyżury z 4 miesięcy.</p><div class="kpis">` +
    tile('Obsadzone', `${st.filled}<small> / ${st.slots}</small>`, `${bar(st.slots && st.filled / st.slots, st.filled < st.slots ? 'warn' : '')}${pct}% · wolne ${st.slots - st.filled}`, st.filled < st.slots ? 'warn' : '') +
    tile('Dyżury na osobę', `${Math.min(...totals)}–${Math.max(...totals)}`, `średnio ${num(avg)}`) +
    tile('Odchylenie od próśb', wantDev, wantDev ? 'suma niedoborów i nadmiarów' : 'prośby spełnione', wantDev ? 'maybe' : '') +
    tile('„W ostateczności”', st.lastResort, 'dyżury w takie dni', st.lastResort ? 'maybe' : '') +
    tile('Kanapki', st.sandwich, 'dyżury co drugi dzień') +
    tile('Wpisy ręczne', st.manual, 'algorytm ich nie zmienia') + '</div>' +
    `<h4>Obsada miejsc</h4><ul class="places">` + state.shifts.filter((s) => st.shifts[s.id].slots).map((s) => {
      const { slots, filled } = st.shifts[s.id];
      return `<li><b>${esc(s.name)}</b>${bar(filled / slots, filled < slots ? 'warn' : '')}<span>${filled} / ${slots}</span></li>`;
    }).join('') + '</ul></div>';

  const rows = [...ppl].sort((a, b) => st.people[b.id].total - st.people[a.id].total || a.name.localeCompare(b.name, 'pl'));
  html += `<div class="panel stats-people"><h3>Osoby <small>od najwięcej dyżurów · kliknij, by zobaczyć szczegóły</small></h3>
    <p class="stats-legend"><span><i class="sw start"></i>gównianość sprzed miesiąca</span><span><i class="sw"></i>w tym miesiącu</span>` +
    `<span><span class="pill lvl-3">Chcę</span><span class="pill lvl-2">Mogę</span><span class="pill lvl-1">Ost.</span> dostępność w dni dyżurów</span></p>
    <div class="srow shead" aria-hidden="true"><span>Osoba</span><span>Dyżury</span><span>Pt/So/Nd</span><span>Gównianość</span><span>Dostępność</span></div>` +
    rows.map((p) => {
      const x = st.people[p.id], s0 = start(p), lim = state.limits[p.id] ?? {}, min = state.mins[p.id] ?? {}, want = W[p.id] ?? {};
      const weLim = lim.we ?? WEEKEND_LIMIT;
      const places = state.shifts.filter((s) => x.n[s.id]).map((s) => `${esc(s.name)} ${x.n[s.id]}`).join(' · ') || 'brak dyżurów';
      const pills = [4, 3, 2, 1, 0].filter((l) => x.lvl[l]).map((l) => `<span class="pill lvl-${l}" title="${LEVELS[l]}">${['Nie mogę', 'Ost.', 'Mogę', 'Chcę', 'Muszę'][l]} ${x.lvl[l]}</span>`).join('') || '<span class="hint">—</span>';
      // Powody: co sprawiło, że osoba ma tyle dyżurów i takie dni
      const why = [];
      const diff = x.total - avg;
      why.push(['info', `<b>${dyzury(x.total)}</b> — ${Math.abs(diff) < 1 ? 'około' : diff > 0 ? 'więcej niż' : 'mniej niż'} średnio (${num(avg)})`]);
      if (x.days[0]) why.push(['hard', `<b>Nie mogę</b>: ${dni(x.days[0])} — w te dni nie dostanie dyżuru`]);
      if (x.days[4]) why.push(['hard', `<b>Muszę</b>: ${dni(x.days[4])} — dyżur obowiązkowy`]);
      if (x.days[3]) why.push(['pref', `<b>Chcę</b>: ${dni(x.days[3])}, dyżur w ${x.lvl[3]} z nich — pierwszeństwo przy wyborze`]);
      if (x.days[1]) why.push(['pref', `<b>W ostateczności</b>: ${dni(x.days[1])} — tylko gdy brak innych${x.lvl[1] ? `; użyte ${x.lvl[1]}×` : ''}`]);
      if (x.lvl[0]) why.push(['hard', `<b>${dyzury(x.lvl[0])} w dzień „Nie mogę”</b> — wpis ręczny łamie dostępność`]);
      if (p.prestige === 0) why.push(['info', '<b>Rezydent</b> — tego dnia najwyżej jeden rezydent, więc mniej wolnych terminów']);
      if (p.boss) why.push(['info', '<b>Kierownik</b> — najwyżej dwóch kierowników dziennie']);
      why.push(['info', `<b>Obciążenie na start: ${num(s0)} pkt</b> (średnio ${num(avgStart)}; historia ${num(h.pts[p.id] ?? 0)}${p.past ? ` + „ostatnio gówniane” ${p.past} × ${PAST_WEIGHT}` : ''})` +
        (s0 - avgStart >= Math.max(1, avgStart / 5) ? ' — więcej niż inni, więc gówniane dni idą najpierw do innych' : avgStart - s0 >= Math.max(1, avgStart / 5) ? ' — mniej niż inni, więc w gówniane dni idzie wcześniej' : '')]);
      why.push(['info', h.tragic[p.id] ? `<b>Ostatni Tragiczny:</b> ${h.tragic[p.id]} — Tragiczne idą do tych, którzy mieli je najdawniej` : '<b>Bez Tragicznego w historii</b> — w Tragiczny dzień idzie przed tymi, którzy już mieli']);
      if (x.manual) why.push(['info', `<b>Wpisy ręczne: ${x.manual}</b> — algorytm ich nie zmienia`]);
      if (x.sandwich) why.push(['pref', `<b>Kanapki: ${x.sandwich}</b> — dyżur co drugi dzień${p.pn1Sandwich === false ? '' : ' (PN1 So + Pn się nie liczy)'}`]);
      for (const r of state.rules.filter((r) => r.who === p.id))
        why.push(['hard', `<b>Warunek:</b> z ${esc(nameOf[r.with] ?? '?')} tylko na ${esc(r.places.map((id) => state.shifts.find((s) => s.id === id)?.name).filter(Boolean).join(', '))}`]);
      // Limity i prośby: dostał / min / limit / prośba w każdej kategorii, która coś ma
      const cats = [['*', 'Łącznie'], ['we', 'Pt/So/Nd'], ['d56', 'So + Nd'], ...state.shifts.map((s) => [s.id, esc(s.name)]), ['d4', 'Piątki'], ['d5', 'Soboty'], ['d6', 'Niedziele']];
      const limRows = cats.filter(([k]) => k === '*' || k === 'we' || lim[k] != null || min[k] != null || want[k] != null).map(([k, label]) => {
        const got = x.n[k] || 0, l = k === 'we' ? weLim : lim[k];
        const [cls, msg] = got < (min[k] ?? 0) ? ['lvl-0', 'poniżej minimum'] : l != null && got >= l ? ['lvl-4', got > l ? 'ponad limit' : 'limit osiągnięty'] :
          want[k] != null && want[k] !== got ? ['lvl-1', got < want[k] ? 'mniej niż prośba' : 'więcej niż prośba'] : want[k] != null ? ['lvl-3', 'prośba spełniona'] : ['', ''];
        return `<tr><th scope="row">${label}</th><td><b>${got}</b></td><td>${min[k] ?? '—'}</td><td class="${k === 'we' && lim.we == null ? 'hint' : ''}">${l ?? '∞'}</td><td>${want[k] ?? '—'}</td><td>${msg && `<span class="pill ${cls}">${msg}</span>`}</td></tr>`;
      }).join('');
      const maxDow = Math.max(1, ...x.dow);
      statDetail[p.id] = { name: p.name, sub: `${ROLES[roleOf(p)]} · ${dyzury(x.total)} · ${places}`,
        body: (uwaga(p.id) ? `<section><h4>Komentarz <small>z Zapisów</small></h4><p class="note-text">${esc(uwaga(p.id))}</p></section>` : '') +
          `<section><h4>Dlaczego tak</h4><ul class="why">${why.map(([t, w]) => `<li class="${t}">${w}</li>`).join('')}</ul></section>
          <section><h4>Limity i prośby <small>ten miesiąc</small></h4><div class="table-scroll"><table class="counts lims"><thead><tr><td></td><th scope="col">Dostał</th><th scope="col">Min.</th><th scope="col">Limit</th><th scope="col">Prośba</th><td></td></tr></thead><tbody>${limRows}</tbody></table></div></section>
          <section><h4>Dni tygodnia</h4><div class="dows">${DAYS.map((d, i) => `<span style="--k:${x.dow[i] / maxDow}" class="${x.dow[i] ? '' : 'zero'}"><small>${d}</small><b>${x.dow[i]}</b></span>`).join('')}</div></section>`,
        actions: `<button type="button" class="outlined" data-log="${p.id}">${HIST}Historia</button><button type="button" class="outlined" data-who="${p.id}">${CAL}Dostępność</button><button type="button" class="outlined" data-edit="${p.id}">${COG}Ustawienia</button><button type="button" class="outlined" data-limits="${p.id}">${GEAR}Limity</button><button>Zamknij</button>` };
      return `<button type="button" class="srow" data-stat="${p.id}" aria-haspopup="dialog">
        <span class="who-cell"><span class="avatar ${p.prestige ? '' : 'rez'}" aria-hidden="true">${esc(initials(p.name))}</span><span><b>${esc(p.name)}</b><small>${ROLES[roleOf(p)]}</small></span></span>
        <span class="cell-n"><span class="big">${x.total}<small> dyż.</small></span>${bar(x.total / maxN)}<small>${places}</small></span>
        <span class="cell-we ${(x.n.we || 0) >= weLim ? 'full' : ''}"><span class="big">${x.n.we || 0}<small> / ${weLim} Pt/So/Nd</small></span><small>Pt ${x.n.d4 || 0} · So ${x.n.d5 || 0} · Nd ${x.n.d6 || 0}</small></span>
        <span class="cell-bad"><span class="big">${num(s0 + x.bad)}<small> pkt</small></span><span class="meter two" aria-hidden="true"><i class="start" style="width:${s0 / maxBad * 100}%"></i><i style="width:${x.bad / maxBad * 100}%"></i></span><small>${num(s0)} wcześniej + ${x.bad} teraz</small></span>
        <span class="cell-lvl">${pills}</span>
        <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>`;
    }).join('') + '</div>';
  $('#stats').innerHTML = html;
  if ($('#pstat').open) showStat(); // okno osoby odświeża się razem ze statystykami (np. po zmianie ustawień)
}

function showStat() {
  const d = statDetail[statsWho];
  if (!d) return $('#pstat').close();
  $('#pstat-title').textContent = d.name;
  $('#pstat-sub').textContent = d.sub;
  $('#pstat-body').innerHTML = d.body;
  $('#pstat-actions').innerHTML = d.actions;
}

// Import grafiku z tabeli: plik .docx albo wklejony tekst → podgląd i łączenie osób → zapis jako ręczne dyżury.
// imp = { days: { dzień: { shiftId: imię } }, warn, names: [imię], map: { imię: personId | 'new:imię' | '' (pomiń) } }
let imp = null;
const dlg = $('#import');

// ponytail: czyta tylko pierwszą tabelę z word/document.xml (zip + natywny DecompressionStream), bez bibliotek; .doc/.odt nie
async function docxRows(file) {
  const buf = await file.arrayBuffer(), v = new DataView(buf);
  let e = buf.byteLength - 22;
  while (e > 0 && v.getUint32(e, true) !== 0x06054b50) e--; // koniec katalogu centralnego zip
  for (let p = v.getUint32(e + 16, true), n = v.getUint16(e + 10, true); n--; ) {
    const len = v.getUint16(p + 28, true);
    if (new TextDecoder().decode(new Uint8Array(buf, p + 46, len)) === 'word/document.xml') {
      const off = v.getUint32(p + 42, true);
      const data = new Blob([new Uint8Array(buf, off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), v.getUint32(p + 20, true))]);
      const xml = await new Response(v.getUint16(p + 10, true) ? data.stream().pipeThrough(new DecompressionStream('deflate-raw')) : data).text();
      const all = (el, tag) => [...el.getElementsByTagName(tag)];
      const tbl = all(new DOMParser().parseFromString(xml, 'application/xml'), 'w:tbl')[0];
      return tbl ? all(tbl, 'w:tr').map((tr) => all(tr, 'w:tc').map((tc) => all(tc, 'w:p').map((p) => all(p, 'w:t').map((t) => t.textContent).join('')).join(' '))) : [];
    }
    p += 46 + len + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return [];
}

function loadImport(rows) {
  const t = parseTable(rows, view.y, view.m, state.shifts);
  const names = [...new Set(Object.values(t.days).flatMap(Object.values))].sort((a, b) => a.localeCompare(b, 'pl'));
  const map = {};
  // najpierw osoby z programu (zapamiętane połączenie, potem nazwisko), reszta łączy się między sobą: „Niezgoda” → nowa „A. Niezgoda”
  for (const n of names) map[n] = team().find((p) => p.id === state.aliases[n.toLowerCase()])?.id ?? matchPerson(n, team()) ?? '';
  const fresh = names.filter((n) => !map[n]).map((n) => ({ id: 'new:' + n, name: n }));
  for (const n of names) map[n] ||= matchPerson(n, [...team(), ...fresh.filter((p) => p.name !== n)]) ?? 'new:' + n;
  imp = { ...t, names, map };
  renderImport();
}

// 'new:X', gdy X połączono z kimś innym, idzie za X (jeden krok — bez pętli)
const target = (v) => v.startsWith('new:') && imp.map[v.slice(4)] !== v ? imp.map[v.slice(4)] : v;

function renderImport() {
  const nameOf = Object.fromEntries(team().map((p) => [p.id, p.name]));
  const label = (v) => !v ? `<span class="skip">pominięty</span>` : v.startsWith('new:') ? `<span class="new">${esc(v.slice(4))} (nowa)</span>` : esc(nameOf[v]);
  const cols = state.shifts.filter((s) => Object.values(imp.days).some((d) => s.id in d));
  const n = Object.values(imp.days).reduce((a, d) => a + Object.values(d).filter((raw) => target(imp.map[raw])).length, 0);
  $('#import-preview').innerHTML = !imp.names.length && !imp.warn.length ? '' :
    (imp.warn.length ? `<ul class="warn">${imp.warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '') +
    `<h4>Połącz osoby <small>kto z programu to osoba z tabeli</small></h4><div class="map">` +
    imp.names.map((raw, i) => `<label for="imp-${i}">${esc(raw)}</label>
      <select id="imp-${i}" data-raw="${esc(raw)}" class="${imp.map[raw] ? imp.map[raw].startsWith('new:') ? 'new' : '' : 'skip'}">
        <option value="">— pomiń</option>
        <optgroup label="Osoby w programie">${team().map((p) => `<option value="${p.id}" ${imp.map[raw] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>
        <optgroup label="Dodaj jako nową osobę">${imp.names.map((o) => `<option value="new:${esc(o)}" ${imp.map[raw] === 'new:' + o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</optgroup>
      </select>`).join('') + '</div>' +
    `<h4>Podgląd <small>${Object.keys(imp.days).length} dni · ${n} dyżurów</small></h4><table class="preview"><tr><th>Dzień</th>${cols.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr>` +
    Object.entries(imp.days).map(([d, day]) => `<tr class="${weekday(view.y, view.m, +d) > 4 ? 'weekend' : ''}"><td>${d} ${DAYS[weekday(view.y, view.m, +d)]}</td>` +
      cols.map((s) => `<td>${s.id in day ? label(target(imp.map[day[s.id]])) : ''}</td>`).join('') + '</tr>').join('') + '</table>';
  $('#import-ok').disabled = !n;
  $('#import-ok').textContent = n ? `Importuj ${n} dyżurów` : 'Importuj';
}

document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

$('#app-settings-open').onclick = () => {
  $('#app-settings').showModal();
  if (!zapisy) return;
  $('#zapisy-fails').textContent = 'Wczytuję…';
  fetchKonta().then((k) => { $('#zapisy-fails').textContent = k.error ? `Nie udało się wczytać: ${k.error}` :
    `Złe próby logowania z 24 h: ${k.fails24h} (przy 100 logowanie wstrzymuje się dla wszystkich).`; });
};
$('#zapisy-od').onchange = (e) => update(() => { if (e.target.value) state.zapisyOd = e.target.value; else delete state.zapisyOd; });
$('#import-open').onclick = () => {
  imp = null;
  dlg.returnValue = '';
  dlg.querySelector('form').reset();
  $('#import-preview').innerHTML = '';
  $('#import-ok').disabled = true;
  $('#import-ok').textContent = 'Importuj';
  $('#import-title').textContent = `Import grafiku — ${$('#month-label').textContent}`;
  dlg.showModal();
};
dlg.oninput = (e) => {
  if (e.target.name === 'paste') loadImport(e.target.value.split(/\r?\n/).map((l) => l.split('\t')));
};
dlg.onchange = async (e) => {
  const { raw } = e.target.dataset;
  if (raw !== undefined) { imp.map[raw] = e.target.value; return renderImport(); }
  const file = e.target.files?.[0];
  if (!file) return;
  let rows = [];
  try { rows = await docxRows(file); } catch {}
  if (!rows.length) { imp = null; $('#import-preview').innerHTML = '<ul class="warn"><li>Nie znaleziono tabeli w pliku — potrzebny plik Word .docx.</li></ul>'; return; }
  loadImport(rows);
};
dlg.onclose = () => {
  if (dlg.returnValue !== 'ok' || !imp) return;
  update(() => {
    const ids = {};
    for (const raw of imp.names) {
      const v = target(imp.map[raw]);
      if (!v.startsWith('new:')) { ids[raw] = v; continue; }
      const name = v.slice(4);
      let p = state.people.find((p) => sameName(p.name, name));
      if (!p) state.people.push(p = person(name));
      delete p.gone; // usunięta osoba o tym imieniu wraca, jak przy dodawaniu
      ids[raw] = p.id;
    }
    for (const raw in ids) if (ids[raw]) state.aliases[raw.toLowerCase()] = ids[raw];
    for (const [d, day] of Object.entries(imp.days)) {
      const key = dateKey(view.y, view.m, +d);
      for (const [sid, raw] of Object.entries(day)) if (ids[raw])
        for (const obj of [state.schedule, state.manual]) (obj[key] ??= {})[sid] = ids[raw];
    }
  });
};

if (cloud) {
  $('#panel-account').hidden = false;
  $('#logout').onclick = cloudLogout;
  $('#reload').onclick = async (e) => {
    e.target.disabled = true;
    $('#reload-status').textContent = await reload().catch((err) => `Nie udało się: ${err.message}`);
    e.target.disabled = false;
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reload().catch(() => {}); });
}
if (zapisy) { $('#panel-zapisy').hidden = $('#panel-zapisy-od').hidden = false; $('#zapisy-link').href = ZAPISY_URL; }

render();
