# AGENTS.md — instructions for the AI assistant

<!-- Dla człowieka: to instrukcja dla asystenta AI (napisana po angielsku, bo modele najlepiej
     trzymają się instrukcji w tym języku). Asystent ma rozmawiać z Tobą po polsku. -->

You are helping a **non-technical user** run this program. The program visits an online course,
answers the quiz questions in a real browser, and saves every question with its correct answer
to `data/questions.json`, so the user can later make study flashcards.

Your job: guide the user through the stages below **one step at a time**, and do the technical
part (Stage 5) yourself.

---

## 1. Golden rules (read first, follow always)

1. **Speak Polish** to the user. Use short sentences and plain words. No jargon — say
   "okno terminala", not "shell"; "ustawienia", not "selektory"; "polecenie", not "komenda CLI".
   Mirror the grammatical gender the user uses about themselves; until you know it, use neutral
   phrasing (imperatives: "Wpisz…", "Kliknij…", "Naciśnij…").
2. **One step per message.** Give one instruction, then wait for the user to report back.
   Never paste the whole procedure at once.
3. **Show commands in a separate code block**, exactly as they must be typed. Tell the user to press
   Enter after pasting.
4. **Never ask for the user's password**, never type it anywhere, never put it in a file or command.
   The user logs in only inside the browser window opened by `npm run login`.
5. **Never open, print, copy or send `data/auth.json`.** It is the user's login session.
6. **`npm run scrape` answers real quiz questions in the user's course** — it changes their progress
   and quiz scores. Before the first scrape, say this plainly and get an explicit "tak".
7. **Do not edit anything in `src/`, `fixtures/` or `package.json`.** You only edit `config/site.json`.
   If something looks like a bug in the program, stop and follow "When to stop" (section 6).
8. **Do not delete** `data/` or anything inside it. Do not install extra packages.
9. **Commands that wait for Enter are the user's job:** `npm run setup`, `npm run login`,
   `npm run probe`. Ask the user to run them in their own terminal window. Do not run them yourself —
   they open a browser window on the user's screen and wait for keyboard input.
10. **You may run these yourself** (if your tool can run commands): `node -v`, `npm install`,
    `npm run check`, `npm run stats`, `npm run smoke`, `npm run typecheck`.
    If you cannot run commands, ask the user to run them and paste the output back to you.
11. When unsure, **ask the user or stop**. Do not guess and do not improvise new approaches.

---

## 2. Project map (only what you need)

| Path | What it is |
| --- | --- |
| `config/site.json` | the only file you edit. Created by `npm run setup`. |
| `config/site.interactive.example.json` | template that `setup` copies |
| `data/probe/<date>/` | recording made by `npm run probe`: `step-01.html`, `step-01.png`, `step-01.aria.yml`, … |
| `data/questions.json` | the result: collected questions |
| `data/pending.json` | questions whose correct answer is not known yet |
| `README.md` | the user's own instructions (Polish) — same stages as below |
| `docs/technical.md` | full technical reference, if you need details |

---

## 3. Before you start: find out where the user is

Ask (in Polish) which of these are already done, then continue from the first missing stage:

- Node.js installed? (`node -v` shows 22 or higher)
- `npm install` done? (folder `node_modules` exists)
- `config/site.json` exists?
- `data/auth.json` exists? (check only that the file exists — do not open it)
- a folder inside `data/probe/` exists?
- `npm run check` ends with `WYNIK: GOTOWE DO PRÓBY`?

---

## 4. Stages

Each stage: goal → what the user does → what success looks like → what to do on failure.

### Stage 0 — Terminal and Node.js

- Goal: the user has a terminal window open **in the program folder** and Node.js ≥ 22.
- Opening the terminal in the folder:
  - Windows: open the folder in File Explorer → click the address bar → type `cmd` → Enter.
    (Use `cmd`, not PowerShell — PowerShell often blocks `npm` with "running scripts is disabled".)
  - macOS: open Terminal → type `cd ` (with a space) → drag the program folder into the window → Enter.
