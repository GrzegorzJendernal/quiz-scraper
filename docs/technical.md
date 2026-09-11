# quiz-scraper — dokumentacja techniczna

Playwright + TypeScript (uruchamiane przez `tsx`, bez kroku budowania). Node.js ≥ 22.
Instrukcja dla osób nietechnicznych: [README.md](../README.md). Procedura dla asystentów AI: [AGENTS.md](../AGENTS.md).

## Komendy

| Komenda | Interaktywna? | Co robi |
| --- | --- | --- |
| `npm run setup` | tak | kreator: adres quizu → `config/site.json` z szablonu interaktywnego |
| `npm run login` | tak (okno + Enter) | ręczne logowanie w oknie przeglądarki → `data/auth.json` (storageState) |
| `npm run probe [-- <url>]` | tak (okno + Enter) | nagrywa kroki quizu: HTML, ARIA, PNG, odpowiedzi JSON z API → `data/probe/<stamp>/`; domyślny URL = `listing.startUrls[0]` |
| `npm run check [-- <katalog\|plik.html>]` | nie | sprawdza selektory offline na nagraniu (domyślnie najnowszym); exit 0 = `GOTOWE DO PRÓBY`, 2 = `SELEKTORY DO POPRAWKI` |
| `npm run scrape [-- --limit=N --headed --force]` | nie | właściwe zbieranie |
| `npm run stats` | nie | podsumowanie danych lokalnych |
| `npm run inspect -- <url>` | nie | tryb statyczny: zrzut + kandydaci na selektory + test ekstrakcji |
| `npm run smoke` | nie | pełne testy na `fixtures/` bez internetu |
| `npm run typecheck` / `npm run lint` | nie | TS / ESLint |

## Dwa tryby

| Tryb | Kiedy | Jak działa |
| --- | --- | --- |
| `interactive` | jedno pytanie na ekranie: zaznacz → **CONFIRM** → werdykt + wyjaśnienie → **NEXT** | skrypt przeklikuje quiz i czyta werdykt po każdej odpowiedzi |
| `static` | poprawne odpowiedzi oznaczone w HTML od razu | czyta DOM, niczego nie klika |

### Jak tryb interaktywny ustala poprawną odpowiedź

Dla każdego pytania: zaznacz → CONFIRM → sprawdź w kolejności (wartość trafia do `resolvedBy`):

1. **`feedback`** — werdykt pasuje do `correctVerdictPattern` → zaznaczona jest poprawna.
2. **`marked`** — po złej odpowiedzi strona oznacza poprawną opcję (`correctOptionSelector`).
3. **`explanation`** — `explanationCorrectPattern` wyciąga poprawną z wyjaśnienia (grupa 1 = litera w kolejności wyświetlania albo tekst).
4. **`elimination`** — zła odpowiedź → `data/pending.json` (`eliminated`), quiz powtarzany (Retake), aż zostanie jedna opcja; limit `maxPasses`.

Przy 2. lub 3. wystarcza jedno przejście. Znane pytania są w kolejnych podejściach klikane poprawnie.
Rozstrzygnięcie sprzeczne z późniejszym werdyktem wraca do puli (`errors.json`: „sprzeczność”).
Silniejsze źródło nadpisuje słabsze: `feedback` > `marked` > `explanation` > `elimination`.

Ograniczenia: zakłada jedną poprawną odpowiedź na pytanie; nie obsługuje treści quizu w `<iframe>`
(`probe` zapisuje ramki jako `step-NN.frame-K.html` — jeśli treść jest tylko tam, trzeba rozszerzyć silnik).

### Pola `interactive`

Wartości to selektory Playwrighta: CSS albo silniki `role=` / `text=` (np. `role=button[name=/confirm/i]`).

| Pole | Domyślnie | Znaczenie |
| --- | --- | --- |
| `questionTextSelector` | — (wymagane) | treść pytania; musi pasować do dokładnie 1 elementu |
| `optionSelector` | — (wymagane) | pojedyncza klikalna odpowiedź |
| `optionTextSelector` | — | tekst wewnątrz opcji; bez niego z innerText zdejmowana jest litera „A” (`A\n…`, `A.`, `A)`) |
| `confirmButton` | `role=button[name=/^\s*confirm\s*$/i]` | |
| `nextButton` | `role=button[name=/^\s*next\s*$/i]` | |
| `finishButton`, `startButton`, `retakeButton` | — | koniec quizu / ekran startowy / ponowne podejście |
| `verdictSelector` | `text=/this answer is (in)?correct/i` | element z werdyktem |
| `correctVerdictPattern` | `answer is correct` | regex (flaga `i`) werdyktu poprawnej odpowiedzi |
| `explanationSelector` | — | bez niego: tekst rodzica werdyktu minus werdykt |
| `explanationCorrectPattern` | — | regex z grupą 1 |
| `correctOptionSelector` | — | opcja oznaczona jako poprawna po CONFIRM |
| `counterSelector` | `text=/question\s+\d+\s+of\s+\d+/i` | rozpoznaje ostatnie pytanie |
| `quizTitleSelector` | — | → pole `deck` |
| `maxPasses` | `5` | limit podejść do jednego quizu |

