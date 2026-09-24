// @ts-check
// Wyłącznie prezentacja. Nie odczytuje ani nie zmienia stanu grafiku.
const root = document.documentElement;
try {
  const saved = localStorage.getItem('dyzury-theme');
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
} catch { /* Motyw systemowy, jeśli pamięć przeglądarki jest niedostępna. */ }

const systemTheme = matchMedia('(prefers-color-scheme: dark)');
function updateThemeButton() {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : systemTheme.matches;
  const button = document.querySelector('#theme-toggle');
  button?.setAttribute('aria-label', dark ? 'Włącz jasny motyw' : 'Włącz ciemny motyw');
  button?.setAttribute('aria-pressed', String(dark));
}
systemTheme.addEventListener('change', updateThemeButton);
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('#theme-toggle')) return;
  event.stopPropagation();
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : systemTheme.matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('dyzury-theme', root.dataset.theme); } catch { /* Motyw działa bez zapisu. */ }
  updateThemeButton();
}, true);

// Delegacja działa także po odtworzeniu DOM przez logowanie i render().
document.addEventListener('pointerdown', (event) => {
  if (!(event.target instanceof Element) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const bounds = button.getBoundingClientRect();
  button.style.setProperty('--ripple-x', `${event.clientX - bounds.left}px`);
  button.style.setProperty('--ripple-y', `${event.clientY - bounds.top}px`);
  button.classList.remove('rippling');
  void button.offsetWidth;
  button.classList.add('rippling');
});
document.addEventListener('animationend', (event) => {
  if (event.target instanceof Element && event.animationName === 'ripple') event.target.classList.remove('rippling');
});
const onScroll = () => root.classList.toggle('scrolled', scrollY > 16);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Pływające etykiety bez zmiany kontrolek i powiązanych z nimi zdarzeń.
function decorate() {
  updateThemeButton();
  document.querySelectorAll('input[data-pn1sandwich]').forEach((input) => input.setAttribute('role', 'switch'));
  document.querySelectorAll('.field:has(select), .rule-form > label:has(select)').forEach((label) => label.classList.add('filled-select'));
}
// Obserwujemy tylko wymianę elementów i zakładkę, nie atrybuty dekorowane wyżej.
new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tab'] });
decorate();
