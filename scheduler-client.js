// Jeden worker na próbę; anulowanie naprawdę przerywa obliczenia i zwalnia pamięć.
export function runScheduler(args, { signal, onProgress = () => {}, timeoutMs = 30000, WorkerClass = globalThis.Worker } = {}) {
  return new Promise((resolve, reject) => {
    let worker, timer;
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker?.terminate();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new DOMException('Układanie anulowane.', 'AbortError'));
    if (signal?.aborted) return abort();
    try {
      if (!WorkerClass) throw new Error('Ta przeglądarka nie obsługuje układania w tle. Otwórz stronę w aktualnej przeglądarce.');
      worker = new WorkerClass(new URL('./scheduler-worker.js', import.meta.url), { type: 'module' });
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => finish(new Error('Przekroczono czas układania. Spróbuj ponownie lub sprawdź ograniczenia.')), timeoutMs);
      worker.onmessage = ({ data }) => {
        if (settled) return;
        if (data.type === 'progress') onProgress(data.progress);
        else if (data.type === 'result') finish(null, data.variants);
        else if (data.type === 'error') finish(new Error(data.message));
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        finish(new Error('Nie udało się uruchomić układania w tle. Odśwież stronę i spróbuj ponownie.'));
      };
      worker.onmessageerror = () => finish(new Error('Nie udało się odczytać wyniku układania.'));
      worker.postMessage(args);
    } catch (error) { finish(error); }
  });
}