Wartości zawierające `TODO` blokują `scrape` z listą pól. `login`, `probe`, `check`, `inspect`
wymagają tylko `login` i `crawl` (ładują konfigurację z `requireSelectors: false`).

### Tryb statyczny — pola `question`

| Pole | Znaczenie |
| --- | --- |
| `containerSelector` | kontener jednego pytania |
| `textSelector`, `answerSelector`, `correctAnswerSelector`, `explanationSelector` | względem kontenera (CSS) |
| `revealSelector` | przycisk „pokaż rozwiązanie”, klikany przed odczytem |

Szablon: `config/site.example.json`.

### Wspólne

| Pole | Znaczenie |
| --- | --- |
| `listing.startUrls` | strony startowe (quiz / listing) |
| `listing.itemLinkSelector` | linki do kolejnych stron/quizów (np. sidebar); CSS |
| `listing.nextPageSelector`, `listing.maxPages` | paginacja listingu |
| `login.mode` | `manual` (domyślnie) albo `auto` (`SITE_USER` / `SITE_PASSWORD` z `.env`) |
| `crawl.delayMs`, `crawl.timeoutMs`, `crawl.headless`, `crawl.waitUntil` | |

## Dane (`data/`, w `.gitignore`)

```
questions.json   rozstrzygnięte pytania
pending.json     pytania bez znanej odpowiedzi (interactive)
visited.json     zakończone strony/quizy (quiz dopiero, gdy nie ma pending)
errors.json      błędy i sprzeczności
auth.json        storageState przeglądarki — prywatne
probe/           nagrania z `probe` (w tym network/*.json z API strony)
inspect/         zrzuty z `inspect`
```

Rekord:

```json
{
  "id": "9f2b1c4d5e6f7a8b",
  "sourceUrl": "https://…/quizzes/…",
  "deck": "BABoK Terms Questions",
  "text": "Business analysis can be defined as",
  "answers": [
    { "text": "Practice of bringing about change", "correct": true },
    { "text": "Developing a new software", "correct": false }
  ],
  "explanation": "Definition",
  "resolvedBy": "feedback",
  "scrapedAt": "2026-09-11T10:00:00.000Z"
}
```

`id` = sha1(treść + posortowane odpowiedzi) — tasowanie odpowiedzi nie tworzy duplikatów,
a różne pytania o tej samej treści się nie sklejają. Zapis atomowy (tmp + rename) po każdym pytaniu i przy Ctrl+C.

## Zmienne środowiskowe (testy)

| Zmienna | Znaczenie |
| --- | --- |
| `QUIZ_SCRAPER_CONFIG` | inna ścieżka konfiguracji (względem katalogu projektu) |
| `QUIZ_SCRAPER_DATA` | inny katalog danych |
| `QUIZ_SCRAPER_FORCE_HEADLESS` | wymusza tryb bez okna (także `login`/`probe`) |

## Smoke test

`npm run smoke` — bez internetu, na `fixtures/`:

- `static` — paginacja, „pokaż rozwiązanie”, wielokrotny wybór, deduplikacja,
- `interactive-marker` / `interactive-text` — poprawna zdradzona po złej odpowiedzi → 1 podejście,
- `interactive-none` — tylko werdykt → eliminacja przez Retake przy tasowanej kolejności,
- `setup / login / probe / check` — kreator, zapis sesji, nagranie, werdykt `check` (pozytywny i negatywny).

Uruchamiaj po każdej zmianie w `src/`. Nie dotyka `data/` ani `config/site.json`.

## Możliwe rozszerzenie: dane z API

`probe` zapisuje odpowiedzi JSON z XHR/fetch do `data/probe/<stamp>/network/`. Jeśli API quizu
zwraca poprawne odpowiedzi, można zbierać dane bez klikania (bez wpływu na wyniki na koncie).
Niezaimplementowane — wymaga obejrzenia prawdziwych odpowiedzi API.

## Udostępnianie programu

Pakując folder dla innej osoby, pomiń: `node_modules/` (zależy od systemu — odbiorca robi `npm install`),
`data/`, `.smoke/`, `config/site.json`, `.env`.
