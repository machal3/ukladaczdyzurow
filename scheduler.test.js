import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMonth, generateVariants, scoreMonth, dateKey, history, badOf, parseTable, matchPerson, personLog, listPeople } from './scheduler.js';

const people = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
const all = [0, 1, 2, 3, 4, 5, 6];
const shifts = [{ id: 's1', name: 'S1', days: all }, { id: 's2', name: 'S2', days: all }];

test('naprawa grupowa rozwiązuje cykl trzech osób, gdy żadna pojedyncza zamiana nie jest legalna', () => {
  const sh = ['s1', 's2', 's3'].map((id) => ({ id, days: [3] }));
  const ppl = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id }));
  const locked = Object.fromEntries([8, 15, 22, 29].map((d) => [dateKey(2026, 9, d), { s1: 'd', s2: 'e', s3: 'f' }]));
  const avail = { a: { '2026-10-01': 3 }, ...Object.fromEntries(['d', 'e', 'f'].map((p) => [p, { '2026-10-01': 0 }])) };
  const limits = { a: { '*': 1, s3: 0, min: { '*': 1 } }, b: { '*': 1, s1: 0, min: { '*': 1 } }, c: { '*': 1, s2: 0, min: { '*': 1 } } };
  const wants = { a: { s2: 1 }, b: { s3: 1 }, c: { s1: 1 } };
  const [best] = generateVariants(2026, 9, sh, ppl, locked, avail, limits, [], {}, wants, { tries: 0, order: ['avail'], rand: () => 0 });
  assert.equal(best.score.wants, 0);
  assert.equal(best.score.min, 0);
  assert.deepEqual(best.schedule['2026-10-01'], { s1: 'c', s2: 'a', s3: 'b' });
  for (const [key, day] of Object.entries(locked)) assert.deepEqual(best.schedule[key], day);
});

test('wspólny budżet kończy próby i oddaje najlepszy znaleziony zgodny grafik', () => {
  let clock = 0;
  const [best] = generateVariants(2026, 9, shifts, people, {}, {}, {}, [], {}, {}, {
    tries: 100000, timeBudgetMs: 20, now: () => clock += 20,
  });
  assert.equal(best.score.unfilled, 0);
  assert.equal(best.score.min, 0);
  assert.ok(clock < 200, 'kolejne fazy nie powinny uruchamiać własnego pełnego budżetu');
});

test('twarde minima: cofa wybór, zostawia jedyny termin osobie z ograniczoną dostępnością, niezależnie od kolejności', () => {
  const sh = [{ id: 's', days: all }];
  const avail = Object.fromEntries(['a', 'b'].map((pid) => [pid, Object.fromEntries(Array.from({ length: 31 }, (_, i) =>
    [dateKey(2026, 9, i + 1), (pid === 'a' ? [1, 3] : [1]).includes(i + 1) ? 2 : 0]))]));
  const limits = { a: { '*': 1, min: { '*': 1 } }, b: { '*': 1, min: { '*': 1 } } };
  for (const ppl of [people.slice(0, 2), people.slice(0, 2).reverse()]) {
    const out = generateMonth(2026, 9, sh, ppl, {}, avail, limits);
    assert.equal(out['2026-10-01'].s, 'b');
    assert.equal(out['2026-10-03'].s, 'a');
    const [best] = generateVariants(2026, 9, sh, ppl, {}, avail, limits, [], {}, {}, { tries: 0 });
    assert.equal(best.score.min, 0);
  }
});

