import { dateKey, daysInMonth, weekday, shiftsForDay, generateMonth, availOf, breaksRule, LEVELS, ROLES } from './scheduler.js';

const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const STORE = 'dyzury-v1';

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
state.limits ??= {}; // { personId: { shiftId: maks. dyżurów w miesiącu, '*': maks. łącznie } } — brak = bez limitu
state.rules ??= []; // [{ id, who, with, places: [shiftId] }] — patrz breaksRule
for (const p of state.people) p.prestige ??= 1; // 0 = Rezydent, 1–2 = Starszy asystent — patrz ROLES
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
function person(name) { return { id: uid(), name, prestige: 1 }; }
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
      const why = !pid ? '' : availOf(state.avail, pid, key) === 0 ? ' — ta osoba nie może tego dnia' :
        breaksRule(state.rules, day, pid, s.id) ? ' — łamie warunek' : '';
      const clash = why && 'clash';
      return `<label class="slot ${pid ? '' : 'unfilled'} ${manual} ${clash}" title="${esc(s.name)}${why}">
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
  const whoShifts = {}; // shiftId → dyżury wybranej osoby w tym miesiącu
  for (const k of monthKeys()) for (const [sid, pid] of Object.entries(state.schedule[k] || {})) {
    if (pid in count) count[pid]++;
    if (pid === view.who) whoShifts[sid] = (whoShifts[sid] || 0) + 1;
  }
  const limitsRow = (p) => `<li class="limits"><label><span>Funkcja</span><select data-prestige aria-label="Funkcja">` +
    ROLES.map((r, i) => `<option value="${i}" ${i === p.prestige ? 'selected' : ''}>${r}</option>`).join('') + `</select></label>` +
    limitsFor(p.id);
  const limitsFor = (pid) => `<small>Limit w miesiącu (puste = bez limitu)</small>` +
    [{ id: '*', name: 'Łącznie' }, ...state.shifts].map((s) => `<label><span>${esc(s.name)}</span><small>${s.id === '*' ? count[pid] : whoShifts[s.id] || 0} /</small>
      <input type="number" min="0" step="1" placeholder="∞" data-limit="${s.id}" value="${state.limits[pid]?.[s.id] ?? ''}" aria-label="Limit: ${esc(s.name)}"></label>`).join('') + '</li>';
  $('#people').innerHTML = state.people.map((p) => `<li>
      <button class="who ${p.id === view.who ? 'on' : ''}" data-who="${p.id}" aria-pressed="${p.id === view.who}" title="Edytuj dostępność i limity">${esc(p.name)}</button><span class="badge" title="${ROLES[p.prestige]}">${p.prestige ? `SA ${p.prestige}` : 'Rez.'}</span><span class="badge">${count[p.id]}</span>
      <button class="x" data-del-person="${p.id}" aria-label="Usuń ${esc(p.name)}">×</button></li>${p.id === view.who ? limitsRow(p) : ''}`).join('');
  const shiftName = Object.fromEntries(state.shifts.map((s) => [s.id, s.name]));
  $('#rules').innerHTML = state.rules.map((r) => `<li>
      <span>Gdy <b>${esc(nameOf[r.who])}</b> dyżuruje z <b>${esc(nameOf[r.with])}</b>, jest w: ${esc(r.places.map((id) => shiftName[id]).filter(Boolean).join(', ') || '—')}</span>
      <button class="x" data-del-rule="${r.id}" aria-label="Usuń warunek">×</button></li>`).join('');
  const people = (name, label) => `<select name="${name}" aria-label="${label}" required><option value="">${label}…</option>` +
    state.people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') + '</select>';
  $('#add-rule').innerHTML = `<label>Gdy ${people('who', 'Osoba')}</label><label>dyżuruje z ${people('with', 'Z kim')}</label>
    <fieldset><legend>to jest w:</legend>${state.shifts.map((s) =>
      `<label class="chk"><input type="checkbox" name="places" value="${s.id}">${esc(s.name)}</label>`).join('')}</fieldset>
    <button>Dodaj warunek</button>`;
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
  Object.assign(state.schedule, generateMonth(view.y, view.m, state.shifts, state.people, pick(state.manual, keys), state.avail, state.limits, state.rules));
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

$('#add-rule').onsubmit = (e) => {
  e.preventDefault();
  const f = e.target;
  const places = [...f.querySelectorAll('[name=places]:checked')].map((c) => c.value);
  if (f.who.value === f.with.value) return alert('Wybierz dwie różne osoby.');
  if (!places.length) return alert('Zaznacz co najmniej jedno miejsce.');
  update(() => state.rules.push({ id: uid(), who: f.who.value, with: f.with.value, places }));
};

document.querySelector('aside').onclick = (e) => {
  const { delPerson, delRule, who } = e.target.dataset;
  if (delRule) update(() => { state.rules = state.rules.filter((r) => r.id !== delRule); });
  if (who) { view.who = view.who === who ? null : who; render(); }
  if (delPerson) update(() => {
    state.people = state.people.filter((p) => p.id !== delPerson);
    delete state.avail[delPerson];
    delete state.limits[delPerson];
    state.rules = state.rules.filter((r) => r.who !== delPerson && r.with !== delPerson);
    if (view.who === delPerson) view.who = null;
  });
};

document.querySelector('aside').onchange = (e) => {
  if ('prestige' in e.target.dataset)
    return update(() => { state.people.find((p) => p.id === view.who).prestige = +e.target.value; });
  const sid = e.target.dataset.limit;
  if (!sid) return;
  const n = parseInt(e.target.value, 10);
  update(() => {
    const l = (state.limits[view.who] ??= {});
    if (n >= 0) l[sid] = n; else delete l[sid];
  });
};

render();
