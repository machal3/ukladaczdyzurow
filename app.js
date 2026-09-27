import { dateKey, daysInMonth, weekday, shiftsForDay, generateVariants, scoreMonth, PRIORITIES, PRIORITY_ORDER, availOf, breaksRule, LEVELS, ROLES, badOf, BAD, history, parseTable, matchPerson, personLog, PAST_WEIGHT, listPeople } from './scheduler.js';
import { cloudLoad, cloudSave, cloudLogout } from './cloud.js';

const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const STORE = 'dyzury-v1';
const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/></svg>'; // Lucide „sliders-horizontal” = ustawienia osoby
const WEEKEND_LIMIT = 2; // domyślny limit dyżurów Pt/So/Nd w miesiącu, gdy osoba nie ustawiła własnego

const cloud = await cloudLoad(); // null = tryb lokalny (tylko localStorage)
let state = cloud?.data ?? load() ?? {
  people: ['Anna Kowalska', 'Jan Nowak', 'Piotr Wiśniewski', 'Maria Zając', 'Tomasz Lis'].map(person),
  shifts: [
    { id: uid(), name: 'OITN', days: [0, 1, 2, 3, 4, 5, 6] },
    { id: uid(), name: 'PN1', days: [0, 1, 2, 3, 4, 5, 6] },
    { id: uid(), name: 'PN2', days: [0, 1, 2, 3, 4, 5, 6] },
  ],
  schedule: {}, // { 'YYYY-MM-DD': { shiftId: personId } }
  manual: {},   // ręczne przypisania — zachowane przy ponownym układaniu
};
state.avail ??= {}; // { personId: { 'YYYY-MM-DD': poziom 0-3 } } — patrz LEVELS
state.limits ??= {}; // { personId: { shiftId: maks. dyżurów w miesiącu, '*': maks. łącznie, we: maks. Pt/So/Nd } } — brak = bez limitu (we: WEEKEND_LIMIT)
state.mins ??= {}; // { personId: { shiftId / d4-d6 / we / '*': minimum dyżurów w miesiącu } } — idzie do generateMonth jako limits[pid].min
state.wants ??= {}; // { personId: { shiftId / d4-d6 / we / '*': ile dyżurów chce w miesiącu } } — prośby, miękkie (patrz generateMonth)
state.bad ??= {}; // { 'YYYY-MM-DD': gównianość 0-3 } — patrz BAD/badOf; osoba: person.past 0-3
state.rules ??= []; // [{ id, who, with, places: [shiftId] }] — patrz breaksRule
state.priority = [...new Set([...(state.priority ?? []), ...PRIORITY_ORDER])].filter((k) => k in PRIORITIES); // kolejność kryteriów układania
state.aliases ??= {}; // { 'imię z importowanej tabeli' (małe litery): personId } — zapamiętane połączenia z importu
for (const p of state.people) p.prestige ??= 1; // 0 = Rezydent, 1–2 = Starszy asystent — patrz ROLES; p.gone = usunięta (zostaje dla przeszłych dyżurów)
// jednorazowa migracja zapisanych danych: stare domyślne miejsca → OITN, PN1, PN2 (id zostają, więc grafik i limity też)
if (!state.miejscaV2) {
  const rename = { 'Oddział': 'OITN', 'SOR': 'PN1' };
  for (const s of state.shifts) s.name = rename[s.name] ?? s.name;
  for (const name of ['OITN', 'PN1', 'PN2'])
    if (!state.shifts.some((s) => s.name === name)) state.shifts.push({ id: uid(), name, days: [0, 1, 2, 3, 4, 5, 6] });
  state.miejscaV2 = true;
  save();
}
if (cloud && !cloud.data) save(); // pusta chmura → wysyłamy to, co było w tej przeglądarce
const now = new Date();
let view = { y: now.getFullYear(), m: now.getMonth(), who: null, bad: false, personTab: 'settings', q: '', role: null, none: false, sort: 'surname' }; // who: osoba, której dostępność edytujemy; bad: tryb oceny gównianości dni; personTab: karta okna osoby; q/role/none/sort: szukanie, filtry i sortowanie w zakładce Osoby (patrz listPeople)
let prevWho = null; // tryb sprzed otwarcia okna osoby
let back = 'settings'; // karta, na którą wraca „Gotowe” — ta, z której włączono tryb

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
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k]).map((k) => [k, obj[k]]));