test('sprzeczne i niewykonalne minima oraz ręczne przekroczenia limitu są odrzucane', () => {
  const sh = [{ id: 's', days: all }];
  for (const generate of [generateMonth, generateVariants]) {
    assert.throws(() => generate(2026, 9, sh, people, {}, {}, { a: { '*': 2, min: { s: 3 } } }), /minimum.*limit górny/);
    assert.throws(() => generate(2026, 9, sh, people, {}, {}, { a: { min: { '*': 17 } } }), /Nie znaleziono/);
    assert.throws(() => generate(2026, 9, sh, people, { '2026-10-01': { s: 'a' } }, {}, { a: { '*': 0 } }), /Ręczne wpisy/);
    assert.throws(() => generate(2026, 9, sh, people, {}, {}, { a: { '*': 1.5 } }), /całkowitą/);
  }
});

test('minimum obejmuje także dostępność „W ostateczności”', () => {
  const avail = { a: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [dateKey(2026, 9, i + 1), 1])) };
  const [best] = generateVariants(2026, 9, [{ id: 's', days: all }], people, {}, avail, { a: { '*': 2, min: { '*': 2 } } }, [], {}, {}, { tries: 0 });
  assert.equal(best.score.min, 0);
  assert.equal(Object.values(best.schedule).filter((d) => d.s === 'a').length, 2);
});

test('prośby liczą nadmiar i niedobór, również jawną prośbę o zero', () => {
  const sh = [{ id: 's', days: all }];
  const out = { '2026-10-01': { s: 'a' }, '2026-10-03': { s: 'a' } };
  assert.equal(scoreMonth(2026, 9, out, sh, people, {}, {}, { a: { '*': 1 } }).wants, 1);
  assert.equal(scoreMonth(2026, 9, out, sh, people, {}, {}, { a: { '*': 0 } }).wants, 2);
  const avail = { a: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [dateKey(2026, 9, i + 1), 3])) };
  const [best] = generateVariants(2026, 9, sh, people, {}, avail, {}, [], {}, { a: { '*': 0 } }, { tries: 0 });
  assert.equal(best.score.unfilled, 0);
  assert.equal(best.score.wants, 0); // prośba nie ginie pod wcześniejszą dostępnością
});

test('naprawa zamienia osoby między miejscami, zachowując dokładne limity i wpisy ręczne', () => {
  const locked = { '2026-10-01': { s1: 'a' } };
  const limits = Object.fromEntries(people.map((p, i) => [p.id, { '*': i % 2 ? 15 : 16, min: { '*': i % 2 ? 15 : 16 } }]));
  const wants = { a: { s1: 8, s2: 8 }, c: { s1: 8, s2: 8 } };
  const [best] = generateVariants(2026, 9, shifts, people, locked, {}, limits, [], {}, wants, { tries: 0 });
  assert.equal(best.score.min, 0);
  assert.equal(best.score.wants, 0);
  assert.equal(best.schedule['2026-10-01'].s1, 'a');
  for (const p of people) assert.equal(Object.values(best.schedule).flatMap(Object.values).filter((id) => id === p.id).length, limits[p.id]['*']);
});

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

test('limit dolny: osoba poniżej minimum (łącznie / na miejscu) dostaje dyżury przed innymi; braki liczą się w ocenie', () => {
  const n = (out, pid, sid) => Object.values(out).flatMap((day) => Object.entries(day)).filter(([k, x]) => x === pid && (!sid || k === sid)).length;
  const out = generateMonth(2026, 9, shifts, people, {}, {}, { d: { min: { '*': 16 } } }); // bez minimum d ma 15; 16 = co drugi dzień
  assert.equal(n(out, 'd'), 16);
  assert.ok(n(generateMonth(2026, 9, shifts, people, {}, {}, { a: { min: { s2: 10 } } }), 'a', 's2') >= 10); // bez minimum a: 0 na S2
  const score = (min) => scoreMonth(2026, 9, out, shifts, people, {}, {}, {}, min).min;
  assert.equal(score({ d: { min: { '*': 16 } } }), 0);
  assert.equal(score({ b: { min: { '*': 20, s1: 31 } } }), 20 - n(out, 'b') + 31 - n(out, 'b', 's1'));
});

