// Czyste funkcje: zero DOM, zero localStorage — łatwe do testowania i podmiany na mocniejszy solver.

export const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; // m: 0-11
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const weekday = (y, m, d) => (new Date(y, m, d).getDay() + 6) % 7; // 0 = pon, 6 = nd
// Dzień tygodnia dla limitów i próśb (Pt/So/Nd, ten sam dzień weekendu): asDay = { 'YYYY-MM-DD': 0-6 }, np. święto w środę liczone jak niedziela.
// Gównianość, miejsca do obsadzenia i odpoczynek po OITN idą dalej według prawdziwego dnia tygodnia.
export const limitDay = (asDay, y, m, d) => asDay[dateKey(y, m, d)] ?? weekday(y, m, d);

// Dostępność: 0 = Nie mogę (twardy zakaz), 1 = W ostateczności, 2 = Mogę (domyślnie), 3 = Chcę.
// avail = { personId: { 'YYYY-MM-DD': poziom } }
export const LEVELS = ['Nie mogę', 'W ostateczności', 'Mogę', 'Chcę'];
// Funkcja wynika z punktów prestiżu (person.prestige): 0 = Rezydent, 1–2 = Starszy asystent.
export const ROLES = ['Rezydent', 'Starszy asystent · 1 pkt', 'Starszy asystent · 2 pkt']; // indeks = punkty prestiżu
export const isResident = (p) => p.prestige === 0;
export const MIN_PRESTIGE = 3; // twardo: suma punktów prestiżu osób dyżurujących danego dnia co najmniej tyle
export const availOf = (avail, pid, key) => avail[pid]?.[key] ?? 2;

// Warunki: rules = [{ who, with, places: [shiftId] }] — jeśli `who` dyżuruje tego samego dnia co `with`,
// to `who` musi być na jednym z `places`. Czy pid na sid w dniu `day` ({ shiftId: personId }) łamie któryś warunek?
export const breaksRule = (rules, day, pid, sid) => rules.some((r) =>
  (r.who === pid && Object.values(day).includes(r.with) && !r.places.includes(sid)) ||
  (r.with === pid && Object.entries(day).some(([s, p]) => p === r.who && !r.places.includes(s))));

// Gównianość dnia 0-3; bad = { 'YYYY-MM-DD': poziom }, brak = domyślna dla dnia tygodnia (Pt = Gówniany, So/Nd = Słaby).
export const BAD = ['Zwykły', 'Słaby', 'Gówniany', 'Tragiczny'];
const BAD_DEFAULT = [0, 0, 0, 0, 2, 1, 1]; // indeks = dzień tygodnia, 0 = pon
export const badOf = (bad, y, m, d) => bad[dateKey(y, m, d)] ?? BAD_DEFAULT[weekday(y, m, d)];
// person.past 0-3 = jak gówniane dyżury miała ostatnio; startowe punkty obciążenia = past × PAST_WEIGHT.
// ponytail: stała waga na oko (poziom 3 ≈ trzy gówniane dni); stroić, jeśli wychodzi niesprawiedliwie.
export const PAST_WEIGHT = 3;

// Gównianość z poprzednich miesięcy grafiku: punkty × ½ (miesiąc temu), × ¼, × ⅛; tragic = data ostatniego Tragicznego
// sprzed tego miesiąca — z całego grafiku, bez limitu wstecz (Tragiczne idą rotacyjnie, rzadko i po równo).
// Zwraca { pts: { personId: punkty }, tragic: { personId: 'YYYY-MM-DD' } } — do doliczenia jako person.hist / person.tragic.
export function history(schedule, bad, y, m, months = 3) {
  const pts = {};
  const tragic = {};
  for (let i = 1; i <= months; i++) {
    const py = y + Math.floor((m - i) / 12), pm = (m - i + 12 * months) % 12;
    for (let d = 1; d <= daysInMonth(py, pm); d++) {
      const b = badOf(bad, py, pm, d);
      for (const pid of Object.values(schedule[dateKey(py, pm, d)] || {})) {
        pts[pid] = (pts[pid] || 0) + b / 2 ** i;
      }
    }
  }
  const start = dateKey(y, m, 1);
  for (const [key, day] of Object.entries(schedule))
    if (key < start && badOf(bad, +key.slice(0, 4), key.slice(5, 7) - 1, +key.slice(8)) === 3)
      for (const pid of Object.values(day)) if (!(tragic[pid] >= key)) tragic[pid] = key;
  return { pts, tragic };
}

// Wszystkie dyżury osoby pid w miesiącu y/m i `months` - 1 poprzednich, chronologicznie:
// [{ key, sid, bad: gównianość dnia, gap: dni od poprzedniego dyżuru (też sprzed okna; null = pierwszy w grafiku) }]
export function personLog(schedule, bad, pid, y, m, months = 4) {
  const start = new Date(y, m - months + 1);
  const from = dateKey(start.getFullYear(), start.getMonth(), 1), to = dateKey(y, m, daysInMonth(y, m));
  const out = [];
  let prev = null;
  for (const key of Object.keys(schedule).sort()) for (const [sid, p] of Object.entries(schedule[key])) {
    if (p !== pid) continue;
    const [py, pm, pd] = key.split('-').map(Number);
    if (key >= from && key <= to) out.push({ key, sid, bad: badOf(bad, py, pm - 1, pd), gap: prev && (Date.parse(key) - Date.parse(prev)) / 864e5 });
    prev = key;
  }
  return out;
}

