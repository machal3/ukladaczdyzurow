// Czyste funkcje: zero DOM, zero localStorage — łatwe do testowania i podmiany na mocniejszy solver.

export const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; // m: 0-11
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const weekday = (y, m, d) => (new Date(y, m, d).getDay() + 6) % 7; // 0 = pon, 6 = nd

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
// d4/d5/d6 = ile razy ten sam Pt/So/Nd, to nie twardy limit, tylko priorytet weDow),
// maks. jeden rezydent dziennie (licząc ręczne wpisy), suma punktów prestiżu dnia ≥ MIN_PRESTIGE (licząc ręczne wpisy), warunki z `rules` (patrz breaksRule),
// po OITN w sobotę wolny poniedziałek, po OITN w niedzielę wolny wtorek (czyli 2 dni po weekendowym OITN).
// Kolejność wyboru (domyślna, `order` = klucze PRIORITIES w innej kolejności ją zmienia): najpierw dostępność (Chcę > Mogę > W ostateczności), potem unikanie „kanapek” (dyżur z jednym dniem
// przerwy, np. pn i śr — chyba że osoba chce ten dzień; wyjątek: PN1 w sobotę + dowolny dyżur w poniedziałek to kanapka preferowana,
// chyba że osoba ma person.pn1Sandwich === false), potem różne dni weekendu (w ten sam Pt/So/Nd maks. limits[pid].d4/d5/d6 dyżurów, domyślnie 1 — miękko), potem prośby: kto ma mniej dyżurów na tym miejscu, niż prosił
// (wants = { personId: { shiftId: n, d4/d5/d6: n w ten dzień weekendu, we: n w Pt/So/Nd, '*': n łącznie } }, miękkie — nie łamie limitów ani zakazów), potem w gówniany dzień najmniejsze
// obciążenie gównianością (person.past + person.hist z poprzednich miesięcy + ten miesiąc), potem równy podział liczby dyżurów.
// W dzień Tragiczny najpierw ci, którzy mieli ostatni Tragiczny najdawniej albo wcale (person.tragic = data, liczy się też ten miesiąc).
// Wpisy z `locked` (ręczne) są zachowane i liczą się do bilansu.
// rand (np. Math.random) = remisy i kolejność miejsc w dniu losowo — do szukania wariantów (patrz generateVariants).
// ponytail: zachłanny algorytm dzień po dniu; preferencje/limity → podmienić na solver (np. ILP) z tym samym interfejsem.
export function generateMonth(y, m, shifts, people, locked = {}, avail = {}, limits = {}, rules = [], bad = {}, wants = {}, { order = PRIORITY_ORDER, rand } = {}) {
  const result = {};
  const count = Object.fromEntries(people.map((p) => [p.id, 0]));
  const burden = Object.fromEntries(people.map((p) => [p.id, (p.past ?? 0) * PAST_WEIGHT + (p.hist ?? 0)]));
  const tragic = Object.fromEntries(people.map((p) => [p.id, p.tragic ?? ''])); // data ostatniego Tragicznego, '' = nigdy
  const perShift = {}; // 'personId:shiftId' → liczba dyżurów; 'personId:d4..d6' → dyżury w Pt/So/Nd; '*' i 'we' — pod prośby
  const we = {}; // personId → liczba dyżurów w Pt/So/Nd
  const isWe = (d) => weekday(y, m, d) >= 4;
  const add = (pid, sid, d) => {
    count[pid]++; perShift[`${pid}:${sid}`] = (perShift[`${pid}:${sid}`] || 0) + 1; perShift[`${pid}:*`] = count[pid];
    if (isWe(d)) { perShift[`${pid}:we`] = we[pid] = (we[pid] || 0) + 1; perShift[`${pid}:d${weekday(y, m, d)}`] = (perShift[`${pid}:d${weekday(y, m, d)}`] || 0) + 1; }
    burden[pid] += badOf(bad, y, m, d);
    if (badOf(bad, y, m, d) === 3) tragic[pid] = dateKey(y, m, d);
  };
  const underLimit = (pid, sid, d) => (perShift[`${pid}:${sid}`] || 0) < (limits[pid]?.[sid] ?? Infinity) &&
    count[pid] < (limits[pid]?.['*'] ?? Infinity) && (!isWe(d) || (we[pid] || 0) < (limits[pid]?.we ?? Infinity));
  const dowFull = (pid, d) => +(isWe(d) && (perShift[`${pid}:d${weekday(y, m, d)}`] || 0) >= sameDow(limits, pid, weekday(y, m, d), wants)); // 1 = ma już dość tego dnia
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
        wants: (a, b) => short(b.id, s.id) - short(a.id, s.id) || (isWe(d) && (short(b.id, `d${weekday(y, m, d)}`) - short(a.id, `d${weekday(y, m, d)}`) || short(b.id, 'we') - short(a.id, 'we'))) ||
          short(b.id, '*') - short(a.id, '*'),
        bad: (a, b) => (isTragic && tragic[a.id].localeCompare(tragic[b.id])) || (isBad && burden[a.id] - burden[b.id]),
        even: (a, b) => count[a.id] - count[b.id],
      };
      const pick = people
        .filter((p) => availOf(avail, p.id, key) > 0 && !busy.has(p.id) && lastDay[p.id] !== d - 1 && !lockedOn(locked, y, m, d + 1, p.id) && underLimit(p.id, s.id, d) &&
          !(hasResident && resident.has(p.id)) && prest[p.id] >= need && !breaksRule(rules, day, p.id, s.id) &&
          !oitnWe(d - 2, p.id))
        .sort((a, b) => order.reduce((r, k) => r || cmp[k](a, b), 0) ||
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

// Ocena gotowego grafiku miesiąca (mniej = lepiej) dla każdego kryterium PRIORITIES + unfilled (nieobsadzone dyżury);
// do pokazania: lastResort = dyżury „W ostateczności”, spread = różnica liczby dyżurów (najwięcej − najmniej).
// ponytail: wagi na oko (W ostateczności = 10 × Mogę); suma kwadratów = kara za nierówny podział.
export function scoreMonth(y, m, schedule, shifts, people, avail = {}, bad = {}, wants = {}, limits = {}) {
  const sc = { unfilled: 0, avail: 0, sandwich: 0, weDow: 0, wants: 0, bad: 0, even: 0, lastResort: 0 };
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
      if (wd >= 4) sc.weDow += (perShift[`${pid}:d${wd}`] = (perShift[`${pid}:d${wd}`] || 0) + 1) > sameDow(limits, pid, wd, wants); // ponad limit tego samego dnia weekendu
      if (wd >= 4) perShift[`${pid}:we`] = (perShift[`${pid}:we`] || 0) + 1;
      perShift[`${pid}:*`] = ++count[pid];
      burden[pid] += badOf(bad, y, m, d);
      perShift[`${pid}:${s.id}`] = (perShift[`${pid}:${s.id}`] || 0) + 1;
    }
  }
  for (const [pid, w] of Object.entries(wants)) for (const [sid, n] of Object.entries(w))
    if (pid in count) sc.wants += Math.max(0, n - (perShift[`${pid}:${sid}`] || 0));
  for (const pid in count) { sc.even += count[pid] ** 2; sc.bad += burden[pid] ** 2; }
  sc.spread = people.length && Math.max(...Object.values(count)) - Math.min(...Object.values(count));
  return sc;
}

