import fs from 'node:fs';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { AUTH_STATE } from './paths.js';
import type { SiteConfig } from './types.js';

export function hasAuthState(): boolean {
  return fs.existsSync(AUTH_STATE);
}

export interface Session {
  browser: Browser;
  context: BrowserContext;
  close(): Promise<void>;
}

/**
 * @param useAuth  dołącz zapisaną sesję z data/auth.json (wymaga wcześniejszego `npm run login`)
 */
export async function openSession(
  config: SiteConfig,
  opts: { headless?: boolean; useAuth?: boolean } = {},
): Promise<Session> {
  // QUIZ_SCRAPER_FORCE_HEADLESS — tylko dla `npm run smoke` (login/probe normalnie zawsze pokazują okno).
  const headless = process.env.QUIZ_SCRAPER_FORCE_HEADLESS ? true : (opts.headless ?? config.crawl.headless);
  const useAuth = opts.useAuth ?? true;

  if (useAuth && !hasAuthState()) {
    throw new Error('Brak data/auth.json — najpierw uruchom: npm run login');
  }

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    storageState: useAuth ? AUTH_STATE : undefined,
    viewport: { width: 1440, height: 900 },
  });
  // tsx (esbuild, keepNames) wstrzykuje wywołania __name do funkcji przekazywanych do page.evaluate.
  // W przeglądarce tego helpera nie ma, więc dokładamy no-opa, zanim cokolwiek się wykona.
  await context.addInitScript({ content: 'globalThis.__name = globalThis.__name || ((fn) => fn);' });

  context.setDefaultTimeout(config.crawl.timeoutMs);
  context.setDefaultNavigationTimeout(config.crawl.timeoutMs);

  return {
    browser,
    context,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
