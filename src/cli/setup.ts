import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_DIR, SITE_CONFIG } from '../paths.js';
import { createPrompter } from '../prompt.js';

/**
 * Kreator pierwszej konfiguracji dla osoby nietechnicznej: pyta o adres quizu
 * i tworzy config/site.json z szablonu. Selektory (TODO) uzupełnia się później
 * na podstawie nagrania z `npm run probe`.
 */
function parseUrl(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const prompt = createPrompter();

  try {
    if (fs.existsSync(SITE_CONFIG)) {
      const answer = await prompt.ask('Konfiguracja już istnieje. Nadpisać ją? (t/N) ');
      if (answer?.trim().toLowerCase() !== 't') {
        console.log('Bez zmian.');
        return;
      }
    }

    console.log('\nOtwórz w przeglądarce pierwszy quiz z kursu i skopiuj adres z paska adresu.');
    let quizUrl: URL | null = null;
    while (!quizUrl) {
      const answer = await prompt.ask('Wklej adres quizu i naciśnij Enter: ');
      if (answer === null) throw new Error('przerwano — nie podano adresu quizu');
      quizUrl = parseUrl(answer);
      if (!quizUrl) console.log('To nie wygląda na adres strony (powinien zaczynać się od https://). Spróbuj jeszcze raz.');
    }

    console.log('\nAdres strony logowania — zwykle wystarczy zostawić puste (Enter).');
    const loginUrl = parseUrl(await prompt.ask('Adres logowania [Enter = adres quizu]: ')) ?? quizUrl;

    const template = JSON.parse(
      fs.readFileSync(path.join(CONFIG_DIR, 'site.interactive.example.json'), 'utf8'),
    ) as Record<string, unknown> & {
      login: Record<string, unknown>;
      listing: Record<string, unknown>;
    };

    template.name = quizUrl.hostname;
    template.baseUrl = quizUrl.origin;
    template.login.url = loginUrl.toString();
    template.listing.startUrls = [quizUrl.toString()];

    fs.writeFileSync(SITE_CONFIG, `${JSON.stringify(template, null, 2)}\n`, 'utf8');

    console.log('\nZapisano konfigurację.');
    console.log('Następny krok: npm run login');
  } finally {
    prompt.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\nBŁĄD: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