// Min., Limit i Prośba dla każdego wiersza okna osoby. 6 osób, żeby grafik nie był wymuszony;
// bez ustawień c ma: 10 łącznie, 4 w Pt/So/Nd, 10 na S1, 0 na S2, Pt 2, So 1, Nd 1.
test('min / limit / prośba działają w każdym wierszu: łącznie, Pt/So/Nd, miejsce, ten sam dzień weekendu', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id }));
  const of = (out) => {
    const c = { '*': 0, we: 0, s1: 0, s2: 0, d4: 0, d5: 0, d6: 0 };
    for (const [k, day] of Object.entries(out)) for (const [sid, p] of Object.entries(day)) if (p === 'c') {
      const wd = (new Date(k).getDay() + 6) % 7;
      c['*']++; c[sid]++; if (wd >= 4) { c.we++; c[`d${wd}`]++; }
    }
    return c;
  };
  const run = (limits, wants = {}, order) => of(generateMonth(2026, 9, shifts, six, {}, {}, limits, [], {}, wants, order && { order }));
  for (const [k, n] of Object.entries({ '*': 13, we: 7, s2: 9, d4: 4, d5: 4, d6: 3 }))
    assert.ok(run({ c: { min: { [k]: n } } })[k] >= n, `min ${k} ${n}`);
  for (const [k, n] of Object.entries({ '*': 6, we: 1, s1: 0, d4: 0, d5: 0, d6: 0 }))
    assert.ok(run({ c: { [k]: n } })[k] <= n, `limit ${k} ${n}`);
  const wantsFirst = ['wants', 'avail', 'sandwich', 'weDow', 'bad', 'even']; // prośby są miękkie: domyślnie przegrywają z „bez kanapek”
  const many = run({ c: { we: 9, d4: 1, d6: 2 } }, { c: { we: 9 } }, wantsFirst); // prośba o dużo weekendów nie przebija wpisanego limitu
  assert.ok(many.d4 <= 1 && many.d6 <= 2, JSON.stringify(many));
  for (const [k, n] of Object.entries({ '*': 13, we: 7, s2: 9 }))
    assert.ok(run({}, { c: { [k]: n } }, wantsFirst)[k] >= n, `prośba ${k} ${n}`);
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

