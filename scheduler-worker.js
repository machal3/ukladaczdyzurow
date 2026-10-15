import { generateVariants } from './scheduler.js';

// Osobny wątek: nawet trudne wyszukiwanie nie blokuje kalendarza.
self.onmessage = ({ data }) => {
  try {
    const variants = generateVariants(...data.slice(0, 10), {
      order: data[10]?.order,
      asDay: data[10]?.asDay,
      timeBudgetMs: 20000, // trudny miesiąc: wyżarzanie i wskazywanie sprzeczności potrzebują czasu
      onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
    });
    self.postMessage({ type: 'result', variants });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
