import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMonth, dateKey, history, badOf } from './scheduler.js';

const people = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
const all = [0, 1, 2, 3, 4, 5, 6];
const shifts = [{ id: 's1', name: 'S1', days: all }, { id: 's2', name: 'S2', days: all }];

test('obsadza wszystko, bez dubli w dniu i bez dyżurów dzień po dniu, równo', () => {
  const out = generateMonth(2026, 9, shifts, people); // październik, 31 dni
  const days = Object.values(out);
  assert.equal(days.length, 31);
  const count = {};
  days.forEach((day, i) => {
    const ids = Object.values(day);
    assert.equal(ids.length, 2);
    assert.equal(new Set(ids).size, 2);
    if (i) for (const id of ids) assert.ok(!Object.values(days[i - 1]).includes(id), `dzień po dniu: ${id}`);
    for (const id of ids) count[id] = (count[id] || 0) + 1;
  });
  const n = Object.values(count);
  assert.ok(Math.max(...n) - Math.min(...n) <= 1, JSON.stringify(count));
});

test('szanuje ręczne przypisania i nie wstawia tej osoby dzień wcześniej', () => {
  const locked = { [dateKey(2026, 9, 10)]: { s1: 'a' } };
  const out = generateMonth(2026, 9, shifts, people, locked);
  assert.equal(out['2026-10-10'].s1, 'a');
  assert.ok(!Object.values(out['2026-10-09']).includes('a'));
});

test('dni tygodnia: dyżur tylko w weekendy', () => {
  const out = generateMonth(2026, 9, [{ id: 'w', name: 'W', days: [5, 6] }], people);
  assert.deepEqual(out['2026-10-05'], {}); // poniedziałek
  assert.ok(out['2026-10-03'].w); // sobota
});

test('za mało ludzi → dyżur zostaje pusty zamiast łamać zasady', () => {
  const out = generateMonth(2026, 9, shifts, people.slice(0, 2));
  assert.equal(Object.values(out['2026-10-02']).length, 0); // obie osoby miały dyżur 1.10
});

test('dostępność: Chcę > Mogę > W ostateczności, Nie mogę = nigdy', () => {
  const k = dateKey(2026, 9, 1);
  const one = [{ id: 's', name: 'S', days: all }];
  const pick = (avail) => generateMonth(2026, 9, one, people, {}, avail)[k].s;
  assert.equal(pick({ d: { [k]: 3 } }), 'd');                                   // chce, mimo że ostatni na liście
  assert.equal(pick({ a: { [k]: 1 }, b: { [k]: 0 } }), 'c');                    // domyślne „Mogę” wygrywa
  assert.equal(pick({ a: { [k]: 0 }, b: { [k]: 1 }, c: { [k]: 0 }, d: { [k]: 0 } }), 'b');
  assert.equal(pick(Object.fromEntries(people.map((p) => [p.id, { [k]: 0 }]))), undefined); // wszyscy „Nie mogę” → pusto
});

test('limit: nikt ponad swój limit na danym dyżurze, 0 = nigdy, ręczne wpisy się liczą', () => {
  const locked = { [dateKey(2026, 9, 1)]: { s1: 'a' } };
  const limits = { a: { s1: 2, s2: 0 }, b: { s2: 3 } };
  const out = generateMonth(2026, 9, shifts, people, locked, {}, limits);
  const n = (pid, sid) => Object.values(out).filter((day) => day[sid] === pid).length;
  assert.equal(n('a', 's1'), 2);
  assert.equal(n('a', 's2'), 0);
  assert.ok(n('b', 's2') <= 3);
});

test('limit łączny: nikt ponad swój limit wszystkich dyżurów w miesiącu, niezależnie od limitów per dyżur', () => {
  const limits = { a: { '*': 3, s1: 10 } };
  const out = generateMonth(2026, 9, shifts, people, {}, {}, limits);
  assert.equal(Object.values(out).flatMap(Object.values).filter((pid) => pid === 'a').length, 3);
});

test('gównianość: w gówniany dzień wygrywa osoba z mniejszym obciążeniem (ostatnio + ten miesiąc)', () => {
  const one = [{ id: 's', name: 'S', days: all }];
  const k = dateKey(2026, 9, 1); // czwartek, domyślnie 0
  const withPast = people.map((p) => ({ ...p, past: p.id === 'a' ? 3 : 0 }));
  assert.equal(generateMonth(2026, 9, one, withPast)[k].s, 'a');                  // zwykły dzień: „ostatnio” nie gra roli
  assert.notEqual(generateMonth(2026, 9, one, withPast, {}, {}, {}, [], { [k]: 3 })[k].s, 'a');
});

test('gównianość: punkty rozkładają się równo w miesiącu', () => {
  const out = generateMonth(2026, 9, shifts, people); // domyślnie Pt = 2 pkt, So/Nd = 1 pkt
  const pts = {};
  for (const [k, day] of Object.entries(out)) for (const pid of Object.values(day))
    pts[pid] = (pts[pid] || 0) + [0, 0, 0, 0, 2, 1, 1][(new Date(k).getDay() + 6) % 7];
  const n = Object.values(pts);
  assert.ok(Math.max(...n) - Math.min(...n) <= 2, JSON.stringify(pts));
});

