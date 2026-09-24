import { dateKey, daysInMonth, weekday, shiftsForDay, generateMonth, availOf, breaksRule, LEVELS, ROLES, badOf, BAD, history } from './scheduler.js';

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
state.bad ??= {}; // { 'YYYY-MM-DD': gównianość 0-3 } — patrz BAD/badOf; osoba: person.past 0-3
state.rules ??= []; // [{ id, who, with, places: [shiftId] }] — patrz breaksRule
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
const now = new Date();
let view = { y: now.getFullYear(), m: now.getMonth(), who: null, bad: false }; // who: osoba, której dostępność edytujemy; bad: tryb oceny gównianości dni

function uid() { return Math.random().toString(36).slice(2, 10); }
function person(name) { return { id: uid(), name, prestige: 1 }; }
function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }
const $ = (s) => document.querySelector(s);
const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const monthKeys = () => Array.from({ length: daysInMonth(view.y, view.m) }, (_, i) => dateKey(view.y, view.m, i + 1));
const team = () => state.people.filter((p) => !p.gone); // aktywne osoby
const sameName = (a, b) => a.localeCompare(b, 'pl', { sensitivity: 'base' }) === 0;
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k]).map((k) => [k, obj[k]]));

function render() {
  const { y, m } = view;
  $('#month-label').textContent = new Date(y, m).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const nameOf = Object.fromEntries(state.people.map((p) => [p.id, p.name]));

  // jedna lista podpowiedzi dla wszystkich pól — przeglądarka filtruje ją w trakcie pisania
  let html = `<datalist id="team-list"><option value="—">(puste)</option>${team().map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>`;
  html += DAYS.map((d, i) => `<div class="dow ${i > 4 ? 'weekend' : ''}">${d}</div>`).join('');
  html += '<div class="cell empty"></div>'.repeat(weekday(y, m, 1));
  let empty = 0;
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(y, m, d);
    const day = state.schedule[key] || {};
    const lvl = view.who && availOf(state.avail, view.who, key);
    const b = badOf(state.bad, y, m, d);
    const rows = view.bad ? `<button class="avail ${['lvl-2', 'lvl-1', 'lvl-0', 'bad-3'][b]}" data-bad="${d}">${BAD[b]}</button>` :
      view.who ? `<button class="avail lvl-${lvl}" data-avail="${key}">${LEVELS[lvl]}</button>` :
      shiftsForDay(state.shifts, y, m, d).map((s) => {
      const pid = nameOf[day[s.id]] ? day[s.id] : '';
      if (!pid) empty++;
      const manual = state.manual[key]?.[s.id] ? 'manual' : '';
      const why = !pid ? '' : availOf(state.avail, pid, key) === 0 ? ' — ta osoba nie może tego dnia' :
        breaksRule(state.rules, day, pid, s.id) ? ' — łamie warunek' : '';
      const clash = why && 'clash';
      return `<label class="slot ${pid ? '' : 'unfilled'} ${manual} ${clash}" title="${esc(s.name)}${why}">
        <span>${esc(s.name)}</span>
        <input list="team-list" data-key="${key}" data-shift="${s.id}" value="${pid ? esc(nameOf[pid]) : ''}" placeholder="—" aria-label="${esc(s.name)}, ${d}">
      </label>`;
    }).join('');
    html += `<div class="cell ${weekday(y, m, d) > 4 ? 'weekend' : ''} ${key === todayKey ? 'today' : ''}">
      <div class="num">${d}</div>${rows}</div>`;
  }
  $('#calendar').innerHTML = html;

  // Statystyki miesiąca
  const count = Object.fromEntries(team().map((p) => [p.id, 0]));
  const whoShifts = { we: 0, bad: 0 }; // shiftId → dyżury wybranej osoby w tym miesiącu, we = w Pt/So/Nd, bad = pkt gównianości
  for (const k of monthKeys()) for (const [sid, pid] of Object.entries(state.schedule[k] || {})) {
    if (pid in count) count[pid]++;
    if (pid !== view.who) continue;
    whoShifts[sid] = (whoShifts[sid] || 0) + 1;
    if (weekday(y, m, +k.slice(8)) >= 4) whoShifts.we++;
    whoShifts.bad += badOf(state.bad, y, m, +k.slice(8));
  }
  const hist = history(state.schedule, state.bad, y, m);
  const limitsRow = (p) => `<li class="limits"><label><span>Funkcja</span><select data-prestige aria-label="Funkcja">` +
    ROLES.map((r, i) => `<option value="${i}" ${i === p.prestige ? 'selected' : ''}>${r}</option>`).join('') + `</select></label>` +
    `<label><span>Ostatnio gówniane (spoza grafiku)</span><select data-past aria-label="Jak gówniane dyżury miała ostatnio poza grafikiem">` +
    BAD.map((_, i) => `<option value="${i}" ${i === (p.past ?? 0) ? 'selected' : ''}>${i}</option>`).join('') +
    `</select></label><small>Gównianość w tym miesiącu: ${whoShifts.bad} pkt · z poprzednich: ${+(hist.pts[p.id] ?? 0).toFixed(1)} pkt` +
    `${hist.tragic.has(p.id) ? ' · miał(a) Tragiczny — teraz omijany(a)' : ''}</small>` +
    limitsFor(p.id);
  const limitsFor = (pid) => `<small>Limit w miesiącu (puste = bez limitu)</small>` +
    [{ id: '*', name: 'Łącznie' }, { id: 'we', name: 'Pt/So/Nd' }, ...state.shifts].map((s) => `<label><span>${esc(s.name)}</span><small>${s.id === '*' ? count[pid] : whoShifts[s.id] || 0} /</small>
      <input type="number" min="0" step="1" placeholder="${s.id === 'we' ? WEEKEND_LIMIT : '∞'}" data-limit="${s.id}" value="${state.limits[pid]?.[s.id] ?? ''}" aria-label="Limit: ${esc(s.name)}"></label>`).join('') + '</li>';
  $('#people').innerHTML = team().map((p) => `<li>
      <button class="who ${p.id === view.who ? 'on' : ''}" data-who="${p.id}" aria-pressed="${p.id === view.who}" title="Edytuj dostępność i limity">${esc(p.name)}</button><span class="badge" title="${ROLES[p.prestige]}">${p.prestige ? `SA ${p.prestige}` : 'Rez.'}</span><span class="badge">${count[p.id]}</span>
      <button class="x" data-del-person="${p.id}" aria-label="Usuń ${esc(p.name)}">×</button></li>${p.id === view.who ? limitsRow(p) : ''}`).join('');
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
  $('#status').textContent = view.bad ? 'Gównianość dni — klikaj dni, by zmienić' :
    view.who ? `Dostępność: ${nameOf[view.who]} — klikaj dni, by zmienić` :
    empty ? `Nieobsadzone: ${empty}` : '';
  $('#status').classList.toggle('info', !!view.who || view.bad);
  $('#bad-mode').setAttribute('aria-pressed', view.bad);
}