test('suma punktów prestiżu dnia ≥ 3 (licząc ręczne wpisy), rezydenci dalej dostają dyżury', () => {
  const pr = { r1: 0, r2: 0, r3: 0, b1: 1, b2: 1, b3: 1, c1: 2, c2: 2 };
  const ppl = Object.entries(pr).map(([id, prestige]) => ({ id, name: id, prestige }));
  const sh = ['s1', 's2', 's3'].map((id) => ({ id, days: all }));
  const locked = { [dateKey(2026, 9, 5)]: { s1: 'r1' } };
  const [{ schedule: out }] = generateVariants(2026, 9, sh, ppl, locked);
  for (const day of Object.values(out))
    if (Object.keys(day).length === 3) assert.ok(Object.values(day).reduce((t, pid) => t + pr[pid], 0) >= 3, JSON.stringify(day));
  assert.ok(Object.values(out).some((day) => Object.values(day).some((pid) => pid[0] === 'r')));
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

test('historia: punkty z poprzednich miesięcy × ½, ¼, ⅛ (także przez przełom roku), ostatni Tragiczny z całej historii', () => {
  const schedule = {
    '2026-12-01': { s1: 'a' }, // miesiąc temu, oceniony na 3
    '2026-11-02': { s1: 'b' }, // 2 miesiące temu, oceniony na 2
    '2026-10-05': { s1: 'c' }, // 3 miesiące temu, oceniony na 2
    '2026-09-07': { s1: 'd' }, // 4 miesiące temu → punkty już się nie liczą, Tragiczny tak
    '2024-03-04': { s1: 'd' }, // dawny Tragiczny d — nowszy wygrywa
    '2027-01-04': { s1: 'b' }, // ten miesiąc — nie historia
  };
  const bad = { '2026-12-01': 3, '2026-11-02': 2, '2026-10-05': 2, '2026-09-07': 3, '2024-03-04': 3, '2027-01-04': 3 };
  const h = history(schedule, bad, 2027, 0);
  assert.deepEqual(h.pts, { a: 1.5, b: 0.5, c: 0.25 });
  assert.deepEqual(h.tragic, { a: '2026-12-01', d: '2026-09-07' });
});

test('Tragiczny: kto miał ostatni Tragiczny najdawniej (albo wcale), idzie pierwszy; kto niedawno — na koniec, ale nie jest zablokowany', () => {
  const one = [{ id: 's', name: 'S', days: all }];
  const k = dateKey(2026, 9, 1);
  const ppl = people.map((p) => (p.id === 'a' ? { ...p, tragic: '2026-09-01' } : { ...p, past: 1 })); // a ma najmniejsze obciążenie
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

test('kanapka PN1 w sobotę + poniedziałek jest preferowana, chyba że osoba ją wyłączyła', () => {
  const two = [{ id: 'p', name: 'PN1', days: all }, { id: 's', name: 'S', days: all }];
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id }));
  const sat = dateKey(2026, 9, 3), mon = dateKey(2026, 9, 5); // październik 2026: 3 = sobota, 5 = poniedziałek
  const on = generateMonth(2026, 9, two, six, { [sat]: { p: 'a' } });
  assert.ok(Object.values(on[mon]).includes('a'));
  assert.equal(scoreMonth(2026, 9, { [sat]: { p: 'a' }, [mon]: { s: 'a' } }, two, six).sandwich, 0);
  const off = six.map((p) => (p.id === 'a' ? { ...p, pn1Sandwich: false } : p));
  assert.ok(!Object.values(generateMonth(2026, 9, two, off, { [sat]: { p: 'a' } })[mon]).includes('a'));
  assert.equal(scoreMonth(2026, 9, { [sat]: { p: 'a' }, [mon]: { s: 'a' } }, two, off).sandwich, 1);
});

test('import tabeli: nagłówek z miejscami, dni, puste komórki i zły dzień tygodnia', () => {
  const rows = [
    ['', '', 'OITN', 'PN2', 'Inne'],
    ['1.', 'czwartek', 'M. Krzysztofik', ' D.  Bulsiewicz ', 'X'],
    ['2.', 'piątek', '', '—', ''],
    ['', '', '', '', ''],
    ['40', 'sobota', 'A', 'B', ''],
  ];
  const sh = [{ id: 'o', name: 'OITN' }, { id: 'p2', name: 'pn2' }];
  const oct = parseTable(rows, 2026, 9, sh); // 1.10.2026 = czwartek
  assert.deepEqual(oct.days, { 1: { o: 'M. Krzysztofik', p2: 'D. Bulsiewicz' }, 2: {} });
  assert.equal(oct.warn.length, 1); // pominięty wiersz 40
  assert.equal(parseTable(rows, 2026, 8, sh).warn.length, 2); // wrzesień: dni tygodnia się nie zgadzają
  assert.equal(parseTable([['a']], 2026, 9, sh).warn.length, 1);
});

test('dopasowanie osób z tabeli: inicjał + nazwisko, samo nazwisko, niejednoznaczne → null', () => {
  const ppl = [['a', 'Anna Niezgoda'], ['m', 'Marta Kłodzińska'], ['k1', 'Kasia Sowa'], ['k2', 'Karol Sowa']].map(([id, name]) => ({ id, name }));
  assert.equal(matchPerson('A. Niezgoda', ppl), 'a');
  assert.equal(matchPerson('Niezgoda', ppl), 'a');
  assert.equal(matchPerson('M. KŁODZIŃSKA', ppl), 'm');
  assert.equal(matchPerson('K. Sowa', ppl), null);
  assert.equal(matchPerson('Ka. Sowa', ppl), null);
  assert.equal(matchPerson('Kas. Sowa', ppl), 'k1');
  assert.equal(matchPerson('B. Niezgoda', ppl), null);
  assert.equal(matchPerson('A. Niezgoda', [{ id: 'n', name: 'Niezgoda' }]), null); // samo nazwisko nie łapie osoby z inicjałem
});

test('prośby: osoba dostaje tyle dyżurów na miejscu, ile prosiła, a potem wraca do równego podziału', () => {
  const one = [{ id: 's', name: 'S', days: all }];
  const n = (wants) => Object.values(generateMonth(2026, 9, one, people, {}, {}, {}, [], {}, wants)).filter((day) => day.s === 'a').length;
  assert.ok(n({}) < 10);
  assert.equal(n({ a: { s: 10 } }), 10);
});

test('historia osoby: okno miesięcy, gównianość dnia, przerwa liczona też sprzed okna i przez przełom roku', () => {
  const schedule = {
    '2025-08-30': { s1: 'a' }, // przed oknem — liczy się tylko do przerwy
    '2025-09-02': { s1: 'b', s2: 'a' },
    '2025-12-31': { s1: 'a' },
    '2026-01-05': { s2: 'a' }, // pn
    '2026-01-09': { s1: 'a' }, // pt → domyślnie Gówniany
    '2026-02-01': { s1: 'a' }, // po oknie
  };
  const log = personLog(schedule, { '2026-01-05': 3 }, 'a', 2026, 0); // styczeń + 3 poprzednie = paź–sty
  assert.deepEqual(log.map((x) => [x.key, x.sid, x.bad, x.gap]), [
    ['2025-12-31', 's1', 0, 120], // śr,
    ['2026-01-05', 's2', 3, 5],
    ['2026-01-09', 's1', 2, 4],
  ]);
  assert.equal(personLog(schedule, {}, 'a', 2025, 8, 1)[0].gap, 3);
  assert.equal(personLog(schedule, {}, 'a', 2025, 7, 1)[0].gap, null);
});

test('warianty: losowe próby omijają ślepy zaułek zachłannego układania', () => {
  const one = [{ id: 's', name: 'S', days: [3, 4] }]; // czw + pt
  const ab = [{ id: 'a', name: 'a', prestige: 1 }, { id: 'b', name: 'b', prestige: 1 }];
  const avail = { b: { [dateKey(2026, 9, 2)]: 0 } }; // 1.10 czw: obaj mogą, 2.10 pt: tylko a
  const greedy = scoreMonth(2026, 9, generateMonth(2026, 9, one, ab, {}, avail), one, ab, avail);
  const [best] = generateVariants(2026, 9, one, ab, {}, avail);
  assert.ok(greedy.unfilled > 0);
  assert.equal(best.score.unfilled, 0);
  assert.equal(best.schedule[dateKey(2026, 9, 2)].s, 'a');
});

test('priorytety: prośba przed dostępnością wygrywa z „Chcę”', () => {
  const one = [{ id: 's', name: 'S', days: all }];
  const k = dateKey(2026, 9, 1);
  const avail = { a: { [k]: 3 } }, wants = { b: { s: 20 } };
  assert.equal(generateMonth(2026, 9, one, people, {}, avail, {}, [], {}, wants)[k].s, 'a');
  assert.equal(generateMonth(2026, 9, one, people, {}, avail, {}, [], {}, wants, { order: ['wants', 'avail', 'sandwich', 'bad', 'even'] })[k].s, 'b');
});

test('warianty: tylko równie dobre (remis we wszystkich kryteriach), różne, nie gorsze od zwykłego układania', () => {
  const v = generateVariants(2026, 9, shifts, people);
  const greedy = scoreMonth(2026, 9, generateMonth(2026, 9, shifts, people), shifts, people);
  assert.ok(v.length > 1 && new Set(v.map((x) => JSON.stringify(x.schedule))).size === v.length);
  assert.ok(v[0].score.unfilled <= greedy.unfilled);
  for (const x of v) assert.deepEqual(x.score, { ...v[0].score, spread: x.score.spread, lastResort: x.score.lastResort });
});

test('OITN w weekend: po sobocie wolny poniedziałek, po niedzieli wolny wtorek, także po ręcznym wpisie', () => {
  const sh = [{ id: 'o', name: 'OITN', days: all }, { id: 's1', name: 'S1', days: all }];
  const out = generateMonth(2026, 9, sh, people, { '2026-10-03': { o: 'a' }, '2026-10-04': { o: 'b' } }); // So 3.10, Nd 4.10
  assert.ok(!Object.values(out['2026-10-05']).includes('a')); // pn
  assert.ok(!Object.values(out['2026-10-06']).includes('b')); // wt
  for (let d = 3; d <= 31; d++) {
    const k = dateKey(2026, 9, d), w = (new Date(2026, 9, d).getDay() + 6) % 7, off = out[dateKey(2026, 9, d + 2)];
    if (w >= 5 && off) assert.ok(!Object.values(off).includes(out[k].o), `${k} OITN ${out[k].o}`);
  }
  // Ręczny poniedziałek też blokuje wcześniejszy OITN w sobotę.
  const lock = generateMonth(2026, 9, sh, people, { '2026-10-12': { s1: 'c' } }, { c: { '2026-10-10': 3 } });
  assert.notEqual(lock['2026-10-10'].o, 'c');
});

test('różne dni weekendu: drugi dyżur w Pt/So/Nd trafia w inny dzień tygodnia, jeśli się da', () => {
  const sh = [{ id: 'w', name: 'W', days: [4, 5, 6] }]; // tylko Pt/So/Nd, październik 2026: 5 piątków, 5 sobót, 4 niedziele
  const out = generateMonth(2026, 9, sh, ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id, name: id })));
  const sc = scoreMonth(2026, 9, out, sh, ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id, name: id })));
  assert.equal(sc.weDow, 0); // 14 dyżurów, 7 osób × 2 różne dni
  assert.equal(scoreMonth(2026, 9, { '2026-10-02': { w: 'a' }, '2026-10-09': { w: 'a' } }, sh, people).weDow, 1); // dwa piątki
});

