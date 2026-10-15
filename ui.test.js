import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { JSDOM } from 'jsdom';
import { BrowserWorker } from './scripts/test-worker.mjs';

// Prawdziwe moduły aplikacji i DOM. Jedynym zamiennikiem usługi jest chmura:
// test nigdy nie łączy się z produkcyjną bazą i nie potrzebuje PIN-u.
// saved = stan w localStorage przed startem aplikacji (jak u użytkownika z zapisanymi danymi);
// fake = podmienione eksporty atrapy cloud.js (np. tryb chmury z atrapą bazy)
async function setup(t, saved, fake = {}) {
  const dom = new JSDOM(await readFile(new URL('./index.html', import.meta.url), 'utf8'), {
    url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  if (saved) w.localStorage.setItem('dyzury-v1', JSON.stringify(saved));
  const workers = [];
  w.Worker = class extends BrowserWorker {
    constructor(...args) { super(...args); workers.push(this); }
  };
  t.after(() => workers.forEach((worker) => worker.terminate()));
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function (value = '') {
    this.open = false; this.returnValue = value; this.dispatchEvent(new w.Event('close'));
  };
  w.alert = (message) => { throw new Error(message); };
  const context = dom.getInternalVMContext();
  const source = async (name) => new SourceTextModule(await readFile(new URL(name, import.meta.url), 'utf8'), {
    context, initializeImportMeta: (meta) => { meta.url = new URL(name, import.meta.url).href; },
  });
  const scheduler = await source('./scheduler.js');
  await scheduler.link(() => { throw new Error('Nieoczekiwany import algorytmu'); });
  const exports = {
    cloudLoad: async () => null, cloudSave: () => {}, cloudLogout: () => {}, cloudReload: async () => null,
    cloudRpc: async () => { throw new Error('Nieoczekiwane wywołanie bazy'); },
    ZAPISY_URL: 'https://zapisy.example/', // ustawiony adres, a mimo to bez chmury Zapisów nie widać
    ...fake,
  };
  const cloud = new SyntheticModule(Object.keys(exports), function () {
    for (const [k, v] of Object.entries(exports)) this.setExport(k, v);
  }, { context });
  await cloud.link(() => {});
  const ui = await source('./ui.js');
  await ui.link(() => {});
  await ui.evaluate();
  const app = await source('./app.js');
  const client = await source('./scheduler-client.js');
  await client.link(() => { throw new Error('Nieoczekiwany import klienta workera'); });
  const exporter = await source('./export.js');
  await exporter.link(() => { throw new Error('Nieoczekiwany import eksportu'); });
  const modules = { './scheduler.js': scheduler, './scheduler-client.js': client, './export.js': exporter };
  await app.link((name) => modules[name] ?? cloud);
  await app.evaluate();
  const $ = (selector) => w.document.querySelector(selector);
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const generated = async () => {
    const deadline = Date.now() + 15000;
    while ($('#generate').disabled && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal($('#generate').disabled, false, 'worker powinien zakończyć obliczenia');
  };
  await tick();
  return { w, $, tick, generated, workers, state: () => JSON.parse(w.localStorage.getItem('dyzury-v1')) };
}

test('nawigacja i motyw nie zmieniają zapisanych danych grafiku', async (t) => {
  const { w, $, tick } = await setup(t);
  const saved = w.localStorage.getItem('dyzury-v1');
  for (const tab of ['people', 'stats', 'settings', 'help', 'calendar']) {
    $(`button[data-tab="${tab}"]`).click();
    await tick();
    assert.equal(w.document.body.dataset.tab, tab);
    assert.equal($(`button[data-tab="${tab}"]`).getAttribute('aria-pressed'), 'true');
  }
  $('#theme-toggle').click();
  assert.equal(w.document.documentElement.dataset.theme, 'dark');
  assert.equal($('#theme-toggle').getAttribute('aria-pressed'), 'true');
  $('button[data-tab="people"]').click();
  await tick();
  assert.equal($('#theme-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(w.localStorage.getItem('dyzury-v1'), saved);
});

test('układanie w tle: nawigacja działa, anulowanie i edycja chronią przed spóźnionym wynikiem', async (t) => {
  const { w, $, state } = await setup(t);
  const original = state().schedule;
  $('#generate').click();
  assert.equal($('#generate').disabled, true);
  assert.equal($('#cancel-generate').hidden, false);
  $('button[data-tab="people"]').click();
  assert.equal(w.document.body.dataset.tab, 'people');
  $('#cancel-generate').click();
  assert.equal($('#generate').disabled, false);
  assert.deepEqual(state().schedule, original);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(state().schedule, original);

  $('#generate').click();
  $('#next').click();
  assert.equal($('#generate').disabled, false);
  assert.deepEqual(state().schedule, original);

  $('#generate').click();
  $(`[data-limits="${state().people[0].id}"]`).click();
  const limit = $('[data-limit="*"]');
  limit.value = '4';
  limit.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal($('#generate').disabled, false);
  assert.equal(state().limits[state().people[0].id]['*'], 4);
  assert.deepEqual(state().schedule, original);
});

test('„Gotowe” publikuje miesiąc i blokuje układanie; „Cofnij gotowość” to odwraca', async (t) => {
  const { w, $, state } = await setup(t);
  w.confirm = () => true;
  const k = () => Object.keys(state().gotowe ?? {});
  $('#publish').click();
  assert.equal(k().length, 1);
  assert.equal($('#generate').disabled, true);
  assert.equal($('#publish').textContent, 'Cofnij gotowość');
  $('#generate').click();
  assert.equal($('#cancel-generate').hidden, true, 'gotowy miesiąc się nie układa');
  $('#next').click();
  assert.equal($('#generate').disabled, false, 'inny miesiąc nie jest gotowy');
  $('#prev').click();
  w.confirm = () => false;
  $('#publish').click();
  assert.equal(k().length, 1, 'bez potwierdzenia nic się nie zmienia');
  w.confirm = () => true;
  $('#publish').click();
  assert.deepEqual(k(), []);
  assert.equal($('#generate').disabled, false);
});

test('wybór koloru motywu zapisuje się i wraca po odświeżeniu', async (t) => {
  const { w, $ } = await setup(t);
  $('[data-color-theme-pick="niebieski"]').click();
  assert.equal(w.document.documentElement.dataset.colorTheme, 'niebieski');
  assert.equal($('[data-color-theme-pick="niebieski"]').getAttribute('aria-pressed'), 'true');
  assert.equal($('[data-color-theme-pick="zielony"]').getAttribute('aria-pressed'), 'false');
  assert.equal(w.localStorage.getItem('dyzury-color-theme'), 'niebieski');
  $('[data-color-theme-pick="zielony"]').click();
  assert.equal(w.document.documentElement.dataset.colorTheme, undefined);
  assert.equal(w.localStorage.getItem('dyzury-color-theme'), null);
});

test('dodawanie osoby i switch w oknie ustawień zachowują zapis i zdarzenia', async (t) => {
  const { w, $, tick, state } = await setup(t);
  const form = $('#add-person');
  const input = form.querySelector('input[name=name]');
  // jsdom nie implementuje named properties formularzy tak jak przeglądarka.
  Object.defineProperty(form, 'name', { value: input });
  input.value = 'Testowa Osoba';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const person = state().people.find((p) => p.name === 'Testowa Osoba');
  assert.ok(person);
  $(`[data-edit="${person.id}"]`).click();
  await tick();
  const control = $('[data-pn1sandwich]');
  assert.equal(control.getAttribute('role'), 'switch');
  control.click();
  assert.equal(state().people.find((p) => p.id === person.id).pn1Sandwich, false);
  assert.equal($('[data-limit="*"]'), null, 'limity są w osobnej części okna');
  $('#person').close();
  $(`[data-limits="${person.id}"]`).click();
  assert.equal($('[data-pn1sandwich]'), null);
  const pressed = (sel) => $(`#people [${sel}="${person.id}"]`).getAttribute('aria-pressed');
  assert.deepEqual(['data-who', 'data-edit', 'data-limits'].map(pressed), ['false', 'false', 'true'], 'podświetlone „Limity”, nie kalendarz');
  $('#person').close();
  $(`[data-edit="${person.id}"]`).click();
  assert.deepEqual(['data-who', 'data-edit', 'data-limits'].map(pressed), ['false', 'true', 'false'], 'podświetlone ⚙');
  $('#person').close();
  assert.deepEqual(['data-who', 'data-edit', 'data-limits'].map(pressed), ['false', 'false', 'false']);
  $(`[data-limits="${person.id}"]`).click();
  const limit = $('[data-limit="*"]');
  limit.value = '4';
  limit.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(state().limits[person.id]['*'], 4);
});

test('wpis ręczny z klawiatury pozostaje po generowaniu miesiąca', async (t) => {
  const { w, $, state, generated } = await setup(t);
  const input = $('#calendar input');
  const { key, shift } = input.dataset;
  input.focus();
  input.value = 'Anna';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const person = state().manual[key][shift];
  assert.ok(person);
  $('#generate').click();
  await generated();
  assert.equal(state().manual[key][shift], person);
  assert.equal(state().schedule[key][shift], person);
  // kropka przed imieniem = dostępność tego dnia (tu wszyscy domyślnie „Mogę”)
  const filled = [...w.document.querySelectorAll('#calendar .slot:not(.unfilled)')];
  assert.ok(filled.length && filled.every((slot) => slot.querySelector('.slot-name .avail-dot.avail-dot-2') && / — Mogę/.test(slot.title)));
});

test('dostępność i import tabeli działają po zmianie struktury formularzy', async (t) => {
  const { w, $, state } = await setup(t);
  $('#people [data-who]').click();
  const control = $('[data-avail]');
  const key = control.dataset.avail;
  const person = state().people[0].id;
  control.click();
  assert.equal(state().avail[person][key], 3);
  $('[data-done]').click();
  $('#import-open').click();
  const paste = $('[name=paste]');
  paste.value = 'Dzień\tOITN\tPN1\tPN2\n1\tAnna Kowalska\t\t';
  paste.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal($('#import-ok').disabled, false);
  $('#import').close('ok');
  const shift = state().shifts.find((s) => s.name === 'OITN').id;
  assert.equal(state().manual[key][shift], person);
});

test('Zapisy na dyżury: bez chmury bez karty konta i wierszy; stamps przetrwają zapis i są widoczne przy dostępności', async (t) => {
  const days = [0, 1, 2, 3, 4, 5, 6];
  const { $, state } = await setup(t, {
    people: [{ id: 'a', name: 'Anna Kowalska', prestige: 1 }, { id: 'b', name: 'Jan Nowak', prestige: 1 }],
    shifts: [{ id: 'o', name: 'OITN', days }, { id: 'p1', name: 'PN1', days }, { id: 'p2', name: 'PN2', days }],
    schedule: {}, manual: {}, miejscaV2: true,
    avail: { a: { '2030-01-07': 0 } }, stamps: { a: '2030-01-02T10:00:00.000Z' }, zapisyOd: '2030-01',
  });
  $('#app-settings-open').click();
  assert.equal($('#panel-zapisy').hidden, true);
  assert.equal($('#panel-account').hidden, true);
  assert.equal($('#panel-zapisy-od').hidden, true);
  $('[data-edit="a"]').click();
  assert.equal($('#konto'), null);
  assert.doesNotMatch($('#person-body').textContent, /Konto w Zapisach/);
  $('#person').close();

  $('#people [data-who="a"]').click();
  assert.match($('#status').textContent, /zmienione w Zapisach: /);
  $('[data-avail]').click(); // zmiana dostępności zapisuje cały stan — stamps odsyłane bez zmian
  assert.deepEqual(state().stamps, { a: '2030-01-02T10:00:00.000Z' });
  assert.equal(state().zapisyOd, '2030-01');
  $('[data-done]').click();
  $('#people [data-who="b"]').click();
  assert.doesNotMatch($('#status').textContent, /Zapisach/);
});

test('Zapisy na dyżury w trybie chmury: konto osoby, nowy PIN (zajęty → losuje znowu), usunięcie, pole „otwarte od”, odświeżenie', async (t) => {
  const days = [0, 1, 2, 3, 4, 5, 6];
  const data = {
    people: [{ id: 'a', name: 'Anna Kowalska', prestige: 1 }, { id: 'b', name: 'Jan Nowak', prestige: 1 }],
    shifts: [{ id: 'o', name: 'OITN', days }], schedule: {}, manual: {}, miejscaV2: true,
  };
  const calls = [], konta = [{ pid: 'a', last_login: '2030-01-03T08:00:00Z', last_change: null }];
  let busy = 1, fresh = null;
  const { w, $, tick, state } = await setup(t, null, {
    cloudLoad: async () => ({ data: structuredClone(data) }),
    cloudReload: async () => fresh,
    cloudRpc: async (fn, body) => {
      calls.push(JSON.parse(JSON.stringify([fn, body])));
      if (fn === 'admin_konta') return { konta, fails24h: 7 };
      if (fn === 'admin_set_pin' && busy-- > 0) throw new Error('Ten PIN jest już zajęty — wylosuj inny');
      return {};
    },
  });
  const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
  w.confirm = () => true;
  $('#app-settings-open').click();
  await settle();
  assert.equal($('#panel-zapisy').hidden, false);
  assert.match($('#zapisy-fails').textContent, /24 h: 7/);
  assert.equal($('#zapisy-link').getAttribute('href'), 'https://zapisy.example/');
  $('#app-settings').close();

  $('[data-edit="a"]').click();
  await settle();
  assert.match($('#konto').textContent, /ma PIN/);
  $('[data-konto="pin"]').click();
  await settle();
  const pins = calls.filter(([fn]) => fn === 'admin_set_pin').map(([, b]) => b.nowy);
  assert.equal(pins.length, 2, 'zajęty PIN → drugie losowanie');
  for (const pin of pins) {
    assert.match(pin, /^\d{6}$/);
    assert.ok(new Set(pin).size > 2 && pin.slice(0, 3) !== pin.slice(3));
  }
  assert.equal($('.new-pin b').textContent, pins[1]);
  $('[data-konto="del"]').click();
  await settle();
  assert.deepEqual(calls.at(-2), ['admin_usun_konto', { osoba: 'a' }]);
  assert.equal($('.new-pin'), null);
  $('#person').close();

  assert.match($('#status').textContent, /Zapisy osób (na ten miesiąc: otwarte do 20 |zamknięte)/);
  $('#zapisy-od').value = '2999-01'; // zamyka oglądany miesiąc wcześniej
  $('#zapisy-od').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.match($('#status').textContent, /Zapisy osób zamknięte/);
  $('#zapisy-od').value = '2030-02';
  $('#zapisy-od').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(state().zapisyOd, '2030-02');

  $(`#people [data-del-person="b"]`).click();
  assert.deepEqual(calls.at(-1), ['admin_usun_konto', { osoba: 'b' }]);

  fresh = { ...structuredClone(data), avail: { a: { '2030-02-04': 0 } }, stamps: { a: '2030-01-05T09:00:00Z' } };
  $('#reload').click();
  await settle();
  assert.equal($('#reload-status').textContent, 'Odświeżono.');
  assert.deepEqual(state().stamps, fresh.stamps);
  assert.ok(state().priority.length, 'odświeżony stan przechodzi te same migracje');
});

test('komentarze osób z Zapisów: tylko w oknie osoby i Statystykach, przetrwają zapis, znikają z usuniętą osobą', async (t) => {
  const days = [0, 1, 2, 3, 4, 5, 6], d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 15); // aplikacja startuje na następnym miesiącu
  const shown = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  const uwagi = { a: { [shown]: 'Wolę <b>OITN</b>\nproszę' }, b: { '2000-01': 'stary' } };
  const { w, $, state } = await setup(t, {
    people: [{ id: 'a', name: 'Anna Kowalska', prestige: 1 }, { id: 'b', name: 'Jan Nowak', prestige: 1 }],
    shifts: [{ id: 'o', name: 'OITN', days }], schedule: {}, manual: {}, miejscaV2: true, uwagi,
  });
  assert.equal($('#want-gaps').hidden, true, 'nie w Uwagach');
  $('#people [data-edit="a"]').click();
  assert.match($('#person-body').textContent, /Komentarze z Zapisów.*Wolę <b>OITN<\/b>/s);
  assert.equal($('#person-body .note-text b b'), null, 'tekst bez HTML');
  $('#person').close();
  $('#people [data-edit="b"]').click();
  assert.doesNotMatch($('#person-body').textContent, /Komentarze z Zapisów/, 'stary komentarz się nie liczy');
  $('#person').close();
  $('#people [data-who="a"]').click();
  assert.doesNotMatch($('#status').textContent, /Komentarz/);
  $('[data-avail]').click(); // zapis całego stanu
  assert.deepEqual(state().uwagi, uwagi);
  $('[data-done]').click();
  w.confirm = () => true;
  $('#people [data-del-person="a"]').click();
  assert.deepEqual(state().uwagi, { b: uwagi.b });
  assert.equal($('#want-gaps').hidden, true);
});

test('dekoracje odtwarzają się po wymianie DOM podczas logowania', async (t) => {
  const { w, $, tick } = await setup(t);
  const page = w.document.body.innerHTML;
  w.document.body.innerHTML = '<main class="login"><h1>PIN</h1></main>';
  await tick();
  w.document.body.innerHTML = page;
  await tick();
  $('#theme-toggle').click();
  assert.equal(w.document.documentElement.dataset.theme, 'dark');
  assert.equal($('input[name=places]').getAttribute('role'), null);
});

test('okno osoby: Min., Limit i Prośba zapisują się w każdym wierszu i działają przy układaniu', async (t) => {
  const { w, $, state, generated } = await setup(t);
  const anna = state().people.find((p) => p.name === 'Anna Kowalska'), oitn = state().shifts.find((s) => s.name === 'OITN').id;
  $(`[data-limits="${anna.id}"]`).click();
  const set = (kind, key, value) => {
    const input = $(`[data-${kind}="${key}"]`);
    input.value = value;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  for (const key of ['*', 'we', oitn, 'd4', 'd5', 'd6']) for (const kind of ['min', 'limit', 'want']) set(kind, key, '3');
  const saved = { mins: {}, limits: {}, wants: {} };
  for (const key of ['*', 'we', oitn, 'd4', 'd5', 'd6']) for (const k in saved) saved[k][key] = 3;
  assert.deepEqual(state().mins[anna.id], saved.mins);
  assert.deepEqual(state().limits[anna.id], saved.limits);
  assert.deepEqual(state().wants[anna.id], saved.wants);
  for (const key of ['*', 'we', oitn, 'd4', 'd5', 'd6']) for (const kind of ['min', 'limit', 'want']) set(kind, key, ''); // puste = usunięte
  assert.deepEqual([state().mins[anna.id], state().limits[anna.id], state().wants[anna.id]], [{}, {}, {}]);

  set('want', '*', '0');
  assert.equal(state().wants[anna.id]['*'], 0);
  let inputError;
  w.alert = (text) => { inputError = text; };
  set('want', '*', '1.5');
  assert.match(inputError, /całkowitą/);
  assert.equal(state().wants[anna.id]['*'], 0);
  assert.equal($('[data-want="*"]').value, '0');
  set('want', '*', '');
  assert.deepEqual(state().wants[anna.id], {});
  w.alert = (message) => { throw new Error(message); };

  set('min', oitn, '6'); // bez minimum Anna ma 1 OITN w miesiącu
  set('limit', '*', '9'); // bez limitu 11 dyżurów
  $('#person').close();
  $('#generate').click();
  await generated();
  const mine = Object.values(state().schedule).filter((day) => Object.values(day).includes(anna.id));
  assert.ok(mine.filter((day) => day[oitn] === anna.id).length >= 6);
  assert.ok(mine.length <= 9);

  $(`[data-limits="${anna.id}"]`).click();
  set('min', oitn, '10'); // przy limicie 9 niewykonalne → komunikat i poprzedni grafik
  $('#person').close();
  const previous = state().schedule;
  let message;
  w.alert = (text) => { message = text; };
  $('#generate').click();
  await generated();
  assert.match(message, /minimum.*przekracza limit górny/);
  assert.deepEqual(state().schedule, previous);
});

test('statystyki: ręczny wpis od razu w zestawieniu, szczegóły osoby w oknie, które zostaje otwarte, historia w osobnym oknie', async (t) => {
  const { w, $, tick, state } = await setup(t);
  const input = $('#calendar input');
  input.focus();
  input.value = 'Anna';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const anna = state().people.find((p) => p.name === 'Anna Kowalska').id;
  $('button[data-tab="stats"]').click();
  await tick();
  const row = () => $(`#stats [data-stat="${anna}"]`);
  assert.match(row().querySelector('.cell-n .big').textContent, /^1/);
  assert.match($('#stats .kpi').textContent, /1 \/ \d+/);
  row().click();
  assert.equal($('#pstat').open, true);
  assert.equal($('#pstat-title').textContent, 'Anna Kowalska');
  assert.match($('#pstat-body').textContent, /Dlaczego tak/);
  $('#pstat [data-limits]').click();
  assert.equal($('#person').open, true);
  assert.equal($('#person [data-ptab]'), null);
  assert.ok($('#person [data-limit="*"]'));
  $('#person').close();
  await tick();
  assert.equal($('#pstat').open, true, 'po przerysowaniu okno osoby zostaje otwarte');
  assert.equal($('#pstat-title').textContent, 'Anna Kowalska');
  $('#pstat [data-log]').click();
  assert.equal($('#log').open, true);
  assert.match($('#log-body').textContent, /ręczny/);
});

test('okno osoby: chip miejsca i zwinięte grupy; pigułki na karcie; pędzel z przeciąganiem; podpowiedzi w wyborze osoby', async (t) => {
  const { w, $, state } = await setup(t);
  const anna = state().people.find((p) => p.name === 'Anna Kowalska'), oitn = state().shifts.find((s) => s.name === 'OITN').id;
  const set = (kind, key, value) => {
    const input = $(`[data-${kind}="${key}"]`);
    input.value = value;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  $(`[data-limits="${anna.id}"]`).click();
  assert.deepEqual([...w.document.querySelectorAll('#person details.limits-group')].map((d) => d.open), [false, false]);
  const chip = () => $(`#person [data-place="${oitn}"]`);
  chip().click();
  assert.equal(state().limits[anna.id][oitn], 0);
  assert.equal($(`[data-limit="${oitn}"]`).value, '0');
  assert.equal(chip().getAttribute('aria-pressed'), 'false');
  chip().click();
  assert.equal(state().limits[anna.id][oitn], undefined);
  assert.equal($(`[data-limit="${oitn}"]`).value, '');
  chip().click();
  set('min', 'd5', '1');
  $('#person').close();
  $(`[data-limits="${anna.id}"]`).click(); // z wpisami grupy otwierają się same
  assert.deepEqual([...w.document.querySelectorAll('#person details.limits-group')].map((d) => d.open), [true, true]);
  $('#person').close();

  // pędzel „Nie mogę” i przeciągnięcie przez trzy dni
  $(`#people [data-who="${anna.id}"]`).click();
  $('[data-brush="avail"][data-lvl="0"]').click();
  const day = (i) => w.document.querySelectorAll('[data-avail]')[i];
  const keys = [0, 1, 2].map((i) => day(i).dataset.avail);
  day(0).dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  day(1).dispatchEvent(new w.MouseEvent('pointerover', { bubbles: true }));
  day(2).dispatchEvent(new w.MouseEvent('pointerover', { bubbles: true }));
  w.dispatchEvent(new w.MouseEvent('pointerup'));
  assert.deepEqual(keys.map((k) => state().avail[anna.id][k]), [0, 0, 0]);
  day(3).dispatchEvent(new w.MouseEvent('pointerover', { bubbles: true })); // po puszczeniu przycisku już nie maluje
  assert.equal(state().avail[anna.id][day(3).dataset.avail], undefined);
  $('[data-done]').click();

  // wybór osoby: Anna nie może 1. dnia → na końcu listy z powodem
  $('button[data-tab="calendar"]').click();
  const input = w.document.querySelector(`#calendar input[data-key="${keys[0]}"]`);
  input.focus();
  const items = [...w.document.querySelectorAll('#picker li')];
  assert.equal(items[0].textContent, '—');
  assert.match(items.at(-1).textContent, /Anna Kowalska.*Nie mogę/);
  assert.ok(items.at(-1).classList.contains('clash'));
});