// Dyżury, które trzeba obstawić danego dnia.
export const shiftsForDay = (shifts, y, m, d) => shifts.filter((s) => s.days.includes(weekday(y, m, d)));

// Zwraca { 'YYYY-MM-DD': { shiftId: personId } }.
// Twarde zasady: nikt dwa razy tego samego dnia, nikt dzień po dniu, nikt w dzień „Nie mogę”,
// nikt ponad swój miesięczny limit na danym dyżurze: limits = { personId: { shiftId: n, '*': n łącznie, we: n w Pt/So/Nd } } (brak = bez limitu;
// d4/d5/d6 = ile razy ten sam Pt/So/Nd: wpisany — twardy; bez wpisu domyślnie 1 albo wg próśb (sameDow) — tylko priorytet weDow; min = { shiftId / '*' / we / d4-d6: n } minimum dyżurów — patrz niżej),
// maks. jeden rezydent dziennie (licząc ręczne wpisy), suma punktów prestiżu dnia ≥ MIN_PRESTIGE (licząc ręczne wpisy), warunki z `rules` (patrz breaksRule),
// po OITN w sobotę wolny poniedziałek, po OITN w niedzielę wolny wtorek (czyli 2 dni po weekendowym OITN).
// Najpierw (przed `order`) ci poniżej któregoś swojego minimum z limits[pid].min (łącznie, na tym miejscu, w Pt/So/Nd, w ten dzień weekendu)
// — ale tylko w dni Chcę/Mogę, nie „W ostateczności”.
// Kolejność wyboru (domyślna, `order` = klucze PRIORITIES w innej kolejności ją zmienia): najpierw dostępność (Chcę > Mogę > W ostateczności), potem unikanie „kanapek” (dyżur z jednym dniem
// przerwy, np. pn i śr — chyba że osoba chce ten dzień; wyjątek: PN1 w sobotę + dowolny dyżur w poniedziałek to kanapka preferowana,
// chyba że osoba ma person.pn1Sandwich === false), potem różne dni weekendu (w ten sam Pt/So/Nd domyślnie maks. 1 dyżur — miękko), potem prośby: kto ma mniej dyżurów na tym miejscu, niż prosił
// (wants = { personId: { shiftId: n, d4/d5/d6: n w ten dzień weekendu, we: n w Pt/So/Nd, '*': n łącznie } }, miękkie — nie łamie limitów ani zakazów), potem w gówniany dzień najmniejsze
// obciążenie gównianością (person.past + person.hist z poprzednich miesięcy + ten miesiąc), potem równy podział liczby dyżurów.
// W dzień Tragiczny najpierw ci, którzy mieli ostatni Tragiczny najdawniej albo wcale (person.tragic = data, liczy się też ten miesiąc).
// Wpisy z `locked` (ręczne) są zachowane i liczą się do bilansu.
// rand (np. Math.random) = remisy i kolejność miejsc w dniu losowo — do szukania wariantów (patrz generateVariants).
// asDay = dni liczone do limitów i próśb jak inny dzień tygodnia (patrz limitDay).
// Wewnętrzna propozycja zachłanna; publiczne generatory poniżej walidują limity i w razie potrzeby cofają decyzje.
function greedyMonth(y, m, shifts, people, locked = {}, avail = {}, limits = {}, rules = [], bad = {}, wants = {}, { order = PRIORITY_ORDER, rand, asDay = {} } = {}) {
  const result = {};
  const count = Object.fromEntries(people.map((p) => [p.id, 0]));
  const burden = Object.fromEntries(people.map((p) => [p.id, (p.past ?? 0) * PAST_WEIGHT + (p.hist ?? 0)]));
  const tragic = Object.fromEntries(people.map((p) => [p.id, p.tragic ?? ''])); // data ostatniego Tragicznego, '' = nigdy
  const perShift = {}; // 'personId:shiftId' → liczba dyżurów; 'personId:d4..d6' → dyżury w Pt/So/Nd; '*' i 'we' — pod prośby
  const we = {}; // personId → liczba dyżurów w Pt/So/Nd
  const ld = (d) => limitDay(asDay, y, m, d); // dzień tygodnia dla limitów i próśb
  const isWe = (d) => ld(d) >= 4;
  const add = (pid, sid, d) => {
    count[pid]++; perShift[`${pid}:${sid}`] = (perShift[`${pid}:${sid}`] || 0) + 1; perShift[`${pid}:*`] = count[pid];
    if (isWe(d)) { perShift[`${pid}:we`] = we[pid] = (we[pid] || 0) + 1; perShift[`${pid}:d${ld(d)}`] = (perShift[`${pid}:d${ld(d)}`] || 0) + 1; }
    burden[pid] += badOf(bad, y, m, d);
    if (badOf(bad, y, m, d) === 3) tragic[pid] = dateKey(y, m, d);
  };
  const underLimit = (pid, sid, d) => (perShift[`${pid}:${sid}`] || 0) < (limits[pid]?.[sid] ?? Infinity) &&
    count[pid] < (limits[pid]?.['*'] ?? Infinity) && (!isWe(d) || ((we[pid] || 0) < (limits[pid]?.we ?? Infinity) &&
      (perShift[`${pid}:d${ld(d)}`] || 0) < (limits[pid]?.[`d${ld(d)}`] ?? Infinity))); // wpisany limit Pt/So/Nd — twardy
  const dowFull = (pid, d) => +(isWe(d) && (perShift[`${pid}:d${ld(d)}`] || 0) >= sameDow(limits, pid, ld(d), wants)); // 1 = ma już dość tego dnia
  // Heurystyka minimum w propozycji startowej. Końcowa walidacja wymaga każdego minimum.
  const under = (pid, k) => (perShift[`${pid}:${k}`] || 0) < (limits[pid]?.min?.[k] ?? 0);
  const belowMin = (pid, sid, d, key) => +(availOf(avail, pid, key) >= 2 &&
    (under(pid, sid) || under(pid, '*') || (isWe(d) && (under(pid, 'we') || under(pid, `d${ld(d)}`))))) -
    // −1 = zostaw na jutro: jutro Pt/So/Nd, którego osoba ma za mało (dyżur dziś zablokowałby jutro)
    +(d < daysInMonth(y, m) && isWe(d + 1) && under(pid, `d${ld(d + 1)}`) && availOf(avail, pid, dateKey(y, m, d + 1)) >= 2);
  const short = (pid, sid) => +((perShift[`${pid}:${sid}`] || 0) < (wants[pid]?.[sid] ?? 0)); // 1 = jeszcze poniżej prośby
  const lastDay = {};
  const resident = new Set(people.filter(isResident).map((p) => p.id));
  const maxPrest = ROLES.length - 1;
  const prest = Object.fromEntries(people.map((p) => [p.id, p.prestige ?? maxPrest])); // bez prestige = bez ograniczeń (app.js zawsze ustawia)
  // ponytail: OITN rozpoznawany po nazwie miejsca; bez sprawdzania przełomu miesięcy (jak „dzień po dniu”)
  const oitn = shifts.find((s) => s.name === 'OITN')?.id;
  const pn1 = shifts.find((s) => s.name === 'PN1')?.id;
  const oitnWe = (d, pid) => d >= 1 && weekday(y, m, d) >= 5 && (result[dateKey(y, m, d)] ?? locked[dateKey(y, m, d)] ?? {})[oitn] === pid;
  for (const [key, day] of Object.entries(locked))
    for (const [sid, pid] of Object.entries(day)) if (pid in count) add(pid, sid, +key.slice(8));

  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(y, m, d);
    const day = { ...(locked[key] || {}) };
    const busy = new Set(Object.values(day));
    let hasResident = [...busy].some((pid) => resident.has(pid));
    const isBad = badOf(bad, y, m, d) > 0;
    const isTragic = badOf(bad, y, m, d) === 3;
    // 1 = kanapka, −1 = preferowana kanapka PN1 w sobotę + poniedziałek (osoba bez pn1Sandwich === false), suma dla obu stron
    const wd = weekday(y, m, d);
    const sandwich = (p, sid) => availOf(avail, p.id, key) < 3 &&
      (lastDay[p.id] === d - 2 && (p.pn1Sandwich !== false && wd === 0 && result[dateKey(y, m, d - 2)]?.[pn1] === p.id ? -1 : 1)) +
      (lockedOn(locked, y, m, d + 2, p.id) && (p.pn1Sandwich !== false && wd === 5 && sid === pn1 ? -1 : 1));

    const noise = rand && Object.fromEntries(people.map((p) => [p.id, rand()]));
    const todays = shiftsForDay(shifts, y, m, d);
    if (rand) todays.sort(() => rand() - 0.5); // ponytail: niedokładne tasowanie, na kilka miejsc wystarczy
    // najpierw miejsca, na których ktoś dostępny ma niespełnione minimum (inaczej zająłby go wcześniejszy dyżur tego dnia)
    const minFirst = (s) => +people.some((p) => under(p.id, s.id) && availOf(avail, p.id, key) >= 2);
    todays.sort((a, b) => minFirst(b) - minFirst(a));
    let sum = [...busy].reduce((t, pid) => t + (prest[pid] ?? 0), 0);
    let open = todays.filter((s) => !day[s.id]).length;
    for (const s of todays) {
      if (day[s.id]) continue;
      // ile punktów musi mieć osoba na tym miejscu, żeby resztę dało się dobić samymi SA 2 pkt
      // (dzień, w którym miejsc jest za mało na MIN_PRESTIGE, jest zwolniony; min z maxPrest: po złych ręcznych wpisach nadal najwyżsi)
      const need = todays.length * maxPrest < MIN_PRESTIGE ? 0 : Math.min(maxPrest, MIN_PRESTIGE - sum - maxPrest * --open);
      const cmp = {
        avail: (a, b) => availOf(avail, b.id, key) - availOf(avail, a.id, key),
        sandwich: (a, b) => sandwich(a, s.id) - sandwich(b, s.id),
        weDow: (a, b) => dowFull(a.id, d) - dowFull(b.id, d),
        wants: (a, b) => short(b.id, s.id) - short(a.id, s.id) || (isWe(d) && (short(b.id, `d${ld(d)}`) - short(a.id, `d${ld(d)}`) || short(b.id, 'we') - short(a.id, 'we'))) ||
          short(b.id, '*') - short(a.id, '*'),
        bad: (a, b) => (isTragic && tragic[a.id].localeCompare(tragic[b.id])) || (isBad && burden[a.id] - burden[b.id]),
        even: (a, b) => count[a.id] - count[b.id],
      };
      const pick = people
        .filter((p) => availOf(avail, p.id, key) > 0 && !busy.has(p.id) && lastDay[p.id] !== d - 1 && !lockedOn(locked, y, m, d + 1, p.id) && underLimit(p.id, s.id, d) &&
          !(hasResident && resident.has(p.id)) && prest[p.id] >= need && !breaksRule(rules, day, p.id, s.id) &&
          !oitnWe(d - 2, p.id) && !(s.id === oitn && wd >= 5 && lockedOn(locked, y, m, d + 2, p.id)))
        .sort((a, b) => belowMin(b.id, s.id, d, key) - belowMin(a.id, s.id, d, key) || order.reduce((r, k) => r || cmp[k](a, b), 0) ||
          (noise ? noise[a.id] - noise[b.id] : (lastDay[a.id] ?? -99) - (lastDay[b.id] ?? -99)))[0];
      if (!pick) continue; // brak wolnej osoby → dyżur zostaje pusty, widoczny w UI
      day[s.id] = pick.id;
      busy.add(pick.id);
      add(pick.id, s.id, d);
      hasResident ||= resident.has(pick.id);
      sum += prest[pick.id];
    }
    for (const pid of busy) lastDay[pid] = d;
    result[key] = day;
  }
  return result;
}