test('różne dni weekendu: własny limit osoby — 1 piątek, soboty/niedziele po 2', () => {
  const sh = [{ id: 'w', name: 'W', days: [4, 5, 6] }], ab = [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }];
  const two = { '2026-10-03': { w: 'a' }, '2026-10-10': { w: 'a' } }; // dwie soboty
  assert.equal(scoreMonth(2026, 9, two, sh, ab).weDow, 1);
  assert.equal(scoreMonth(2026, 9, two, sh, ab, {}, {}, {}, { a: { d5: 2 } }).weDow, 0);
  // Pt 9.10: oboje mają już piątek (a 2.10, b 16.10); a ma więcej dyżurów, ale limit 2 piątków → a
  const locked = { '2026-10-02': { w: 'a' }, '2026-10-16': { w: 'b' } };
  const pick = (limits) => generateMonth(2026, 9, sh, ab, locked, {}, limits, [], {}, {}, { order: ['weDow', 'even'] })['2026-10-09'].w;
  assert.equal(pick({}), 'b');
  assert.equal(pick({ a: { d4: 2 } }), 'a');
});

test('prośby o dzień weekendu: osoba prosi o 2 soboty i je dostaje, liczy się też w ocenie', () => {
  const sh = [{ id: 'w', name: 'W', days: [4, 5, 6] }];
  const wants = { a: { d5: 2 } };
  const out = generateMonth(2026, 9, sh, people, {}, {}, {}, [], {}, wants);
  const sat = Object.entries(out).filter(([k, day]) => new Date(k).getDay() === 6 && day.w === 'a').length;
  assert.equal(sat, 2);
  assert.equal(scoreMonth(2026, 9, out, sh, people, {}, {}, wants).wants, 0);
  assert.equal(scoreMonth(2026, 9, {}, sh, people, {}, {}, wants).wants, 2);
});