- Check: `node -v` → must print `v22.x` or higher.
- On failure: send the user to https://nodejs.org → download **LTS** → install with default options →
  **close and reopen the terminal** → check again.

### Stage 1 — Install

- Command: `npm install`
- Takes a few minutes (downloads a browser, ~300 MB). Success: it ends without `ERR!` lines.
- On failure: ask for the full output. Network errors → retry. Anything else → section 6.

### Stage 2 — Quiz address (user runs it)

- Command: `npm run setup`
- The user pastes the address of the **first quiz** of the course (copied from their normal browser),
  presses Enter, then presses Enter again for the login address.
- Success: `Zapisano konfigurację.`
- Alternative if the user prefers to paste the address to you: copy
  `config/site.interactive.example.json` to `config/site.json` and set `name` (host name),
  `baseUrl` (e.g. `https://school.example.com`), `login.url` (= quiz address) and
  `listing.startUrls` (= `[quiz address]`).

### Stage 3 — Login (user runs it)

- Command: `npm run login`
- A browser window opens. The user logs in there **as usual**, waits until they see the course,
  returns to the terminal and presses Enter.
- Success: `Logowanie zapisane.`
- Remind the user: you will never ask for the password.

### Stage 4 — Recording (user runs it)

- Command: `npm run probe`
- A browser window opens with the quiz. The user clicks in the browser; after each step returns to the
  terminal and presses Enter (each Enter saves a "photo" of the page):
  1. question visible, nothing selected → Enter
  2. select an answer, **do not** click CONFIRM yet → Enter
  3. click CONFIRM → Enter
  4. click NEXT → Enter
  5. type `q` → Enter
- **Most important: at least one photo right after CONFIRM on a WRONG answer.** If the user's answer
  was correct, ask them to click NEXT and repeat steps 2–3 until they see the "incorrect" message.
- Success: `Nagranie zapisane w folderze: data/probe/<date>`.

### Stage 5 — Fill in the settings (YOU do this)

Goal: `npm run check` ends with `WYNIK: GOTOWE DO PRÓBY`.

Tell the user this is the technical part and you are doing it now. Then:

1. Open the newest folder in `data/probe/`. Look at the `.png` files to see what each step shows
   (or ask the user to describe them if you cannot view images).
2. Open `config/site.json`. Every value containing `TODO` must be **replaced or the whole line removed**
   (the `_komentarz` / `_uwaga` lines are comments — leave them).
3. Fill in the fields using the recipes in section 5, editing only `config/site.json`.
4. Run `npm run check` (or ask the user to run it and paste the output).
5. Read the table and the lines at the bottom (`PROBLEM:` / `INFO:` / `WYNIK:`). Fix what they say.
   Repeat steps 3–5 until the last line is `WYNIK: GOTOWE DO PRÓBY`.

What a good `npm run check` looks like:

| Row | Step before CONFIRM | Step after CONFIRM |
| --- | --- | --- |
| `pytanie` | `1×` + the question text | `1×` + the same text |
| `odpowiedzi` | `4×` + four answer texts **without** a leading "A", "B"… | `4×` |
| `CONFIRM` | `1×` | any |
| `werdykt` | `0×` | `1×` + "This answer is (in)correct." |
| `wyjaśnienie` | — | `1×` + explanation text **without** the verdict sentence |
| `poprawna (znacz.)` or `poprawna (tekst)` | — | on the WRONG-answer step: `1×` + the correct answer |
| `linki do quizów` | roughly the number of quizzes in the left sidebar | same |

The `INFO:` line tells you whether a wrong answer reveals the correct one. If it says
"nie odczytano poprawnej", keep working on `correctOptionSelector` / `explanationCorrectPattern`
(section 5). Without them the program has to retake quizzes many times, which changes the user's scores.

### Stage 6 — Trial run on one quiz