// Ile dyżurów w ten sam dzień weekendu (wd 4-6 = Pt/So/Nd) osoba może mieć bez kary; domyślnie 1 albo tyle, o ile prosi
// (o ten dzień albo o Pt/So/Nd łącznie — prośba o 6 weekendowych to po 2 na dzień).
export const sameDow = (limits, pid, wd, wants = {}) => limits[pid]?.[`d${wd}`] ?? Math.max(1, wants[pid]?.[`d${wd}`] ?? 0, Math.ceil((wants[pid]?.we ?? 0) / 3));

const lockedOn = (locked, y, m, d, pid) =>
  d <= daysInMonth(y, m) && Object.values(locked[dateKey(y, m, d)] || {}).includes(pid);

// Kryteria układania — kolejność = priorytet (state.priority w app.js). Twarde zasady są zawsze ważniejsze.
export const PRIORITIES = {
  avail: 'Dostępność (Chcę przed Mogę, „W ostateczności” na końcu)',
  sandwich: 'Bez „kanapek” (dyżur co drugi dzień)',
  weDow: 'Dyżury weekendowe w różne dni (nie dwa razy ten sam Pt/So/Nd, chyba że osoba ma inaczej)',
  wants: 'Prośby o liczbę dyżurów (łącznie, w Pt/So/Nd, na miejscu)',
  bad: 'Sprawiedliwy podział gównianych dni',
  even: 'Równa liczba dyżurów',
};
export const PRIORITY_ORDER = Object.keys(PRIORITIES);

