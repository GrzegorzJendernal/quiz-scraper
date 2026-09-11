import fs from 'node:fs';
import { ERRORS_FILE, PENDING_FILE, QUESTIONS_FILE } from '../paths.js';
import type { PendingQuestion, Question, ScrapeError } from '../types.js';

function readJson<T>(file: string, fallback: T): T {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as T) : fallback;
}

/** Szybki przegląd tego, co leży lokalnie — bez wchodzenia na stronę. */
function main(): void {
  if (!fs.existsSync(QUESTIONS_FILE)) {
    console.log('Brak data/questions.json — najpierw uruchom: npm run scrape');
    return;
  }

  const questions = readJson<Question[]>(QUESTIONS_FILE, []);
  const pending = readJson<PendingQuestion[]>(PENDING_FILE, []);
  const withExplanation = questions.filter((q) => q.explanation);
  const multiCorrect = questions.filter((q) => q.answers.filter((a) => a.correct).length > 1);

  console.log(`Pytań rozstrzygniętych:        ${questions.length}`);
  console.log(`Bez rozstrzygnięcia:           ${pending.length}${pending.length ? ' (data/pending.json)' : ''}`);
  console.log(`Wielokrotnego wyboru:          ${multiCorrect.length}`);
  console.log(`Z wyjaśnieniem:                ${withExplanation.length}`);

  const byMethod = new Map<string, number>();
  for (const q of questions) byMethod.set(q.resolvedBy, (byMethod.get(q.resolvedBy) ?? 0) + 1);
  console.log('\nŹródło poprawnej odpowiedzi:');
  for (const [method, count] of byMethod) console.log(`  ${method.padEnd(12)} ${count}`);

  const byDeck = new Map<string, number>();
  for (const q of questions) byDeck.set(q.deck ?? '(bez tytułu)', (byDeck.get(q.deck ?? '(bez tytułu)') ?? 0) + 1);
  console.log('\nRozdziały (talie):');
  for (const [deck, count] of byDeck) console.log(`  ${String(count).padStart(4)}  ${deck}`);

  const errors = readJson<ScrapeError[]>(ERRORS_FILE, []);
  if (errors.length > 0) {
    console.log(`\nBłędy: ${errors.length} (data/errors.json)`);
    for (const error of errors.slice(-5)) console.log(`  ${error.url} — ${error.message.split('\n')[0]}`);
  }

  const sample = questions[0];
  if (sample) {
    console.log('\nPrzykładowy rekord:');
    console.log(JSON.stringify(sample, null, 2));
  }
}

main();