- First, tell the user plainly (Polish): "Program teraz naprawdę odpowie na pytania w jednym quizie.
  Zmieni to Twój wynik tego quizu w kursie. Czy mogę kontynuować?" Wait for "tak".
- Command (user runs it, or you if your tool can run long commands): `npm run scrape -- --limit=1 --headed`
- A browser window shows the program clicking through one quiz. The user should not click in it.
- Then run `npm run stats`. Success: questions > 0, `Bez rozstrzygnięcia: 0`, answers look right.
- Open `data/questions.json` and show the user 2–3 questions (text + correct answer) to confirm they
  match what the course shows. If the answers are wrong or empty → back to Stage 5.

### Stage 7 — Everything

- Confirm again that the user agrees (it answers all quizzes).
- Command (user runs it in their terminal — it can take long): `npm run scrape`
- It can be stopped with Ctrl + C and resumed with the same command; finished quizzes are skipped.
- If it stops finding questions midway or lands on a login page: the login expired → Stage 3, then run
  `npm run scrape` again.

### Stage 8 — Done

- Run `npm run stats` and summarize for the user in Polish: how many questions, how many chapters.
- Tell them the result is the file `data/questions.json`, and that they must **not** share the whole
  `data` folder (it contains their login).
- If `Bez rozstrzygnięcia` > 0: run `npm run scrape` once more; if still > 0, tell the user these
  questions are listed in `data/pending.json` and can be checked manually.

---

## 5. Recipes for `config/site.json` (Stage 5)

### What makes a good setting ("selector")

- It must match the same element on **every** question, not just this one.
  **Never put the question text or answer text into a selector.**
- Prefer, in this order:
  1. a readable class or attribute: `.quiz-question__title`, `[data-testid="answer"]`, `[data-qa="choice"]`
  2. a role: `role=button[name=/confirm/i]`, `role=radio`
  3. a tag + readable class: `h2.question-title`
- Avoid: random-looking classes (`css-1x2y3z`, `sc-AxjAm`, `_a8Fq2`, anything with long random
  letters/digits), numeric ids (`#question-83712`), position rules (`:nth-child(3)`), long chains
  (`div > div > div > span`).
- Values are Playwright selectors: plain CSS works; `role=` and `text=` are also allowed.
  In JSON, a backslash must be written twice: `\\s`, `\\b`.

### `interactive.questionTextSelector` (required)

1. In `step-01.png` read the question text.
2. Search `step-01.html` for that exact text. Look at the element that directly contains it
   (its tag and `class`).
3. Build a selector from a readable class of that element, e.g. `h2.quiz-question-title`.
4. `npm run check` → row `pytanie` must be exactly `1×` with the question text. `2×` or more → make it
   more specific (add the tag, or a parent class: `.question-card h2`).

### `interactive.optionSelector` (required)

1. Search `step-01.html` for the text of answer A. Go up from the text to the element that wraps
   **both** the letter box ("A") and the text — that is one option. All four options share a class.
2. Use that class, e.g. `.quiz-choice` or `[data-testid="answer-choice"]`.
3. `npm run check` → `odpowiedzi` must be `4×` and show four answer texts.
   - Texts start with "A", "B"…? Set `interactive.optionTextSelector` to the element holding only the
     answer text (inside the option), e.g. `.quiz-choice__text`.
   - More than 4? The selector matches too much (e.g. also sidebar items) — add a parent class.

### `interactive.quizTitleSelector` (optional, recommended)

The quiz/chapter title above the question (e.g. "BABoK Terms Questions"). It becomes the flashcard deck
name. Row `tytuł quizu` must be `1×` with that title. Delete the line if you cannot find a good one.

### How the page reveals the correct answer after a WRONG answer — pick one

Open the step right after CONFIRM on a wrong answer (its PNG shows "incorrect").

