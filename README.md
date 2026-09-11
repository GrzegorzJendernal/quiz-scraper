# Pobieracz pytań z quizów

Ten program przechodzi za Ciebie quizy w kursie online i zapisuje na komputerze
**wszystkie pytania razem z poprawnymi odpowiedziami i wyjaśnieniami**.
Potem można z nich zrobić fiszki do nauki, a do samej strony kursu nie trzeba już wracać.

---

## ⚠️ Przeczytaj przed startem

- **Program naprawdę odpowiada na pytania w Twoim kursie.** Klika odpowiedzi tak, jak zrobiłby to
  człowiek, więc zmieni się Twój postęp i wyniki quizów na koncie.
- **Hasło wpisujesz tylko w oknie przeglądarki**, tak jak zwykle. Program go nie widzi i nie zapisuje.
  Zapamiętuje jedynie „zalogowanie” (jak przeglądarka, która pamięta, że jesteś w kursie).
- **Folderu `data` nie wysyłaj nikomu w całości** — jest w nim Twoje zalogowanie do kursu
  (plik `auth.json`). Wyniki (plik `questions.json`) możesz udostępniać, komu chcesz.

---

## Czego potrzebujesz

- komputera z Windows albo macOS,
- dostępu do kursu (login i hasło),
- około **1 GB** wolnego miejsca (program pobiera własną przeglądarkę),
- około **30 minut** na pierwsze uruchomienie; kolejne to już tylko jedno polecenie.

---

## Sposób 1: z pomocą asystenta AI (polecany)

Jeśli masz asystenta AI, który widzi pliki na komputerze (np. Claude Code, Cursor, GitHub Copilot,
Codex, Gemini CLI):

1. Otwórz w nim ten folder.
2. Napisz: **„Pomóż mi uruchomić ten program. Przeczytaj plik AGENTS.md i prowadź mnie krok po kroku.”**

Asystent przeprowadzi Cię przez całość i zrobi techniczną część za Ciebie.

Jeśli używasz zwykłego czatu w przeglądarce (ChatGPT, Claude.ai, Gemini) — otwórz plik
`AGENTS.md` w Notatniku, skopiuj całą treść, wklej do czatu i dopisz to samo zdanie.
Czat będzie Cię prosić o wklejenie wyników poleceń albo o dołączenie plików.

---

## Sposób 2: samodzielnie, krok po kroku

### Krok 1. Zainstaluj Node.js (jednorazowo)

To silnik, na którym działa program.

1. Wejdź na **https://nodejs.org**.
2. Pobierz wersję oznaczoną **LTS**.
3. Uruchom pobrany plik i klikaj **Dalej / Continue** aż do końca.

### Krok 2. Otwórz terminal w folderze programu

Terminal to okno, w którym wpisuje się polecenia. Każde polecenie z tej instrukcji
wpisujesz (albo wklejasz) i zatwierdzasz klawiszem **Enter**.

**Windows:**
1. Otwórz folder programu w Eksploratorze plików.
2. Kliknij w pasek adresu u góry okna (tam, gdzie widać nazwę folderu).
3. Wpisz `cmd` i naciśnij **Enter** — otworzy się czarne okno.

**macOS:**
1. Otwórz aplikację **Terminal** (Cmd + Spacja, wpisz „Terminal”, Enter).
2. Wpisz `cd` i **spację** (jeszcze bez Enter).
3. Przeciągnij folder programu z Findera do okna Terminala i naciśnij **Enter**.

Sprawdź, czy wszystko gotowe — wpisz:

```bash
node -v
```

Powinno pojawić się coś w rodzaju `v24.11.0` (liczba na początku: 22 lub więcej).
Jeśli pojawia się błąd, zamknij terminal, otwórz go ponownie i spróbuj jeszcze raz.

> Wklejanie w terminalu: **Ctrl + V** (Windows) albo **Cmd + V** (macOS).
> Jeśli w Windows nie działa, kliknij prawym przyciskiem myszy w oknie.

### Krok 3. Zainstaluj program (jednorazowo)

```bash
npm install
```

Trwa to kilka minut, bo program pobiera własną przeglądarkę. Poczekaj, aż znowu będzie można pisać.

### Krok 4. Podaj adres quizu (jednorazowo)

```bash
npm run setup
```

Program poprosi o adres pierwszego quizu. Otwórz quiz w swojej zwykłej przeglądarce,
skopiuj adres z paska adresu, wklej go do terminala i naciśnij **Enter**.
Na pytanie o adres logowania naciśnij po prostu **Enter**.