// Ocena gotowego grafiku miesiąca (mniej = lepiej) dla każdego kryterium PRIORITIES + unfilled (nieobsadzone dyżury) + min (brakujące dyżury do minimów limits[pid].min);
// do pokazania: lastResort = dyżury „W ostateczności”, spread = różnica liczby dyżurów (najwięcej − najmniej).
// ponytail: wagi na oko (W ostateczności = 10 × Mogę); suma kwadratów = kara za nierówny podział.
export function scoreMonth(y, m, schedule, shifts, people, avail = {}, bad = {}, wants = {}, limits = {}, asDay = {}) {
  const sc = { unfilled: 0, min: 0, avail: 0, sandwich: 0, weDow: 0, wants: 0, bad: 0, even: 0, lastResort: 0 };
  const count = Object.fromEntries(people.map((p) => [p.id, 0]));
  const burden = Object.fromEntries(people.map((p) => [p.id, (p.past ?? 0) * PAST_WEIGHT + (p.hist ?? 0)]));
  const perShift = {}, last = {}, lastSid = {}; // perShift jak w generateMonth, też 'personId:d4..d6', '*', 'we'
  const pn1 = shifts.find((s) => s.name === 'PN1')?.id;
  const pref = Object.fromEntries(people.map((p) => [p.id, p.pn1Sandwich !== false]));
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(y, m, d), day = schedule[key] || {};
    for (const s of shiftsForDay(shifts, y, m, d)) {
      const pid = day[s.id];
      if (!(pid in count)) { sc.unfilled += !pid; continue; }
      const lvl = availOf(avail, pid, key);
      sc.avail += [0, 10, 1, 0][lvl];
      sc.lastResort += lvl === 1;
      const wd = weekday(y, m, d);
      if (last[pid] === d - 2 && lvl < 3 && !(pref[pid] && wd === 0 && lastSid[pid] === pn1)) sc.sandwich++; // PN1 So + Pn nie liczy się jako kanapka
      last[pid] = d; lastSid[pid] = s.id;
      const lw = limitDay(asDay, y, m, d);
      if (lw >= 4) sc.weDow += (perShift[`${pid}:d${lw}`] = (perShift[`${pid}:d${lw}`] || 0) + 1) > sameDow(limits, pid, lw, wants); // ponad limit tego samego dnia weekendu
      if (lw >= 4) perShift[`${pid}:we`] = (perShift[`${pid}:we`] || 0) + 1;
      perShift[`${pid}:*`] = ++count[pid];
      burden[pid] += badOf(bad, y, m, d);
      perShift[`${pid}:${s.id}`] = (perShift[`${pid}:${s.id}`] || 0) + 1;
    }
  }
  for (const [pid, w] of Object.entries(wants)) for (const [sid, n] of Object.entries(w))
    if (pid in count) sc.wants += Math.abs(n - (perShift[`${pid}:${sid}`] || 0));
  for (const [pid, l] of Object.entries(limits)) for (const [k, n] of Object.entries(l?.min ?? {}))
    if (pid in count) sc.min += Math.max(0, n - (perShift[`${pid}:${k}`] || 0));
  for (const pid in count) { sc.even += count[pid] ** 2; sc.bad += burden[pid] ** 2; }
  sc.spread = people.length && Math.max(...Object.values(count)) - Math.min(...Object.values(count));
  return sc;
}

