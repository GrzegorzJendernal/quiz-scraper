import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, loadSiteConfig } from '../config.js';
import { hasAuthState, openSession } from '../browser.js';
import { extractQuestions } from '../extract.js';
import { INSPECT_DIR } from '../paths.js';

/**
 * Pomocnik do pisania selektorów: wchodzi na podaną stronę (z zapisaną sesją),
 * zrzuca HTML + screenshot i wypisuje kandydatów na kontenery pytań/odpowiedzi.
 * Jeśli config/site.json już istnieje, od razu testuje na nim ekstrakcję.
 */
async function main(): Promise<void> {
  loadEnv();
  const url = process.argv[2];
  if (!url) {
    console.error('Użycie: npm run inspect -- <url>');
    process.exitCode = 1;
    return;
  }

  const config = loadSiteConfig({ requireSelectors: false });
  const session = await openSession(config, { headless: true, useAuth: hasAuthState() });
  const page = await session.context.newPage();

  try {
    await page.goto(url, { waitUntil: config.crawl.waitUntil });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    fs.mkdirSync(INSPECT_DIR, { recursive: true });
    const slug = url.replace(/[^a-z0-9]+/gi, '-').slice(0, 80);
    const htmlFile = path.join(INSPECT_DIR, `${slug}.html`);
    const pngFile = path.join(INSPECT_DIR, `${slug}.png`);

    fs.writeFileSync(htmlFile, await page.content(), 'utf8');
    await page.screenshot({ path: pngFile, fullPage: true });

    const candidates = await page.evaluate(() => {
      const interesting = /(question|pytanie|answer|odpowied|correct|poprawn|option|quiz|test|choice)/i;
      const byClass = new Map<string, number>();

      for (const el of document.querySelectorAll<HTMLElement>('*')) {
        for (const cls of el.classList) {
          if (interesting.test(cls)) byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
        }
        const testId = el.getAttribute('data-testid');
        if (testId) byClass.set(`[data-testid="${testId}"]`, (byClass.get(`[data-testid="${testId}"]`) ?? 0) + 1);
      }

      return [...byClass.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([selector, count]) => ({ selector, count }));
    });

    console.log(`\nURL: ${page.url()}`);
    console.log(`Tytuł: ${await page.title()}`);
    console.log(`HTML:       ${htmlFile}`);
    console.log(`Screenshot: ${pngFile}`);

    console.log('\nKandydaci na selektory (klasa / data-testid → liczba wystąpień):');
    for (const { selector, count } of candidates) {
      console.log(`  ${String(count).padStart(4)}×  ${selector.startsWith('[') ? selector : `.${selector}`}`);
    }
    if (candidates.length === 0) {
      console.log('  (nic nie pasuje do heurystyki — zajrzyj do zrzutu HTML powyżej)');
    }

    if (config.mode !== 'static' || !config.question) {
      console.log('\nTryb interactive — do podglądu przebiegu CONFIRM/NEXT użyj: npm run probe -- <url>');
      return;
    }

    const questions = await extractQuestions(page, config.question);
    console.log(`\nTest bieżących selektorów z config/site.json: znaleziono ${questions.length} pytań.`);
    const first = questions[0];
    if (first) {
      console.log(`\n  Pytanie: ${first.text.slice(0, 160)}`);
      for (const answer of first.answers) {
        console.log(`    ${answer.correct ? '[✓]' : '[ ]'} ${answer.text.slice(0, 120)}`);
      }
      if (first.explanation) console.log(`    Wyjaśnienie: ${first.explanation.slice(0, 160)}`);
      const marked = questions.filter((q) => q.answers.some((a) => a.correct)).length;
      console.log(`\n  Pytania z zaznaczoną poprawną odpowiedzią: ${marked}/${questions.length}`);
      if (marked === 0) {
        console.log('  → popraw question.correctAnswerSelector (albo ustaw question.revealSelector).');
      }
    }
  } finally {
    await session.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\nBŁĄD: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
