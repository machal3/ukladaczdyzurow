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
export const availOf = (avail, pid, key) => avail[pid]?.[key] ?? 2;

// Dyżury, które trzeba obstawić danego dnia.
export const shiftsForDay = (shifts, y, m, d) => shifts.filter((s) => s.days.includes(weekday(y, m, d)));

// Zwraca { 'YYYY-MM-DD': { shiftId: personId } }.
// Twarde zasady: nikt dwa razy tego samego dnia, nikt dzień po dniu, nikt w dzień „Nie mogę”,
// nikt ponad swój miesięczny limit na danym dyżurze: limits = { personId: { shiftId: n, '*': n łącznie } } (brak = bez limitu).
// Kolejność wyboru: najpierw dostępność (Chcę > Mogę > W ostateczności), potem równy podział.
// maks. jeden rezydent dziennie (licząc ręczne wpisy).
// Wpisy z `locked` (ręczne) są zachowane i liczą się do bilansu.
// ponytail: zachłanny algorytm dzień po dniu; preferencje/limity → podmienić na solver (np. ILP) z tym samym interfejsem.
export function generateMonth(y, m, shifts, people, locked = {}, avail = {}, limits = {}) {
  const result = {};
  const count = Object.fromEntries(people.map((p) => [p.id, 0]));
  const perShift = {}; // 'personId:shiftId' → liczba dyżurów
  const add = (pid, sid) => { count[pid]++; perShift[`${pid}:${sid}`] = (perShift[`${pid}:${sid}`] || 0) + 1; };
  const underLimit = (pid, sid) => (perShift[`${pid}:${sid}`] || 0) < (limits[pid]?.[sid] ?? Infinity) &&
    count[pid] < (limits[pid]?.['*'] ?? Infinity);
  const lastDay = {};
  const resident = new Set(people.filter(isResident).map((p) => p.id));
  for (const day of Object.values(locked))
    for (const [sid, pid] of Object.entries(day)) if (pid in count) add(pid, sid);

  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const key = dateKey(y, m, d);
    const day = { ...(locked[key] || {}) };
    const busy = new Set(Object.values(day));
    let hasResident = [...busy].some((pid) => resident.has(pid));

    for (const s of shiftsForDay(shifts, y, m, d)) {
      if (day[s.id]) continue;
      const pick = people
        .filter((p) => availOf(avail, p.id, key) > 0 && !busy.has(p.id) && lastDay[p.id] !== d - 1 && !lockedOn(locked, y, m, d + 1, p.id) && underLimit(p.id, s.id) &&
          !(hasResident && resident.has(p.id)))
        .sort((a, b) => availOf(avail, b.id, key) - availOf(avail, a.id, key) ||
          count[a.id] - count[b.id] || (lastDay[a.id] ?? -99) - (lastDay[b.id] ?? -99))[0];
      if (!pick) continue; // brak wolnej osoby → dyżur zostaje pusty, widoczny w UI
      day[s.id] = pick.id;
      busy.add(pick.id);
      add(pick.id, s.id);
      hasResident ||= resident.has(pick.id);
    }
    for (const pid of busy) lastDay[pid] = d;
    result[key] = day;
  }
  return result;
}

const lockedOn = (locked, y, m, d, pid) =>
  d <= daysInMonth(y, m) && Object.values(locked[dateKey(y, m, d)] || {}).includes(pid);