### Krok 5. Zaloguj się (jednorazowo, powtarzasz tylko, gdy logowanie wygaśnie)

```bash
npm run login
```

Otworzy się okno przeglądarki. Zaloguj się w nim tak jak zwykle. Kiedy zobaczysz kurs,
wróć do terminala i naciśnij **Enter**.

### Krok 6. Nagraj jedno pytanie (jednorazowo)

Program musi „zobaczyć”, jak wygląda quiz, żeby wiedzieć, gdzie klikać.

```bash
npm run probe
```

Otworzy się okno z quizem. **Ty klikasz w oknie**, a po każdym kroku wracasz do terminala
i naciskasz **Enter**:

1. widać pytanie, nic nie zaznaczone → **Enter**
2. zaznacz odpowiedź, jeszcze bez CONFIRM → **Enter**
3. kliknij **CONFIRM** → **Enter**
   Najważniejsze jest nagranie **złej** odpowiedzi. Jeśli trafisz dobrą, kliknij NEXT
   i powtarzaj kroki 2–3, aż pojawi się komunikat o złej odpowiedzi.
4. kliknij **NEXT** → **Enter**
5. wpisz `q` i naciśnij **Enter**, żeby zakończyć.

### Krok 7. Dopasowanie ustawień (jednorazowo, techniczne)

Ten krok wymaga odrobiny wiedzy technicznej. Są dwie drogi:

- **asystent AI** — patrz *Sposób 1*; zajmie się tym za Ciebie, **albo**
- **osoba, która przygotowała program** — spakuj i wyślij jej folder `data/probe`
  (**bez** pliku `data/auth.json`). Odeśle Ci gotowy plik `config/site.json`,
  który wstawiasz do folderu `config`, zastępując stary.

Jak sprawdzić, że ustawienia są gotowe:

```bash
npm run check
```

Na samym dole musi być napisane **`WYNIK: GOTOWE DO PRÓBY`**.

### Krok 8. Próba na jednym quizie

```bash
npm run scrape -- --limit=1 --headed
```

Zobaczysz, jak program sam przechodzi jeden quiz. Niczego nie klikaj w tym oknie —
po prostu poczekaj, aż się zamknie.

### Krok 9. Wszystkie quizy

```bash
npm run scrape
```

To może potrwać dłużej — przeglądarki nie widać, postęp jest wypisywany w terminalu.
Możesz przerwać w dowolnym momencie klawiszami **Ctrl + C**; zebrane dane zostają.
Ponowne uruchomienie tego samego polecenia kontynuuje od miejsca przerwania.

### Krok 10. Wyniki

```bash
npm run stats
```

Pokazuje, ile pytań zebrano i z których rozdziałów. Wszystkie pytania są w pliku
**`data/questions.json`** w folderze programu — to z niego powstaną fiszki.

---

## Gdy coś nie działa

| Co widzisz | Co zrobić |
| --- | --- |
| `'node' nie jest rozpoznawany…` albo `command not found: node` | Node.js nie jest zainstalowany (Krok 1) albo terminal był otwarty przed instalacją — zamknij go i otwórz ponownie. |
| Windows: `…npm.ps1 cannot be loaded because running scripts is disabled…` | Otwierasz PowerShell zamiast zwykłego terminala. Otwórz terminal tak, jak w Kroku 2 (wpisując `cmd` w pasku adresu folderu). |
| `Brak config/site.json` | Nie był wykonany Krok 4 — uruchom `npm run setup`. |
| `Brak data/auth.json` | Nie był wykonany Krok 5 — uruchom `npm run login`. |
| Program nagle trafia na stronę logowania albo nie znajduje pytań | Logowanie wygasło — uruchom ponownie `npm run login`, potem powtórz polecenie. |
| `niewypełnione pola z szablonu` | Krok 7 nie jest jeszcze zrobiony. |
| `WYNIK: SELEKTORY DO POPRAWKI` | Ustawienia z Kroku 7 wymagają poprawek — przekaż wynik asystentowi albo osobie, która przygotowała program. |
| Coś innego | Skopiuj cały tekst z terminala i pokaż go asystentowi AI albo osobie, która przygotowała program. |

---

Informacje dla osób technicznych: [docs/technical.md](docs/technical.md).
Instrukcja dla asystentów AI: [AGENTS.md](AGENTS.md).
