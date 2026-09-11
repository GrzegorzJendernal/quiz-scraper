import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE_CONFIG } from './paths.js';
import type { InteractiveConfig, QuestionConfig, SiteConfig } from './types.js';

/**
 * Domyślne wartości trybu interaktywnego — dopasowane do przepływu
 * „zaznacz → CONFIRM → werdykt + wyjaśnienie → NEXT”. Selektory specyficzne dla strony
 * (treść pytania, opcje) i tak trzeba podać w config/site.json.
 */
const INTERACTIVE_DEFAULTS: Omit<InteractiveConfig, 'questionTextSelector' | 'optionSelector'> = {
  confirmButton: 'role=button[name=/^\\s*confirm\\s*$/i]',
  nextButton: 'role=button[name=/^\\s*next\\s*$/i]',
  verdictSelector: 'text=/this answer is (in)?correct/i',
  correctVerdictPattern: 'answer is correct',
  counterSelector: 'text=/question\\s+\\d+\\s+of\\s+\\d+/i',
  maxPasses: 5,
};

/** Ładuje .env (Node >= 20.12) — brak pliku nie jest błędem. */
export function loadEnv(): void {
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return;
  process.loadEnvFile(envFile);
}

class ConfigError extends Error {}

function req<T>(value: T | undefined | null, field: string): T {
  if (value === undefined || value === null || value === '') {
    throw new ConfigError(`config/site.json: brakuje pola "${field}"`);
  }
  return value;
}

/** Ścieżki pól, które wciąż zawierają „TODO” z szablonu (pola `_komentarz`/`_uwaga` pomijane). */
function findTodos(value: unknown, at = ''): string[] {
  if (typeof value === 'string') return value.includes('TODO') ? [at] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => findTodos(v, `${at}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !key.startsWith('_'))
      .flatMap(([key, v]) => findTodos(v, at ? `${at}.${key}` : key));
  }
  return [];
}

/**
 * @param requireSelectors  false dla `login` / `probe` / `inspect` — te komendy służą do poznania
 *   selektorów, więc wymagają tylko sekcji `login` i `crawl`.
 */
export function loadSiteConfig({ requireSelectors = true }: { requireSelectors?: boolean } = {}): SiteConfig {
  if (!fs.existsSync(SITE_CONFIG)) {
    throw new ConfigError('Brak config/site.json — najpierw uruchom: npm run setup');
  }

  const raw = JSON.parse(fs.readFileSync(SITE_CONFIG, 'utf8')) as Partial<SiteConfig>;

  const todos = requireSelectors ? findTodos(raw) : findTodos({ login: raw.login, crawl: raw.crawl });
  if (todos.length > 0) {
    throw new ConfigError(
      `config/site.json: niewypełnione pola z szablonu (uzupełnij albo usuń opcjonalne):\n  ${todos.join('\n  ')}`,
    );
  }

  const login = req(raw.login, 'login');
  if (login.mode !== 'manual' && login.mode !== 'auto') {
    throw new ConfigError('config/site.json: login.mode musi być "manual" albo "auto"');
  }
  req(login.url, 'login.url');
  if (login.mode === 'auto') {
    req(login.usernameSelector, 'login.usernameSelector');
    req(login.passwordSelector, 'login.passwordSelector');
    req(login.submitSelector, 'login.submitSelector');
  }

  const listing = req(raw.listing, 'listing');
  if (!Array.isArray(listing.startUrls) || listing.startUrls.length === 0) {
    throw new ConfigError('config/site.json: listing.startUrls musi być niepustą tablicą');
  }

  const mode = raw.mode ?? 'static';
  if (mode !== 'static' && mode !== 'interactive') {
    throw new ConfigError('config/site.json: mode musi być "static" albo "interactive"');
  }

  let question: QuestionConfig | undefined;
  let interactive: InteractiveConfig | undefined;

  if (!requireSelectors) {
    question = raw.question;
    interactive = raw.interactive ? { ...INTERACTIVE_DEFAULTS, ...raw.interactive } : undefined;
  } else if (mode === 'static') {
    question = req(raw.question, 'question');
    req(question.containerSelector, 'question.containerSelector');
    req(question.textSelector, 'question.textSelector');
    req(question.answerSelector, 'question.answerSelector');
    req(question.correctAnswerSelector, 'question.correctAnswerSelector');
  } else {
    const rawInteractive = req(raw.interactive, 'interactive');
    req(rawInteractive.questionTextSelector, 'interactive.questionTextSelector');
    req(rawInteractive.optionSelector, 'interactive.optionSelector');
    interactive = { ...INTERACTIVE_DEFAULTS, ...rawInteractive };
  }

  return {
    name: req(raw.name, 'name'),
    baseUrl: req(raw.baseUrl, 'baseUrl'),
    mode,
    login,
    listing: { ...listing, maxPages: listing.maxPages ?? 50 },
    question,
    interactive,
    crawl: {
      delayMs: 1200,
      timeoutMs: 30_000,
      headless: true,
      waitUntil: 'domcontentloaded',
      ...raw.crawl,
    },
  };
}

export { ConfigError };
