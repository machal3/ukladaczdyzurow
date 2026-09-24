import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMonth, dateKey } from './scheduler.js';

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

test('obecność: Chcę > Mogę > Jeśli trzeba > Nie ma opcji', () => {
  const k = dateKey(2026, 9, 1);
  const one = [{ id: 's', name: 'S', days: all }];
  const pick = (avail) => generateMonth(2026, 9, one, people, {}, avail)[k].s;
  assert.equal(pick({ d: { [k]: 3 } }), 'd');                                   // chce, mimo że ostatni na liście
  assert.equal(pick({ a: { [k]: 1 }, b: { [k]: 0 } }), 'c');                    // domyślne „Mogę” wygrywa
  assert.equal(pick({ a: { [k]: 0 }, b: { [k]: 1 }, c: { [k]: 0 }, d: { [k]: 0 } }), 'b');
  assert.equal(pick(Object.fromEntries(people.map((p) => [p.id, { [k]: 0 }]))), 'a'); // w ostateczności i tak ktoś
});