// Wspólna kontrola ograniczeń dla wyszukiwania i końcowej walidacji.
function constraints(y, m, shifts, people, avail, limits, rules, asDay = {}) {
  const days = Array.from({ length: daysInMonth(y, m) + 4 }, (_, d) => dateKey(y, m, d));
  const dayShifts = Array.from({ length: daysInMonth(y, m) + 1 }, (_, d) => shiftsForDay(shifts, y, m, d));
  const slots = Array.from({ length: daysInMonth(y, m) }, (_, i) =>
    dayShifts[i + 1].map((s) => ({ key: days[i + 1], d: i + 1, sid: s.id,
      cats: [s.id, '*', ...(limitDay(asDay, y, m, i + 1) >= 4 ? ['we', `d${limitDay(asDay, y, m, i + 1)}`] : [])] }))).flat();
  const persons = Object.fromEntries(people.map((p) => [p.id, p]));
  const oitn = shifts.find((s) => s.name === 'OITN')?.id;
  for (const s of slots) {
    s.previous = days[s.d - 1]; s.next = days[s.d + 1];
    s.afterOitn = s.d > 2 && weekday(y, m, s.d - 2) >= 5 ? days[s.d - 2] : null;
    s.beforeRest = s.sid === oitn && weekday(y, m, s.d) >= 5 ? days[s.d + 2] : null;
    s.capacity = dayShifts[s.d].length;
    s.candidates = people.filter((p) => availOf(avail, p.id, s.key) > 0 && s.cats.every((k) => (limits[p.id]?.[k] ?? Infinity) > 0)).map((p) => p.id);
  }
  const counts = (schedule) => {
    const out = Object.fromEntries(people.map((p) => [p.id, {}]));
    for (const s of slots) {
      const c = out[schedule[s.key]?.[s.sid]];
      if (c) for (const k of s.cats) c[k] = (c[k] || 0) + 1;
    }
    return out;
  };
  const can = (schedule, s, pid, tally) => {
    const p = persons[pid], day = schedule[s.key] || {};
    if (!p || availOf(avail, pid, s.key) === 0 || Object.values(day).includes(pid) ||
      [s.previous, s.next].some((key) => Object.values(schedule[key] || {}).includes(pid)) ||
      s.cats.some((k) => (tally[pid]?.[k] || 0) >= (limits[pid]?.[k] ?? Infinity)) ||
      breaksRule(rules, day, pid, s.sid) ||
      (isResident(p) && Object.values(day).some((id) => persons[id] && isResident(persons[id])))) return false;
    if (s.afterOitn && schedule[s.afterOitn]?.[oitn] === pid) return false;
    if (s.beforeRest && Object.values(schedule[s.beforeRest] || {}).includes(pid)) return false;
    const ids = [...Object.values(day), pid];
    // Prestiż sprawdzamy dla obsadzonego dnia; puste miejsca są jawnie raportowane.
    return s.capacity * 2 < MIN_PRESTIGE || ids.length < s.capacity ||
      ids.reduce((n, id) => n + (persons[id]?.prestige ?? 2), 0) >= MIN_PRESTIGE;
  };
  const valid = (schedule, minimum = true) => {
    const partial = {}, tally = Object.fromEntries(people.map((p) => [p.id, {}]));
    for (const s of slots) {
      const pid = schedule[s.key]?.[s.sid];
      if (!pid) continue;
      // Historyczne wpisy usuniętych osób pozostają zablokowane.
      if (persons[pid] && !can(partial, s, pid, tally)) return false;
      (partial[s.key] ??= {})[s.sid] = pid;
      if (tally[pid]) for (const k of s.cats) tally[pid][k] = (tally[pid][k] || 0) + 1;
    }
    return !minimum || people.every((p) => Object.entries(limits[p.id]?.min || {}).every(([k, n]) => (tally[p.id][k] || 0) >= n));
  };
  return { slots, counts, can, valid };
}

