import type { Page } from 'playwright';
import { loadEnv, loadSiteConfig } from '../config.js';
import { openSession, sleep } from '../browser.js';
import { extractLinks, extractQuestions } from '../extract.js';
import { runQuiz } from '../interactive.js';
import { Store } from '../store.js';
import { QUESTIONS_FILE } from '../paths.js';
import type { SiteConfig } from '../types.js';

interface Options {
  /** ponownie odwiedź strony już zapisane w data/visited.json */
  force: boolean;
  /** przerwij po N stronach z pytaniami (0 = bez limitu) */
  limit: number;
  headed: boolean;
}

function parseArgs(argv: string[]): Options {
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  return {
    force: argv.includes('--force'),
    headed: argv.includes('--headed'),
    limit: limitArg ? Number(limitArg.split('=')[1]) : 0,
  };
}

/** Przechodzi listing (z paginacją) i zbiera URL-e stron z pytaniami. */
async function collectTargets(page: Page, config: SiteConfig): Promise<string[]> {
  const { listing } = config;
  const targets: string[] = [];

  for (const startUrl of listing.startUrls) {
    if (!listing.itemLinkSelector) {
      targets.push(startUrl);
      continue;
    }

    let url: string | null = startUrl;
    for (let pageNo = 1; url && pageNo <= listing.maxPages; pageNo += 1) {
      await page.goto(url, { waitUntil: config.crawl.waitUntil });
      const links = await extractLinks(page, listing.itemLinkSelector);
      targets.push(...links);
      console.log(`  listing ${pageNo}: ${links.length} linków (${url})`);

      url = null;
      if (listing.nextPageSelector) {
        const next = page.locator(listing.nextPageSelector).first();
        if ((await next.count()) > 0) {
          url = await next.getAttribute('href');
          if (url) url = new URL(url, page.url()).toString();
        }
      }
      await sleep(config.crawl.delayMs);
    }
  }

  return [...new Set(targets)];
}

async function main(): Promise<void> {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));
  const config = loadSiteConfig();
  const store = new Store();

  console.log(`Serwis: ${config.name}`);
  console.log(`W bazie na start: ${store.questionCount} pytań\n`);

  const session = await openSession(config, { headless: options.headed ? false : config.crawl.headless });
  const page = await session.context.newPage();

  // Zapisz dane także przy Ctrl+C — nic z zebranego materiału nie przepada.
  const onInterrupt = (): void => {
    store.flush();
    console.log('\nPrzerwano — dane zapisane.');
    process.exit(130);
  };
  process.on('SIGINT', onInterrupt);

  try {
    console.log('Zbieram listę stron do odwiedzenia...');
    const targets = await collectTargets(page, config);
    const queue = targets.filter((url) => options.force || !store.hasVisited(url));
    console.log(`\nZnaleziono ${targets.length} stron, do przetworzenia: ${queue.length}\n`);

    let processed = 0;
    for (const url of queue) {
      if (options.limit > 0 && processed >= options.limit) {
        console.log(`Limit ${options.limit} stron osiągnięty — kończę.`);
        break;
      }

      try {
        processed += 1;
        if (config.mode === 'interactive') {
          console.log(`[${processed}/${queue.length}] ${url}`);
          const result = await runQuiz(page, url, config.interactive!, store, config.crawl.waitUntil, (line) =>
            console.log(line),
          );
          // Quiz uznajemy za zrobiony dopiero, gdy każde pytanie ma rozstrzygnięcie.
          if (result.pending === 0) store.markVisited(url);
          console.log(
            `  → ${result.seen} pytań, +${result.newlyResolved} nowych, ` +
              `${result.pending} nierozstrzygniętych, podejść: ${result.passes}\n`,
          );
          if (result.seen === 0) store.addError(url, 'brak pytań — sprawdź interactive.questionTextSelector');
        } else {
          await page.goto(url, { waitUntil: config.crawl.waitUntil });
          const questions = await extractQuestions(page, config.question!);
          const added = store.addQuestions(questions);
          store.markVisited(url);
          console.log(`[${processed}/${queue.length}] ${questions.length} pytań (+${added} nowych) — ${url}`);
          if (questions.length === 0) {
            store.addError(url, 'brak pytań — sprawdź question.containerSelector');
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        store.addError(url, message);
        console.warn(`[!] ${url} — ${message.split('\n')[0]}`);
      }

      store.flush(); // zapis po każdej stronie → wznawialność
      await sleep(config.crawl.delayMs);
    }
  } finally {
    process.off('SIGINT', onInterrupt);
    store.flush();
    await session.close();
  }

  console.log(`\nGotowe. Łącznie w bazie: ${store.questionCount} pytań`);
  if (store.pendingCount > 0) console.log(`Bez rozstrzygnięcia: ${store.pendingCount} (data/pending.json)`);
  console.log(`Plik: ${QUESTIONS_FILE}`);
}

main().catch((error: unknown) => {
  console.error(`\nBŁĄD: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
