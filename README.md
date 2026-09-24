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
9. [Znane ograniczenia](#9-znane-ograniczenia)
10. [Dla programistów](#10-dla-programistów)

---

## 1. Szybki start

1. **Osoby** — dodaj wszystkich dyżurujących. Przy każdej osobie ⚙ otwiera jej ustawienia: funkcję
   (Rezydent / Starszy asystent), limity, prośby i historię dyżurów.
2. **Dostępność** — kliknij imię osoby, a kalendarz przełączy się w tryb jej dostępności. Klikanie w dzień zmienia
   poziom: **Mogę → Chcę → Nie mogę → W ostateczności → Mogę**. Na koniec **Gotowe**.
3. **Dostosowywanie** — ustaw kolejność priorytetów, dodaj warunki („gdy X dyżuruje z Y, to X jest na…”) i oceń,
   które dni są ciężkie (**Oceń dni w kalendarzu →**).
4. **Grafik** — przejdź do miesiąca i kliknij **Ułóż miesiąc**. Jeśli jest kilka równie dobrych grafików, nad
   kalendarzem pojawi się panel wariantów — zaznacz wariant, by go obejrzeć, i kliknij **Zostaw zaznaczony**
   (albo **Przywróć poprzedni grafik**).
5. Popraw ręcznie, co chcesz: kliknij pole dyżuru i wybierz osobę (albo „—”, by zwolnić). Ręczne wpisy
   zostają przy każdym kolejnym **Ułóż miesiąc**.

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

Okno osoby (⚙) pokazuje, ile punktów z przeszłości liczy się przy układaniu oglądanego miesiąca.

### Limity (ustawienia osoby, twarde)

Liczone w obrębie jednego miesiąca, puste pole = bez limitu:

- **Łącznie** — maks. liczba wszystkich dyżurów,
- **Pt/So/Nd** — maks. liczba dyżurów w piątki, soboty i niedziele; **domyślnie 2**, jeśli nic nie wpisano,
- **na każdym miejscu** (np. OITN) — maks. liczba dyżurów na tym miejscu.

### Ten sam dzień weekendu (miękko)

Ile razy w miesiącu osoba może trafić na **ten sam** dzień weekendu (np. dwa piątki) bez „kary”. Domyślnie 1
(albo tyle, o ile osoba prosi). To nie jest zakaz — algorytm tylko tego unika, zgodnie z priorytetem
„Dyżury weekendowe w różne dni”.

### Prośby (miękko)

Ile dyżurów osoba **chce** w miesiącu na danym miejscu (np. 3 × OITN) albo w dany dzień weekendu (np. 2 soboty).
Dopóki osoba ma mniej, niż prosiła, ma pierwszeństwo na tym miejscu / w ten dzień. Prośby nigdy nie łamią limitów
ani twardych zasad.

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
6. **Warunki** z zakładki Dostosowywanie.
7. **Wolne po weekendowym OITN** — po OITN w **sobotę** wolny **poniedziałek**, po OITN w **niedzielę**
   wolny **wtorek**. Działa też w drugą stronę: kto ma ręczny dyżur w poniedziałek/wtorek, nie dostanie OITN
   w sobotę/niedzielę przed nim. (OITN jest rozpoznawany po nazwie miejsca.)

---

## 4. Priorytety — co liczy się przy wyborze osoby

Gdy kilka osób spełnia twarde zasady, algorytm porównuje je według priorytetów — **w kolejności ustawionej w
zakładce Dostosowywanie** (strzałki ↑↓). Wyższy priorytet zawsze wygrywa; niższy rozstrzyga dopiero remis na
wszystkich wyższych. Domyślna kolejność:

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

Przykład: przy domyślnej kolejności osoba „Chcę” z 6 dyżurami wygrywa z osobą „Mogę” z 2 dyżurami, bo dostępność
jest ważniejsza niż równa liczba dyżurów. Przesuń „Równa liczba dyżurów” na górę, a będzie odwrotnie.

---

## 5. Jak działa algorytm krok po kroku

Algorytm jest **zachłanny**: idzie po kolei przez dni miesiąca i każde miejsce obsadza najlepszą w tej chwili
osobą. Nie cofa wcześniejszych decyzji.

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

Zachłanny algorytm zależy od tego, jak rozstrzygnie remisy. Dlatego **Ułóż miesiąc** uruchamia go **201 razy**:
raz zwyczajnie i 200 razy z losowym rozstrzyganiem remisów oraz losową kolejnością miejsc w obrębie dnia. Każdy
gotowy grafik dostaje ocenę (mniej = lepiej):

| Kryterium | Jak liczone |
|---|---|
| **Nieobsadzone** | liczba pustych miejsc — zawsze najważniejsze |
| **Dostępność** | za każdy dyżur: „W ostateczności” = 10 pkt, „Mogę” = 1 pkt, „Chcę” = 0 |
| **Kanapki** | liczba dyżurów co drugi dzień (bez dni „Chcę”) |
| **Ten sam dzień weekendu** | liczba dyżurów ponad dozwoloną liczbę tego samego Pt/So/Nd |
| **Prośby** | suma brakujących dyżurów względem próśb |
| **Gówniane dni** | suma kwadratów obciążenia osób (kwadrat mocno karze nierówny podział) |
| **Równa liczba** | suma kwadratów liczby dyżurów osób |

Grafiki są porównywane **leksykograficznie**: najpierw liczba nieobsadzonych, potem kryteria w Twojej kolejności
priorytetów — kolejne kryterium liczy się tylko przy remisie na poprzednich. Zwycięzca trafia do kalendarza. Jeśli
inne grafiki mają **dokładnie taką samą ocenę** we wszystkich kryteriach, pojawia się panel **Warianty grafiku**
(maks. 3), z podsumowaniem: nieobsadzone, „W ostateczności”, kanapki, niespełnione prośby i różnica liczby dyżurów
(najwięcej − najmniej). Wybór między nimi jest już kwestią gustu.

---

## 7. Ręczne wpisy, import, usuwanie osób

- **Wpis ręczny** — kliknij pole dyżuru, wpisz kilka liter (bez polskich znaków też działa) i wybierz osobę;
  „—” zwalnia miejsce. Wpis ręczny oznaczony jest kropką i **nie jest sprawdzany** twardymi zasadami — jeśli coś
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
  wszyscy z PIN-em widzą ten sam grafik. **Wyloguj** zapomina PIN w tej przeglądarce.

---

## 9. Znane ograniczenia

- Algorytm jest **zachłanny** (dzień po dniu, bez cofania). 201 prób z losowymi remisami zwykle wystarcza, ale nie
  gwarantuje najlepszego możliwego grafiku. Jeśli zostają puste miejsca, poluzuj limity/warunki albo wpisz
  trudne dni ręcznie i ułóż ponownie.
- Zasady „nie dzień po dniu”, „bez kanapek” i „wolne po weekendowym OITN” **nie patrzą przez przełom miesięcy** —
  dyżur 31. dnia nie blokuje 1. dnia następnego miesiąca. Sprawdź początek miesiąca ręcznie.
- Zasada wolnego po OITN działa tylko dla miejsca o nazwie dokładnie **OITN**.
- Wpisy ręczne nie są blokowane — tylko oznaczane, gdy łamią „Nie mogę” lub warunek.

---

## 10. Dla programistów

Vanilla JS (moduły ES), bez kroku budowania i bez zależności. Wymaga Node ≥ 20.11.

```sh
npm start   # serwer lokalny: http://127.0.0.1:3000
npm test    # testy (node:test)
node --test --test-name-pattern="fragment nazwy testu"
```

| Plik | Rola |
|---|---|
| `scheduler.js` | czyste funkcje: `generateMonth` (algorytm), `scoreMonth` (ocena), `generateVariants` (201 prób), historia, import tabel |
| `scheduler.test.js` | testy algorytmu |
| `app.js` | interfejs i stan (localStorage `dyzury-v1`) |
| `index.html`, `style.css` | strona |
| `cloud.js`, `config.js`, `supabase.sql` | opcjonalny tryb chmury (Supabase, dostęp przez PIN) |
| `server.js` | minimalny serwer plików do pracy lokalnej |

Zmiany logiki układania wprowadzaj w `scheduler.js` razem z testem. `generateMonth` ma stały interfejs — można go
podmienić na mocniejszy solver (np. ILP) bez zmian w UI.
