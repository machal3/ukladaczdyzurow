# Układacz dyżurów

Aplikacja w przeglądarce do układania miesięcznego grafiku dyżurów. Zbiera, kto kiedy może, jakie ma limity i prośby,
a potem jednym przyciskiem **Ułóż miesiąc** układa cały grafik według jasnych zasad. Każde pole można też wpisać
ręcznie — ręczne wpisy są zawsze zachowywane.

Ta sama instrukcja jest w aplikacji, w zakładce **Instrukcja**.

---

## Spis treści

1. [Szybki start](#1-szybki-start)
2. [Pojęcia](#2-pojęcia)
3. [Twarde zasady — obowiązują zawsze](#3-twarde-zasady--obowiązują-zawsze)
4. [Priorytety — co liczy się przy wyborze osoby](#4-priorytety--co-liczy-się-przy-wyborze-osoby)
5. [Jak działa algorytm krok po kroku](#5-jak-działa-algorytm-krok-po-kroku)
6. [Warianty grafiku i ich ocena](#6-warianty-grafiku-i-ich-ocena)
7. [Ręczne wpisy, import, usuwanie osób](#7-ręczne-wpisy-import-usuwanie-osób)
8. [Gdzie zapisują się dane](#8-gdzie-zapisują-się-dane)
9. [Dane od osób (Zapisy na dyżury)](#9-dane-od-osób-zapisy-na-dyżury)
10. [Znane ograniczenia](#10-znane-ograniczenia)
11. [Dla programistów](#11-dla-programistów)

---

## 1. Szybki start

1. **Osoby** — przy każdej osobie ⚙ otwiera jej ustawienia: funkcję
   (Rezydent / Starszy asystent), limity i prośby.
2. **Dostępność** — kliknij imię osoby, a kalendarz przełączy się w tryb jej dostępności. Klikanie w dzień zmienia
   poziom: **Mogę → Chcę → Muszę → Nie mogę → W ostateczności → Mogę**. Szybciej: wybierz poziom w pasku nad
   kalendarzem (np. **Nie mogę**) — klik wpisuje go od razu, a przeciągnięcie myszą po dniach (np. cały urlop) wpisuje
   go we wszystkie mijane dni; **Po kolei** wraca do zmiany po kliknięciu. Tak samo przy ocenie gównianości. Na koniec **Gotowe**.
3. **Układanie** — dodaj wszystkich dyżurujących (**Nowa osoba**), ustaw kolejność priorytetów, dodaj warunki („gdy X dyżuruje z Y, to X jest na…”) i oceń,
   które dni są ciężkie (**Oceń dni w kalendarzu →**).
4. **Grafik** — przejdź do miesiąca i kliknij **Ułóż miesiąc**. Jeśli jest kilka równie dobrych grafików, nad
   kalendarzem pojawi się panel wariantów — zaznacz wariant, by go obejrzeć, i kliknij **Zostaw zaznaczony**
   (albo **Przywróć poprzedni grafik**).
5. Popraw ręcznie, co chcesz: kliknij pole dyżuru i wybierz osobę (albo „—”, by zwolnić). Ręczne wpisy
   zostają przy każdym kolejnym **Ułóż miesiąc**.
6. **Statystyki** — kto ile dyżurów dostał w oglądanym miesiącu i dlaczego: obsada, Pt/So/Nd, gównianość,
   dostępność w dni dyżurów, limity i prośby. Kliknij osobę, by otworzyć okno z powodami, limitami i historią jej dyżurów z 4 miesięcy.

Legenda w kalendarzu:

| Oznaczenie | Znaczenie |
|---|---|
| kropka przy dyżurze | wpisany ręcznie (zostaje przy ponownym układaniu) |
| pomarańczowa nazwa miejsca, „—” | dyżur nieobsadzony — nikt nie spełniał twardych zasad |
| falista linia pod nazwiskiem | osoba ma tego dnia „Nie mogę” albo wpis łamie warunek (możliwe tylko przy wpisie ręcznym) |

---

## 2. Pojęcia

### Miejsca (dyżury)

Każdego dnia trzeba obsadzić kilka miejsc — domyślnie **OITN**, **PN1**, **PN2**, codziennie. Jedna osoba = jedno
miejsce jednego dnia.

### Osoby i funkcja

Każda osoba ma funkcję:

- **Rezydent** — danego dnia może dyżurować najwyżej jeden rezydent,
- **Starszy asystent** (1 lub 2 pkt) — bez tego ograniczenia.

### Dostępność (poziom na każdy dzień)

| Poziom | Znaczenie dla algorytmu |
|---|---|
| **Chcę** | pierwszeństwo przy wyborze |
| **Mogę** | domyślny poziom, jeśli nic nie zaznaczono |
| **W ostateczności** | wybierana dopiero, gdy nikt lepszy nie jest dostępny |
| **Nie mogę** | twardy zakaz — algorytm nigdy tej osoby tego dnia nie wstawi |

### Gównianość dni (0–3)

Jak ciężki jest dzień: **Zwykły (0)**, **Słaby (1)**, **Gówniany (2)**, **Tragiczny (3)**. Bez oceny obowiązują
wartości domyślne: **piątek = Gówniany**, **sobota i niedziela = Słaby**, pozostałe dni = Zwykły. Każdy dyżur dodaje
osobie tyle punktów „obciążenia”, ile wynosi gównianość dnia. Algorytm stara się, by obciążenie rozkładało się
równo (szczegóły w punkcie 4).

Do obciążenia na start miesiąca liczy się też przeszłość:

- **historia z grafiku** — punkty gównianości z trzech poprzednich miesięcy, ważone: miesiąc temu × ½,
  dwa miesiące temu × ¼, trzy miesiące temu × ⅛,
- **„Ostatnio gówniane (spoza grafiku)”** w ustawieniach osoby (0–3) — np. dla kogoś nowego albo z dyżurami,
  których nie ma w programie; dodaje 0–3 × 3 punkty,
- kto miał **Tragiczny** dzień w poprzednim miesiącu, w tym miesiącu dostaje Tragiczny dzień dopiero na końcu kolejki.

Zakładka **Statystyki** pokazuje przy każdej osobie, ile punktów z przeszłości liczy się przy układaniu oglądanego miesiąca.

### Dzień liczony jak inny dzień tygodnia

W trybie **Oceń dni w kalendarzu** pod gównianością każdego dnia jest lista **„Limity jak …”**. Dzień ustawiony np.
jak niedziela (święto w środę) liczy się jak niedziela do limitów, minimów i próśb (Pt/So/Nd, ten sam dzień
weekendu). Gównianość, miejsca do obsadzenia i wolne po OITN zostają według prawdziwego dnia tygodnia.
W grafiku taki dzień ma etykietę „jak Nd”.

### Limity (ustawienia osoby, twarde)

Min. i Limit są twardymi granicami w każdym wierszu tabeli osoby, także dla ręcznych wpisów.
Puste minimum = 0; puste maksimum = bez limitu poza domyślnym limitem Pt/So/Nd.
Jeśli nie znaleziono zgodnego grafiku, aplikacja pokazuje komunikat i zachowuje poprzedni.

- **Łącznie** — maks. liczba wszystkich dyżurów,
- **Pt/So/Nd** — maks. liczba dyżurów w piątki, soboty i niedziele; **domyślnie 2**, jeśli nic nie wpisano,
- **na każdym miejscu** (np. OITN) — maks. liczba dyżurów na tym miejscu.

### Ten sam dzień weekendu

Ile razy w miesiącu osoba może trafić na **ten sam** dzień weekendu (np. dwa piątki). Wpisany limit jest
twardy (0 = nie dyżuruje w ten dzień). Bez wpisu domyślnie 1 (albo tyle, o ile osoba prosi) — to nie jest zakaz,
algorytm tylko tego unika, zgodnie z priorytetem „Dyżury weekendowe w różne dni”.

### Prośby (miękko)

Ile dyżurów osoba **chce** w miesiącu na danym miejscu (np. 3 × OITN) albo w dany dzień weekendu (np. 2 soboty).
Algorytm ogranicza zarówno niedobór, jak i nadmiar względem prośby, również jawnej prośby o zero.
Prośby obejmują też łączną liczbę dyżurów i Pt/So/Nd. Nigdy nie łamią limitów ani twardych zasad.

### Warunki

Zasada w postaci: **„Gdy X dyżuruje tego samego dnia co Y, to X jest na: [wybrane miejsca]”**. Np. „Gdy Anna
dyżuruje z Janem, to Anna jest na OITN”. Warunek jest twardy: algorytm nie ułoży dnia, w którym X i Y są razem,
a X jest na innym miejscu.

---

## 3. Twarde zasady — obowiązują zawsze

Tych zasad algorytm **nigdy** nie łamie. Jeśli żadna osoba ich nie spełnia, miejsce zostaje **nieobsadzone**
(widoczne na pomarańczowo) — wtedy trzeba coś poluzować albo wpisać dyżur ręcznie.

1. **Jedna osoba — jeden dyżur dziennie.**
2. **Nie dzień po dniu** — nikt nie dyżuruje dwa dni z rzędu (liczą się też wpisy ręczne, również te na
   następny dzień).
3. **„Nie mogę” = zakaz** dyżuru w tym dniu.
4. **Limity osoby** — łącznie, w Pt/So/Nd i na każdym miejscu (patrz wyżej).
5. **Najwyżej jeden rezydent dziennie** (licząc wpisy ręczne).
6. **Warunki** z zakładki Ustawienia.
7. **Wolne po weekendowym OITN** — po OITN w **sobotę** wolny **poniedziałek**, po OITN w **niedzielę**
   wolny **wtorek**. Ręczny dyżur w poniedziałek/wtorek blokuje też wcześniejszy OITN w weekend.
   (OITN jest rozpoznawany po nazwie miejsca.)

---

## 4. Priorytety — co liczy się przy wyborze osoby

Kolejność w zakładce Układanie (strzałki ↑↓) ustala wagi preferencji w ocenie całego miesiąca.
Niższe preferencje też wpływają na wynik. Twarde limity, obsada i dokładność próśb mają pierwszeństwo.
Preferencje używane przy tworzeniu początkowych propozycji:

| # | Priorytet | Kogo wybiera najpierw |
|---|---|---|
| 1 | **Dostępność** | Chcę → Mogę → W ostateczności |
| 2 | **Bez „kanapek”** | kogoś, kto *nie* miałby dyżuru co drugi dzień (np. pn i śr). Nie dotyczy dnia, w który osoba zaznaczyła „Chcę”. Wyjątek: PN1 w sobotę + dowolny dyżur w poniedziałek to kanapka *preferowana* (wyłączane w oknie osoby: ⚙ → „Kanapka PN1 So + Pn”). |
| 3 | **Dyżury weekendowe w różne dni** | w Pt/So/Nd — kogoś, kto nie wyczerpał jeszcze swojego „tego samego dnia weekendu” (domyślnie: nie miał jeszcze tego dnia tygodnia) |
| 4 | **Prośby o liczbę dyżurów** | kogoś, kto ma na tym miejscu (lub w ten dzień weekendu) mniej dyżurów, niż prosił |
| 5 | **Sprawiedliwy podział gównianych dni** | w dzień ciężki (gównianość ≥ 1) — osobę z najmniejszym obciążeniem; w dzień Tragiczny najpierw osoby, które *nie* miały Tragicznego ani w zeszłym, ani w tym miesiącu |
| 6 | **Równa liczba dyżurów** | osobę z najmniejszą liczbą dyżurów w tym miesiącu |

Jeśli po wszystkich priorytetach wciąż jest remis: w pierwszym przebiegu wygrywa osoba, która **najdłużej nie
dyżurowała** (w tym miesiącu); w kolejnych przebiegach remis rozstrzyga losowanie (patrz punkt 6).

Przesunięcie „Równej liczby dyżurów” na górę zwiększa jej wpływ, ale pozostałe preferencje nadal się liczą.

---

## 5. Jak działa algorytm krok po kroku

Algorytm tworzy wiele propozycji, a następnie poprawia cały miesiąc przez zmiany osób i zamiany przydziałów.
Potrafi również ponownie ułożyć grupę dni, co pozwala naprawić kilka zależnych przydziałów naraz.
Obliczenia działają w osobnym wątku (Web Worker), więc kalendarz i przyciski pozostają dostępne.
Przycisk **Anuluj układanie** natychmiast kończy próbę. Zmiana danych lub miesiąca również ją anuluje,
żeby starszy wynik nie nadpisał nowych ustawień. Komunikat pokazuje aktualny etap pracy.
Wyszukiwanie ma wspólny budżet 7 sekund; dodatkowe zabezpieczenie kończy worker po 12 sekundach.
Po wykorzystaniu budżetu algorytm zwraca najlepszy znaleziony zgodny wynik, jeśli taki znalazł.
Przy braku zgodnego rozwiązania cofa decyzje, zaczyna od miejsc z najmniejszą liczbą kandydatów i sprawdza,
czy pozostało dość dostępnych terminów na minima. Przyjęty wynik musi spełniać wszystkie limity.
Poniżej opis początkowego przebiegu zachłannego, stanowiącego punkt startowy do dalszego wyszukiwania.

**Przygotowanie**

1. Bierze aktywne osoby (bez usuniętych).
2. Dla każdej liczy obciążenie startowe: `„ostatnio gówniane” × 3 + historia z 3 poprzednich miesięcy (½, ¼, ⅛)`
   i sprawdza, czy miała Tragiczny dzień w zeszłym miesiącu.
3. Wczytuje **wpisy ręczne** z tego miesiąca (oraz przeszłe dyżury osób usuniętych). Są nietykalne i od razu
   liczą się do liczby dyżurów, limitów, obciążenia i dni weekendu tych osób.

**Dla każdego dnia (1, 2, 3, …), dla każdego miejsca, które tego dnia trzeba obsadzić:**

1. Jeśli miejsce ma wpis ręczny — zostaje.
2. **Filtr (twarde zasady)** — odrzuca każdego, kto:
   - ma tego dnia „Nie mogę”,
   - już dyżuruje tego dnia,
   - dyżurował wczoraj albo ma wpis ręczny jutro,
   - osiągnął któryś limit (łącznie / Pt/So/Nd / na tym miejscu),
   - jest rezydentem, a tego dnia jest już rezydent,
   - złamałby warunek z kimś, kto już tego dnia dyżuruje,
   - miał OITN w sobotę/niedzielę dwa dni temu (albo — przy OITN w weekend — ma wpis ręczny za dwa dni).
3. **Sortowanie (priorytety)** — pozostałe osoby ustawia według priorytetów w wybranej kolejności
   (tabela w punkcie 4), a remisy rozstrzyga jak opisano wyżej.
4. **Wybór** — pierwsza osoba z listy dostaje dyżur. Jej liczba dyżurów, obciążenie, liczniki miejsc
   i dni weekendu rosną od razu, więc wpływają na kolejne dni.
5. Jeśli po filtrze nie został nikt — miejsce zostaje **puste**.

---

## 6. Warianty grafiku i ich ocena

Zachłanny algorytm zależy od tego, jak rozstrzygnie remisy. Dlatego **Ułóż miesiąc** uruchamia go **do 201 razy**, w ramach wspólnego limitu czasu:
raz zwyczajnie i 200 razy z losowym rozstrzyganiem remisów oraz losową kolejnością miejsc w obrębie dnia. Każdy
gotowy grafik dostaje ocenę (mniej = lepiej):

| Kryterium | Jak liczone |
|---|---|
| **Nieobsadzone** | liczba pustych miejsc — zawsze najważniejsze |
| **Dostępność** | za każdy dyżur: „W ostateczności” = 10 pkt, „Mogę” = 1 pkt, „Chcę” = 0 |
| **Kanapki** | liczba dyżurów co drugi dzień (bez dni „Chcę”) |
| **Ten sam dzień weekendu** | liczba dyżurów ponad dozwoloną liczbę tego samego Pt/So/Nd |
| **Prośby** | suma niedoborów i nadmiarów względem próśb |
| **Gówniane dni** | suma kwadratów obciążenia osób (kwadrat mocno karze nierówny podział) |
| **Równa liczba** | suma kwadratów liczby dyżurów osób |

Grafiki spełniające twarde warunki są porównywane: najpierw liczba nieobsadzonych, potem odchylenia od próśb,
następnie ważona, przeskalowana suma pozostałych preferencji. Zwycięzca trafia do kalendarza. Jeśli
inne grafiki mają taką samą ocenę końcową (a gdy remisu nie ma — prawie taką samą: ta sama obsada i prośby,
reszta oceny do 10% gorsza), pojawia się panel **Warianty grafiku**
(maks. 3), z podsumowaniem: nieobsadzone, „W ostateczności”, kanapki, odchylenia od próśb i różnica liczby dyżurów
(najwięcej − najmniej). Wybór między nimi jest już kwestią gustu.

---

## 7. Ręczne wpisy, import, usuwanie osób

- **Wpis ręczny** — kliknij pole dyżuru, wpisz kilka liter (bez polskich znaków też działa) i wybierz osobę;
  „—” zwalnia miejsce. Lista podpowiada: na górze osoby bez kolizji (najpierw „Muszę” i „Chcę”), na dole osoby
  z kolizją i jej powodem — nadal do wybrania. Wpis ręczny oznaczony jest kropką i **nie jest sprawdzany** twardymi zasadami — jeśli coś
  łamie („Nie mogę”, warunek), pojawia się falista linia. Algorytm go nie ruszy, ale uwzględni go przy
  pozostałych dniach.
- **Wyczyść** — usuwa cały grafik oglądanego miesiąca, łącznie z wpisami ręcznymi.
- **Importuj** — wczytuje grafik z tabeli (plik Word `.docx` albo tabela skopiowana z Worda/Excela). Tabela
  musi mieć wiersz nagłówka z nazwami miejsc i numer dnia w pierwszej kolumnie. Imiona z tabeli łączone są
  z osobami w programie (pełne imię i nazwisko, „M. Kowalska” albo samo nazwisko); nieznane można dodać jako nowe
  osoby albo pominąć. Połączenia są zapamiętywane na kolejne importy. Zaimportowane dyżury stają się wpisami ręcznymi.
- **Usunięcie osoby** — przeszłe dyżury zostają w grafiku (i w historii), przyszłe są zwalniane; znikają też jej
  dostępność, limity, prośby i warunki. Dodanie osoby o tym samym imieniu przywraca ją razem z historią.

---

## 8. Gdzie zapisują się dane

- **Tryb lokalny** (domyślny) — wszystko w pamięci przeglądarki (localStorage). Inna przeglądarka lub inny
  komputer = osobne dane. Wyczyszczenie danych przeglądarki usuwa grafik.
- **Tryb chmury** — gdy w `config.js` ustawiony jest Supabase, aplikacja prosi o PIN i zapisuje stan w bazie;
  wszyscy z PIN-em widzą ten sam grafik. **Wyloguj** (w Ustawieniach) zapomina PIN w tej przeglądarce.

---

## 9. Dane od osób (Zapisy na dyżury)

Osobna aplikacja **Zapisy na dyżury** (repo `machal3/ukladaczdyzurowzapisy`) pozwala każdej osobie samej wpisać
swoją dostępność i prośby, 6-cyfrowym PIN-em. Działa tylko w trybie chmury, gdy w `config.js` ustawiony jest
`ZAPISY_URL`; w Supabase trzeba też uruchomić `supabase-zapisy.sql` z repo Zapisów (po `supabase.sql` stąd).

- **Konto osoby** — karta **Konto w Zapisach** w ustawieniach osoby: czy ma PIN, ostatnie logowanie i ostatnia
  zmiana. **Nadaj PIN** losuje 6 cyfr (bez łatwych, np. 112211, 123456, 123123). PIN widać tylko raz — przekaż
  go osobie (**Skopiuj**). Nowy PIN unieważnia stary i wylogowuje osobę na wszystkich urządzeniach.
  **Usuń konto** odbiera dostęp (wpisana dostępność zostaje). Usunięcie osoby usuwa też jej konto.
- **Co osoba widzi** — swoje imię, nazwy miejsc, swoją dostępność (Mogę / Chcę / Muszę / Nie mogę /
  W ostateczności), swoje prośby i komentarze. **Nie widzi** limitów, minimów, cudzej dostępności, warunków ani
  gównianości dni.
- **Grafik** — Zapisy pokazują wszystkim aktualny grafik od poprzedniego miesiąca (tylko imiona na miejscach), na
  bieżąco, także w trakcie poprawiania.
- **Komentarze** — osoba może dopisać komentarz do swoich dyżurów w danym miesiącu (do 500 znaków). Widać go w
  **Uwagach** nad kalendarzem (także przy pustym grafiku), w oknie osoby w Statystykach i w trybie jej dostępności.
- **Termin zapisów** — osoby zmieniają dostępność na dany miesiąc do 20. dnia poprzedniego miesiąca włącznie;
  pilnuje tego baza. Pasek nad kalendarzem pokazuje, czy zapisy na oglądany miesiąc są otwarte. Pole **Zamknij
  zapisy osób do miesiąca** (zakładka Układanie, opcjonalne) zamyka wcześniej wszystkie miesiące przed wybranym
  (np. już ułożone).
- **Kto to wpisał** — w trybie dostępności osoby przy imieniu widać „zmienione w Zapisach: data”, jeśli osoba
  coś tam zmieniała.
- **Odświeżanie** — zmiany osób pojawiają się po powrocie na kartę przeglądarki albo po **Odśwież dane**
  (Ustawienia aplikacji). Nie w trakcie układania, przy otwartym oknie osoby ani gdy własne zmiany jeszcze się zapisują.
- **Jednoczesna zmiana — wygrywa osoba.** Jeśli osoba zmieni swoją dostępność po wczytaniu danych w Układaczu,
  przy zapisie jej dostępność, prośby i komentarze zostają z bazy, a zmiany zrobione w Układaczu u tej osoby przepadają
  (widać to po odświeżeniu). Reszta zmian zapisuje się normalnie.
- **Ustawienia aplikacji → Zapisy na dyżury** — liczba złych prób logowania z 24 h (przy 100 logowanie wstrzymuje
  się dla wszystkich) i link do aplikacji Zapisów.

---

## 10. Znane ograniczenia

- Wyszukiwanie i poprawianie grafiku mają ograniczony budżet czasu i nie gwarantują globalnego optimum.
  Brak wyniku nie jest dowodem niewykonalności. Można sprawdzić ustawienia lub ponowić próbę;
  algorytm nigdy automatycznie nie rozluźnia limitów.
- Przełom miesięcy: „nie dzień po dniu”, „bez kanapek” i „wolne po weekendowym OITN” uwzględniają 2 ostatnie dni
  poprzedniego i 2 pierwsze dni następnego miesiąca, jeśli są już w grafiku (nie liczą się do limitów, minimów
  ani próśb tego miesiąca).
- Zasada wolnego po OITN działa tylko dla miejsca o nazwie dokładnie **OITN**.
- Wpisy ręczne nie są blokowane — tylko oznaczane, gdy łamią „Nie mogę” lub warunek.

---

## 11. Dla programistów

Vanilla JS (moduły ES), bez zależności uruchomieniowych. Zależności npm służą do generowania
motywu i kontroli kodu. Narzędzia deweloperskie wymagają Node ≥ 22.13 (zalecany Node 24).
Gotowy `theme.css` jest w repozytorium, więc serwer lokalny i dotychczasowy hosting statyczny
nadal działają bez obowiązkowego budowania.

```sh
npm ci           # zależności deweloperskie z lockfile
npm start        # serwer lokalny: http://127.0.0.1:3000
npm test         # testy algorytmu (node:test)
npm run test:ui  # testy integracyjne DOM, bez połączenia z chmurą
npm run lint     # ESLint
npm run typecheck # ścisła kontrola typów ui.js przez TypeScript / JSDoc
npm run build    # kontrola typów, palety i statyczny artefakt dist/
npm run theme    # regenerowanie theme.css po zmianie koloru bazowego
node --test --test-name-pattern="fragment nazwy testu"
```

| Plik | Rola |
|---|---|
| `scheduler.js` | czyste funkcje: `generateMonth` (algorytm), `scoreMonth` (ocena), `generateVariants` (201 prób), historia, import tabel |
| `scheduler.test.js` | testy algorytmu |
| `app.js` | interfejs i stan (localStorage `dyzury-v1`) |
| `index.html`, `style.css` | strona |
| `ui.js` | motyw, ripple, etykiety i nagłówki; bez dostępu do stanu grafiku |
| `theme.css`, `scripts/theme.mjs` | palety HCT i role kolorów M3; seed `#236a4c` |
| `ui.test.js` | integracja formularzy, nawigacji, importu i ręcznych przypisań |
| `scripts/build.mjs` | powtarzalny build statyczny do `dist/` |
| `cloud.js`, `config.js`, `supabase.sql` | opcjonalny tryb chmury (Supabase, dostęp przez PIN); `save_state` zachowuje zmiany osób z Zapisów (`data.stamps`) |
| `server.js` | minimalny serwer plików do pracy lokalnej |

Zmiany logiki układania wprowadzaj w `scheduler.js` razem z testem. `generateMonth` ma stały interfejs — można go
podmienić na mocniejszy solver (np. ILP) bez zmian w UI.

### System wizualny

Material You: zielony motyw Tonal Spot, chłodny kolor tertiary, tonalne powierzchnie bez cieni,
rail na komputerze i dolna nawigacja z FAB na telefonie. Kolory są generowane przez
Material Color Utilities 0.3.0 (wersja 0.4.0 ma niepoprawny import ESM w Node).
Role i poziomy powierzchni odpowiadają [dokumentacji Material 3](https://github.com/material-components/material-web/blob/main/docs/theming/color.md).
Motyw domyślnie podąża za systemem. Przycisk w nawigacji zapisuje wybór jasny/ciemny
pod osobnym kluczem `dyzury-theme`, niezależnym od `dyzury-v1`.

Ruch używa `cubic-bezier(.2, 0, 0, 1)` i respektuje `prefers-reduced-motion`.
Kontrolki zachowują natywne elementy, nazwy, identyfikatory i zdarzenia.
Projekt pozostaje JavaScriptem; ścisła kontrola TypeScript obejmuje `ui.js` i `theme-init.js`,
a ESLint wszystkie pliki JS. Testy DOM nie zastępują oceny wizualnej w przeglądarce.