test('prośby łącznie i w Pt/So/Nd: osoba dostaje tyle, ile prosiła, liczy się też w ocenie', () => {
  const one = [{ id: 's', name: 'S', days: all }];
  const of = (out, pid, weOnly) => Object.entries(out).filter(([k, day]) => day.s === pid && (!weOnly || [0, 5, 6].includes(new Date(k).getDay()))).length;
  for (const wants of [{ a: { '*': 10 } }, { a: { we: 4 } }]) {
    const out = generateMonth(2026, 9, one, people, {}, {}, {}, [], {}, wants);
    assert.equal(of(out, 'a', 'we' in wants.a), wants.a['*'] ?? wants.a.we);
    assert.equal(scoreMonth(2026, 9, out, one, people, {}, {}, wants).wants, 0);
  }
  assert.equal(scoreMonth(2026, 9, {}, one, people, {}, {}, { a: { '*': 3, we: 2 } }).wants, 5);
});

test('listPeople: szukanie bez polskich znaków, filtry i sortowanie', () => {
  const ppl = [
    { id: 'a', name: 'Łukasz Żak', prestige: 0 },
    { id: 'b', name: 'Anna Kowalska', prestige: 2 },
    { id: 'c', name: 'Jan Nowak', prestige: 1 },
  ];
  const count = { a: 3, b: 0, c: 5 };
  const ids = (opts) => listPeople(ppl, count, opts).map((p) => p.id);
  assert.deepEqual(ids(), ['b', 'c', 'a']); // nazwisko A–Z
  assert.deepEqual(ids({ q: 'lukasz ZAK' }), ['a']);
  assert.deepEqual(ids({ q: 'an' }), ['b', 'c']);
  assert.deepEqual(ids({ role: 'rez' }), ['a']);
  assert.deepEqual(ids({ role: 'sa', sort: 'most' }), ['c', 'b']);
  assert.deepEqual(ids({ none: true }), ['b']);
  assert.deepEqual(ids({ sort: 'name' }), ['b', 'c', 'a']);
  assert.deepEqual(ids({ sort: 'least' }), ['b', 'a', 'c']);
  assert.deepEqual(ids({ sort: 'role' }), ['b', 'c', 'a']);
});

