import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, '..');
export const CONFIG_DIR = path.join(ROOT, 'config');
/** Nadpisywalne przez QUIZ_SCRAPER_CONFIG — używane m.in. przez `npm run smoke`. */
export const SITE_CONFIG = process.env.QUIZ_SCRAPER_CONFIG
  ? path.resolve(ROOT, process.env.QUIZ_SCRAPER_CONFIG)
  : path.join(CONFIG_DIR, 'site.json');
/** Nadpisywalne przez QUIZ_SCRAPER_DATA — smoke test nie miesza się z prawdziwymi danymi. */
export const DATA_DIR = process.env.QUIZ_SCRAPER_DATA
  ? path.resolve(ROOT, process.env.QUIZ_SCRAPER_DATA)
  : path.join(ROOT, 'data');
export const AUTH_STATE = path.join(DATA_DIR, 'auth.json');
export const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
export const PENDING_FILE = path.join(DATA_DIR, 'pending.json');
export const VISITED_FILE = path.join(DATA_DIR, 'visited.json');
export const ERRORS_FILE = path.join(DATA_DIR, 'errors.json');
export const INSPECT_DIR = path.join(DATA_DIR, 'inspect');
export const PROBE_DIR = path.join(DATA_DIR, 'probe');
