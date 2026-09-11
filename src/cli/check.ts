import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { loadSiteConfig } from '../config.js';
import { correctFromExplanation, correctFromMarkers, optionText, readExplanation } from '../interactive.js';
import { normalizeText } from '../store.js';
import { PROBE_DIR } from '../paths.js';
import type { InteractiveConfig } from '../types.js';

/**
 * Sprawdza selektory z config/site.json na zrzutach z `npm run probe` — offline,
 * bez logowania i bez klikania w kursie. Na końcu drukuje jednoznaczny werdykt.
 *
 * Użycie: npm run check [-- <katalog-nagrania | plik.html>]   (domyślnie: najnowsze nagranie)
 */

interface StepReport {
  file: string;
  question: number;
  options: number;
  confirm: number;
  verdict: number;
  verdictIsCorrect: boolean | null;
  resolvedFromPage: string[];
}

function latestProbeDir(): string | null {
  if (!fs.existsSync(PROBE_DIR)) return null;
  const dirs = fs
    .readdirSync(PROBE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const last = dirs.at(-1);
  return last ? path.join(PROBE_DIR, last) : null;
}

function stepFiles(target: string): string[] {
  if (fs.statSync(target).isFile()) return [target];
  return fs
    .readdirSync(target)
    .filter((f) => /^step-\d+\.html$/.test(f))
    .sort()
    .map((f) => path.join(target, f));
}

const clip = (text: string, max = 60): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function row(label: string, count: number | string, sample = ''): void {
  const value = typeof count === 'number' ? `${count}×` : count;
  console.log(`  ${label.padEnd(17)} ${value.padStart(4)}  ${sample}`);
}

/** Liczba dopasowań selektora; błędna składnia selektora → -1 i komunikat. */
async function countOf(page: Page, label: string, selector: string | undefined): Promise<number> {
  if (!selector) {
    row(label, '-', '(nieustawione)');
    return 0;
  }
  try {
    const locator = page.locator(selector);
    const count = await locator.count();
    const sample = count > 0 ? normalizeText(await locator.first().innerText().catch(() => '')) : '';
    row(label, count, sample ? `„${clip(sample)}”` : '');
    return count;
  } catch (error: unknown) {
    row(label, 'ERR', `BŁĘDNY SELEKTOR: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`);
    return -1;
  }
}

async function checkStep(page: Page, file: string, cfg: InteractiveConfig, itemLinkSelector?: string): Promise<StepReport> {
  const html = fs.readFileSync(file, 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, '');
  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  console.log(`\n${path.basename(file)}`);
  const report: StepReport = {
    file,
    question: await countOf(page, 'pytanie', cfg.questionTextSelector),
    options: 0,
    confirm: 0,
    verdict: 0,
    verdictIsCorrect: null,
    resolvedFromPage: [],
  };

  // Odpowiedzi — pokaż wszystkie teksty, bo tu najłatwiej o pomyłkę (litery A–D, zbyt szeroki selektor).
  let options: string[] = [];
  try {
    const locator = page.locator(cfg.optionSelector);
    report.options = await locator.count();
    for (let i = 0; i < report.options; i += 1) options.push(await optionText(locator.nth(i), cfg).catch(() => '?'));
    row('odpowiedzi', report.options, options.map((o) => `„${clip(o, 30)}”`).join(' | '));
  } catch (error: unknown) {
    row('odpowiedzi', 'ERR', `BŁĘDNY SELEKTOR: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`);
    options = [];
  }

  await countOf(page, 'licznik', cfg.counterSelector);
  await countOf(page, 'tytuł quizu', cfg.quizTitleSelector);
  report.confirm = await countOf(page, 'CONFIRM', cfg.confirmButton);
  await countOf(page, 'NEXT', cfg.nextButton);
  report.verdict = await countOf(page, 'werdykt', cfg.verdictSelector);

  if (report.verdict > 0) {
    const verdict = page.locator(cfg.verdictSelector).first();
    const verdictText = normalizeText(await verdict.innerText());
    report.verdictIsCorrect = new RegExp(cfg.correctVerdictPattern, 'i').test(verdictText);
    const explanation = await readExplanation(page, cfg, verdict, verdictText).catch(() => undefined);
    row('wyjaśnienie', explanation ? 1 : 0, explanation ? `„${clip(explanation, 80)}”` : '');
    row('werdykt = dobrze?', report.verdictIsCorrect ? 'TAK' : 'NIE');

    const marked = await correctFromMarkers(page, cfg, options).catch(() => []);
    const fromText = correctFromExplanation(cfg, explanation, options);
    row('poprawna (znacz.)', cfg.correctOptionSelector ? marked.length : '-', marked.map((m) => `„${clip(m, 40)}”`).join(' | '));
    row('poprawna (tekst)', cfg.explanationCorrectPattern ? fromText.length : '-', fromText.map((m) => `„${clip(m, 40)}”`).join(' | '));
    report.resolvedFromPage = marked.length > 0 ? marked : fromText;
  }

  if (itemLinkSelector) {
    try {
      const links = await page.locator(itemLinkSelector).evaluateAll((els) =>
        els.map((el) => (el as HTMLAnchorElement).getAttribute('href') ?? ''),
      );
      row('linki do quizów', links.length, links.slice(0, 3).join('  '));
    } catch (error: unknown) {
      row('linki do quizów', 'ERR', `BŁĘDNY SELEKTOR: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`);
    }
  }

  return report;
}

async function main(): Promise<void> {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : latestProbeDir();
  if (!target || !fs.existsSync(target)) {
    console.error('Brak nagrania. Najpierw: npm run probe -- <adres-quizu>');
    process.exitCode = 1;
    return;
  }

  const config = loadSiteConfig({ requireSelectors: false });
  const cfg = config.interactive;
  if (config.mode !== 'interactive' || !cfg) {
    console.error('npm run check działa dla mode = "interactive" (config/site.json).');
    process.exitCode = 1;
    return;
  }

  const files = stepFiles(target);
  if (files.length === 0) {
    console.error(`Brak plików step-NN.html w: ${target}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Nagranie: ${target}`);
  console.log('Kolumny: co sprawdzam | ile elementów pasuje | przykładowy tekst');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  // Offline: zrzut ma się wyrenderować bez dociągania czegokolwiek ze strony kursu.
  await context.route('**/*', (route) => route.abort());
  const page = await context.newPage();

  const reports: StepReport[] = [];
  try {
    for (const file of files) reports.push(await checkStep(page, file, cfg, config.listing.itemLinkSelector));
  } finally {
    await browser.close();
  }

  const problems: string[] = [];
  const hints: string[] = [];
  const unanswered = reports.find((r) => r.question === 1 && r.options >= 2 && r.confirm >= 1);
  const answered = reports.filter((r) => r.verdict > 0);
  const wrong = answered.find((r) => r.verdictIsCorrect === false);

  if (reports.some((r) => r.question > 1)) problems.push('„pytanie” pasuje do więcej niż 1 elementu — zawęź questionTextSelector.');
  if (!reports.some((r) => r.question === 1)) problems.push('„pytanie” nie pasuje do niczego — popraw questionTextSelector.');
  if (!reports.some((r) => r.options >= 2)) problems.push('„odpowiedzi” — mniej niż 2 dopasowania; popraw optionSelector.');
  if (reports.some((r) => r.options > 6)) problems.push('„odpowiedzi” — podejrzanie dużo dopasowań; optionSelector łapie za dużo.');
  if (!unanswered) problems.push('Brak kroku z pytaniem, odpowiedziami i przyciskiem CONFIRM (sprawdź confirmButton).');
  if (answered.length === 0) problems.push('Żaden krok nie ma werdyktu — nagraj krok po CONFIRM albo popraw verdictSelector.');
  if (answered.some((r) => r.question !== 1 || r.options < 2)) {
    problems.push('Po CONFIRM pytanie/odpowiedzi znikają z selektorów — muszą pasować także po odpowiedzi.');
  }

  if (!wrong) {
    hints.push('W nagraniu nie ma złej odpowiedzi — nie da się sprawdzić, jak strona zdradza poprawną.');
  } else if (wrong.resolvedFromPage.length === 1) {
    hints.push(`Zła odpowiedź → strona zdradza poprawną („${clip(wrong.resolvedFromPage[0]!, 40)}”). Wystarczy 1 podejście na quiz.`);
  } else {
    hints.push(
      'Zła odpowiedź → nie odczytano poprawnej. Ustaw correctOptionSelector albo explanationCorrectPattern; ' +
        'bez tego skrypt będzie powtarzał quizy (Retake), co zmienia wyniki na koncie.',
    );
  }

  console.log('\n' + '='.repeat(70));
  for (const hint of hints) console.log(`INFO: ${hint}`);
  if (problems.length > 0) {
    for (const problem of problems) console.log(`PROBLEM: ${problem}`);
    console.log('WYNIK: SELEKTORY DO POPRAWKI');
    process.exitCode = 2;
  } else {
    console.log('WYNIK: GOTOWE DO PRÓBY (npm run scrape -- --limit=1 --headed)');
  }
}

main().catch((error: unknown) => {
  console.error(`\nBŁĄD: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
