// Czyste funkcje: zero DOM, zero localStorage — łatwe do testowania i podmiany na mocniejszy solver.

export const pad = (n) => String(n).padStart(2, '0');
// m: 0-11; dzień/miesiąc spoza zakresu przechodzi na sąsiedni miesiąc (dateKey(y, m, 0) = ostatni dzień poprzedniego)
export const dateKey = (y, m, d) => d >= 1 && d <= 28 && m >= 0 && m <= 11 ? `${y}-${pad(m + 1)}-${pad(d)}`
  : ((t) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`)(new Date(y, m, d));
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const weekday = (y, m, d) => (new Date(y, m, d).getDay() + 6) % 7; // 0 = pon, 6 = nd
// Dzień tygodnia dla limitów i próśb (Pt/So/Nd, ten sam dzień weekendu): asDay = { 'YYYY-MM-DD': 0-6 }, np. święto w środę liczone jak niedziela.
// Gównianość, miejsca do obsadzenia i odpoczynek po OITN idą dalej według prawdziwego dnia tygodnia.
export const limitDay = (asDay, y, m, d) => asDay[dateKey(y, m, d)] ?? weekday(y, m, d);

// Dostępność: 0 = Nie mogę (twardy zakaz), 1 = W ostateczności, 2 = Mogę (domyślnie), 3 = Chcę, 4 = Muszę (twardo: jakiś dyżur tego dnia).
// avail = { personId: { 'YYYY-MM-DD': poziom } }
export const LEVELS = ['Nie mogę', 'W ostateczności', 'Mogę', 'Chcę', 'Muszę'];
export const MUST = 4;
// Funkcja = punkty prestiżu (person.prestige: 0 = Rezydent, 1–2 = Starszy asystent) + person.boss (Kierownik, 1–2 pkt).
export const ROLES = ['Rezydent', 'Starszy asystent · 1 pkt', 'Starszy asystent · 2 pkt', 'Kierownik 1 · 1 pkt', 'Kierownik 2 · 2 pkt'];
export const roleOf = (p) => p.boss ? p.prestige + 2 : p.prestige; // indeks w ROLES
export const isResident = (p) => p.prestige === 0;
export const MAX_BOSS = 2; // twardo: maks. tylu kierowników jednego dnia
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
// Twarde zasady: nikt dwa razy tego samego dnia, nikt dzień po dniu, nikt w dzień „Nie mogę”, każdy w swój dzień „Muszę”,
// nikt ponad swój miesięczny limit na danym dyżurze: limits = { personId: { shiftId: n, '*': n łącznie, we: n w Pt/So/Nd, d56: n w So + Nd łącznie } } (brak = bez limitu;
// d4/d5/d6 = ile razy ten sam Pt/So/Nd: wpisany — twardy; bez wpisu domyślnie 1 albo wg próśb (sameDow) — tylko priorytet weDow; min = { shiftId / '*' / we / d4-d6: n } minimum dyżurów — patrz niżej),
// maks. jeden rezydent i maks. MAX_BOSS kierowników dziennie (licząc ręczne wpisy), suma punktów prestiżu dnia ≥ MIN_PRESTIGE (licząc ręczne wpisy), warunki z `rules` (patrz breaksRule),
// po OITN w sobotę wolny poniedziałek, po OITN w niedzielę wolny wtorek (czyli 2 dni po weekendowym OITN).
// Najpierw (przed `order`) ci poniżej któregoś swojego minimum z limits[pid].min (łącznie, na tym miejscu, w Pt/So/Nd, w ten dzień weekendu)
// — ale tylko w dni Chcę/Mogę, nie „W ostateczności”.
// Kolejność wyboru (domyślna, `order` = klucze PRIORITIES w innej kolejności ją zmienia): najpierw dostępność (Chcę > Mogę > W ostateczności), potem unikanie „kanapek” (dyżur z jednym dniem
// przerwy, np. pn i śr — chyba że osoba chce ten dzień; wyjątek: PN1 w sobotę + dowolny dyżur w poniedziałek to kanapka preferowana,
// chyba że osoba ma person.pn1Sandwich === false), potem różne dni weekendu (w ten sam Pt/So/Nd domyślnie maks. 1 dyżur — miękko), potem prośby: kto ma mniej dyżurów na tym miejscu, niż prosił
// (wants = { personId: { shiftId: n, d4/d5/d6: n w ten dzień weekendu, we: n w Pt/So/Nd, '*': n łącznie } }, miękkie — nie łamie limitów ani zakazów), potem w gówniany dzień najmniejsze
// obciążenie gównianością (person.past + person.hist z poprzednich miesięcy + ten miesiąc), potem równy podział liczby dyżurów.
// W dzień Tragiczny najpierw ci, którzy mieli ostatni Tragiczny najdawniej albo wcale (person.tragic = data, liczy się też ten miesiąc).
// Wpisy z `locked` (ręczne) są zachowane i liczą się do bilansu. Wpisy `locked` z 2 dni przed i po miesiącu (sąsiednie miesiące)
// nie liczą się do limitów, minimów ani próśb, ale blokują dzień po dniu, odpoczynek po weekendowym OITN i liczą się do kanapek.
// rand (np. Math.random) = remisy i kolejność miejsc w dniu losowo — do szukania wariantów (patrz generateVariants).
// mrv = dni w kolejności od najtrudniejszego (dni „Muszę”, mało chętnych na miejsce, gównianość), nie po kolei.
// asDay = dni liczone do limitów i próśb jak inny dzień tygodnia (patrz limitDay).
// Wewnętrzna propozycja zachłanna; publiczne generatory poniżej walidują limity i w razie potrzeby cofają decyzje.
function greedyMonth(y, m, shifts, people, locked = {}, avail = {}, limits = {}, rules = [], bad = {}, wants = {}, { order = PRIORITY_ORDER, rand, asDay = {}, mrv = false } = {}) {
  const D = daysInMonth(y, m);
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
    if (ld(d) >= 5) perShift[`${pid}:d56`] = (perShift[`${pid}:d56`] || 0) + 1; // So + Nd łącznie
    burden[pid] += badOf(bad, y, m, d);
    if (badOf(bad, y, m, d) === 3) tragic[pid] = dateKey(y, m, d);
  };
  const underLimit = (pid, sid, d) => (perShift[`${pid}:${sid}`] || 0) < (limits[pid]?.[sid] ?? Infinity) &&
    count[pid] < (limits[pid]?.['*'] ?? Infinity) && (!isWe(d) || ((we[pid] || 0) < (limits[pid]?.we ?? Infinity) &&
      (perShift[`${pid}:d${ld(d)}`] || 0) < (limits[pid]?.[`d${ld(d)}`] ?? Infinity))) && // wpisany limit Pt/So/Nd — twardy
    (ld(d) < 5 || (perShift[`${pid}:d56`] || 0) < (limits[pid]?.d56 ?? Infinity));
  const dowFull = (pid, d) => +(isWe(d) && (perShift[`${pid}:d${ld(d)}`] || 0) >= sameDow(limits, pid, ld(d), wants)); // 1 = ma już dość tego dnia
  // Heurystyka minimum w propozycji startowej. Końcowa walidacja wymaga każdego minimum.
  const under = (pid, k) => (perShift[`${pid}:${k}`] || 0) < (limits[pid]?.min?.[k] ?? 0);
  const belowMin = (pid, sid, d, key) => +(availOf(avail, pid, key) >= 2 &&
    (under(pid, sid) || under(pid, '*') || (isWe(d) && (under(pid, 'we') || under(pid, `d${ld(d)}`))) || (ld(d) >= 5 && under(pid, 'd56')))) -
    // −1 = zostaw na jutro: jutro Pt/So/Nd, którego osoba ma za mało (dyżur dziś zablokowałby jutro)
    +(d < D && isWe(d + 1) && under(pid, `d${ld(d + 1)}`) && availOf(avail, pid, dateKey(y, m, d + 1)) >= 2);
  const short = (pid, sid) => +((perShift[`${pid}:${sid}`] || 0) < (wants[pid]?.[sid] ?? 0)); // 1 = jeszcze poniżej prośby
  const lastDay = {};
  const resident = new Set(people.filter(isResident).map((p) => p.id));
  const boss = new Set(people.filter((p) => p.boss).map((p) => p.id));
  const maxPrest = 2;
  const prest = Object.fromEntries(people.map((p) => [p.id, p.prestige ?? maxPrest])); // bez prestige = bez ograniczeń (app.js zawsze ustawia)
  // ponytail: OITN i PN1 rozpoznawane po nazwie miejsca
  const oitn = shifts.find((s) => s.name === 'OITN')?.id;
  const pn1 = shifts.find((s) => s.name === 'PN1')?.id;
  // Zajętość dni osób (indeks d + 2, d = −1 … D + 2): ręczne wpisy, dni sąsiednich miesięcy i już obsadzone — dzięki temu
  // dzień po dniu, odpoczynek po weekendowym OITN i kanapki sprawdzamy w obie strony, przy dowolnej kolejności dni.
  const W = D + 5, ix = Object.fromEntries(people.map((p, i) => [p.id, i]));
  const busyOn = new Uint8Array(people.length * W), oitnOn = new Uint8Array(people.length * W);
  const on = (pid, d) => busyOn[ix[pid] * W + d + 2] === 1;
  const oitnWe = (d, pid) => oitnOn[ix[pid] * W + d + 2] === 1; // weekendowy OITN w dniu d
  const mark = (pid, sid, d) => {
    const i = ix[pid];
    if (i === undefined) return;
    busyOn[i * W + d + 2] = 1;
    if (sid === oitn && weekday(y, m, d) >= 5) oitnOn[i * W + d + 2] = 1;
  };
  const dayAt = (d) => result[dateKey(y, m, d)] ?? locked[dateKey(y, m, d)] ?? {};
  for (let d = -1; d <= D + 2; d++) for (const [sid, pid] of Object.entries(locked[dateKey(y, m, d)] || {})) {
    mark(pid, sid, d);
    if (d >= 1 && d <= D && pid in count) add(pid, sid, d);
  }
  // dzień d zajęty (wpis, sąsiedni miesiąc, już obsadzony) albo „Muszę” — nie dawać dyżuru dzień obok (ani weekendowego OITN 2 dni wcześniej)
  const takenOn = (d, pid) => on(pid, d) || (d >= 1 && d <= D && availOf(avail, pid, dateKey(y, m, d)) === MUST);

  const days = Array.from({ length: D }, (_, i) => i + 1);
  if (mrv) { // najpierw dni „Muszę”, potem najmniej chętnych (Mogę i wyżej) na wolne miejsce, potem gównianość
    const hard = days.map((d) => {
      const key = dateKey(y, m, d), open = shiftsForDay(shifts, y, m, d).filter((s) => !locked[key]?.[s.id]).length;
      return { must: +people.some((p) => availOf(avail, p.id, key) === MUST), bad: badOf(bad, y, m, d),
        ratio: open ? people.filter((p) => availOf(avail, p.id, key) >= 2).length / open : Infinity };
    });
    days.sort((a, b) => hard[b - 1].must - hard[a - 1].must || hard[a - 1].ratio - hard[b - 1].ratio || hard[b - 1].bad - hard[a - 1].bad || a - b);
  }
  for (const d of days) {
    const key = dateKey(y, m, d);
    const day = { ...(locked[key] || {}) };
    const busy = new Set(Object.values(day));
    let hasResident = [...busy].some((pid) => resident.has(pid));
    let bosses = [...busy].filter((pid) => boss.has(pid)).length;
    const isBad = badOf(bad, y, m, d) > 0;
    const isTragic = badOf(bad, y, m, d) === 3;
    // 1 = kanapka, −1 = preferowana kanapka PN1 w sobotę + poniedziałek (osoba bez pn1Sandwich === false), suma dla obu stron
    const wd = weekday(y, m, d);
    const sandwich = (p, sid) => availOf(avail, p.id, key) < 3 &&
      (on(p.id, d - 2) && (p.pn1Sandwich !== false && wd === 0 && dayAt(d - 2)[pn1] === p.id ? -1 : 1)) +
      (on(p.id, d + 2) && (p.pn1Sandwich !== false && wd === 5 && sid === pn1 ? -1 : 1));

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
          (ld(d) >= 5 && short(b.id, 'd56') - short(a.id, 'd56')) ||
          short(b.id, '*') - short(a.id, '*'),
        bad: (a, b) => (isTragic && tragic[a.id].localeCompare(tragic[b.id])) || (isBad && burden[a.id] - burden[b.id]),
        even: (a, b) => count[a.id] - count[b.id],
      };
      const must = (p) => +(availOf(avail, p.id, key) === MUST);
      const pick = people
        .filter((p) => availOf(avail, p.id, key) > 0 && !busy.has(p.id) && !takenOn(d - 1, p.id) && !takenOn(d + 1, p.id) && underLimit(p.id, s.id, d) &&
          !(hasResident && resident.has(p.id)) && !(bosses >= MAX_BOSS && boss.has(p.id)) && prest[p.id] >= need && !breaksRule(rules, day, p.id, s.id) &&
          !oitnWe(d - 2, p.id) && !(s.id === oitn && wd >= 5 && takenOn(d + 2, p.id)))
        .sort((a, b) => must(b) - must(a) || belowMin(b.id, s.id, d, key) - belowMin(a.id, s.id, d, key) || order.reduce((r, k) => r || cmp[k](a, b), 0) ||
          (noise ? noise[a.id] - noise[b.id] : (lastDay[a.id] ?? -99) - (lastDay[b.id] ?? -99)))[0];
      if (!pick) continue; // brak wolnej osoby → dyżur zostaje pusty, widoczny w UI
      day[s.id] = pick.id;
      busy.add(pick.id);
      add(pick.id, s.id, d);
      mark(pick.id, s.id, d);
      hasResident ||= resident.has(pick.id);
      bosses += boss.has(pick.id);
      sum += prest[pick.id];
    }
    for (const pid of busy) lastDay[pid] = Math.max(lastDay[pid] ?? -99, d);
    result[key] = day;
  }
  return Object.fromEntries(days.map((_, i) => dateKey(y, m, i + 1)).map((key) => [key, result[key]])); // dni po kolei
}

// Ile dyżurów w ten sam dzień weekendu (wd 4-6 = Pt/So/Nd) osoba może mieć bez kary; domyślnie 1 albo tyle, o ile prosi
// (o ten dzień albo o Pt/So/Nd łącznie — prośba o 6 weekendowych to po 2 na dzień).
export const sameDow = (limits, pid, wd, wants = {}) => limits[pid]?.[`d${wd}`] ?? Math.max(1, wants[pid]?.[`d${wd}`] ?? 0, Math.ceil((wants[pid]?.we ?? 0) / 3));


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
// Dni miesiąca y/m, w które test(poziom dostępności, czy ma dyżur) — { personId: [dzień] }, do pokazania po ułożeniu.
function daysWhere(y, m, schedule, people, avail, test) {
  const out = {};
  for (const p of people) for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(y, m, d);
    if (test(availOf(avail, p.id, key), Object.values(schedule[key] || {}).includes(p.id))) (out[p.id] ??= []).push(d);
  }
  return out;
}
// Dni „Chcę” bez dyżuru tej osoby.
export const missedWishes = (y, m, schedule, people, avail = {}) => daysWhere(y, m, schedule, people, avail, (lvl, on) => lvl === 3 && !on);
// Dyżury w dni „W ostateczności”.
export const lastResortDays = (y, m, schedule, people, avail = {}) => daysWhere(y, m, schedule, people, avail, (lvl, on) => lvl === 1 && on);
// Kanapki (dyżur z jednym dniem przerwy) jak w scoreMonth: drugi dzień nie „Chcę”/„Muszę”, PN1 So + Pn się nie liczy (chyba że pn1Sandwich === false),
// też z 2 ostatnimi dniami poprzedniego miesiąca ze schedule. { personId: [['YYYY-MM-DD', 'YYYY-MM-DD']] } — pary dni.
export function sandwichDays(y, m, schedule, shifts, people, avail = {}) {
  const out = {}, last = {}, lastSid = {};
  const pn1 = shifts.find((s) => s.name === 'PN1')?.id, pref = Object.fromEntries(people.map((p) => [p.id, p.pn1Sandwich !== false]));
  for (let d = -1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(y, m, d);
    for (const [sid, pid] of Object.entries(schedule[key] || {})) {
      if (!(pid in pref)) continue;
      if (d >= 1 && last[pid] === d - 2 && availOf(avail, pid, key) < 3 && !(pref[pid] && weekday(y, m, d) === 0 && lastSid[pid] === pn1))
        (out[pid] ??= []).push([dateKey(y, m, d - 2), key]);
      last[pid] = d; lastSid[pid] = sid;
    }
  }
  return out;
}

export function scoreMonth(y, m, schedule, shifts, people, avail = {}, bad = {}, wants = {}, limits = {}, asDay = {}) {
  const sc = { unfilled: 0, min: 0, avail: 0, sandwich: 0, weDow: 0, wants: 0, bad: 0, even: 0, lastResort: 0 };
  const count = Object.fromEntries(people.map((p) => [p.id, 0]));
  const burden = Object.fromEntries(people.map((p) => [p.id, (p.past ?? 0) * PAST_WEIGHT + (p.hist ?? 0)]));
  const perShift = {}, last = {}, lastSid = {}; // perShift jak w generateMonth, też 'personId:d4..d6', '*', 'we'
  const pn1 = shifts.find((s) => s.name === 'PN1')?.id;
  const pref = Object.fromEntries(people.map((p) => [p.id, p.pn1Sandwich !== false]));
  // dwa ostatnie dni poprzedniego miesiąca (jeśli są w schedule) — tylko do kanapek, bez liczników
  for (const d of [-1, 0]) for (const [sid, pid] of Object.entries(schedule[dateKey(y, m, d)] || {})) { last[pid] = d; lastSid[pid] = sid; }
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(y, m, d), day = schedule[key] || {};
    for (const s of shiftsForDay(shifts, y, m, d)) {
      const pid = day[s.id];
      if (!(pid in count)) { sc.unfilled += !pid; continue; }
      const lvl = availOf(avail, pid, key);
      sc.avail += [0, 10, 1, 0, 0][lvl];
      sc.lastResort += lvl === 1;
      const wd = weekday(y, m, d);
      if (last[pid] === d - 2 && lvl < 3 && !(pref[pid] && wd === 0 && lastSid[pid] === pn1)) sc.sandwich++; // PN1 So + Pn nie liczy się jako kanapka
      last[pid] = d; lastSid[pid] = s.id;
      const lw = limitDay(asDay, y, m, d);
      if (lw >= 4) sc.weDow += (perShift[`${pid}:d${lw}`] = (perShift[`${pid}:d${lw}`] || 0) + 1) > sameDow(limits, pid, lw, wants); // ponad limit tego samego dnia weekendu
      if (lw >= 4) perShift[`${pid}:we`] = (perShift[`${pid}:we`] || 0) + 1;
      if (lw >= 5) perShift[`${pid}:d56`] = (perShift[`${pid}:d56`] || 0) + 1;
      perShift[`${pid}:*`] = ++count[pid];
      burden[pid] += badOf(bad, y, m, d);
      perShift[`${pid}:${s.id}`] = (perShift[`${pid}:${s.id}`] || 0) + 1;
    }
  }
  sc.gaps = []; // [{ pid, k, want, got }] — prośby niespełnione co do liczby, do pokazania po ułożeniu
  for (const [pid, w] of Object.entries(wants)) for (const [k, n] of Object.entries(w)) {
    const got = perShift[`${pid}:${k}`] || 0;
    if (pid in count && n !== got) { sc.wants += Math.abs(n - got); sc.gaps.push({ pid, k, want: n, got }); }
  }
  for (const [pid, l] of Object.entries(limits)) for (const [k, n] of Object.entries(l?.min ?? {}))
    if (pid in count) sc.min += Math.max(0, n - (perShift[`${pid}:${k}`] || 0));
  for (const pid in count) { sc.even += count[pid] ** 2; sc.bad += burden[pid] ** 2; }
  sc.spread = people.length && Math.max(...Object.values(count)) - Math.min(...Object.values(count));
  return sc;
}

// Wspólna kontrola ograniczeń dla wyszukiwania i końcowej walidacji.
// locked: wpisy z 2 dni przed i po miesiącu (edge) blokują sąsiednie dni, ale nie liczą się do limitów ani minimów.
function constraints(y, m, shifts, people, avail, limits, rules, asDay = {}, locked = {}) {
  const D = daysInMonth(y, m);
  const days = Array.from({ length: D + 5 }, (_, d) => dateKey(y, m, d - 2)); // days[d + 2] = dzień d, d = −2 … D + 2
  const edge = Object.fromEntries([-1, 0, D + 1, D + 2].map((d) => [days[d + 2], locked[days[d + 2]]]).filter(([, day]) => day));
  const dayShifts = Array.from({ length: daysInMonth(y, m) + 1 }, (_, d) => shiftsForDay(shifts, y, m, d));
  const slots = Array.from({ length: daysInMonth(y, m) }, (_, i) =>
    dayShifts[i + 1].map((s) => ({ key: days[i + 3], d: i + 1, sid: s.id,
      cats: [s.id, '*', ...(limitDay(asDay, y, m, i + 1) >= 4 ? ['we', `d${limitDay(asDay, y, m, i + 1)}`] : []),
        ...(limitDay(asDay, y, m, i + 1) >= 5 ? ['d56'] : [])] }))).flat();
  const persons = Object.fromEntries(people.map((p) => [p.id, p]));
  const oitn = shifts.find((s) => s.name === 'OITN')?.id;
  for (const s of slots) {
    s.previous = days[s.d + 1]; s.next = days[s.d + 3];
    s.afterOitn = weekday(y, m, s.d - 2) >= 5 ? days[s.d] : null; // d = 1, 2: weekendowy OITN z końca poprzedniego miesiąca
    s.beforeRest = s.sid === oitn && weekday(y, m, s.d) >= 5 ? days[s.d + 4] : null;
    s.capacity = dayShifts[s.d].length;
  }
  // dzień z grafiku albo — poza miesiącem — z sąsiedniego miesiąca
  const at = (schedule, key) => schedule[key] ?? edge[key];
  const has = (schedule, key, pid) => { const day = at(schedule, key); return !!day && Object.values(day).includes(pid); };
  // stała blokada od dni sąsiednich miesięcy: dzień po dniu, odpoczynek po weekendowym OITN
  const blocked = (s, pid) => [s.previous, s.next].some((key) => edge[key] && Object.values(edge[key]).includes(pid)) ||
    (!!s.afterOitn && edge[s.afterOitn]?.[oitn] === pid) || (!!s.beforeRest && !!edge[s.beforeRest] && Object.values(edge[s.beforeRest]).includes(pid));
  for (const s of slots)
    s.candidates = people.filter((p) => availOf(avail, p.id, s.key) > 0 && s.cats.every((k) => (limits[p.id]?.[k] ?? Infinity) > 0) && !blocked(s, p.id)).map((p) => p.id);
  // dni „Muszę” (tylko dni z dyżurami w tym miesiącu): [{ key, d, pid }]
  const musts = people.flatMap((p) => [...new Set(slots.map((s) => s.d))]
    .filter((d) => availOf(avail, p.id, days[d + 2]) === MUST).map((d) => ({ key: days[d + 2], d, pid: p.id })));
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
      has(schedule, s.previous, pid) || has(schedule, s.next, pid) ||
      s.cats.some((k) => (tally[pid]?.[k] || 0) >= (limits[pid]?.[k] ?? Infinity)) ||
      breaksRule(rules, day, pid, s.sid) ||
      (isResident(p) && Object.values(day).some((id) => persons[id] && isResident(persons[id]))) ||
      (p.boss && Object.values(day).filter((id) => persons[id]?.boss).length >= MAX_BOSS)) return false;
    if (s.afterOitn && at(schedule, s.afterOitn)?.[oitn] === pid) return false;
    if (s.beforeRest && has(schedule, s.beforeRest, pid)) return false;
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
    return !minimum || (people.every((p) => Object.entries(limits[p.id]?.min || {}).every(([k, n]) => (tally[p.id][k] || 0) >= n)) &&
      musts.every(({ key, pid }) => Object.values(schedule[key] || {}).includes(pid)));
  };
  return { slots, counts, can, valid, musts, edge, blocked };
}

function checkSettings(people, limits, wants) {
  for (const p of people) {
    const l = limits[p.id] || {};
    for (const values of [Object.fromEntries(Object.entries(l).filter(([k]) => k !== 'min')), l.min || {}, wants[p.id] || {}])
      for (const [k, n] of Object.entries(values)) if (!Number.isInteger(n) || n < 0)
        throw new Error(`${p.name}: wartość „${k}” musi być nieujemną liczbą całkowitą.`);
    for (const [k, n] of Object.entries(l.min || {})) if (n > Math.min(l[k] ?? Infinity, l['*'] ?? Infinity,
      /^d(4|5|6|56)$/.test(k) ? l.we ?? Infinity : Infinity, /^d[56]$/.test(k) ? l.d56 ?? Infinity : Infinity))
      throw new Error(`${p.name}: minimum „${k}” (${n}) przekracza limit górny.`);
  }
}

const CAT = { '*': 'łącznie', we: 'Pt/So/Nd', d56: 'So + Nd', d4: 'ten sam Pt', d5: 'ten sam So', d6: 'ten sam Nd' };
const PHRASE = { '*': 'łącznie', we: 'w Pt/So/Nd', d56: 'w So + Nd', d4: 'w piątki', d5: 'w soboty', d6: 'w niedziele' }; // w zdaniu; miejsce → „na OITN”
const DOW = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

// Czy osoba sama, bez innych, zmieści swoje minima: dostępność, ręczne wpisy, dzień po dniu, wolne po weekendowym OITN, limity.
// lim/min = { kategoria: n }. Zwraca true / false (dowód) / null (przekroczony budżet — nie wiadomo).
function personFits(model, avail, locked, pid, lim, min) {
  const D = Math.max(0, ...model.slots.map((s) => s.d));
  const opts = Array.from({ length: D + 2 }, () => []), forced = [];
  for (const s of model.slots) {
    const who = locked[s.key]?.[s.sid];
    if (who === pid) forced[s.d] = s;
    else if (!who && availOf(avail, pid, s.key) > 0 && !model.blocked(s, pid)) opts[s.d].push(s);
  }
  for (let d = 1; d <= D; d++) if (forced[d]) opts[d] = [forced[d]];
  const keys = [...new Set([...Object.keys(lim), ...Object.keys(min)])];
  const cap = keys.map((k) => lim[k] ?? min[k]);
  const daysWith = keys.map((k) => opts.map((o) => o.some((s) => s.cats.includes(k))));
  const must = new Set(model.musts.filter((x) => x.pid === pid).map((x) => x.d));
  const memo = new Set();
  let nodes = 0;
  const rec = (d, blocked, blockedNext, cnt) => {
    if (d > D) return keys.every((k, i) => cnt[i] >= (min[k] ?? 0));
    const id = `${d}|${+blocked}${+blockedNext}|${cnt}`;
    if (memo.has(id)) return false;
    if (++nodes > 200000) throw 'budget';
    // górne oszacowanie: ile jeszcze dni bez dnia po dniu zostało na każde minimum
    for (let i = 0; i < keys.length; i++) {
      let need = (min[keys[i]] ?? 0) - cnt[i];
      for (let e = blocked ? d + 1 : d; need > 0 && e <= D; e++) if (daysWith[i][e]) { need--; e++; }
      if (need > 0) { memo.add(id); return false; }
    }
    if (!blocked) for (const s of opts[d]) {
      const next = cnt.map((n, i) => (s.cats.includes(keys[i]) ? Math.min(n + 1, cap[i]) : n));
      if (keys.some((k, i) => s.cats.includes(k) && cnt[i] + 1 > (lim[k] ?? Infinity))) continue;
      if (rec(d + 1, true, !!s.beforeRest, next)) return true;
    }
    if (!forced[d] && !must.has(d) && rec(d + 1, blockedNext, false, cnt)) return true;
    memo.add(id);
    return false;
  };
  try { return rec(1, false, false, keys.map(() => 0)); } catch (e) { if (e === 'budget') return null; throw e; }
}

// Dowody sprzeczności (bez szukania całego grafiku): każda osoba z osobna i sumy minimów na każdą kategorię.
// Zwraca listę zdań po polsku; pusta = nie znaleziono sprzeczności (co nie dowodzi, że grafik istnieje).
function conflicts(model, y, m, shifts, people, locked, avail, limits, asDay = {}) {
  const out = [];
  const label = (k) => CAT[k] ?? shifts.find((s) => s.id === k)?.name ?? k;
  const isLocked = (s) => locked[s.key]?.[s.sid];
  for (const p of people) {
    const l = limits[p.id] || {};
    const items = [...Object.entries(l).filter(([k, n]) => k !== 'min' && Number.isFinite(n)).map(([k, n]) => ['Limit', k, n]),
      ...Object.entries(l.min || {}).filter(([, n]) => n > 0).map(([k, n]) => ['Min.', k, n])];
    const fits = (list) => personFits(model, avail, locked, p.id,
      Object.fromEntries(list.filter((x) => x[0] === 'Limit').map((x) => [x[1], x[2]])),
      Object.fromEntries(list.filter((x) => x[0] === 'Min.').map((x) => [x[1], x[2]])));
    if (fits(items) !== false) continue;
    const mustDays = model.musts.filter((x) => x.pid === p.id).map((x) => x.d);
    if (mustDays.length && fits([]) === false) {
      out.push(`${p.name}: dni „Muszę” (${mustDays.join(', ')}) nie dają się spełnić — nie ma dyżuru dzień po dniu ani 2 dni po weekendowym OITN, ` +
        `a w dzień „Muszę” musi zostać wolne miejsce (bez ręcznego wpisu innej osoby). Zmień dostępność: ${p.name}.`);
      continue;
    }
    let core = items; // najmniejszy zestaw ustawień, który nadal się wyklucza
    for (const it of items) { const rest = core.filter((x) => x !== it); if (fits(rest) === false) core = rest; }
    const days = [...new Set(model.slots.filter((s) => availOf(avail, p.id, s.key) > 0 && (!isLocked(s) || isLocked(s) === p.id)).map((s) => s.d))];
    const dayName = (d) => { const w = limitDay(asDay, y, m, d); return w === weekday(y, m, d) ? (w >= 4 ? ` ${DOW[w]}` : '') : ` jak ${DOW[w]}`; };
    const list = (t) => core.filter((x) => x[0] === t).map(([, k, n]) => `${n} ${PHRASE[k] ?? `na ${label(k)}`}`).join(', ');
    const few = days.length <= 12; // przy ograniczonej dostępności liczą się też dni i odpoczynek
    out.push(`${p.name}: minimum ${list('Min.')}${list('Limit') ? `, a limit ${list('Limit')}` : ''} — to się wyklucza` +
      (few ? ` przy dostępnych dniach: ${days.map((d) => d + dayName(d)).join(', ')} (bez dyżuru dzień po dniu ani 2 dni po weekendowym OITN)` : '') +
      `. Zmień jedno z tych pól${few ? ' albo dostępność' : ''} w Osoby → ${p.name} → Ustawienia (puste pole Limit = wartość domyślna, szara).`);
  }
  // Minimum faktyczne: łącznie ≥ suma minimów na miejscach, Pt/So/Nd ≥ Pt + So + Nd albo Pt + (So + Nd), So + Nd ≥ So + Nd osobno
  const parts = { '*': [shifts.map((s) => s.id)], we: [['d4', 'd5', 'd6'], ['d4', 'd56']], d56: [['d5', 'd6']] };
  const sum = (p, list) => list.reduce((n, c) => n + (limits[p.id]?.min?.[c] ?? 0), 0);
  const top = (p, k) => (parts[k] ?? []).reduce((b, list) => (sum(p, list) > sum(p, b) ? list : b), []); // składniki dające największą sumę
  const eff = (p, k) => Math.max(limits[p.id]?.min?.[k] ?? 0, sum(p, top(p, k)));
  const why = (list, k) => list.filter((p) => eff(p, k) > (limits[p.id]?.min?.[k] ?? 0)).map((p) =>
    ` (${p.name}: minima ${top(p, k).filter((c) => limits[p.id]?.min?.[c]).map((c) => `${limits[p.id].min[c]} ${PHRASE[c] ?? `na ${label(c)}`}`).join(' + ')} = ${eff(p, k)}, więcej niż Min. ${label(k)} ${limits[p.id]?.min?.[k] ?? 0})`).join('');
  for (const k of new Set(model.slots.flatMap((s) => s.cats))) {
    const free = model.slots.filter((s) => s.cats.includes(k) && !isLocked(s)).length;
    const own = (pid) => model.slots.filter((s) => s.cats.includes(k) && isLocked(s) === pid).length;
    const need = people.reduce((n, p) => n + Math.max(0, eff(p, k) - own(p.id)), 0);
    if (need > free) out.push(`Minima „${label(k)}” wszystkich osób razem: ${need}, a wolnych dyżurów w tej kategorii jest tylko ${free}${why(people, k)}.`);
  }
  const res = people.filter(isResident);
  const resDays = new Set(model.slots.map((s) => s.d)).size - new Set(model.slots.filter((s) => res.some((p) => isLocked(s) === p.id)).map((s) => s.d)).size;
  const resNeed = res.reduce((n, p) => n + Math.max(0, eff(p, '*') - model.slots.filter((s) => isLocked(s) === p.id).length), 0);
  if (resNeed > resDays) out.push(`Minima rezydentów razem: ${resNeed}, a dni (maks. jeden rezydent dziennie) zostało ${resDays}${why(res, '*')}.`);
  for (const key of new Set(model.musts.map((x) => x.key))) {
    const day = model.slots.filter((s) => s.key === key);
    const who = people.filter((p) => model.musts.some((x) => x.key === key && x.pid === p.id) && !day.some((s) => isLocked(s) === p.id));
    const free = day.filter((s) => !isLocked(s)).length;
    const names = (list) => list.map((p) => p.name).join(', ');
    if (who.length > free) out.push(`${+key.slice(8)}.${key.slice(5, 7)}: „Muszę” ma ${who.length} osób (${names(who)}), a wolnych miejsc jest ${free}.`);
    else if (who.filter(isResident).length > 1) out.push(`${+key.slice(8)}.${key.slice(5, 7)}: „Muszę” ma kilku rezydentów (${names(who.filter(isResident))}), a dziennie może być tylko jeden.`);
  }
  return out;
}

// Wyżarzanie całego miesiąca naraz: kara za każde złamanie twardej zasady (×3) i każde puste miejsce (×1).
// Zwraca grafik bez łamania zasad (model.valid) z najmniejszą liczbą pustych miejsc albo null.
// Koszt liczony przyrostowo: ruch przelicza tylko składniki dotknięte zmianą (dni d − 2 … d osoby, kategorie miejsca, dzień),
// więc jedna iteracja nie zależy od długości miesiąca ani liczby kategorii.
function anneal(model, people, locked, limits, rules, { deadline, now = () => performance.now(), rand = Math.random, start = {} }) {
  const { slots } = model;
  const D = Math.max(0, ...slots.map((s) => s.d)), W = D + 3;
  const N = people.length, ix = Object.fromEntries(people.map((p, i) => [p.id, i]));
  const cats = [...new Set(slots.flatMap((s) => s.cats))], C = cats.length;
  const lim = people.flatMap((p) => cats.map((c) => limits[p.id]?.[c] ?? Infinity));
  const min = people.flatMap((p) => cats.map((c) => limits[p.id]?.min?.[c] ?? 0));
  const pres = people.map((p) => p.prestige ?? 2), res = people.map(isResident), bos = people.map((p) => +!!p.boss);
  const sc = slots.map((s) => s.cats.map((c) => cats.indexOf(c)));
  const cand = slots.map((s) => s.candidates.map((pid) => ix[pid]).filter((i) => i !== undefined));
  const ok = slots.map((s, i) => { const a = new Uint8Array(N); for (const p of cand[i]) a[p] = 1; return a; });
  const cap = new Int8Array(W), daySlots = Array.from({ length: W }, () => []);
  slots.forEach((s, i) => { cap[s.d]++; daySlots[s.d].push(i); });
  // warunki (breaksRule) jako indeksy osób i maska dozwolonych miejsc — bez obiektów dnia w pętli
  const sids = [...new Set(slots.map((s) => s.sid))], si = slots.map((s) => sids.indexOf(s.sid));
  const R = rules.map((r) => ({ who: ix[r.who] ?? -1, with: ix[r.with] ?? -1, places: Uint8Array.from(sids, (id) => +r.places.includes(id)) }))
    .filter((r) => r.who >= 0 && r.with >= 0);
  const w = new Int8Array(N * W), oi = new Int8Array(N * W), cnt = new Int16Array(N * C), must = new Uint8Array(N * W);
  for (const x of model.musts) must[ix[x.pid] * W + x.d] = 1;
  const dRes = new Int8Array(W), dBoss = new Int8Array(W), dPres = new Int16Array(W), fill = new Int8Array(W);
  const a = new Int16Array(slots.length).fill(-1);
  const put = (i, p, sign) => {
    const s = slots[i];
    if (p === -2) { dPres[s.d] += 2 * sign; fill[s.d] += sign; return; } // ręczny wpis usuniętej osoby
    if (p < 0) return;
    w[p * W + s.d] += sign; if (s.beforeRest) oi[p * W + s.d] += sign;
    for (const c of sc[i]) cnt[p * C + c] += sign;
    dRes[s.d] += res[p] * sign; dBoss[s.d] += bos[p] * sign; dPres[s.d] += pres[p] * sign; fill[s.d] += sign;
  };
  // składniki kosztu osoby: dzień e (o = p * W) i kategoria (oc = p * C + c)
  const dayTerm = (o, e) => {
    const x = w[o + e];
    return (x > 1 ? x - 1 : 0) + (must[o + e] && !x ? 1 : 0) + (x && w[o + e + 1] ? 1 : 0) + (oi[o + e] && w[o + e + 2] ? 1 : 0);
  };
  const catTerm = (oc) => { const n = cnt[oc]; return n > lim[oc] ? n - lim[oc] : n < min[oc] ? min[oc] - n : 0; };
  const pc = (p) => {
    let v = 0;
    for (let d = 1; d <= D; d++) v += dayTerm(p * W, d);
    for (let c = 0; c < C; c++) v += catTerm(p * C + c);
    return 3 * v;
  };
  const breaks = (d, i, p) => { // breaksRule dla osoby p na miejscu i dnia d
    for (const r of R) {
      if (r.who === p && !r.places[si[i]]) for (const j of daySlots[d]) if (a[j] === r.with) return 1;
      if (r.with === p) for (const j of daySlots[d]) if (a[j] === r.who && !r.places[si[j]]) return 1;
    }
    return 0;
  };
  const dc = (d) => {
    let v = Math.max(0, dRes[d] - 1) + Math.max(0, dBoss[d] - MAX_BOSS);
    if (fill[d] === cap[d] && cap[d] * 2 >= MIN_PRESTIGE && dPres[d] < MIN_PRESTIGE) v += MIN_PRESTIGE - dPres[d];
    if (R.length) for (const i of daySlots[d]) if (a[i] >= 0) v += breaks(d, i, a[i]);
    return 3 * v + cap[d] - fill[d];
  };
  // dotknięte składniki osoby p przy zmianie na miejscu i; stempel `gen` liczy każdy składnik raz na ruch
  const stD = new Int32Array(N * W), stC = new Int32Array(N * C);
  let gen = 0;
  const local = (p, i) => {
    if (p < 0) return 0;
    let v = 0;
    const o = p * W, d = slots[i].d;
    for (let e = Math.max(1, d - 2); e <= d; e++) if (stD[o + e] !== gen) { stD[o + e] = gen; v += dayTerm(o, e); }
    for (const c of sc[i]) { const oc = p * C + c; if (stC[oc] !== gen) { stC[oc] = gen; v += catTerm(oc); } }
    return 3 * v;
  };
  const touched = (i, j, p, q) => { // koszt części dotkniętej ruchem: q ↔ p na miejscu i (i ewentualnie j)
    gen++;
    const di = slots[i].d, dj = j < 0 ? di : slots[j].d;
    return local(q, i) + local(p, i) + (j >= 0 ? local(p, j) + local(q, j) : 0) + dc(di) + (dj !== di ? dc(dj) : 0);
  };
  const movable = [];
  slots.forEach((s, i) => {
    const who = locked[s.key]?.[s.sid];
    if (who) a[i] = ix[who] ?? -2;
    else { movable.push(i); const p = ix[start[s.key]?.[s.sid]]; if (p !== undefined && ok[i][p]) a[i] = p; }
    put(i, a[i], 1);
  });
  if (!movable.length) return null;
  let cost = 0;
  for (let p = 0; p < N; p++) cost += pc(p);
  for (let d = 1; d <= D; d++) cost += dc(d);
  const floor = movable.filter((i) => !cand[i].length).length; // tych miejsc nikt nie może wziąć
  let best = cost, bestA = a.slice();
  const pick = (n) => Math.floor(rand() * n);
  for (let it = 0, T = 2; best > floor; it++) {
    if ((it & 1023) === 0) { if (now() >= deadline) break; }
    T = it % 30000 === 0 ? 2 : T * 0.9998; // cykle schładzania z ponownym podgrzaniem
    const i = movable[pick(movable.length)], q = a[i];
    let j = -1, p;
    if (rand() < 0.3) { // zamiana z innym miejscem
      j = movable[pick(movable.length)];
      p = a[j];
      if (j === i || p === q || (p >= 0 && !ok[i][p]) || (q >= 0 && !ok[j][q])) continue;
    } else {
      const k = pick(cand[i].length + 1);
      p = k < cand[i].length ? cand[i][k] : -1;
      if (p === q) continue;
    }
    const before = touched(i, j, p, q);
    put(i, q, -1); put(i, p, 1); a[i] = p;
    if (j >= 0) { put(j, p, -1); put(j, q, 1); a[j] = q; }
    const delta = touched(i, j, p, q) - before;
    if (delta <= 0 || rand() < Math.exp(-delta / T)) {
      cost += delta;
      if (cost < best) { best = cost; bestA = a.slice(); }
    } else {
      put(i, p, -1); put(i, q, 1); a[i] = q;
      if (j >= 0) { put(j, q, -1); put(j, p, 1); a[j] = p; }
    }
  }
  const schedule = Object.fromEntries([...new Set(slots.map((s) => s.key))].map((key) => [key, { ...locked[key] }]));
  for (const i of movable) if (bestA[i] >= 0) schedule[slots[i].key][slots[i].sid] = people[bestA[i]].id;
  return model.valid(schedule) ? schedule : null;
}

// Sprzeczności → błąd z wyjaśnieniem; inaczej wyżarzanie, a gdy i ono nie znajdzie — próby bez minimów pojedynczych osób, żeby wskazać, gdzie szukać.
function solveOrExplain(y, m, shifts, people, locked, avail, limits, rules, asDay, model, seed, { deadline, now = () => performance.now(), rand = Math.random, progress = () => {} }) {
  const found = conflicts(model, y, m, shifts, people, locked, avail, limits, asDay);
  if (found.length) throw new Error(`Nie znaleziono grafiku — ustawienia są sprzeczne:\n• ${found.join('\n• ')}`);
  progress('Szukam grafiku spełniającego wszystkie minima…');
  const start = now();
  const solved = anneal(model, people, locked, limits, rules, { deadline: start + (deadline - start) * 0.7, now, rand, start: seed });
  if (solved) return solved;
  progress('Nie wychodzi — sprawdzam, czyje minima blokują grafik…');
  const blockers = [];
  const withMins = people.filter((p) => Object.values(limits[p.id]?.min || {}).some((n) => n > 0));
  for (const [i, p] of withMins.entries()) {
    const left = deadline - now();
    if (left <= 0) break;
    const relaxed = { ...limits, [p.id]: { ...limits[p.id], min: {} } };
    if (anneal(constraints(y, m, shifts, people, avail, relaxed, rules, asDay, locked), people, locked, relaxed, rules,
      { deadline: now() + left / (withMins.length - i), now, rand, start: seed })) blockers.push(p.name);
  }
  throw new Error('Nie znaleziono grafiku spełniającego wszystkie limity dolne i górne oraz dni „Muszę”. Nie wykryłem prostej sprzeczności (każda osoba z osobna i sumy minimów są w porządku), ' +
    (blockers.length ? `ale grafik daje się ułożyć po zdjęciu minimów jednej z osób: ${blockers.join(', ')}. Tam szukaj konfliktu (np. te same wolne dni co inni, rezydenci, punkty prestiżu).`
      : 'a zdjęcie minimów pojedynczej osoby nie wystarcza. Zmniejsz kilka minimów albo ponów próbę.'));
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

// Ręczne wpisy łamią zasady: same w sobie albo dopiero razem z dniami sąsiedniego miesiąca (wpisy `locked` spoza miesiąca).
function lockedError(y, m, shifts, people, avail, limits, rules, asDay, locked) {
  const month = dateKey(y, m, 1).slice(0, 8), inMonth = Object.fromEntries(Object.entries(locked).filter(([k]) => k.startsWith(month)));
  return new Error(constraints(y, m, shifts, people, avail, limits, rules, asDay, inMonth).valid(inMonth, false)
    ? 'Ręczne wpisy kolidują z grafikiem sąsiedniego miesiąca (dzień po dniu albo odpoczynek po weekendowym OITN na przełomie miesięcy). Popraw je przed układaniem.'
    : 'Ręczne wpisy łamią twarde zasady lub limity. Popraw je przed układaniem.');
}

export function generateMonth(y, m, shifts, people, locked = {}, avail = {}, limits = {}, rules = [], bad = {}, wants = {}, options = {}) {
  checkSettings(people, limits, wants);
  const model = constraints(y, m, shifts, people, avail, limits, rules, options.asDay, locked);
  if (!model.valid(locked, false)) throw lockedError(y, m, shifts, people, avail, limits, rules, options.asDay, locked);
  const seed = greedyMonth(y, m, shifts, people, locked, avail, limits, rules, bad, wants, options);
  if (model.valid(seed)) return seed;
  return solveOrExplain(y, m, shifts, people, locked, avail, limits, rules, options.asDay, model, seed, { deadline: performance.now() + 3000, rand: options.rand });
}

// Twarde warunki są filtrem, następnie obsada i dokładność próśb.
// Pozostałe preferencje mają skończone wagi: niższe też wpływają na wynik.
export function generateVariants(y, m, shifts, people, locked = {}, avail = {}, limits = {}, rules = [], bad = {}, wants = {},
  { order = PRIORITY_ORDER, asDay = {}, tries = 200, keep = 3, rand = Math.random, timeBudgetMs = 4500,
    onProgress = () => {}, now = () => performance.now() } = {}) {
  const started = now();
  const duration = Number.isFinite(timeBudgetMs) ? Math.max(20, Math.min(20000, timeBudgetMs)) : 4500;
  const deadline = started + duration;
  const progress = (message) => onProgress({ message });
  progress('Tworzę propozycje grafiku…');
  const args = [y, m, shifts, people, locked, avail, limits, rules, bad, wants];
  checkSettings(people, limits, wants);
  const model = constraints(y, m, shifts, people, avail, limits, rules, asDay, locked);
  if (!model.valid(locked, false)) throw lockedError(y, m, shifts, people, avail, limits, rules, asDay, locked);
  const { slots } = model;
  const scale = { avail: 10, sandwich: 1, weDow: 1, bad: Math.max(1, slots.length * 9 / Math.max(1, people.length)), even: Math.max(1, slots.length / Math.max(1, people.length)) };
  const key = (sc) => [sc.unfilled, sc.wants, order.reduce((n, k, i) => n + (k === 'wants' ? 0 : (order.length - i) * sc[k] / scale[k]), 0)];
  const cmp = (a, b) => { const ka = key(a.score), kb = key(b.score); return ka.reduce((r, v, i) => r || v - kb[i], 0); };
  const same = (a, b) => ['unfilled', 'min', ...PRIORITY_ORDER].every((k) => a.score[k] === b.score[k]); // remis we wszystkich kryteriach
  const withEdge = Object.keys(model.edge).length ? (s) => ({ ...model.edge, ...s }) : (s) => s; // kanapki z końcem poprzedniego miesiąca
  const score = (schedule) => scoreMonth(y, m, withEdge(schedule), shifts, people, avail, bad, wants, limits, asDay);
  const copy = (s) => Object.fromEntries(Object.entries(s).map(([key, day]) => [key, { ...day }]));
  const ids = (schedule) => slots.map((s) => schedule[s.key]?.[s.sid] ?? '');
  // skład dnia = kto tego dnia dyżuruje, bez względu na miejsce — warianty różniące się tylko rozstawieniem
  // tych samych osób na miejscach w obrębie dnia nie są osobnym wyborem
  const dates = [...new Set(slots.map((s) => s.key))];
  const crew = (schedule) => dates.map((key) => Object.values(schedule[key] || {}).sort().join(','));
  // wszystkie znalezione zgodne grafiki, bez powtórzeń (klucz = obsada miejsc po kolei)
  const seen = new Map(), crews = new Set();
  const remember = (schedule, sc, trusted = false, tie = false) => {
    if (!schedule || (tie && seen.size >= 400)) return;
    const list = ids(schedule), sig = list.join('\n'), days = crew(schedule), cs = days.join('\n');
    if (seen.has(sig) || (tie && crews.has(cs)) || (!trusted && !model.valid(schedule))) return;
    seen.set(sig, { schedule: trusted ? copy(schedule) : schedule, score: sc ?? score(schedule), ids: list, days });
    crews.add(cs);
  };
  let seed;
  for (let i = 0; i <= Math.min(1000, tries); i++) {
    if (i && now() >= started + duration * 0.25) break;
    // Zmieniamy też punkt startu preferencji, nie tylko remisy na pierwszym kryterium; co druga próba — najtrudniejsze dni najpierw.
    const offset = Math.floor(i / 2) % Math.max(1, order.length);
    const trialOrder = [...order.slice(offset), ...order.slice(0, offset)];
    const schedule = greedyMonth(...args, { order: trialOrder, rand: i ? rand : undefined, asDay, mrv: i % 2 === 1 });
    seed ??= schedule;
    remember(schedule);
  }
  progress('Sprawdzam limity i szukam obsady trudnych terminów…');
  if (!seen.size) remember(solveOrExplain(y, m, shifts, people, locked, avail, limits, rules, asDay, model, seed, { deadline: started + duration * 0.8, now, rand, progress }));
  else if ([...seen.values()].every((v) => v.score.unfilled))
    remember(anneal(model, people, locked, limits, rules, { deadline: started + duration * 0.55, now, rand, start: seed }));

  // Ruchy na całym miesiącu: zmiana osoby, zamiana dwóch i cykl trzech przydziałów, także między miejscami i dniami.
  // Twarde zasady sprawdza od razu model.can na bieżącym grafiku z licznikami (plus minima i „Muszę” zdejmowanych osób),
  // więc scoreMonth liczymy tylko dla ruchów w pełni dozwolonych.
  progress('Poprawiam dopasowanie próśb i rozkład dyżurów…');
  const movable = slots.filter((s) => !locked[s.key]?.[s.sid]);
  const mustKeys = {};
  for (const x of model.musts) (mustKeys[x.pid] ??= []).push(x.key);
  const place = (schedule, tally, s, pid, sign) => {
    if (sign > 0) schedule[s.key][s.sid] = pid; else delete schedule[s.key][s.sid];
    if (tally[pid]) for (const k of s.cats) tally[pid][k] = (tally[pid][k] || 0) + sign;
  };
  const keeps = (schedule, tally, pid) => Object.entries(limits[pid]?.min || {}).every(([k, n]) => (tally[pid]?.[k] || 0) >= n) &&
    (mustKeys[pid] || []).every((key) => Object.values(schedule[key] || {}).includes(pid));
  const undo = (schedule, tally, list, old) => {
    for (const s of list) { const pid = schedule[s.key][s.sid]; if (pid) place(schedule, tally, s, pid, -1); }
    list.forEach((s, k) => old[k] && place(schedule, tally, s, old[k], 1));
  };
  // na miejscach `list` stają osoby `pids` (puste = wolne miejsce); zwraca poprzednie osoby albo null (ruch łamie zasady — cofnięty)
  const move = (schedule, tally, list, pids) => {
    const old = list.map((s) => schedule[s.key][s.sid]);
    list.forEach((s, k) => old[k] && place(schedule, tally, s, old[k], -1));
    let n = 0;
    for (; n < list.length; n++) if (pids[n]) {
      if (!model.can(schedule, list[n], pids[n], tally)) break;
      place(schedule, tally, list[n], pids[n], 1);
    }
    if (n === list.length && old.every((pid) => !pid || keeps(schedule, tally, pid))) return old;
    undo(schedule, tally, list, old);
    return null;
  };
  const far = Math.max(2, Math.ceil(dates.length / 10)); // „inny strukturalnie” = inny skład w co najmniej tylu dniach
  const differ = (a, b) => a.days.reduce((n, x, i) => n + (x !== b.days[i]), 0);
  // najpierw wyraźnie różne, potem z innym składem choć jednego dnia (any — dowolne, do startów poprawiania)
  const choose = (list, n, out = [], any = false) => {
    for (const v of list) if (out.length < n && !out.includes(v) && out.every((o) => differ(o, v) >= far)) out.push(v);
    for (const v of list) if (out.length < n && !out.includes(v) && (any || out.every((o) => differ(o, v) >= 1))) out.push(v);
    return out;
  };
  const pick = (n) => Math.floor(rand() * n);

  const improve = (start, until) => {
    let best = start, schedule, tally;
    const reset = () => { // grafik roboczy = najlepszy znaleziony
      schedule = copy(best.schedule);
      for (const s of slots) schedule[s.key] ??= {};
      tally = model.counts(schedule);
    };
    reset();
    const accept = (sc) => {
      if (cmp({ score: sc }, best) < -1e-9) { best = { schedule: copy(schedule), score: sc }; remember(schedule, sc, true); return true; }
      if (same({ score: sc }, best)) remember(schedule, sc, true, true); // remis = gotowy wariant do wyboru
      return false;
    };
    // 1) Hill climbing: zmiana osoby i zamiana par, aż nic nie poprawia
    const climb = (climbUntil) => {
      for (let pass = 0; pass < 5 && now() < climbUntil; pass++) {
        let improved = false;
        for (let i = 0; i < movable.length; i++) {
          if (now() >= climbUntil) break;
          const s = movable[i];
          for (const pid of s.candidates) {
            if (pid === schedule[s.key][s.sid]) continue;
            const old = move(schedule, tally, [s], [pid]);
            if (old) { if (accept(score(schedule))) improved = true; else undo(schedule, tally, [s], old); }
          }
          for (let j = i + 1; j < movable.length; j++) {
            const t = movable[j], a = schedule[s.key][s.sid], b = schedule[t.key][t.sid];
            if (a === b) continue;
            const old = move(schedule, tally, [s, t], [b, a]);
            if (old) { if (accept(score(schedule))) improved = true; else undo(schedule, tally, [s, t], old); }
          }
        }
        if (!improved) break;
      }
    };
    climb(now() + (until - now()) * 0.35);
    // 2) Wyżarzanie miękkie: przyjmuje też niewielkie pogorszenie (np. jedna prośba mniej), a cykl A → B → C → A
    // przesuwa trzy osoby naraz — wychodzi z lokalnych minimów, których pojedyncza zamiana nie rusza.
    const saUntil = now() + (until - now()) * 0.6;
    const energy = (sc) => { const k = key(sc); return k[0] * 1e6 + k[1] * 10 + k[2]; };
    let cur = energy(best.score), gain = 0;
    const maxIt = 200000;
    for (let it = 0; it < maxIt && it - gain < 50000 && movable.length; it++) {
      if ((it & 31) === 0 && now() >= saUntil) break;
      const T = 1.5 * (1 - it / maxIt) + 0.05, r = rand();
      let list, pids;
      if (r < 0.4) {
        const s = movable[pick(movable.length)], c = s.candidates;
        if (!c.length) continue;
        list = [s]; pids = [c[pick(c.length)]];
        if (pids[0] === schedule[s.key][s.sid]) continue;
      } else {
        list = [movable[pick(movable.length)], movable[pick(movable.length)], ...(r < 0.8 ? [] : [movable[pick(movable.length)]])];
        if (new Set(list).size < list.length) continue;
        const held = list.map((s) => schedule[s.key][s.sid]);
        pids = [held.at(-1), ...held.slice(0, -1)]; // zamiana dwóch albo cykl trzech
        if (pids.every((p, k) => p === held[k])) continue;
      }
      const old = move(schedule, tally, list, pids);
      if (!old) continue;
      const sc = score(schedule), e = energy(sc);
      if (e <= cur || rand() < Math.exp((cur - e) / T)) { cur = e; if (accept(sc)) gain = it; }
      else undo(schedule, tally, list, old);
    }
    reset(); // wyżarzanie kończy w przypadkowym miejscu — dopracowujemy najlepszy
    climb(now() + (until - now()) * 0.6);
    // 3) Większe naprawy: uwalniamy grupę dni i układamy ją od nowa.
    // Reszta najlepszego grafiku jest zamrożona, ręczne wpisy zawsze zostają.
    // Pozwala to przejść przez kilka zależnych zmian, których pojedyncza zamiana nie rozwiązuje.
    const free = [...new Set(movable.map((s) => s.key))]; // dni z miejscami do zmiany
    for (let attempt = 0; attempt < 16 && now() < until && free.length; attempt++) {
      const frozen = copy(best.schedule);
      const first = Math.floor(rand() * free.length);
      const selected = new Set();
      for (let i = 0; i < Math.min(5, free.length); i++)
        selected.add(free[(first + (attempt % 2 ? i * 7 : i)) % free.length]);
      for (const s of movable) if (selected.has(s.key)) delete frozen[s.key][s.sid];
      const repaired = searchMonth(model, people, frozen, limits, wants, best.schedule, false,
        { deadline: Math.min(until, now() + 100), budget: 2000, now });
      if (!repaired) continue;
      Object.assign(schedule, copy(repaired));
      tally = model.counts(schedule);
      accept(score(schedule));
    }
    return best;
  };
  // poprawiamy kilka najlepszych, wyraźnie różnych grafików startowych; najlepszy dostaje podwójną część czasu
  const starts = choose([...seen.values()].sort(cmp), Math.max(1, keep), [], true);
  for (const [n, start] of starts.entries()) {
    const t = now();
    if (t >= deadline) break;
    improve(start, t + (deadline - t) * (n ? 1 : 2) / (starts.length - n + (n ? 0 : 1)));
  }
  const all = [...seen.values()].sort(cmp);
  const out = choose(all.filter((v) => same(v, all[0])), keep);
  // brak remisów → do wyboru także prawie równie dobre (ta sama obsada i prośby, reszta oceny w granicach 10%)
  if (out.length < Math.min(2, keep)) {
    const [u, w, rest] = key(all[0].score);
    choose(all.filter((v) => { const k = key(v.score); return k[0] === u && k[1] === w && k[2] <= rest * 1.1 + 0.5; }), keep, out);
  }
  return out.map(({ schedule, score }) => ({ schedule, score }));
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

// Zakładka Statystyki: liczniki oglądanego miesiąca. people → { pid: { total, n: { '*' / shiftId / we / d4-d6 / d56: dyżury — klucze jak w limitach, z asDay },
// dow: [7] (prawdziwy dzień tygodnia), bad: punkty gównianości, lvl: [5] dyżury wg dostępności tego dnia, days: [5] dni miesiąca wg dostępności,
// sandwich: dyżury co drugi dzień (jak w scoreMonth), manual: wpisane ręcznie } }; do tego obsada całości i każdego miejsca.
export function monthStats(y, m, schedule, shifts, people, avail = {}, bad = {}, asDay = {}, manual = {}) {
  const st = { slots: 0, filled: 0, manual: 0, lastResort: 0, sandwich: 0, shifts: Object.fromEntries(shifts.map((s) => [s.id, { slots: 0, filled: 0 }])), people: {} };
  for (const p of people) st.people[p.id] = { total: 0, n: {}, dow: [0, 0, 0, 0, 0, 0, 0], bad: 0, lvl: [0, 0, 0, 0, 0], days: [0, 0, 0, 0, 0], sandwich: 0, manual: 0 };
  const pn1 = shifts.find((s) => s.name === 'PN1')?.id, last = {}, lastSid = {};
  const pref = Object.fromEntries(people.map((p) => [p.id, p.pn1Sandwich !== false]));
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(y, m, d), day = schedule[key] || {}, wd = weekday(y, m, d);
    for (const p of people) st.people[p.id].days[availOf(avail, p.id, key)]++;
    for (const s of shiftsForDay(shifts, y, m, d)) {
      st.slots++; st.shifts[s.id].slots++;
      const x = st.people[day[s.id]];
      if (!x) continue;
      const pid = day[s.id], lvl = availOf(avail, pid, key);
      st.filled++; st.shifts[s.id].filled++;
      const lw = limitDay(asDay, y, m, d);
      for (const k of ['*', s.id, ...(lw >= 4 ? ['we', `d${lw}`] : []), ...(lw >= 5 ? ['d56'] : [])]) x.n[k] = (x.n[k] || 0) + 1;
      x.total++; x.dow[wd]++; x.lvl[lvl]++; x.bad += badOf(bad, y, m, d);
      if (manual[key]?.[s.id] === pid) { x.manual++; st.manual++; }
      st.lastResort += lvl === 1;
      if (last[pid] === d - 2 && lvl < 3 && !(pref[pid] && wd === 0 && lastSid[pid] === pn1)) { x.sandwich++; st.sandwich++; }
      last[pid] = d; lastSid[pid] = s.id;
    }
  }
  return st;
}
