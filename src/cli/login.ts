import { loadEnv, loadSiteConfig } from '../config.js';
import { openSession } from '../browser.js';
import { AUTH_STATE } from '../paths.js';
import { createPrompter } from '../prompt.js';

/**
 * Zapisuje sesję zalogowanej przeglądarki do data/auth.json.
 *
 * Tryb domyślny ("manual"): otwiera okno przeglądarki, Ty logujesz się ręcznie,
 * skrypt zapisuje ciasteczka po naciśnięciu Enter. Hasło nie przechodzi przez żaden plik.
 *
 * Tryb "auto" (config/site.json -> login.mode): skrypt wypełnia formularz danymi z .env.
 */
async function main(): Promise<void> {
  loadEnv();
  const config = loadSiteConfig({ requireSelectors: false });
  const prompt = createPrompter();
  const session = await openSession(config, { headless: false, useAuth: false });
  const page = await session.context.newPage();

  try {
    await page.goto(config.login.url, { waitUntil: config.crawl.waitUntil });

    if (config.login.mode === 'auto') {
      const user = process.env.SITE_USER;
      const password = process.env.SITE_PASSWORD;
      if (!user || !password) {
        throw new Error('login.mode = "auto" wymaga SITE_USER i SITE_PASSWORD w pliku .env');
      }
      await page.fill(config.login.usernameSelector!, user);
      await page.fill(config.login.passwordSelector!, password);
      await page.click(config.login.submitSelector!);
      if (config.login.successUrlPattern) {
        await page.waitForURL(config.login.successUrlPattern);
      } else {
        await page.waitForLoadState('networkidle');
      }
      console.log(`Zalogowano automatycznie. Aktualny URL: ${page.url()}`);
    } else {
      console.log('\nOtworzyło się okno przeglądarki — zaloguj się w nim tak jak zwykle.');
      console.log('Kiedy zobaczysz już kurs po zalogowaniu, wróć do tego okna i naciśnij Enter.\n');
      const answer = await prompt.ask('Enter = zapisz logowanie... ');
      if (answer === null) throw new Error('przerwano przed zapisaniem logowania');
      console.log(`Zapisuję logowanie dla strony: ${page.url()}`);
    }

    await session.context.storageState({ path: AUTH_STATE });
    console.log('Logowanie zapisane.');
    console.log('Następny krok: npm run probe');
  } finally {
    prompt.close();
    await session.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\nBŁĄD: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
