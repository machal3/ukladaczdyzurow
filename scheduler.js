// Czyste funkcje: zero DOM, zero localStorage — łatwe do testowania i podmiany na mocniejszy solver.

export const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; // m: 0-11
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const weekday = (y, m, d) => (new Date(y, m, d).getDay() + 6) % 7; // 0 = pon, 6 = nd

// Dostępność: 0 = Nie mogę (twardy zakaz), 1 = W ostateczności, 2 = Mogę (domyślnie), 3 = Chcę.
// avail = { personId: { 'YYYY-MM-DD': poziom } }
export const LEVELS = ['Nie mogę', 'W ostateczności', 'Mogę', 'Chcę'];
export const availOf = (avail, pid, key) => avail[pid]?.[key] ?? 2;

// Gównianość dnia 0-3; bad = { 'YYYY-MM-DD': poziom }, brak = 2 w Pt/So/Nd, 0 w pozostałe dni.
export const BAD = ['Zwykły', 'Słaby', 'Gówniany', 'Tragiczny'];
export const badOf = (bad, y, m, d) => bad[dateKey(y, m, d)] ?? (weekday(y, m, d) >= 4 ? 2 : 0);
// person.past 0-3 = jak gówniane dyżury miała ostatnio; startowe punkty obciążenia = past × PAST_WEIGHT.
// ponytail: stała waga na oko (poziom 3 ≈ trzy gówniane dni); stroić, jeśli wychodzi niesprawiedliwie.
export const PAST_WEIGHT = 3;

// Dyżury, które trzeba obstawić danego dnia.
export const shiftsForDay = (shifts, y, m, d) => shifts.filter((s) => s.days.includes(weekday(y, m, d)));

// Zwraca { 'YYYY-MM-DD': { shiftId: personId } }.
// Twarde zasady: nikt dwa razy tego samego dnia, nikt dzień po dniu, nikt w dzień „Nie mogę”,
// nikt ponad swój miesięczny limit na danym dyżurze: limits = { personId: { shiftId: n, '*': n łącznie, we: n w Pt/So/Nd } } (brak = bez limitu).
// Kolejność wyboru: najpierw dostępność (Chcę > Mogę > W ostateczności), potem w gówniany dzień najmniejsze
// obciążenie gównianością (ostatnio + ten miesiąc), potem równy podział liczby dyżurów.
// Wpisy z `locked` (ręczne) są zachowane i liczą się do bilansu.
// ponytail: zachłanny algorytm dzień po dniu; preferencje/limity → podmienić na solver (np. ILP) z tym samym interfejsem.
export function generateMonth(y, m, shifts, people, locked = {}, avail = {}, limits = {}, bad = {}) {
  const result = {};
  const count = Object.fromEntries(people.map((p) => [p.id, 0]));
  const burden = Object.fromEntries(people.map((p) => [p.id, (p.past ?? 0) * PAST_WEIGHT]));
  const perShift = {}; // 'personId:shiftId' → liczba dyżurów
  const we = {}; // personId → liczba dyżurów w Pt/So/Nd
  const isWe = (d) => weekday(y, m, d) >= 4;
  const add = (pid, sid, d) => {
    count[pid]++; perShift[`${pid}:${sid}`] = (perShift[`${pid}:${sid}`] || 0) + 1;
    if (isWe(d)) we[pid] = (we[pid] || 0) + 1;
    burden[pid] += badOf(bad, y, m, d);
  };
  const underLimit = (pid, sid, d) => (perShift[`${pid}:${sid}`] || 0) < (limits[pid]?.[sid] ?? Infinity) &&
    count[pid] < (limits[pid]?.['*'] ?? Infinity) && (!isWe(d) || (we[pid] || 0) < (limits[pid]?.we ?? Infinity));
  const lastDay = {};
  for (const [key, day] of Object.entries(locked))
    for (const [sid, pid] of Object.entries(day)) if (pid in count) add(pid, sid, +key.slice(8));

  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(y, m, d);
    const day = { ...(locked[key] || {}) };
    const busy = new Set(Object.values(day));
    const isBad = badOf(bad, y, m, d) > 0;

    for (const s of shiftsForDay(shifts, y, m, d)) {
      if (day[s.id]) continue;
      const pick = people
        .filter((p) => availOf(avail, p.id, key) > 0 && !busy.has(p.id) && lastDay[p.id] !== d - 1 && !lockedOn(locked, y, m, d + 1, p.id) && underLimit(p.id, s.id, d))
        .sort((a, b) => availOf(avail, b.id, key) - availOf(avail, a.id, key) ||
          (isBad && burden[a.id] - burden[b.id]) || count[a.id] - count[b.id] || (lastDay[a.id] ?? -99) - (lastDay[b.id] ?? -99))[0];
      if (!pick) continue; // brak wolnej osoby → dyżur zostaje pusty, widoczny w UI
      day[s.id] = pick.id;
      busy.add(pick.id);
      add(pick.id, s.id, d);
    }
    for (const pid of busy) lastDay[pid] = d;
    result[key] = day;
  }
  return result;
}

const lockedOn = (locked, y, m, d, pid) =>
  d <= daysInMonth(y, m) && Object.values(locked[dateKey(y, m, d)] || {}).includes(pid);
