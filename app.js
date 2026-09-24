import { dateKey, daysInMonth, weekday, shiftsForDay, generateMonth, availOf, LEVELS } from './scheduler.js';

const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const STORE = 'dyzury-v1';
const WEEKEND_LIMIT = 2; // domyślny limit dyżurów Pt/So/Nd w miesiącu, gdy osoba nie ustawiła własnego

// ponytail: localStorage jako baza; backend dopiero gdy dane mają być współdzielone między osobami
let state = load() || {
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
// jednorazowa migracja zapisanych danych: stare domyślne miejsca → OITN, PN1, PN2 (id zostają, więc grafik i limity też)
if (!state.miejscaV2) {
  const rename = { 'Oddział': 'OITN', 'SOR': 'PN1' };
  for (const s of state.shifts) s.name = rename[s.name] ?? s.name;
  for (const name of ['OITN', 'PN1', 'PN2'])
    if (!state.shifts.some((s) => s.name === name)) state.shifts.push({ id: uid(), name, days: [0, 1, 2, 3, 4, 5, 6] });
  state.miejscaV2 = true;
  save();
}
const now = new Date();
let view = { y: now.getFullYear(), m: now.getMonth(), who: null }; // who: osoba, której dostępność edytujemy

function uid() { return Math.random().toString(36).slice(2, 10); }
function person(name) { return { id: uid(), name }; }
function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }
const $ = (s) => document.querySelector(s);
const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const monthKeys = () => Array.from({ length: daysInMonth(view.y, view.m) }, (_, i) => dateKey(view.y, view.m, i + 1));
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k]).map((k) => [k, obj[k]]));

function render() {
  const { y, m } = view;
  $('#month-label').textContent = new Date(y, m).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const nameOf = Object.fromEntries(state.people.map((p) => [p.id, p.name]));
  const options = (sel) => `<option value="">—</option>` +
    state.people.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

  let html = DAYS.map((d, i) => `<div class="dow ${i > 4 ? 'weekend' : ''}">${d}</div>`).join('');
  html += '<div class="cell empty"></div>'.repeat(weekday(y, m, 1));
  let empty = 0;
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(y, m, d);
    const day = state.schedule[key] || {};
    const lvl = view.who && availOf(state.avail, view.who, key);
    const rows = view.who ? `<button class="avail lvl-${lvl}" data-avail="${key}">${LEVELS[lvl]}</button>` :
      shiftsForDay(state.shifts, y, m, d).map((s) => {
      const pid = nameOf[day[s.id]] ? day[s.id] : '';
      if (!pid) empty++;
      const manual = state.manual[key]?.[s.id] ? 'manual' : '';
      const clash = pid && availOf(state.avail, pid, key) === 0 ? 'clash' : '';
      return `<label class="slot ${pid ? '' : 'unfilled'} ${manual} ${clash}" title="${esc(s.name)}${clash && ' — ta osoba nie może tego dnia'}">
        <span>${esc(s.name)}</span>
        <select data-key="${key}" data-shift="${s.id}" aria-label="${esc(s.name)}, ${d}">${options(pid)}</select>
      </label>`;
    }).join('');
    html += `<div class="cell ${weekday(y, m, d) > 4 ? 'weekend' : ''} ${key === todayKey ? 'today' : ''}">
      <div class="num">${d}</div>${rows}</div>`;
  }
  $('#calendar').innerHTML = html;

  // Statystyki miesiąca
  const count = Object.fromEntries(state.people.map((p) => [p.id, 0]));
  const whoShifts = { we: 0 }; // shiftId → dyżury wybranej osoby w tym miesiącu, we = w Pt/So/Nd
  for (const k of monthKeys()) for (const [sid, pid] of Object.entries(state.schedule[k] || {})) {
    if (pid in count) count[pid]++;
    if (pid === view.who) whoShifts[sid] = (whoShifts[sid] || 0) + 1;
    if (pid === view.who && weekday(y, m, +k.slice(8)) >= 4) whoShifts.we++;
  }
  const limitsRow = (pid) => `<li class="limits"><small>Limit w miesiącu (puste = bez limitu)</small>` +
    [{ id: '*', name: 'Łącznie' }, { id: 'we', name: 'Pt/So/Nd' }, ...state.shifts].map((s) => `<label><span>${esc(s.name)}</span><small>${s.id === '*' ? count[pid] : whoShifts[s.id] || 0} /</small>
      <input type="number" min="0" step="1" placeholder="${s.id === 'we' ? WEEKEND_LIMIT : '∞'}" data-limit="${s.id}" value="${state.limits[pid]?.[s.id] ?? ''}" aria-label="Limit: ${esc(s.name)}"></label>`).join('') + '</li>';
  $('#people').innerHTML = state.people.map((p) => `<li>
      <button class="who ${p.id === view.who ? 'on' : ''}" data-who="${p.id}" aria-pressed="${p.id === view.who}" title="Edytuj dostępność i limity">${esc(p.name)}</button><span class="badge">${count[p.id]}</span>
      <button class="x" data-del-person="${p.id}" aria-label="Usuń ${esc(p.name)}">×</button></li>${p.id === view.who ? limitsRow(p.id) : ''}`).join('');
  $('#shifts').innerHTML = state.shifts.map((s) => `<li>
      <span>${esc(s.name)}</span>
      <span class="days">${DAYS.map((d, i) => `<button class="day ${s.days.includes(i) ? 'on' : ''}" data-toggle="${s.id}" data-day="${i}" aria-pressed="${s.days.includes(i)}">${d[0]}</button>`).join('')}</span>
      <button class="x" data-del-shift="${s.id}" aria-label="Usuń ${esc(s.name)}">×</button></li>`).join('');
  $('#status').textContent = view.who ? `Dostępność: ${nameOf[view.who]} — klikaj dni, by zmienić` :
    empty ? `Nieobsadzone: ${empty}` : '';
  $('#status').classList.toggle('info', !!view.who);
}