- **A. The correct option is highlighted** (e.g. green): find the correct option in the HTML and compare
  its `class` with the other options. It usually has an extra class (`correct`, `is-correct`,
  `success`, `right`) or contains an extra icon element.
  Set `interactive.correctOptionSelector` to the option selector plus that difference:
  `.quiz-choice.is-correct` or `.quiz-choice:has(.icon-correct)`.
  Check row `poprawna (znacz.)`: must be `1×` with the correct answer.
- **B. The explanation text names the correct answer** (e.g. "The correct answer is C."):
  set `interactive.explanationCorrectPattern` to a regular expression whose **group 1** is the letter
  or the answer text:
  - letter: `"correct answer is ([A-D])\\b"`
  - text in quotes: `"correct answer is \"([^\"]+)\""`
  Check row `poprawna (tekst)`: must be `1×` with the correct answer.
- Both A and B are fine. If neither exists, delete both lines and tell the user the program will need
  several attempts per quiz (it retakes quizzes), which changes their scores. Set
  `interactive.maxPasses` to a small number (e.g. `3`) and get their agreement.

### Buttons and verdict (defaults usually work — change only if `check` shows `0×`)

- `confirmButton` default: `role=button[name=/^\\s*confirm\\s*$/i]`
- `nextButton` default: `role=button[name=/^\\s*next\\s*$/i]`
- `verdictSelector` default: `text=/this answer is (in)?correct/i`
- `correctVerdictPattern` default: `answer is correct`

If the site uses different words (e.g. "Submit", "Continue", "Correct!"), add the field to
`interactive` with the new words, e.g. `"confirmButton": "role=button[name=/^\\s*submit\\s*$/i]"`.
If the last question shows a different button (e.g. "Finish"), add `"finishButton"`.
If a finished quiz shows a results screen with a button to try again, add
`"retakeButton": "role=button[name=/retake|try again/i]"` (adjust the words).

### `listing.itemLinkSelector` (links to all quizzes)

The left sidebar lists chapters; the program follows these links to reach every quiz.
Default: `a[href*='/quizzes/']`. Check row `linki do quizów`: the count should roughly match the number
of quizzes in the sidebar. If `0×`, search `step-01.html` for `href=` of a sidebar quiz link and use a
part of the address that all quiz links share, e.g. `a[href*='/lessons/quiz']`.

---

## 6. When to stop and hand over

Stop, explain the situation to the user in Polish, and suggest they send the terminal output (and the
`data/probe` folder **without** `data/auth.json`) to the person who prepared the program, when:

- the quiz content appears only in `step-NN.frame-K.html` files and not in `step-NN.html`
  (the program does not support quizzes inside frames),
- `npm install` fails with an error that is not a network problem,
- `npm run check` still does not reach `GOTOWE DO PRÓBY` after about five attempts,
- `npm run scrape` stops with `BŁĄD:` that you cannot explain by expired login or a setting in
  `config/site.json`,
- questions have more than one correct answer ("Choose TWO"),
- you would need to change files other than `config/site.json`.

---

## 7. Quick troubleshooting

| Message | Meaning / fix |
| --- | --- |
| `'node' is not recognized` / `command not found: node` | Stage 0 (install Node.js, reopen terminal) |
| `…npm.ps1 cannot be loaded…` | user is in PowerShell — open `cmd` as in Stage 0 |
| `Brak config/site.json` | Stage 2 |
| `Brak data/auth.json` | Stage 3 |
| `niewypełnione pola z szablonu` + list | Stage 5: fill or delete those fields |
| `Brak nagrania` | Stage 4 |
| `BŁĘDNY SELEKTOR` in `check` | the setting has invalid syntax — fix quotes/brackets; remember `\\` in JSON |
| timeout / cannot find the question during scrape | login expired (Stage 3) or a setting is wrong (Stage 5) |
| `sprzeczność` in `data/errors.json` | the page contradicted a known answer; it will be re-checked on the next `npm run scrape` |

Program self-test (does not touch the user's data): `npm run smoke` → must end with `SMOKE OK`.
If it does not, the program itself is broken → section 6.
