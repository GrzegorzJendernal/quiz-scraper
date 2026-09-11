import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { CONFIG_DIR, ROOT } from '../paths.js';
import type { Question, ResolvedBy } from '../types.js';

/**
 * Smoke test bez wychodzenia do internetu: scrape leci po lokalnych plikach z fixtures/.
 *
 * - static:             paginacja po linkach, klik „pokaż rozwiązanie”, wielokrotny wybór, deduplikacja
 * - interactive/marker: po złej odpowiedzi strona oznacza poprawną opcję → 1 podejście
 * - interactive/text:   po złej odpowiedzi wyjaśnienie podaje literę poprawnej → 1 podejście
 * - interactive/none:   tylko werdykt → poprawna wydedukowana w kolejnych podejściach
 */
const SMOKE_ROOT = path.join(ROOT, '.smoke');
const FIXTURES_URL = pathToFileURL(path.join(ROOT, 'fixtures')).toString();
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

let failures = 0;

/** Uruchamia komendę z src/cli z odizolowanym katalogiem danych i konfiguracją; `input` trafia na stdin. */
function runCli(command: string, args: string[], dataDir: string, configFile: string, input?: string) {
  return spawnSync(process.execPath, [TSX_CLI, path.join(ROOT, 'src', 'cli', `${command}.ts`), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    env: {
      ...process.env,
      QUIZ_SCRAPER_CONFIG: configFile,
      QUIZ_SCRAPER_DATA: dataDir,
      QUIZ_SCRAPER_FORCE_HEADLESS: '1',
    },
  });
}

/** Konfiguracja interaktywna z szablonu fixture'a, z nadpisaniami, zapisana w `dir`. */
function writeInteractiveConfig(dir: string, reveal: string, extra: Record<string, unknown>): string {
  const config = JSON.parse(
    fs
      .readFileSync(path.join(CONFIG_DIR, 'site.fixture-interactive.json'), 'utf8')
      .replaceAll('FIXTURES/', `${FIXTURES_URL}/`)
      .replaceAll('REVEAL', reveal),
  ) as { interactive: Record<string, unknown> };
  Object.assign(config.interactive, extra);
  const file = path.join(dir, 'site.json');
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
  return file;
}

function check(condition: boolean, message: string): void {
  console.log(`${condition ? 'OK  ' : 'FAIL'} ${message}`);
  if (!condition) failures += 1;
}

/** Uruchamia scrape z konfiguracją z szablonu; zwraca zebrane pytania i stdout. */
function runScenario(
  name: string,
  template: string,
  patch: (config: Record<string, unknown>) => void = () => undefined,
): { questions: Question[]; pending: unknown[]; stdout: string } {
  const dir = path.join(SMOKE_ROOT, name);
  fs.mkdirSync(dir, { recursive: true });

  const config = JSON.parse(
    fs.readFileSync(path.join(CONFIG_DIR, template), 'utf8').replaceAll('FIXTURES/', `${FIXTURES_URL}/`),
  ) as Record<string, unknown>;
  patch(config);
  fs.writeFileSync(path.join(dir, 'site.json'), JSON.stringify(config, null, 2), 'utf8');
  // Pusta, ale poprawna sesja — fixtures nie wymagają logowania.
  fs.writeFileSync(path.join(dir, 'auth.json'), '{"cookies":[],"origins":[]}', 'utf8');

  const result = runCli('scrape', [], dir, path.join(dir, 'site.json'));

  console.log(`\n=== ${name} ===`);
  console.log(result.stdout.trimEnd());
  if (result.stderr.trim()) console.log(result.stderr.trimEnd());
  if (result.status !== 0) {
    check(false, `scrape zakończył się kodem ${String(result.status)}`);
    return { questions: [], pending: [], stdout: result.stdout };
  }

  const read = (file: string): unknown[] =>
    fs.existsSync(path.join(dir, file)) ? (JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as unknown[]) : [];
  return { questions: read('questions.json') as Question[], pending: read('pending.json'), stdout: result.stdout };
}

function correctOf(questions: Question[], fragment: string): string | undefined {
  return questions.find((q) => q.text.includes(fragment))?.answers.find((a) => a.correct)?.text;
}

