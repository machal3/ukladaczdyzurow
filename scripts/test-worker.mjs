import { Worker } from 'node:worker_threads';

// Adapter wyłącznie testowy: uruchamia prawdziwy moduł przeglądarkowego workera
// w osobnym wątku Node, bez zastępowania algorytmu atrapą.
export class BrowserWorker {
  constructor(url) {
    this.worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      globalThis.self = { postMessage: (data) => parentPort.postMessage(data) };
      import(workerData).then(() => parentPort.on('message', (data) => self.onmessage({ data })));
    `, { eval: true, workerData: String(url) });
    this.worker.on('message', (data) => this.onmessage?.({ data }));
    this.worker.on('error', (error) => this.onerror?.(error));
  }
  postMessage(data) { this.worker.postMessage(data); }
  terminate() { return this.worker.terminate(); }
}