function checkSettings(people, limits, wants) {
  for (const p of people) {
    const l = limits[p.id] || {};
    for (const values of [Object.fromEntries(Object.entries(l).filter(([k]) => k !== 'min')), l.min || {}, wants[p.id] || {}])
      for (const [k, n] of Object.entries(values)) if (!Number.isInteger(n) || n < 0)
        throw new Error(`${p.name}: wartość „${k}” musi być nieujemną liczbą całkowitą.`);
    for (const [k, n] of Object.entries(l.min || {})) if (n > Math.min(l[k] ?? Infinity, l['*'] ?? Infinity,
      /^d[456]$/.test(k) ? l.we ?? Infinity : Infinity))
      throw new Error(`${p.name}: minimum „${k}” (${n}) przekracza limit górny.`);
  }
}

// Cofanie decyzji, najpierw miejsca z najmniejszą liczbą kandydatów.
// Ograniczony budżet: nieudane wyszukiwanie nie oznacza dowodu niewykonalności.
function searchMonth(model, people, locked, limits, wants, seed, allowEmpty, { budget = 12000, deadline = performance.now() + 1800, now = () => performance.now() } = {}) {
  const schedule = Object.fromEntries([...new Set(model.slots.map((s) => s.key))].map((key) => [key, { ...locked[key] }]));
  const tally = model.counts(schedule);
  const pending = model.slots.filter((s) => !schedule[s.key][s.sid]);
  const minima = people.flatMap((p) => Object.entries(limits[p.id]?.min || {}).filter(([, n]) => n > 0).map(([k, n]) => ({ pid: p.id, k, n })));
  const visit = (left) => {
    if (--budget < 0 || now() >= deadline) return false;
    if (!left.length) return model.valid(schedule);
    const domains = [];
    for (const s of left) {
      if (now() >= deadline) return false;
      const ids = s.candidates.filter((pid) => model.can(schedule, s, pid, tally));
      if (!allowEmpty && !ids.length) return false;
      domains.push({ s, ids });
    }
    // Czy zostało dość dostępnych dni (z odpoczynkiem) na każde minimum?
    for (const { pid, k, n } of minima) {
      const need = n - (tally[pid][k] || 0);
      if (need <= 0) continue;
      const days = [...new Set(domains.filter(({ s, ids }) => s.cats.includes(k) && ids.includes(pid)).map(({ s }) => s.d))].sort((a, b) => a - b);
      let capacity = 0, prev = -2;
      for (const d of days) if (d > prev + 1) { capacity++; prev = d; }
      if (capacity < need) return false;
    }
    domains.sort((a, b) => a.ids.length - b.ids.length || a.s.d - b.s.d);
    const { s, ids } = domains[0];
    const urgency = (pid) => s.cats.reduce((n, k) => n + Math.max(0, (limits[pid]?.min?.[k] || 0) - (tally[pid][k] || 0)), 0);
    const wish = (pid) => s.cats.reduce((n, k) => n + (wants[pid]?.[k] === undefined ? 0 :
      Math.abs((tally[pid][k] || 0) - wants[pid][k]) - Math.abs((tally[pid][k] || 0) + 1 - wants[pid][k])), 0);
    ids.sort((a, b) => urgency(b) - urgency(a) || wish(b) - wish(a) ||
      +(seed[s.key]?.[s.sid] === b) - +(seed[s.key]?.[s.sid] === a) || (tally[a]['*'] || 0) - (tally[b]['*'] || 0));
    const rest = left.filter((x) => x !== s);
    for (const pid of ids) {
      schedule[s.key][s.sid] = pid;
      for (const k of s.cats) tally[pid][k] = (tally[pid][k] || 0) + 1;
      if (visit(rest)) return true;
      delete schedule[s.key][s.sid];
      for (const k of s.cats) tally[pid][k]--;
    }
    return allowEmpty && visit(rest);
  };
  return visit(pending) ? schedule : null;
}

export function generateMonth(y, m, shifts, people, locked = {}, avail = {}, limits = {}, rules = [], bad = {}, wants = {}, options = {}) {
  checkSettings(people, limits, wants);
  const model = constraints(y, m, shifts, people, avail, limits, rules, options.asDay);
  if (!model.valid(locked, false)) throw new Error('Ręczne wpisy łamią twarde zasady lub limity. Popraw je przed układaniem.');
  const seed = greedyMonth(y, m, shifts, people, locked, avail, limits, rules, bad, wants, options);
  if (model.valid(seed)) return seed;
  const solved = searchMonth(model, people, locked, limits, wants, seed, false) || searchMonth(model, people, locked, limits, wants, seed, true);
  if (!solved) throw new Error('Nie znaleziono grafiku spełniającego wszystkie limity dolne i górne. Sprawdź dostępność, minima i ręczne wpisy lub ponów próbę.');
  return solved;
}