function update(fn) { fn(); save(); render(); }

$('#prev').onclick = () => { view = { ...view, ...(view.m ? { m: view.m - 1 } : { y: view.y - 1, m: 11 }) }; render(); };
$('#next').onclick = () => { view = { ...view, ...(view.m < 11 ? { m: view.m + 1 } : { y: view.y + 1, m: 0 }) }; render(); };

$('#generate').onclick = () => update(() => {
  view.who = null;
  const keys = monthKeys();
  Object.assign(state.schedule, generateMonth(view.y, view.m, state.shifts, state.people, pick(state.manual, keys), state.avail,
    Object.fromEntries(state.people.map((p) => [p.id, { we: WEEKEND_LIMIT, ...state.limits[p.id] }]))));
});

// Klik w dzień w trybie dostępności: Mogę → Chcę → Nie mogę → W ostateczności → Mogę
$('#calendar').onclick = (e) => {
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

$('#calendar').onchange = (e) => {
  const { key, shift } = e.target.dataset;
  update(() => {
    for (const obj of [state.schedule, state.manual]) {
      obj[key] ??= {};
      if (e.target.value) obj[key][shift] = e.target.value; else delete obj[key][shift];
    }
  });
};

$('#add-person').onsubmit = (e) => {
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (name) update(() => state.people.push(person(name)));
  e.target.reset();
};

$('#add-shift').onsubmit = (e) => {
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (name) update(() => state.shifts.push({ id: uid(), name, days: [0, 1, 2, 3, 4, 5, 6] }));
  e.target.reset();
};

document.querySelector('aside').onclick = (e) => {
  const { delPerson, delShift, toggle, day, who } = e.target.dataset;
  if (who) { view.who = view.who === who ? null : who; render(); }
  if (delPerson) update(() => {
    state.people = state.people.filter((p) => p.id !== delPerson);
    delete state.avail[delPerson];
    delete state.limits[delPerson];
    if (view.who === delPerson) view.who = null;
  });
  if (delShift) update(() => { state.shifts = state.shifts.filter((s) => s.id !== delShift); });
  if (toggle) update(() => {
    const s = state.shifts.find((s) => s.id === toggle);
    const i = +day;
    s.days = s.days.includes(i) ? s.days.filter((x) => x !== i) : [...s.days, i].sort();
  });
};

document.querySelector('aside').onchange = (e) => {
  const sid = e.target.dataset.limit;
  if (!sid) return;
  const n = parseInt(e.target.value, 10);
  update(() => {
    const l = (state.limits[view.who] ??= {});
    if (n >= 0) l[sid] = n; else delete l[sid];
  });
};

render();
