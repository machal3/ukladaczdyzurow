import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { JSDOM } from 'jsdom';

// Prawdziwe moduły aplikacji i DOM. Jedynym zamiennikiem usługi jest chmura:
// test nigdy nie łączy się z produkcyjną bazą i nie potrzebuje PIN-u.
async function setup(t) {
  const dom = new JSDOM(await readFile(new URL('./index.html', import.meta.url), 'utf8'), {
    url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function (value = '') {
    this.open = false; this.returnValue = value; this.dispatchEvent(new w.Event('close'));
  };
  w.alert = (message) => { throw new Error(message); };
  const context = dom.getInternalVMContext();
  const source = async (name) => new SourceTextModule(await readFile(new URL(name, import.meta.url), 'utf8'), { context });
  const scheduler = await source('./scheduler.js');
  await scheduler.link(() => { throw new Error('Nieoczekiwany import algorytmu'); });
  const cloud = new SyntheticModule(['cloudLoad', 'cloudSave', 'cloudLogout'], function () {
    this.setExport('cloudLoad', async () => null);
    this.setExport('cloudSave', () => {});
    this.setExport('cloudLogout', () => {});
  }, { context });
  await cloud.link(() => {});
  const ui = await source('./ui.js');
  await ui.link(() => {});
  await ui.evaluate();
  const app = await source('./app.js');
  await app.link((name) => name === './scheduler.js' ? scheduler : cloud);
  await app.evaluate();
  const $ = (selector) => w.document.querySelector(selector);
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  await tick();
  return { w, $, tick, state: () => JSON.parse(w.localStorage.getItem('dyzury-v1')) };
}

test('nawigacja i motyw nie zmieniają zapisanych danych grafiku', async (t) => {
  const { w, $, tick } = await setup(t);
  const saved = w.localStorage.getItem('dyzury-v1');
  for (const tab of ['people', 'settings', 'help', 'calendar']) {
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
  const limit = $('[data-limit="*"]');
  limit.value = '4';
  limit.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(state().limits[person.id]['*'], 4);
});

test('wpis ręczny z klawiatury pozostaje po generowaniu miesiąca', async (t) => {
  const { w, $, state } = await setup(t);
  const input = $('#calendar input');
  const { key, shift } = input.dataset;
  input.focus();
  input.value = 'Anna';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const person = state().manual[key][shift];
  assert.ok(person);
  $('#generate').click();
  assert.equal(state().manual[key][shift], person);
  assert.equal(state().schedule[key][shift], person);
});

test('dostępność i import tabeli działają po zmianie struktury formularzy', async (t) => {
  const { w, $, state } = await setup(t);
  $('#summary-list [data-who]').click();
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
  const { w, $, state } = await setup(t);
  const anna = state().people.find((p) => p.name === 'Anna Kowalska'), oitn = state().shifts.find((s) => s.name === 'OITN').id;
  $(`[data-edit="${anna.id}"]`).click();
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

  set('min', oitn, '6'); // bez minimum Anna ma 1 OITN w miesiącu
  set('limit', '*', '9'); // bez limitu 11 dyżurów
  $('#person').close();
  $('#generate').click();
  const mine = Object.values(state().schedule).filter((day) => Object.values(day).includes(anna.id));
  assert.ok(mine.filter((day) => day[oitn] === anna.id).length >= 6);
  assert.ok(mine.length <= 9);
  assert.equal($('#summary-list .badge.under'), null); // minimum spełnione → bez ostrzeżenia

  $(`[data-edit="${anna.id}"]`).click();
  set('min', oitn, '10'); // przy limicie 9 niewykonalne → ostrzeżenie w podsumowaniu
  $('#person').close();
  $('#generate').click();
  assert.match($('#summary-list .badge.under').title, /Do minimum brakuje: \d/);
});