// Twarde warunki są filtrem, następnie obsada i dokładność próśb.
// Pozostałe preferencje mają skończone wagi: niższe też wpływają na wynik.
export function generateVariants(y, m, shifts, people, locked = {}, avail = {}, limits = {}, rules = [], bad = {}, wants = {},
  { order = PRIORITY_ORDER, asDay = {}, tries = 200, keep = 3, rand = Math.random, timeBudgetMs = 4500,
    onProgress = () => {}, now = () => performance.now() } = {}) {
  const started = now();
  const duration = Number.isFinite(timeBudgetMs) ? Math.max(20, Math.min(10000, timeBudgetMs)) : 4500;
  const deadline = started + duration;
  const progress = (message) => onProgress({ message });
  progress('Tworzę propozycje grafiku…');
  const args = [y, m, shifts, people, locked, avail, limits, rules, bad, wants];
  checkSettings(people, limits, wants);
  const model = constraints(y, m, shifts, people, avail, limits, rules, asDay);
  if (!model.valid(locked, false)) throw new Error('Ręczne wpisy łamią twarde zasady lub limity. Popraw je przed układaniem.');
  const scale = { avail: 10, sandwich: 1, weDow: 1, bad: Math.max(1, model.slots.length * 9 / Math.max(1, people.length)), even: Math.max(1, model.slots.length / Math.max(1, people.length)) };
  const key = (sc) => [sc.unfilled, sc.wants, order.reduce((n, k, i) => n + (k === 'wants' ? 0 : (order.length - i) * sc[k] / scale[k]), 0)];
  const seen = new Map();
  let seed;
  const add = (schedule) => {
    if (schedule && model.valid(schedule)) seen.set(JSON.stringify(schedule), { schedule, score: scoreMonth(y, m, schedule, shifts, people, avail, bad, wants, limits, asDay) });
  };
  for (let i = 0; i <= Math.min(1000, tries); i++) {
    if (i && now() >= started + duration * 0.25) break;
    // Zmieniamy też punkt startu preferencji, nie tylko remisy na pierwszym kryterium.
    const offset = i % Math.max(1, order.length);
    const trialOrder = [...order.slice(offset), ...order.slice(0, offset)];
    const schedule = greedyMonth(...args, { order: trialOrder, rand: i ? rand : undefined, asDay });
    seed ??= schedule;
    add(schedule);
  }
  const cmp = (a, b) => { const ka = key(a.score), kb = key(b.score); return ka.reduce((r, v, i) => r || v - kb[i], 0); };
  progress('Sprawdzam limity i szukam obsady trudnych terminów…');
  if (!seen.size || [...seen.values()].every((v) => v.score.unfilled))
    add(searchMonth(model, people, locked, limits, wants, seed, false, { deadline: started + duration * 0.55, now }));
  if (!seen.size) add(searchMonth(model, people, locked, limits, wants, seed, true, { deadline: started + duration * 0.8, now }));
  if (!seen.size) throw new Error('Nie znaleziono grafiku spełniającego wszystkie limity dolne i górne. Sprawdź dostępność, minima i ręczne wpisy lub ponów próbę.');
  // Naprawa całego miesiąca: zmiana osoby oraz zamiana dwóch przydziałów,
  // także między miejscami i dniami. Każdy ruch zachowuje wszystkie twarde zasady.
  let best = [...seen.values()].sort(cmp)[0];
  progress('Poprawiam dopasowanie próśb i rozkład dyżurów…');
  const copy = (s) => Object.fromEntries(Object.entries(s).map(([key, day]) => [key, { ...day }]));
  let schedule = copy(best.schedule);
  const movable = model.slots.filter((s) => !locked[s.key]?.[s.sid]);
  const consider = () => {
    if (!model.valid(schedule)) return false;
    const score = scoreMonth(y, m, schedule, shifts, people, avail, bad, wants, limits, asDay);
    if (cmp({ score }, best) >= -1e-9) return false;
    best = { schedule: copy(schedule), score };
    return true;
  };
  const localDeadline = Math.min(deadline, now() + duration * 0.25);
  for (let pass = 0; pass < 5 && now() < localDeadline; pass++) {
    let improved = false;
    for (let i = 0; i < movable.length; i++) {
      const s = movable[i];
      if (now() >= localDeadline) break;
      for (const pid of s.candidates) {
        if (now() >= localDeadline) break;
        const old = schedule[s.key][s.sid];
        if (old === pid) continue;
        schedule[s.key][s.sid] = pid;
        if (consider()) improved = true;
        else if (old) schedule[s.key][s.sid] = old; else delete schedule[s.key][s.sid];
      }
      for (let j = i + 1; j < movable.length; j++) {
        if (now() >= localDeadline) break;
        const t = movable[j];
        const a = schedule[s.key][s.sid], b = schedule[t.key][t.sid];
        if (a === b) continue;
        if (b) schedule[s.key][s.sid] = b; else delete schedule[s.key][s.sid];
        if (a) schedule[t.key][t.sid] = a; else delete schedule[t.key][t.sid];
        if (consider()) improved = true;
        else {
          if (a) schedule[s.key][s.sid] = a; else delete schedule[s.key][s.sid];
          if (b) schedule[t.key][t.sid] = b; else delete schedule[t.key][t.sid];
        }
      }
    }
    if (!improved) break;
  }
  // Większe naprawy: uwalniamy grupę dni i układamy ją od nowa.
  // Reszta najlepszego grafiku jest zamrożona, ręczne wpisy zawsze zostają.
  // Pozwala to przejść przez kilka zależnych zmian, których pojedyncza zamiana nie rozwiązuje.
  const dates = [...new Set(movable.map((s) => s.key))];
  for (let attempt = 0; attempt < 16 && now() < deadline && dates.length; attempt++) {
    const frozen = copy(best.schedule);
    const start = Math.floor(rand() * dates.length);
    const selected = new Set();
    for (let i = 0; i < Math.min(5, dates.length); i++)
      selected.add(dates[(start + (attempt % 2 ? i * 7 : i)) % dates.length]);
    for (const s of movable) if (selected.has(s.key)) delete frozen[s.key][s.sid];
    const repaired = searchMonth(model, people, frozen, limits, wants, best.schedule, false,
      { deadline: Math.min(deadline, now() + 100), budget: 2000, now });
    if (repaired) { schedule = repaired; consider(); }
  }
  add(best.schedule);
  const all = [...seen.values()].sort(cmp);
  return all.filter((v) => !cmp(v, all[0])).slice(0, keep);
}