test('Tragiczny: rotacja po dacie ostatniego Tragicznego, także w obrębie miesiąca', () => {
  const one = [{ id: 's', name: 'S', days: all }];
  const tr = { a: '2026-01-05', b: '2024-06-01', c: '2025-03-02', d: '2026-08-07' };
  const ppl = people.map((p) => ({ ...p, tragic: tr[p.id] }));
  const days = [1, 5, 9, 13, 17].map((d) => dateKey(2026, 9, d));
  const off = Object.fromEntries([...Array(31)].map((_, i) => dateKey(2026, 9, i + 1)).filter((k) => !days.includes(k)).map((k) => [k, 0]));
  const avail = Object.fromEntries(people.map((p) => [p.id, off])); // tylko Tragiczne dni do obsadzenia
  const out = generateMonth(2026, 9, one, ppl, {}, avail, {}, [], Object.fromEntries(days.map((k) => [k, 3])));
  assert.deepEqual(days.map((k) => out[k].s), ['b', 'c', 'a', 'd', 'b']);
});

test('dzień liczony jak inny dzień tygodnia: limity Nd obowiązują w środę ustawioną jak Nd', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id }));
  const asDay = { '2026-10-14': 6 }; // środa jak niedziela
  const limits = { a: { d6: 0 }, b: { d6: 0 } };
  for (const s of [generateMonth(2026, 9, shifts, six, {}, {}, limits, [], {}, {}, { asDay }),
    generateVariants(2026, 9, shifts, six, {}, {}, limits, [], {}, {}, { asDay, tries: 5, timeBudgetMs: 200 })[0].schedule]) {
    assert.ok(!['a', 'b'].some((p) => Object.values(s['2026-10-14']).includes(p)), JSON.stringify(s['2026-10-14']));
    assert.deepEqual(Object.keys(s['2026-10-14']).sort(), ['s1', 's2']); // miejsca jak w zwykłą środę
  }
  // dwa dyżury „w niedzielę” (prawdziwa Nd 11 + środa 14) to dwa razy ten sam dzień weekendu
  const two = { '2026-10-11': { s1: 'a' }, '2026-10-14': { s1: 'a' } };
  assert.equal(scoreMonth(2026, 9, two, shifts, people).weDow, 0);
  assert.equal(scoreMonth(2026, 9, two, shifts, people, {}, {}, {}, {}, asDay).weDow, 1);
});

