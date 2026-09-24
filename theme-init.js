// @ts-check
// Przed arkuszami CSS: zapisany motyw bez błysku niewłaściwego tła.
(() => {
  try {
    const theme = localStorage.getItem('dyzury-theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  } catch { /* Brak dostępu do pamięci: motyw systemowy z CSS. */ }
})();
