// Chmura: Supabase — dostęp na PIN i sesję (sprawdzane w bazie, patrz supabase.sql), cały stan w jednym wierszu tabeli `dyzury`.
// PIN idzie tylko do admin_login; w localStorage zostaje token sesji (90 dni), więc pyta tylko raz.
// Bez SUPABASE_URL w config.js wszystko działa lokalnie.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const TOKEN = 'dyzury-token';
const OLD_PIN = 'dyzury-pin'; // dawniej w przeglądarce zostawał sam PIN — zamieniany na token i usuwany
let token = null;
let queue = Promise.resolve();
let pending = 0;

async function rpc(fn, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const out = await r.json().catch(() => null);
  if (!r.ok || out?.error) throw new Error(out?.error || out?.message || r.statusText); // { error }: zły PIN albo limit prób
  return out;
}

// { data: stan | null (pusta baza) } albo null (tryb lokalny). Bez poprawnego PIN-u aplikacja czeka na ekranie PIN-u.
export async function cloudLoad() {
  if (!SUPABASE_URL) return null;
  const page = document.body.innerHTML;
  let t = localStorage.getItem(TOKEN), p = localStorage.getItem(OLD_PIN), msg = '';
  localStorage.removeItem(OLD_PIN);
  for (;;) {
    try {
      if (!t && p) localStorage.setItem(TOKEN, t = (await rpc('admin_login', { p })).token);
      if (t) {
        const { data } = await rpc('load_state', { p: t });
        token = t;
        document.body.innerHTML = page;
        return { data };
      }
    } catch (e) {
      if (e.message === 'Sesja wygasła') { localStorage.removeItem(TOKEN); msg = 'Sesja wygasła — wpisz PIN.'; }
      else if (e.message === 'Zły PIN') msg = 'Zły PIN.';
      else msg = e.message.startsWith('Za dużo') ? e.message : `Błąd połączenia: ${e.message}`;
    }
    p = await ask(msg);
    t = null; // wpisany PIN → nowa sesja
  }
}

function ask(msg) {
  document.body.innerHTML = `<main class="login"><h1>Układacz dyżurów</h1><form>
    <label for="pin">PIN</label>
    <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" required autofocus>
    <button>Wejdź</button><p role="status"></p></form></main>`;
  document.querySelector('.login [role=status]').textContent = msg;
  return new Promise((resolve) => document.querySelector('.login form').addEventListener('submit', (e) => {
    e.preventDefault();
    e.target.querySelector('button').disabled = true;
    resolve(e.target.pin.value.trim());
  }));
}

// ponytail: cały stan nadpisywany przy każdej zmianie (ostatni zapis wygrywa), cudze zmiany widać po odświeżeniu;
// realtime / zapis per pole, gdy kilka osób będzie edytować naraz.
// Szybkie serie zmian (np. malowanie dni przeciągnięciem) idą jednym zapisem: wysyłany jest tylko ostatni stan po 400 ms ciszy.
let timer = null, latest = null;
export function cloudSave(json) {
  if (!token) return;
  latest = json;
  if (!timer) pending++; // od pierwszej zmiany — beforeunload ostrzega też przed jeszcze niewysłaną
  clearTimeout(timer);
  timer = setTimeout(send, 400);
}
function send() {
  timer = null;
  const d = JSON.parse(latest);
  queue = queue.then(() => rpc('save_state', { p: token, d }))
    .catch((e) => alert(`Nie zapisano w chmurze: ${e.message}`)).finally(() => pending--);
}
addEventListener('beforeunload', (e) => { if (pending) e.preventDefault(); }); // niezapisane zmiany → przeglądarka pyta

export async function cloudLogout() {
  localStorage.removeItem(TOKEN);
  await rpc('admin_logout', { t: token }).catch(() => {}); // bez sieci token i tak znika z przeglądarki
  location.reload();
}

// Wywołanie funkcji bazy z sesją administratora (np. admin_konta, admin_set_pin — patrz supabase-zapisy.sql w repo Zapisów;
// check_pin przyjmuje token zamiast PIN-u)
export const cloudRpc = (fn, body) => rpc(fn, { p: token, ...body });

// Świeży stan z bazy (np. zmiany osób z Zapisów) albo null, gdy coś czeka na wysłanie — wtedy lokalny stan jest nowszy
export async function cloudReload() {
  if (!token || pending) return null;
  const { data } = await rpc('load_state', { p: token });
  return pending ? null : data; // zmiana w trakcie wczytywania wygrywa
}

export { ZAPISY_URL } from './config.js';