test('sprzeczność jednej osoby: wyjaśnienie wskazuje kolidujące ustawienia i dostępne dni', () => {
  const sh = [{ id: 's', name: 'S', days: all }];
  const free = [5, 7, 10, 12]; // Pn, Śr, So, Pn
  const avail = { a: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [dateKey(2026, 9, i + 1), free.includes(i + 1) ? 2 : 0])) };
  const limits = { a: { we: 0, min: { '*': 4 } } };
  for (const generate of [generateMonth, generateVariants])
    assert.throws(() => generate(2026, 9, sh, people, {}, avail, limits, [], {}, {}, { asDay: { '2026-10-07': 6 } }),
      /a: Limit Pt\/So\/Nd = 0, Min\. łącznie = 4 .*dniach: 5, 7 jak Nd, 10 So, 12/);
});

test('sprzeczność sum: minima na miejscu przekraczają liczbę dyżurów', () => {
  const sh = [{ id: 'o', name: 'OITN', days: [0] }]; // październik 2026: 4 poniedziałki
  assert.throws(() => generateVariants(2026, 9, sh, people, {}, {}, { a: { min: { o: 2 } }, b: { min: { o: 2 } }, c: { min: { o: 1 } } }),
    /Minima „OITN” wszystkich osób razem: 5, a wolnych dyżurów w tej kategorii jest tylko 4/);
});

test('konflikt między osobami: wskazuje, czyje minima blokują grafik', () => {
  const sh = [{ id: 's', name: 'S', days: [0] }];
  const only = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [dateKey(2026, 9, i + 1), [5, 12].includes(i + 1) ? 2 : 0]));
  assert.throws(() => generateVariants(2026, 9, sh, people.slice(0, 2), {}, { a: only, b: only }, { a: { min: { '*': 2 } }, b: { min: { '*': 2 } } }, [], {}, {}, { timeBudgetMs: 300 }),
    /po zdjęciu minimów jednej z osób: a, b/);
});

test('ciasne minima (suma = liczba miejsc) układa wyżarzanie, gdy zachłanny nie daje rady', () => {
  const ppl = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => ({ id, name: id, prestige: 1 + (i % 2) }));
  let r = 7;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const avail = Object.fromEntries(ppl.map((p) => [p.id, Object.fromEntries(Array.from({ length: 31 }, (_, i) => [dateKey(2026, 9, i + 1), rnd() < 0.3 ? 0 : 2]))]));
  const limits = Object.fromEntries(ppl.map((p, i) => [p.id, { '*': i < 6 ? 8 : 7, min: { '*': i < 6 ? 8 : 7 } }]));
  const [best] = generateVariants(2026, 9, shifts, ppl, {}, avail, limits, [], {}, {}, { timeBudgetMs: 4000, rand: rnd });
  assert.equal(best.score.min, 0);
  assert.equal(best.score.unfilled, 0);
});