// Najlepsze różne grafiki: zwykły przebieg + `tries` przebiegów z losowymi remisami, porównane leksykograficznie
// (najpierw nieobsadzone, potem kryteria w kolejności `order`). Zwraca najlepszy i (do `keep` łącznie) te,
// które są z nim na remis we wszystkich kryteriach: [{ schedule, score }].
// ponytail: losowe restarty zamiast solvera; więcej prób = lepiej, ale wolniej (~ms na próbę).
export function generateVariants(y, m, shifts, people, locked = {}, avail = {}, limits = {}, rules = [], bad = {}, wants = {},
  { order = PRIORITY_ORDER, tries = 200, keep = 3, rand = Math.random } = {}) {
  const args = [y, m, shifts, people, locked, avail, limits, rules, bad, wants];
  const key = (sc) => [sc.unfilled, ...order.map((k) => sc[k])];
  const seen = new Map();
  for (let i = 0; i <= tries; i++) {
    const schedule = generateMonth(...args, { order, rand: i ? rand : undefined });
    const id = JSON.stringify(schedule);
    if (!seen.has(id)) seen.set(id, { schedule, score: scoreMonth(y, m, schedule, shifts, people, avail, bad, wants, limits) });
  }
  const cmp = (a, b) => { const ka = key(a.score), kb = key(b.score); return ka.reduce((r, v, i) => r || v - kb[i], 0); };
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