function render() {
  const { y, m } = view;
  const monthName = new Date(y, m).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  $('#month-label').textContent = monthName;
  $('#today').classList.toggle('here', y === now.getFullYear() && m === now.getMonth());

  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const nameOf = Object.fromEntries(state.people.map((p) => [p.id, p.name]));

  const dayNames = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
  let html = dayNames.map((d) => `<div class="dow">${d}</div>`).join('');
  html += '<div class="cell empty"></div>'.repeat(weekday(y, m, 1));
  let empty = 0, slots = 0;
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(y, m, d);
    const day = state.schedule[key] || {};
    const lvl = view.who && availOf(state.avail, view.who, key);
    const b = badOf(state.bad, y, m, d);
    const rows = view.bad ? `<button class="avail ${['lvl-2', 'lvl-1', 'lvl-0', 'bad-3'][b]}" data-bad="${d}">${BAD[b]}</button>` :
      view.who ? `<button class="avail lvl-${lvl}" data-avail="${key}">${LEVELS[lvl]}</button>` :
      shiftsForDay(state.shifts, y, m, d).map((s) => {
      const pid = nameOf[day[s.id]] ? day[s.id] : '';
      slots++;
      if (!pid) empty++;
      const manual = state.manual[key]?.[s.id] ? 'manual' : '';
      const why = !pid ? '' : availOf(state.avail, pid, key) === 0 ? ' — ta osoba nie może tego dnia' :
        state.limits[pid]?.[s.id] === 0 ? ' — ta osoba nie dyżuruje na tym miejscu' :
        breaksRule(state.rules, day, pid, s.id) ? ' — łamie warunek' : '';
      const clash = why && 'clash';
      return `<label class="slot ${pid ? '' : 'unfilled'} ${manual} ${clash}" title="${esc(s.name)}${pid ? ` — ${esc(nameOf[pid])}` : ' — wybierz osobę'}${manual && ' — wpisany ręcznie'}${why}">
        <span class="slot-label">${esc(s.name)}</span>
        <span class="slot-name" aria-hidden="true">${pid ? esc(nameOf[pid]) : 'Wybierz osobę'}</span>
        <input data-key="${key}" data-shift="${s.id}" value="${pid ? esc(nameOf[pid]) : ''}" placeholder="—" autocomplete="off" role="combobox" aria-controls="picker" aria-label="${esc(s.name)}, ${d} ${monthName}">
      </label>`;
    }).join('');
    html += `<div class="cell burden-${b} ${key === todayKey ? 'today' : ''}">
      <div class="day-heading"><div class="num" aria-label="${dayNames[weekday(y, m, d)]}, ${d} ${monthName} — ${BAD[b]}">${d}</div><span class="day-name">${dayNames[weekday(y, m, d)]}</span>${key === todayKey ? '<span class="today-label">Dzisiaj</span>' : ''}</div><div class="day-slots">${rows}</div></div>`;
  }
  html += '<div class="cell empty"></div>'.repeat((7 - (weekday(y, m, 1) + daysInMonth(y, m)) % 7) % 7); // domknięcie ostatniego tygodnia
  $('#calendar').innerHTML = html;

  // Wydruk (pionowo, jedna kartka): dzień pod dniem, miejsca w kolumnach — widoczny tylko w @media print
  const cols = state.shifts.filter((s) => s.days.length);
  $('#print-sheet').innerHTML = `<h2>Grafik dyżurów — ${monthName[0].toUpperCase() + monthName.slice(1)}</h2><table><colgroup><col class="c-d"><col class="c-wd"></colgroup><thead><tr><th colspan="2">Dzień</th>${cols.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>` +
    Array.from({ length: daysInMonth(y, m) }, (_, i) => {
      const d = i + 1, key = dateKey(y, m, d), wd = weekday(y, m, d), day = state.schedule[key] || {};
      return `<tr class="${wd >= 5 ? 'we' : ''} ${wd === 0 ? 'mon' : ''}"><td class="d">${d}</td><td class="wd">${DAYS[wd]}</td>${cols.map((s) =>
        `<td>${!s.days.includes(wd) ? '' : nameOf[day[s.id]] ? esc(nameOf[day[s.id]]) : '<span class="none">—</span>'}</td>`).join('')}</tr>`;
    }).join('') + '</tbody></table>';

  // Statystyki miesiąca
  const count = Object.fromEntries(team().map((p) => [p.id, 0]));
  for (const k of monthKeys()) for (const pid of Object.values(state.schedule[k] || {})) if (pid in count) count[pid]++;
  const shown = listPeople(team(), count, view), filtered = view.q.trim() || view.role || view.none;
  $('#people').innerHTML = shown.map((p) => `<li class="${p.id === view.who ? 'on' : ''}">
      <span class="avatar ${p.prestige ? '' : 'rez'}" aria-hidden="true">${esc(p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</span>
      <span class="id"><button class="who ${p.id === view.who ? 'on' : ''}" data-who="${p.id}" aria-pressed="${p.id === view.who}" title="Dostępność w grafiku">${esc(p.name)}</button><span class="sub">${ROLES[p.prestige]}</span></span>
      <button class="x" data-del-person="${p.id}" aria-label="Usuń ${esc(p.name)}">×</button>
      <span class="foot"><span class="count"><b>${count[p.id]}</b>${dyzury(count[p.id]).replace(/^\d+ /, '')}<br>w tym miesiącu</span>
      <button class="edit" data-edit="${p.id}" aria-label="Ustawienia i historia: ${esc(p.name)}" title="Ustawienia i historia">${GEAR}<span>Ustawienia</span></button></span></li>`).join('') ||
    (team().length ? '<li class="no-match"><b>Nikt nie pasuje</b><span>Zmień wyszukiwanie lub filtry.</span><button type="button" class="outline" data-clear-filters>Wyczyść filtry</button></li>' : '');
  $('#people-count').textContent = filtered ? `Pokazano ${shown.length} z ${team().length}` : '';
  for (const b of document.querySelectorAll('[data-filter]')) b.setAttribute('aria-pressed', b.dataset.filter === 'none' ? view.none : b.dataset.filter === view.role);
  const max = Math.max(1, ...Object.values(count));
  const short = (p) => scoreMonth(view.y, view.m, state.schedule, state.shifts, [p], {}, {}, {}, { [p.id]: { min: state.mins[p.id] } }).min; // brak do minimów
  $('#summary-list').innerHTML = team().map((p) => `<li>
      <button class="who ${p.id === view.who ? 'on' : ''}" data-who="${p.id}" aria-pressed="${p.id === view.who}" title="Dostępność w grafiku">${esc(p.name)}</button>
      <span class="meter" aria-hidden="true"><i style="width:${count[p.id] / max * 100}%"></i></span>${short(p) ? `<span class="badge under" title="Do minimum brakuje: ${short(p)}">${count[p.id]}</span>` : `<span class="badge">${count[p.id]}</span>`}</li>`).join('');
  // Okno osoby: ustawienia (limity i prośby obowiązują w każdym miesiącu) + historia dyżurów
  const who = state.people.find((p) => p.id === view.who);
  // Treść budujemy tylko przy otwarciu / zmianie karty: przebudowa przy każdej zmianie pola zabiera fokus,
  // zamyka klawiaturę na telefonie i przewija okno do góry. Pola same pokazują zapisaną wartość.
  const personKey = `${view.who}|${view.personTab}`;
  if (who && $('#person').open && $('#person-body').dataset.key !== personKey) {
    $('#person-body').dataset.key = personKey;
    $('#person-title').textContent = who.name;
    for (const b of document.querySelectorAll('[data-ptab]')) b.setAttribute('aria-pressed', b.dataset.ptab === view.personTab);
    // ustawienia: po lewej osoba, po prawej jedna tabela — limit i prośba w jednym wierszu
    const num = (kind, key, ph, label) => `<input type="number" min="0" step="1" placeholder="${ph}" data-${kind}="${key}" value="${{ limit: state.limits, min: state.mins, want: state.wants }[kind][who.id]?.[key] ?? ''}" aria-label="${label}">`;
    const row = (name, key, ph, label) => `<tr><th scope="row">${name}</th><td>${num('min', key, '—', `Minimum: ${label}`)}</td>` +
      `<td>${num('limit', key, ph, `Limit: ${label}`)}</td><td>${num('want', key, '—', `Prośba: ${label}`)}</td></tr>`;
    const field = (name, hint, control) => `<label class="field"><span>${name}${hint ? `<small>${hint}</small>` : ''}</span>${control}</label>`;
    $('#person-body').innerHTML = view.personTab === 'history' ? logHtml(who) : `<div class="person-grid"><section><h4>Osoba</h4>` +
      field('Funkcja', '', `<select data-prestige>${ROLES.map((r, i) => `<option value="${i}" ${i === who.prestige ? 'selected' : ''}>${r}</option>`).join('')}</select>`) +
      field('Ostatnio gówniane', 'dyżury spoza grafiku, 0–3', `<select data-past>${BAD.map((_, i) => `<option value="${i}" ${i === (who.past ?? 0) ? 'selected' : ''}>${i}</option>`).join('')}</select>`) +
      field('Kanapka PN1 So + Pn', 'zaznaczone = woli ten układ', `<input type="checkbox" role="switch" data-pn1sandwich ${who.pn1Sandwich === false ? '' : 'checked'}>`) +
      `</section><section><h4>Limity i prośby</h4><table class="counts"><thead><tr><td></td><th scope="col">Min.</th><th scope="col">Limit</th><th scope="col">Prośba</th></tr></thead><tbody>` +
      row('Łącznie', '*', '∞', 'łącznie') + row('Pt/So/Nd', 'we', WEEKEND_LIMIT, 'Pt/So/Nd') +
      state.shifts.map((s) => row(esc(s.name), s.id, '∞', esc(s.name))).join('') +
      `<tr class="sub"><th colspan="4" scope="rowgroup">Ten sam dzień weekendu</th></tr>` +
      ['Pt', 'So', 'Nd'].map((n, i) => row(n, `d${i + 4}`, 1, `ten sam dzień ${n}`)).join('') +
      `</tbody></table><p class="hint">Puste pole = wartość domyślna (szara, ∞ = bez limitu). Limit 0 na miejscu = nie dyżuruje tam. Limity łącznie, Pt/So/Nd i na miejscu są twarde; minimum ma pierwszeństwo przed wszystkim poza twardymi zasadami; ten sam dzień weekendu i prośby — miękkie.</p></section></div>`;
  }
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
  const chips = (names, cls) => `<span class="cycle">${names.map((n, i) => `<span class="${cls[i]}">${n}</span>`).join('<span aria-hidden="true">→</span>')}</span>`;
  const done = '<button data-done>Gotowe</button>';
  $('#status').innerHTML = view.bad ? `<span><b>Gównianość dni</b> — klikaj dni, by zmienić:</span>${chips(BAD, ['lvl-2', 'lvl-1', 'lvl-0', 'bad-3'])}${done}` :
    view.who ? `<span><b>Dostępność: ${esc(nameOf[view.who])}</b> — klikaj dni, by zmienić:</span>${chips([2, 3, 0, 1].map((i) => LEVELS[i]), ['lvl-2', 'lvl-3', 'lvl-0', 'lvl-1'])}${done}` :
    empty === slots && slots ? '<span>Pusty grafik — <b>Ułóż miesiąc</b> wypełni go automatycznie; każde pole możesz też wpisać ręcznie.</span>' :
    empty ? `<span>Obsadzone <b class="ok">${slots - empty} z ${slots}</b></span><span class="progress" role="progressbar" aria-label="Obsadzone dyżury" aria-valuenow="${Math.round((slots - empty) / slots * 100)}"><i style="width:${(slots - empty) / slots * 100}%"></i></span>` +
      `<span>wolne: <b>${empty}</b></span><button class="ghost" data-jump>Pokaż pierwszy wolny →</button>` : '';
  $('#status').classList.toggle('info', !!view.who || view.bad || empty === slots);
  $('#bad-mode').setAttribute('aria-pressed', view.bad);
}