// Import grafiku z tabeli (np. z Worda): rows = [[tekst komórki]]. Nagłówek = pierwszy wiersz z nazwą któregoś miejsca,
// dzień = liczba w pierwszej kolumnie, nazwa dnia tygodnia (jeśli jest) sprawdzana z miesiącem y/m.
// Zwraca { days: { dzień: { shiftId: imię z tabeli } }, warn: [tekst] }.
const WEEKDAYS = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];
const same = (a, b) => a.localeCompare(b, 'pl', { sensitivity: 'base' }) === 0;
const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
export function parseTable(rows, y, m, shifts) {
  rows = rows.map((r) => r.map(clean));
  const h = rows.findIndex((r) => r.some((c) => shifts.some((s) => same(s.name, c))));
  const warn = [];
  if (h < 0) return { days: {}, warn: [`Brak nagłówka z nazwą miejsca (${shifts.map((s) => s.name).join(', ')}).`] };
  const cols = rows[h].map((c) => shifts.find((s) => same(s.name, c))?.id);
  const days = {};
  let wrongDow = 0;
  for (const r of rows.slice(h + 1)) {
    if (!r.some(Boolean)) continue;
    const d = parseInt(r[0], 10);
    if (!(d >= 1 && d <= daysInMonth(y, m))) { warn.push(`Pominięto wiersz: ${r.filter(Boolean).join(' · ')}`); continue; }
    const dow = WEEKDAYS.findIndex((w) => r.some((c) => same(c, w)));
    if (dow >= 0 && dow !== weekday(y, m, d)) wrongDow++;
    days[d] = Object.fromEntries(cols.map((sid, i) => [sid, r[i]]).filter(([sid, name]) => sid && name && !/^[-—–]+$/.test(name)));
  }
  if (wrongDow) warn.push(`Dni tygodnia z tabeli nie pasują do tego miesiąca (${wrongDow} dni) — czy to na pewno ten miesiąc?`);
  return { days, warn };
}

// Kto z `people` ({ id, name }) to imię z tabeli: pełne imię i nazwisko, „M. Kowalska” (inicjał + nazwisko) albo samo nazwisko.
// Zwraca id tylko przy jednoznacznym dopasowaniu, inaczej null.
export function matchPerson(raw, people) {
  const exact = people.filter((p) => same(p.name, raw));
  if (exact.length) return exact.length === 1 ? exact[0].id : null;
  const w = raw.split(' ');
  const first = w.length > 1 ? w[0].replace(/\.$/, '') : '';
  const hits = people.filter((p) => {
    const pw = p.name.split(' ');
    return same(pw.at(-1), w.at(-1)) && (!first || (pw.length > 1 && same(pw[0].slice(0, first.length), first)));
  });
  return hits.length === 1 ? hits[0].id : null;
}

// Zakładka Osoby: szukanie po fragmentach imienia i nazwiska (bez wielkości liter i polskich znaków),
// filtr funkcji ('rez' / 'sa') i osób bez dyżurów w miesiącu, sortowanie; count = { personId: dyżury w miesiącu }
const fold = (s) => s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '');
export function listPeople(people, count, { q = '', role = null, none = false, sort = 'surname' } = {}) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  const abc = (a, b) => a.localeCompare(b, 'pl', { sensitivity: 'base' });
  const last = (p) => p.name.trim().split(/\s+/).at(-1);
  const cmp = {
    surname: (a, b) => abc(last(a), last(b)),
    name: () => 0,
    most: (a, b) => (count[b.id] ?? 0) - (count[a.id] ?? 0),
    least: (a, b) => (count[a.id] ?? 0) - (count[b.id] ?? 0),
    role: (a, b) => b.prestige - a.prestige,
  }[sort] ?? (() => 0);
  return people.filter((p) => words.every((w) => fold(p.name).includes(w)) &&
    (!role || (role === 'rez') === !p.prestige) && (!none || !count[p.id]))
    .sort((a, b) => cmp(a, b) || abc(a.name, b.name));
}