function update(fn) { fn(); save(); render(); }

$('#prev').onclick = () => { view = { ...view, ...(view.m ? { m: view.m - 1 } : { y: view.y - 1, m: 11 }) }; render(); };
$('#next').onclick = () => { view = { ...view, ...(view.m < 11 ? { m: view.m + 1 } : { y: view.y + 1, m: 0 }) }; render(); };

$('#generate').onclick = () => update(() => {
  view.who = null;
  view.bad = false;
  const keys = monthKeys();
  const h = history(state.schedule, state.bad, view.y, view.m);
  const people = team().map((p) => ({ ...p, hist: h.pts[p.id] ?? 0, tragic: h.tragic.has(p.id) }));
  // przeszłe dyżury usuniętych osób zostają, jak ręczne
  const locked = pick(state.manual, keys), gone = new Set(state.people.filter((p) => p.gone).map((p) => p.id));
  const today = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  for (const k of keys) if (k < today) for (const [sid, pid] of Object.entries(state.schedule[k] || {}))
    if (gone.has(pid)) (locked[k] = { ...locked[k] })[sid] = pid;
  Object.assign(state.schedule, generateMonth(view.y, view.m, state.shifts, people, locked, state.avail,
    Object.fromEntries(team().map((p) => [p.id, { we: WEEKEND_LIMIT, ...state.limits[p.id] }])), state.rules, state.bad));
});

$('#bad-mode').onclick = () => { view.bad = !view.bad; view.who = null; render(); };

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

// Pole osoby: po kliknięciu czyści się, żeby pokazać całą listę; wpisywanie ją filtruje.
// Bez wyboru (pusto / nieznane imię) wraca poprzednia wartość; „—” zwalnia dyżur.
$('#calendar').addEventListener('focusin', (e) => {
  if (!e.target.dataset.shift) return;
  e.target.dataset.was = e.target.value;
  e.target.placeholder = e.target.value || '—';
  e.target.value = '';
});
$('#calendar').addEventListener('focusout', (e) => {
  if (e.target.dataset.shift && !e.target.value) { e.target.value = e.target.dataset.was; e.target.placeholder = '—'; }
});

$('#calendar').onchange = (e) => {
  const { key, shift, was } = e.target.dataset;
  const name = e.target.value.trim();
  if (!name) return;
  const pid = name === '—' ? '' : team().find((p) => sameName(p.name, name))?.id;
  if (pid === undefined || name === was) { e.target.value = was; return; }
  update(() => {
    for (const obj of [state.schedule, state.manual]) {
      obj[key] ??= {};
      if (pid) obj[key][shift] = pid; else delete obj[key][shift];
    }
  });
};

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

document.querySelector('aside').onclick = (e) => {
  const { delPerson, delRule, who } = e.target.dataset;
  if (delRule) update(() => { state.rules = state.rules.filter((r) => r.id !== delRule); });
  if (who) { view.who = view.who === who ? null : who; view.bad = false; render(); }
  if (delPerson && confirm(`Usunąć ${state.people.find((p) => p.id === delPerson).name}? Przeszłe dyżury zostaną w grafiku, przyszłe zostaną zwolnione.`)) update(() => {
    state.people.find((p) => p.id === delPerson).gone = true;
    const today = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
    for (const obj of [state.schedule, state.manual]) for (const [k, day] of Object.entries(obj))
      if (k >= today) for (const sid in day) if (day[sid] === delPerson) delete day[sid];
    delete state.avail[delPerson];
    delete state.limits[delPerson];
    state.rules = state.rules.filter((r) => r.who !== delPerson && r.with !== delPerson);
    if (view.who === delPerson) view.who = null;
  });
};

document.querySelector('aside').onchange = (e) => {
  if ('past' in e.target.dataset)
    return update(() => { state.people.find((p) => p.id === view.who).past = +e.target.value; });
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