function update(fn) { fn(); save(); render(); }

$('#prev').onclick = () => { $('#panel-variants').hidden = true; view = { ...view, ...(view.m ? { m: view.m - 1 } : { y: view.y - 1, m: 11 }) }; render(); };
// „Dzisiaj” wraca do bieżącego miesiąca; na telefonie (kalendarz = lista dni) też przewija do dzisiejszego dnia
$('#today').onclick = () => {
  $('#panel-variants').hidden = true; view = { ...view, y: now.getFullYear(), m: now.getMonth() }; render();
  if (matchMedia('(max-width: 760px)').matches) $('.today')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
};
$('#next').onclick = () => { $('#panel-variants').hidden = true; view = { ...view, ...(view.m < 11 ? { m: view.m + 1 } : { y: view.y + 1, m: 0 }) }; render(); };

$('#generate').onclick = () => update(() => {
  view.who = null;
  view.bad = false;
  const keys = monthKeys();
  const h = history(state.schedule, state.bad, view.y, view.m);
  const people = team().map((p) => ({ ...p, hist: h.pts[p.id] ?? 0, tragic: h.tragic[p.id] }));
  // przeszłe dyżury usuniętych osób zostają, jak ręczne
  const locked = pick(state.manual, keys), gone = new Set(state.people.filter((p) => p.gone).map((p) => p.id));
  const today = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  for (const k of keys) if (k < today) for (const [sid, pid] of Object.entries(state.schedule[k] || {}))
    if (gone.has(pid)) (locked[k] = { ...locked[k] })[sid] = pid;
  const variants = generateVariants(view.y, view.m, state.shifts, people, locked, state.avail,
    Object.fromEntries(team().map((p) => [p.id, { we: WEEKEND_LIMIT, ...state.limits[p.id], min: state.mins[p.id] }])), state.rules, state.bad, state.wants, { order: state.priority });
  const prev = Object.fromEntries(keys.map((k) => [k, state.schedule[k]]));
  const apply = (i) => update(() => Object.assign(state.schedule, variants[i].schedule));
  apply(0);
  $('#panel-variants').hidden = variants.length < 2;
  if (variants.length < 2) return;
  // Kilka dobrych grafików → panel wyboru nad kalendarzem; zaznaczenie od razu pokazuje wariant
  $('#variants-list').innerHTML = variants.map(({ score: s }, i) => `<label class="variant"><input type="radio" name="variant" value="${i}" ${i ? '' : 'checked'}>
    <b>Wariant ${i + 1}</b><span class="hint">nieobsadzone ${s.unfilled} · ${s.min ? `brak do minimum ${s.min} · ` : ''}„W ostateczności” ${s.lastResort} · kanapki ${s.sandwich} ·
    niespełnione prośby ${s.wants} · różnica liczby dyżurów ${s.spread}</span></label>`).join('');
  $('#variants-list').onchange = (e) => apply(+e.target.value);
  $('#variants-undo').onclick = () => update(() => {
    for (const k of keys) if (prev[k]) state.schedule[k] = prev[k]; else delete state.schedule[k];
    $('#panel-variants').hidden = true;
  });
});
$('#variants-ok').onclick = () => { $('#panel-variants').hidden = true; };

