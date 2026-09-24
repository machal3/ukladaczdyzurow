import { dateKey, daysInMonth, weekday, shiftsForDay, generateMonth } from './scheduler.js';

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
const now = new Date();
let view = { y: now.getFullYear(), m: now.getMonth() };

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
    const rows = shiftsForDay(state.shifts, y, m, d).map((s) => {
      const pid = nameOf[day[s.id]] ? day[s.id] : '';
      if (!pid) empty++;
      const manual = state.manual[key]?.[s.id] ? 'manual' : '';
      return `<label class="slot ${pid ? '' : 'unfilled'} ${manual}" title="${esc(s.name)}">
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
  for (const k of monthKeys()) for (const pid of Object.values(state.schedule[k] || {})) if (pid in count) count[pid]++;
  $('#people').innerHTML = state.people.map((p) => `<li>
      <span>${esc(p.name)}</span><span class="badge">${count[p.id]}</span>
      <button class="x" data-del-person="${p.id}" aria-label="Usuń ${esc(p.name)}">×</button></li>`).join('');
  $('#shifts').innerHTML = state.shifts.map((s) => `<li>
      <span>${esc(s.name)}</span>
      <span class="days">${DAYS.map((d, i) => `<button class="day ${s.days.includes(i) ? 'on' : ''}" data-toggle="${s.id}" data-day="${i}" aria-pressed="${s.days.includes(i)}">${d[0]}</button>`).join('')}</span>
      <button class="x" data-del-shift="${s.id}" aria-label="Usuń ${esc(s.name)}">×</button></li>`).join('');
  $('#status').textContent = empty ? `Nieobsadzone: ${empty}` : '';
}

function update(fn) { fn(); save(); render(); }

$('#prev').onclick = () => { view = view.m ? { y: view.y, m: view.m - 1 } : { y: view.y - 1, m: 11 }; render(); };
$('#next').onclick = () => { view = view.m < 11 ? { y: view.y, m: view.m + 1 } : { y: view.y + 1, m: 0 }; render(); };

$('#generate').onclick = () => update(() => {
  const keys = monthKeys();
  Object.assign(state.schedule, generateMonth(view.y, view.m, state.shifts, state.people, pick(state.manual, keys)));
});

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
  const { delPerson, delShift, toggle, day } = e.target.dataset;
  if (delPerson) update(() => { state.people = state.people.filter((p) => p.id !== delPerson); });
  if (delShift) update(() => { state.shifts = state.shifts.filter((s) => s.id !== delShift); });
  if (toggle) update(() => {
    const s = state.shifts.find((s) => s.id === toggle);
    const i = +day;
    s.days = s.days.includes(i) ? s.days.filter((x) => x !== i) : [...s.days, i].sort();
  });
};

render();
