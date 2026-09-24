import { dateKey, daysInMonth, weekday, shiftsForDay, generateVariants, PRIORITIES, PRIORITY_ORDER, availOf, breaksRule, LEVELS, ROLES, badOf, BAD, history, parseTable, matchPerson, personLog, PAST_WEIGHT } from './scheduler.js';
import { cloudLoad, cloudSave, cloudLogout } from './cloud.js';

const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const STORE = 'dyzury-v1';
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
state.wants ??= {}; // { personId: { shiftId: ile dyżurów chce w miesiącu } } — prośby, miękkie (patrz generateMonth)
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
let view = { y: now.getFullYear(), m: now.getMonth(), who: null, bad: false }; // who: osoba, której dostępność edytujemy; bad: tryb oceny gównianości dni

function uid() { return Math.random().toString(36).slice(2, 10); }
function person(name) { return { id: uid(), name, prestige: 1 }; }
function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }
function save() { const json = JSON.stringify(state); try { localStorage.setItem(STORE, json); } catch {} cloudSave(json); }
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
      <div class="num" data-dow="${DAYS[weekday(y, m, d)]}">${d}</div>${rows}</div>`;
  }
  $('#calendar').innerHTML = html;

  // Statystyki miesiąca
  const count = Object.fromEntries(team().map((p) => [p.id, 0]));
  const whoShifts = { we: 0 }; // shiftId → dyżury wybranej osoby w tym miesiącu, we = w Pt/So/Nd
  for (const k of monthKeys()) for (const [sid, pid] of Object.entries(state.schedule[k] || {})) {
    if (pid in count) count[pid]++;
    if (pid !== view.who) continue;
    whoShifts[sid] = (whoShifts[sid] || 0) + 1;
    if (weekday(y, m, +k.slice(8)) >= 4) whoShifts.we++;
  }
  $('#people').innerHTML = team().map((p) => `<li>
      <button class="who ${p.id === view.who ? 'on' : ''}" data-who="${p.id}" aria-pressed="${p.id === view.who}" title="Dostępność w grafiku, ustawienia i historia">${esc(p.name)}</button><span class="badge" title="${ROLES[p.prestige]}">${p.prestige ? `SA ${p.prestige}` : 'Rez.'}</span><span class="badge">${count[p.id]}</span>
      <button class="x" data-del-person="${p.id}" aria-label="Usuń ${esc(p.name)}">×</button></li>`).join('');
  // Okno osoby: ustawienia (limity i prośby dotyczą oglądanego miesiąca) + historia dyżurów
  const who = state.people.find((p) => p.id === view.who);
  if (who && $('#person').open) {
    $('#person-title').textContent = `${who.name} — ${$('#month-label').textContent}`;
    $('#person-body').innerHTML = `<div class="person-grid">` +
      `<section class="limits"><h4>Osoba</h4><label><span>Funkcja</span><select data-prestige aria-label="Funkcja">` +
      ROLES.map((r, i) => `<option value="${i}" ${i === who.prestige ? 'selected' : ''}>${r}</option>`).join('') + `</select></label>` +
      `<label><span>Ostatnio gówniane (spoza grafiku)</span><select data-past aria-label="Jak gówniane dyżury miała ostatnio poza grafikiem">` +
      BAD.map((_, i) => `<option value="${i}" ${i === (who.past ?? 0) ? 'selected' : ''}>${i}</option>`).join('') + `</select></label></section>` +
      `<section class="limits"><h4>Limit w miesiącu <small>puste = bez limitu</small></h4>` +
      [{ id: '*', name: 'Łącznie' }, { id: 'we', name: 'Pt/So/Nd' }, ...state.shifts].map((s) => `<label><span>${esc(s.name)}</span><small>${s.id === '*' ? count[who.id] : whoShifts[s.id] || 0} /</small>
        <input type="number" min="0" step="1" placeholder="${s.id === 'we' ? WEEKEND_LIMIT : '∞'}" data-limit="${s.id}" value="${state.limits[who.id]?.[s.id] ?? ''}" aria-label="Limit: ${esc(s.name)}"></label>`).join('') + '</section>' +
      `<section class="limits"><h4>Prośby w miesiącu <small>ile chce na miejscu</small></h4>` +
      state.shifts.map((s) => `<label><span>${esc(s.name)}</span><small>${whoShifts[s.id] || 0} /</small>
        <input type="number" min="0" step="1" placeholder="—" data-want="${s.id}" value="${state.wants[who.id]?.[s.id] ?? ''}" aria-label="Prośba: ${esc(s.name)}"></label>`).join('') + '</section></div>' +
      logHtml(who);
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
  $('#priority').innerHTML = state.priority.map((k, i) => `<li><span>${i + 1}. ${PRIORITIES[k]}</span>
      <button class="x" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Wyżej: ${PRIORITIES[k]}">↑</button>
      <button class="x" data-up="${i + 1}" ${i < state.priority.length - 1 ? '' : 'disabled'} aria-label="Niżej: ${PRIORITIES[k]}">↓</button></li>`).join('');
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
  const variants = generateVariants(view.y, view.m, state.shifts, people, locked, state.avail,
    Object.fromEntries(team().map((p) => [p.id, { we: WEEKEND_LIMIT, ...state.limits[p.id] }])), state.rules, state.bad, state.wants, { order: state.priority });
  const prev = Object.fromEntries(keys.map((k) => [k, state.schedule[k]]));
  const apply = (i) => update(() => Object.assign(state.schedule, variants[i].schedule));
  apply(0);
  if (variants.length < 2) return;
  // Kilka równie dobrych/podobnych grafików → wybór; zaznaczenie od razu pokazuje wariant w kalendarzu
  $('#variants-list').innerHTML = variants.map(({ score: s }, i) => `<label class="chk"><input type="radio" name="variant" value="${i}" ${i ? '' : 'checked'}>
    <span><b>Wariant ${i + 1}</b> — nieobsadzone: ${s.unfilled}, „W ostateczności”: ${s.lastResort}, kanapki: ${s.sandwich},
    niespełnione prośby: ${s.wants}, różnica liczby dyżurów: ${s.spread}</span></label>`).join('');
  $('#variants-list').onchange = (e) => apply(+e.target.value);
  $('#variants').onclose = () => {
    if ($('#variants').returnValue === 'cancel') update(() => { for (const k of keys) if (prev[k]) state.schedule[k] = prev[k]; else delete state.schedule[k]; });
  };
  $('#variants').returnValue = '';
  $('#variants').showModal();
});

// Zakładki na telefonie (na szerokim ekranie ukryte, wszystko widać naraz)
function showTab(tab) {
  document.body.dataset.tab = tab;
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-pressed', b.dataset.tab === tab);
}
$('.tabs').onclick = (e) => { if (e.target.dataset.tab) { showTab(e.target.dataset.tab); scrollTo(0, 0); } };
$('.actions').addEventListener('click', (e) => { if (e.target.closest('#generate, #bad-mode, #clear')) showTab('calendar'); });

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
  const { delPerson, delRule, who, up } = e.target.dataset;
  if (up) update(() => { const i = +up; [state.priority[i - 1], state.priority[i]] = [state.priority[i], state.priority[i - 1]]; });
  if (e.target.dataset.go) { showTab(e.target.dataset.go); scrollTo(0, 0); }
  if (delRule) update(() => { state.rules = state.rules.filter((r) => r.id !== delRule); });
  if (who) { view.who = view.who === who ? null : who; view.bad = false; if (view.who) $('#person').showModal(); render(); }
  if (delPerson && confirm(`Usunąć ${state.people.find((p) => p.id === delPerson).name}? Przeszłe dyżury zostaną w grafiku, przyszłe zostaną zwolnione.`)) update(() => {
    state.people.find((p) => p.id === delPerson).gone = true;
    const today = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
    for (const obj of [state.schedule, state.manual]) for (const [k, day] of Object.entries(obj))
      if (k >= today) for (const sid in day) if (day[sid] === delPerson) delete day[sid];
    delete state.avail[delPerson];
    delete state.limits[delPerson];
    delete state.wants[delPerson];
    state.rules = state.rules.filter((r) => r.who !== delPerson && r.with !== delPerson);
    if (view.who === delPerson) view.who = null;
  });
};

$('#person').onclick = (e) => { if (e.target.dataset.go) { showTab(e.target.dataset.go); scrollTo(0, 0); } };
// Enter w polu liczby zatwierdza wartość zamiast zamykać okno (formularz method="dialog")
$('#person').onkeydown = (e) => { if (e.key === 'Enter' && e.target.type === 'number') { e.preventDefault(); e.target.blur(); } };
$('#person').onchange = (e) => {
  if ('past' in e.target.dataset)
    return update(() => { state.people.find((p) => p.id === view.who).past = +e.target.value; });
  if ('prestige' in e.target.dataset)
    return update(() => { state.people.find((p) => p.id === view.who).prestige = +e.target.value; });
  const { limit, want } = e.target.dataset, sid = limit ?? want;
  if (!sid) return;
  const n = parseInt(e.target.value, 10);
  update(() => {
    const l = ((limit ? state.limits : state.wants)[view.who] ??= {});
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
    const n = list.length, form = n === 1 ? 'dyżur' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'dyżury' : 'dyżurów';
    return [`${n} ${form}`, ...Object.entries(per).map(([sid, n]) => `${esc(shiftName[sid] ?? '(usunięte miejsce)')} ${n}`),
      `Pt/So/Nd ${we}`, `gównianość ${list.reduce((a, x) => a + x.bad, 0)} pkt`].join(' · ');
  };
  const hist = history(state.schedule, state.bad, view.y, view.m);
  let html = `<h3>Historia dyżurów</h3><p class="hint">Razem: ${summary(log)}<br>Do układania ${monthName(view.y, view.m)} liczy się: gównianość z poprzednich miesięcy ${+(hist.pts[pid] ?? 0).toFixed(2)} pkt (ważona ½, ¼, ⅛)` +
    ` + „ostatnio gówniane” ${p.past ?? 0} × ${PAST_WEIGHT}${hist.tragic.has(pid) ? ' · w zeszłym miesiącu miał(a) Tragiczny' : ''}</p>`;
  for (let i = 0; i < 4; i++) {
    const t = new Date(view.y, view.m - i), y = t.getFullYear(), m = t.getMonth();
    const list = log.filter((x) => x.key.startsWith(dateKey(y, m, 1).slice(0, 8))).reverse(); // najnowsze na górze
    html += `<h4>${monthName(y, m)} <small>${summary(list)}</small></h4>` + (!list.length ? '' :
      `<table class="preview"><tr><th>Dzień</th><th>Miejsce</th><th>Gównianość</th><th>Przerwa</th></tr>` +
      list.map((x) => {
        const d = +x.key.slice(8);
        const note = [state.manual[x.key]?.[x.sid] === pid && 'ręczny', x.key > today && 'zaplanowany'].filter(Boolean).join(', ');
        return `<tr class="${weekday(y, m, d) > 4 ? 'weekend' : ''}"><td>${d} ${DAYS[weekday(y, m, d)]}</td>` +
          `<td>${esc(shiftName[x.sid] ?? '(usunięte miejsce)')}${note && ` <small class="hint">${note}</small>`}</td><td>${BAD[x.bad]}</td>` +
          `<td>${x.gap === null ? '—' : x.gap === 1 ? '1 dzień' : `${x.gap} dni`}</td></tr>`;
      }).join('') + '</table>');
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

if (cloud) { $('#logout').hidden = false; $('#logout').onclick = cloudLogout; }

render();