// Zakładki: Grafik / Osoby / Dostosowywanie (priorytety, warunki, gównianość)
// Każda zakładka pamięta swoje przewinięcie; ponowne kliknięcie aktywnej wraca na górę.
const scrolls = {};
function showTab(tab) {
  const cur = document.body.dataset.tab;
  scrolls[cur] = tab === cur ? 0 : scrollY;
  document.body.dataset.tab = tab;
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-pressed', b.dataset.tab === tab);
  scrollTo({ top: scrolls[tab] ?? 0, behavior: 'instant' }); // instant: html ma scroll-behavior: smooth
}
$('.tabs').onclick = (e) => { const t = e.target.closest('[data-tab]'); if (t) showTab(t.dataset.tab); };

// „Gotowe” kończy dostępność/gównianość i wraca na kartę, z której je włączono
$('#status').onclick = (e) => {
  if ('done' in e.target.dataset) { view.who = null; view.bad = false; showTab(back); render(); }
  if ('jump' in e.target.dataset) { // pierwszy nieobsadzony dyżur: przewiń i ustaw kursor
    const input = $('#calendar .slot.unfilled input');
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input?.focus({ preventScroll: true });
  }
};
$('#bad-mode').onclick = () => { view.bad = !view.bad; view.who = null; back = 'settings'; if (view.bad) showTab('calendar'); render(); };