function resolvedByOf(questions: Question[], fragment: string): ResolvedBy | undefined {
  return questions.find((q) => q.text.includes(fragment))?.resolvedBy;
}

function staticScenario(): void {
  const { questions } = runScenario('static', 'site.fixture.json');
  console.log('--- asercje ---');
  check(questions.length === 3, `3 unikalne pytania (deduplikacja), jest ${questions.length}`);
  check(questions.every((q) => q.answers.some((a) => a.correct)), 'każde pytanie ma poprawną odpowiedź');
  check(correctOf(questions, 'IPv6') === '128', 'klik „pokaż rozwiązanie” odsłonił ukryte odpowiedzi');
  check(
    questions.find((q) => q.text.includes('relacyjnymi'))?.answers.filter((a) => a.correct).length === 2,
    'pytanie wielokrotnego wyboru ma 2 poprawne odpowiedzi',
  );
  check(questions.some((q) => q.explanation), 'wyjaśnienie wyciągnięte');
}

function interactiveAssertions(questions: Question[], pending: unknown[]): void {
  check(questions.length === 3, `3 rozstrzygnięte pytania, jest ${questions.length}`);
  check(pending.length === 0, `brak nierozstrzygniętych, jest ${pending.length}`);
  check(correctOf(questions, 'HTTP stand') === 'HyperText Transfer Protocol', 'HTTP → HyperText Transfer Protocol');
  check(correctOf(questions, 'FIFO') === 'Queue', 'FIFO → Queue');
  check(correctOf(questions, 'Not Found') === '404', 'Not Found → 404');
  check(questions.every((q) => q.deck === 'Fixture Terms Questions'), 'deck = tytuł quizu');
  check(questions.every((q) => q.explanation && !/answer is (in)?correct/i.test(q.explanation)), 'wyjaśnienie bez werdyktu');
  check(questions.every((q) => q.answers.length === 4 && !/^[A-D]\s/.test(q.answers[0]!.text)), 'odpowiedzi bez liter A–D');
}

function interactiveScenarios(): void {
  const withReveal = (reveal: string, extra: Record<string, unknown>) => (config: Record<string, unknown>) => {
    const listing = config.listing as { startUrls: string[] };
    listing.startUrls = listing.startUrls.map((u) => u.replace('REVEAL', reveal));
    Object.assign(config.interactive as Record<string, unknown>, extra);
  };

  const marker = runScenario('interactive-marker', 'site.fixture-interactive.json',
    withReveal('marker', { correctOptionSelector: '.option.is-correct' }));
  console.log('--- asercje ---');
  interactiveAssertions(marker.questions, marker.pending);
  check(marker.stdout.includes('podejść: 1'), 'wystarczyło 1 podejście');
  check(resolvedByOf(marker.questions, 'FIFO') === 'marked', 'FIFO rozstrzygnięte znacznikiem na opcji');

  const text = runScenario('interactive-text', 'site.fixture-interactive.json',
    withReveal('text', { explanationCorrectPattern: 'correct answer is ([A-D])\\b' }));
  console.log('--- asercje ---');
  interactiveAssertions(text.questions, text.pending);
  check(text.stdout.includes('podejść: 1'), 'wystarczyło 1 podejście');
  check(resolvedByOf(text.questions, 'FIFO') === 'explanation', 'FIFO rozstrzygnięte z treści wyjaśnienia');

  const none = runScenario('interactive-none', 'site.fixture-interactive.json', withReveal('none', {}));
  console.log('--- asercje ---');
  interactiveAssertions(none.questions, none.pending);
  check(/podejść: [2-5]/.test(none.stdout), 'potrzebne kolejne podejścia (Retake)');
  check(resolvedByOf(none.questions, 'FIFO') === 'elimination', 'FIFO wydedukowane przez eliminację');
  check(resolvedByOf(none.questions, 'Not Found') === 'feedback', 'Not Found trafione przy odwróconej kolejności');
}