test('limit weekendowy: nikt ponad swój limit dyżurów w Pt/So/Nd, ręczne wpisy się liczą', () => {
  const locked = { [dateKey(2026, 9, 2)]: { s1: 'a' } }; // piątek
  const limits = { a: { we: 2 }, b: { we: 0 } };
  const out = generateMonth(2026, 9, shifts, people, locked, {}, limits);
  const weekendOf = (pid) => Object.entries(out).filter(([k, day]) =>
    [4, 5, 6].includes((new Date(k).getDay() + 6) % 7) && Object.values(day).includes(pid)).length;
  assert.equal(weekendOf('a'), 2);
  assert.equal(weekendOf('b'), 0);
  assert.ok(Object.values(out).flatMap(Object.values).includes('b')); // w tygodniu dalej dyżuruje
});

test('rezydenci (prestiż 0): maks. jeden dziennie, także gdy jeden jest wpisany ręcznie', () => {
  const ppl = ['r1', 'r2', 'r3', 'a1', 'a2'].map((id) => ({ id, name: id, prestige: id[0] === 'r' ? 0 : 2 }));
  const locked = { [dateKey(2026, 9, 5)]: { s1: 'r1' } };
  const out = generateMonth(2026, 9, shifts, ppl, locked);
  for (const day of Object.values(out))
    assert.ok(Object.values(day).filter((pid) => pid[0] === 'r').length <= 1, JSON.stringify(day));
  assert.ok(Object.values(out).some((day) => Object.values(day).some((pid) => pid[0] === 'r'))); // rezydenci nadal dostają dyżury
});

test('warunek: gdy a dyżuruje z b, a jest tylko na s2', () => {
  const rules = [{ who: 'a', with: 'b', places: ['s2'] }];
  const locked = { [dateKey(2026, 9, 5)]: { s1: 'b' } };
  const out = generateMonth(2026, 9, shifts, people.slice(0, 3), locked, {}, {}, rules);
  let together = 0;
  for (const day of Object.values(out))
    if (Object.values(day).includes('a') && Object.values(day).includes('b')) { together++; assert.equal(day.s2, 'a', JSON.stringify(day)); }
  assert.ok(together > 0); // warunek nie zabrania wspólnych dyżurów, tylko wymusza miejsce
});

test('historia: punkty z poprzednich miesięcy × ½, ¼, ⅛ (także przez przełom roku), Tragiczny miesiąc temu', () => {
  const schedule = {
    '2026-12-01': { s1: 'a' }, // miesiąc temu, oceniony na 3
    '2026-11-02': { s1: 'b' }, // 2 miesiące temu, oceniony na 2
    '2026-10-05': { s1: 'c' }, // 3 miesiące temu, oceniony na 2
    '2026-09-07': { s1: 'd' }, // 4 miesiące temu → już się nie liczy
  };
  const bad = { '2026-12-01': 3, '2026-11-02': 2, '2026-10-05': 2, '2026-09-07': 3 };
  const h = history(schedule, bad, 2027, 0);
  assert.deepEqual(h.pts, { a: 1.5, b: 0.5, c: 0.25 });
  assert.deepEqual([...h.tragic], ['a']);
});

test('Tragiczny: kto miał Tragiczny miesiąc temu, idzie na koniec kolejki (ale nie jest zablokowany)', () => {
  const one = [{ id: 's', name: 'S', days: all }];
  const k = dateKey(2026, 9, 1);
  const ppl = people.map((p) => (p.id === 'a' ? { ...p, tragic: true } : { ...p, past: 1 })); // a ma najmniejsze obciążenie
  assert.equal(generateMonth(2026, 9, one, ppl, {}, {}, {}, [], { [k]: 2 })[k].s, 'a');
  assert.notEqual(generateMonth(2026, 9, one, ppl, {}, {}, {}, [], { [k]: 3 })[k].s, 'a');
  const onlyA = { b: { [k]: 0 }, c: { [k]: 0 }, d: { [k]: 0 } };
  assert.equal(generateMonth(2026, 9, one, ppl, {}, onlyA, {}, [], { [k]: 3 })[k].s, 'a');
});

test('gównianość domyślna: Pt = Gówniany, So/Nd = Słaby, reszta Zwykły; ręczna ocena wygrywa', () => {
  assert.deepEqual([5, 6, 7, 8, 9, 10, 11].map((d) => badOf({}, 2026, 9, d)), [0, 0, 0, 0, 2, 1, 1]); // 5.10.2026 = pon
  assert.equal(badOf({ '2026-10-09': 0 }, 2026, 9, 9), 0);
});

test('kanapki: unika dyżuru z jednym dniem przerwy, chyba że osoba chce ten dzień', () => {
  const one = [{ id: 's', name: 'S', days: all }];
  const trio = people.slice(0, 3);
  const out = generateMonth(2026, 9, one, trio);
  const days = Object.values(out).map((day) => day.s);
  days.forEach((pid, i) => { if (i >= 2) assert.notEqual(pid, days[i - 2], `kanapka dnia ${i + 1}`); });
  const k = dateKey(2026, 9, 3);
  assert.equal(generateMonth(2026, 9, one, trio, {}, { a: { [k]: 3 } })[k].s, 'a'); // a miał 1.10, ale chce 3.10
  const locked = { [dateKey(2026, 9, 5)]: { s: 'b' } };
  assert.notEqual(generateMonth(2026, 9, one, people, locked)[k].s, 'b'); // b wpisany ręcznie 5.10 → nie 3.10
});
