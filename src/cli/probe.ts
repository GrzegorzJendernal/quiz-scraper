import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, loadSiteConfig } from '../config.js';
import { createPrompter } from '../prompt.js';
import { openSession } from '../browser.js';
import { captureJsonResponses } from '../network.js';
import { PROBE_DIR } from '../paths.js';

/**
 * Nagrywa prawdziwy przebieg quizu, żeby dobrać selektory trybu interactive.
 *
 * Otwiera okno przeglądarki z zapisaną sesją. Ty klikasz (odpowiedź, CONFIRM, NEXT),
 * a po każdym kroku naciskasz Enter w terminalu — skrypt zapisuje HTML, drzewo dostępności
 * (ARIA) i screenshot. Równolegle zapisuje odpowiedzi JSON z API strony.
 * Skrypt sam niczego nie klika.
 */
async function main(): Promise<void> {
  loadEnv();
  const config = loadSiteConfig({ requireSelectors: false });
  // Domyślnie pierwszy quiz z konfiguracji (wpisany przez `npm run setup`).
  const configured = config.listing.startUrls[0];
  const url = process.argv[2] ?? (configured && !configured.includes('TODO') ? configured : undefined);
  if (!url) {
    console.error('Brak adresu quizu. Najpierw: npm run setup  (albo: npm run probe -- <adres-quizu>)');
    process.exitCode = 1;
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(PROBE_DIR, stamp);
  fs.mkdirSync(dir, { recursive: true });

  const prompt = createPrompter();
  const session = await openSession(config, { headless: false });
  const page = await session.context.newPage();
  const captured = captureJsonResponses(page, path.join(dir, 'network'));

  try {
    await page.goto(url, { waitUntil: config.crawl.waitUntil });

    console.log('\nOtworzyło się okno przeglądarki z quizem. Klikasz w nim samodzielnie,');
    console.log('a po każdym kroku wracasz tutaj i naciskasz Enter — program zrobi „zdjęcie” strony.\n');
    console.log('  1. Widać pytanie, nic jeszcze nie zaznaczone                  → Enter');
    console.log('  2. Zaznacz odpowiedź, na razie BEZ klikania CONFIRM            → Enter');
    console.log('  3. Kliknij CONFIRM                                             → Enter');
    console.log('     Najważniejsze jest zdjęcie po ZŁEJ odpowiedzi. Jeśli trafisz dobrą,');
    console.log('     kliknij NEXT i powtarzaj kroki 2–3, aż zobaczysz komunikat o złej odpowiedzi.');
    console.log('  4. Kliknij NEXT                                                → Enter');
    console.log('  Na koniec wpisz q i naciśnij Enter.\n');

    for (let step = 1; ; step += 1) {
      const answer = await prompt.ask(`Krok ${step}: Enter = zdjęcie, q = koniec > `);
      if (answer === null || answer.trim().toLowerCase() === 'q') break;

      const base = path.join(dir, `step-${String(step).padStart(2, '0')}`);
      fs.writeFileSync(`${base}.html`, await page.content(), 'utf8');
      fs.writeFileSync(`${base}.aria.yml`, await page.locator('body').ariaSnapshot(), 'utf8');
      await page.screenshot({ path: `${base}.png`, fullPage: true });

      // Treść quizu bywa w iframe — zapisz też ramki potomne.
      const frames = page.frames().filter((f) => f !== page.mainFrame() && f.url() !== 'about:blank');
      for (const [i, frame] of frames.entries()) {
        const html = await frame.content().catch(() => null);
        if (html) fs.writeFileSync(`${base}.frame-${i + 1}.html`, `<!-- ${frame.url()} -->\n${html}`, 'utf8');
      }

      console.log(`  zapisano zdjęcie ${step} (ramki: ${frames.length})`);
    }
  } finally {
    prompt.close();
    await session.close();
  }

  console.log(`\nNagranie zapisane w folderze: data/probe/${stamp}`);
  console.log(`(odpowiedzi z API strony: ${captured().length})`);
  console.log('Następny krok: dopasowanie ustawień i sprawdzenie — npm run check');
}

main().catch((error: unknown) => {
  console.error(`\nBŁĄD: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
