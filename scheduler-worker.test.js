import test from 'node:test';
import assert from 'node:assert/strict';
import { runScheduler } from './scheduler-client.js';
import { BrowserWorker } from './scripts/test-worker.mjs';

const args = [2026, 9, [{ id: 's', days: [0, 1, 2, 3, 4, 5, 6] }],
  ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id })), {}, {}, {}, [], {}, {}, {}];

test('prawdziwy worker liczy grafik, a główny wątek nadal obsługuje zdarzenia', async () => {
  let ticks = 0;
  const messages = [];
  const timer = setInterval(() => ticks++, 1);
  try {
    const [best] = await runScheduler(args, { WorkerClass: BrowserWorker, onProgress: (p) => messages.push(p.message) });
    assert.equal(best.score.unfilled, 0);
    assert.ok(ticks > 1, 'obliczenia nie mogą blokować pętli zdarzeń');
    assert.ok(messages.length >= 3);
  } finally { clearInterval(timer); }
});

test('worker przekazuje błąd twardych ograniczeń', async () => {
  const input = structuredClone(args);
  input[6] = { a: { '*': 0, min: { '*': 1 } } };
  await assert.rejects(runScheduler(input, { WorkerClass: BrowserWorker }), /minimum.*limit górny/);
});

class WaitingWorker {
  static instance;
  constructor() { WaitingWorker.instance = this; this.terminated = 0; }
  postMessage() {}
  terminate() { this.terminated++; }
}

test('anulowanie kończy worker i ignoruje spóźniony wynik', async () => {
  const controller = new AbortController();
  let progress = 0;
  const promise = runScheduler(args, { WorkerClass: WaitingWorker, signal: controller.signal, onProgress: () => progress++ });
  const worker = WaitingWorker.instance;
  controller.abort();
  worker.onmessage({ data: { type: 'progress', progress: {} } });
  worker.onmessage({ data: { type: 'result', variants: [] } });
  await assert.rejects(promise, { name: 'AbortError' });
  assert.equal(worker.terminated, 1);
  assert.equal(progress, 0);
});

test('watchdog kończy zawieszony worker, a błąd ładowania zwalnia zasoby', async () => {
  await assert.rejects(runScheduler(args, { WorkerClass: WaitingWorker, timeoutMs: 10 }), /Przekroczono czas/);
  assert.equal(WaitingWorker.instance.terminated, 1);
  const promise = runScheduler(args, { WorkerClass: WaitingWorker });
  WaitingWorker.instance.onerror({});
  await assert.rejects(promise, /Nie udało się uruchomić/);
  assert.equal(WaitingWorker.instance.terminated, 1);
});

test('brak obsługi workera nie uruchamia blokującego solvera na stronie', async () => {
  await assert.rejects(runScheduler(args, { WorkerClass: null }), /nie obsługuje/);
});
