// Chmura: Supabase — logowanie linkiem z e-maila, cały stan w jednym wspólnym wierszu tabeli `dyzury`.
// Bez SUPABASE_URL w config.js wszystko działa lokalnie (cloudLoad zwraca null).
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

let sb = null;
let queue = Promise.resolve();
let pending = 0;
const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// { data: stan | null (pusta baza) } albo null (tryb lokalny). Bez zalogowania / dostępu pokazuje ekran logowania i nie wraca.
export async function cloudLoad() {
  if (!SUPABASE_URL) return null;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return gate();
  const { data: ok, error: e1 } = await sb.rpc('is_editor');
  if (e1) return gate(`Błąd chmury: ${e1.message}`, session);
  if (!ok) return gate(`Konto ${session.user.email} nie ma dostępu — poproś o dopisanie do listy.`, session);
  const { data, error } = await sb.from('dyzury').select('data').eq('id', 1).maybeSingle();
  if (error) return gate(`Błąd chmury: ${error.message}`, session);
  return { data: data?.data ?? null };
}

// ponytail: cały stan nadpisywany przy każdej zmianie (ostatni zapis wygrywa), cudze zmiany widać po odświeżeniu;
// realtime / zapis per pole, gdy kilka osób będzie edytować naraz.
export function cloudSave(json) {
  if (!sb) return;
  pending++;
  queue = queue.then(async () => {
    const { error } = await sb.from('dyzury').upsert({ id: 1, data: JSON.parse(json), updated_at: new Date().toISOString() });
    if (error) throw error;
  }).catch((e) => alert(`Nie zapisano w chmurze: ${e.message}`)).finally(() => pending--);
}
addEventListener('beforeunload', (e) => { if (pending) e.preventDefault(); }); // niezapisane zmiany → przeglądarka pyta

export async function cloudLogout() { await sb.auth.signOut(); location.reload(); }

function gate(msg = '', session) {
  document.body.innerHTML = `<main class="login"><h1>Układacz dyżurów</h1>
    ${session ? `<p>${esc(msg)}</p><button id="out">Wyloguj</button>` : `<form id="in">
      <label for="email">E-mail — wyślemy link do logowania</label>
      <input id="email" name="email" type="email" required autocomplete="email">
      <button>Wyślij link</button><p role="status"></p></form>`}</main>`;
  document.querySelector('#out')?.addEventListener('click', cloudLogout);
  document.querySelector('#in')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = e.target.querySelector('[role=status]');
    const { error } = await sb.auth.signInWithOtp({ email: e.target.email.value, options: { emailRedirectTo: location.origin + location.pathname } });
    out.textContent = error ? `Błąd: ${error.message}` : 'Sprawdź skrzynkę i kliknij link.';
  });
  return new Promise(() => {}); // aplikacja nie startuje bez dostępu
}