// Klik w dzień w trybie dostępności: Mogę → Chcę → Nie mogę → W ostateczności → Mogę
// W trybie gównianości: 0 → 1 → 2 → 3 → 0 (wartość równa domyślnej nie jest zapisywana)
$('#calendar').onclick = (e) => {
  const d = +e.target.dataset.bad;
  if (d) return update(() => {
    const key = dateKey(view.y, view.m, d);
    const next = (badOf(state.bad, view.y, view.m, d) + 1) % BAD.length;
    delete state.bad[key];
    if (next !== badOf(state.bad, view.y, view.m, d)) state.bad[key] = next;
  });
  const key = e.target.dataset.avail;
  if (!key) return;
  update(() => {
    const a = (state.avail[view.who] ??= {});
    const next = (availOf(state.avail, view.who, key) + 1) % LEVELS.length;
    if (next === 2) delete a[key]; else a[key] = next;
  });
};

$('#clear').onclick = () => {
  if (!confirm('Wyczyścić grafik tego miesiąca (łącznie z ręcznymi zmianami)?')) return;
  update(() => { for (const k of monthKeys()) { delete state.schedule[k]; delete state.manual[k]; } });
};

$('#print').onclick = () => window.print(); // wydruk / „Zapisz jako PDF” — obsługuje przeglądarka, patrz @media print w style.css