/** setup → login → probe → check: komendy, przez które asystent prowadzi użytkownika. */
async function toolsScenario(): Promise<void> {
  const dir = path.join(SMOKE_ROOT, 'tools');
  fs.mkdirSync(dir, { recursive: true });
  console.log('\n=== setup / login / probe / check ===');

  // setup: adres quizu + Enter (logowanie = adres quizu)
  const setupConfig = path.join(dir, 'setup-site.json');
  const quizUrl = 'https://szkola.example.com/courses/take/kurs/quizzes/123-pierwszy-quiz';
  const setup = runCli('setup', [], dir, setupConfig, `nie-adres\n${quizUrl}\n\n`);
  const written = fs.existsSync(setupConfig)
    ? (JSON.parse(fs.readFileSync(setupConfig, 'utf8')) as { baseUrl: string; login: { url: string }; listing: { startUrls: string[] } })
    : null;
  check(setup.status === 0 && written !== null, 'setup zapisał konfigurację');
  check(setup.stdout.includes('nie wygląda na adres'), 'setup odrzucił niepoprawny adres i zapytał ponownie');
  check(written?.listing.startUrls[0] === quizUrl && written.login.url === quizUrl, 'setup: adres quizu = start i logowanie');
  check(written?.baseUrl === 'https://szkola.example.com', 'setup: baseUrl z adresu quizu');

  // login: Enter → zapis sesji
  const config = writeInteractiveConfig(dir, 'text', { explanationCorrectPattern: 'correct answer is ([A-D])\\b' });
  const login = runCli('login', [], dir, config, '\n');
  check(login.status === 0 && fs.existsSync(path.join(dir, 'auth.json')), 'login zapisał sesję (auth.json)');

  // probe: jeden zrzut i koniec
  const probeUrl = `${FIXTURES_URL}/interactive-quiz.html?reveal=text`;
  const probe = runCli('probe', [probeUrl], dir, config, '\nq\n');
  const probeRoot = path.join(dir, 'probe');
  const recording = fs.existsSync(probeRoot) ? fs.readdirSync(probeRoot).map((d) => path.join(probeRoot, d))[0] : undefined;
  check(
    probe.status === 0 && !!recording && ['html', 'aria.yml', 'png'].every((ext) => fs.existsSync(path.join(recording, `step-01.${ext}`))),
    'probe zapisał step-01 (html, aria.yml, png)',
  );
  if (!recording) return;

  // Dogrywamy krok po CONFIRM przy złej odpowiedzi — to, co użytkownik zrobiłby ręcznie w oknie.
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(probeUrl);
  await page.locator('.option').nth(1).click();
  await page.getByRole('button', { name: 'CONFIRM' }).click();
  await page.getByText('This answer is incorrect.').waitFor();
  fs.writeFileSync(path.join(recording, 'step-02.html'), await page.content(), 'utf8');
  await browser.close();

  const good = runCli('check', [recording], dir, config);
  console.log(good.stdout.trimEnd());
  check(good.status === 0 && good.stdout.includes('WYNIK: GOTOWE DO PRÓBY'), 'check: poprawne selektory → GOTOWE DO PRÓBY');
  check(good.stdout.includes('zdradza poprawną („HyperText Transfer Protocol”)'), 'check: wyczytał poprawną z wyjaśnienia');

  const badConfig = writeInteractiveConfig(dir, 'text', { optionSelector: '.nie-ma-takiej-klasy' });
  const bad = runCli('check', [recording], dir, badConfig);
  check(bad.status === 2 && bad.stdout.includes('WYNIK: SELEKTORY DO POPRAWKI'), 'check: zły selektor → SELEKTORY DO POPRAWKI');
}

async function main(): Promise<void> {
  fs.rmSync(SMOKE_ROOT, { recursive: true, force: true });
  staticScenario();
  interactiveScenarios();
  await toolsScenario();

  if (failures > 0) {
    console.error(`\nSMOKE FAIL: ${failures} asercji nie przeszło (dane w .smoke/)`);
    process.exit(1);
  }
  fs.rmSync(SMOKE_ROOT, { recursive: true, force: true });
  console.log('\nSMOKE OK');
}

main().catch((error: unknown) => {
  console.error(`\nSMOKE BŁĄD: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