// Pole osoby: po kliknięciu czyści się i pokazuje własną listę osób, wpisywanie ją filtruje
// (bez wielkości liter i polskich znaków). Enter/klik wybiera, Esc lub brak dopasowania przywraca poprzednią wartość.
const picker = document.createElement('ul');
picker.id = 'picker'; picker.className = 'picker'; picker.role = 'listbox'; picker.hidden = true;
document.body.append(picker);
const fold = (t) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l');
let field = null, hits = [], active = 0;

function showPicker() {
  const q = fold(field.value.trim());
  hits = [{ id: '', name: '—' }, ...team()].filter((p) => !q || (p.id && fold(p.name).includes(q)));
  active = q ? 0 : Math.max(0, hits.findIndex((p) => p.name === field.dataset.was));
  picker.innerHTML = hits.map((p, i) => `<li role="option" data-i="${i}" ${i === active ? 'aria-selected="true"' : ''}>${esc(p.name)}</li>`).join('') ||
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
picker.onclick = (e) => { const i = e.target.dataset.i; if (i && field) choose(hits[i]); };

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
  const { delPerson, delRule, who, edit, up, filter } = e.target.dataset;
  if (filter === 'none') { view.none = !view.none; render(); }
  else if (filter) { view.role = view.role === filter ? null : filter; render(); }
  if ('clearFilters' in e.target.dataset) { Object.assign(view, { q: '', role: null, none: false }); $('#people-q').value = ''; render(); }
  if (up) update(() => { const i = +up; [state.priority[i - 1], state.priority[i]] = [state.priority[i], state.priority[i - 1]]; });
  if (e.target.dataset.go) showTab(e.target.dataset.go);
  if (delRule) update(() => { state.rules = state.rules.filter((r) => r.id !== delRule); });
  // imię = tryb dostępności w kalendarzu; „Ustawienia” = okno osoby (po zamknięciu wraca poprzedni tryb, chyba że „Dostępność →”)
  if (who) { view.who = view.who === who ? null : who; view.bad = false; back = e.target.closest('#summary') ? 'calendar' : 'people'; if (view.who) showTab('calendar'); render(); }
  if (edit) { prevWho = view.who; view.who = edit; view.bad = false; view.personTab = 'settings'; $('#person').returnValue = ''; $('#person-body').dataset.key = ''; $('#person').showModal(); render(); }
  if (delPerson && confirm(`Usunąć ${state.people.find((p) => p.id === delPerson).name}? Przeszłe dyżury zostaną w grafiku, przyszłe zostaną zwolnione.`)) update(() => {
    state.people.find((p) => p.id === delPerson).gone = true;
    const today = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
    for (const obj of [state.schedule, state.manual]) for (const [k, day] of Object.entries(obj))
      if (k >= today) for (const sid in day) if (day[sid] === delPerson) delete day[sid];
    delete state.avail[delPerson];
    delete state.limits[delPerson];
    delete state.wants[delPerson];
    delete state.mins[delPerson];
    state.rules = state.rules.filter((r) => r.who !== delPerson && r.with !== delPerson);
    if (view.who === delPerson) view.who = null;
  });
};

$('#people-q').oninput = (e) => { view.q = e.target.value; render(); };
$('#people-sort').onchange = (e) => { view.sort = e.target.value; render(); };

$('#person').onclose = () => { if ($('#person').returnValue !== 'avail') view.who = prevWho; render(); };
$('#person').onclick = (e) => {
  if (e.target.dataset.ptab) { view.personTab = e.target.dataset.ptab; render(); $('#person-body').scrollTop = 0; return; }
  if (e.target.dataset.go) showTab(e.target.dataset.go);
};
// Enter w polu liczby zatwierdza wartość zamiast zamykać okno (formularz method="dialog")
$('#person').onkeydown = (e) => { if (e.key === 'Enter' && e.target.type === 'number') { e.preventDefault(); e.target.blur(); } };
$('#person').onchange = (e) => {
  if ('past' in e.target.dataset)
    return update(() => { state.people.find((p) => p.id === view.who).past = +e.target.value; });
  if ('pn1sandwich' in e.target.dataset) // brak pola = włączone
    return update(() => { state.people.find((p) => p.id === view.who).pn1Sandwich = e.target.checked; });
  if ('prestige' in e.target.dataset)
    return update(() => { state.people.find((p) => p.id === view.who).prestige = +e.target.value; });
  const { limit, min, want } = e.target.dataset, sid = limit ?? min ?? want;
  if (!sid) return;
  const n = parseInt(e.target.value, 10);
  e.target.value = n >= 0 ? n : ''; // okno się nie przebudowuje, więc pole samo pokazuje zapisaną wartość
  update(() => {
    const l = ((limit ? state.limits : min ? state.mins : state.wants)[view.who] ??= {});
    if (n >= 0) l[sid] = n; else delete l[sid];
  });
};

// Historia osoby p: każdy dyżur z oglądanego miesiąca i 3 poprzednich — data, miejsce, gównianość, przerwa, ręczny/zaplanowany
function logHtml(p) {
  const pid = p.id;
  const shiftName = Object.fromEntries(state.shifts.map((s) => [s.id, s.name]));
  const today = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const log = personLog(state.schedule, state.bad, pid, view.y, view.m);
  const monthName = (y, m) => new Date(y, m).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  const summary = (list) => {
    const per = {};
    for (const x of list) per[x.sid] = (per[x.sid] || 0) + 1;
    const we = list.filter((x) => weekday(+x.key.slice(0, 4), x.key.slice(5, 7) - 1, +x.key.slice(8)) >= 4).length; // Pt/So/Nd
    return [dyzury(list.length), ...Object.entries(per).map(([sid, n]) => `${esc(shiftName[sid] ?? '(usunięte miejsce)')} ${n}`),
      `Pt/So/Nd ${we}`, `gównianość ${list.reduce((a, x) => a + x.bad, 0)} pkt`].join(' · ');
  };
  const hist = history(state.schedule, state.bad, view.y, view.m);
  let html = `<h3>Historia dyżurów</h3><p class="hint">Razem: ${summary(log)}<br>Do układania ${monthName(view.y, view.m)} liczy się: gównianość z poprzednich miesięcy ${+(hist.pts[pid] ?? 0).toFixed(2)} pkt (ważona ½, ¼, ⅛)` +
    ` + „ostatnio gówniane” ${p.past ?? 0} × ${PAST_WEIGHT}${hist.tragic[pid] ? ` · ostatni Tragiczny: ${hist.tragic[pid]}` : ''}</p>`;
  for (let i = 0; i < 4; i++) {
    const t = new Date(view.y, view.m - i), y = t.getFullYear(), m = t.getMonth();
    const list = log.filter((x) => x.key.startsWith(dateKey(y, m, 1).slice(0, 8))).reverse(); // najnowsze na górze
    html += `<h4>${monthName(y, m)} <small>${summary(list)}</small></h4>` + (!list.length ? '' :
      `<div class="table-scroll"><table class="preview"><tr><th>Dzień</th><th>Miejsce</th><th>Gównianość</th><th>Przerwa</th></tr>` +
      list.map((x) => {
        const d = +x.key.slice(8);
        const note = [state.manual[x.key]?.[x.sid] === pid && 'ręczny', x.key > today && 'zaplanowany'].filter(Boolean).join(', ');
        return `<tr class="${weekday(y, m, d) > 4 ? 'weekend' : ''}"><td>${d} ${DAYS[weekday(y, m, d)]}</td>` +
          `<td>${esc(shiftName[x.sid] ?? '(usunięte miejsce)')}${note && ` <small class="hint">${note}</small>`}</td><td>${BAD[x.bad]}</td>` +
          `<td>${x.gap === null ? '—' : x.gap === 1 ? '1 dzień' : `${x.gap} dni`}</td></tr>`;
      }).join('') + '</table></div>');
  }
  return html;
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

$('#app-settings-open').onclick = () => $('#app-settings').showModal();
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

if (cloud) { $('#panel-account').hidden = false; $('#logout').onclick = cloudLogout; }

render();
