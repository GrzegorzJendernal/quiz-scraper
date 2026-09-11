import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, ERRORS_FILE, PENDING_FILE, QUESTIONS_FILE, VISITED_FILE } from './paths.js';
import type { PendingQuestion, Question, ResolvedBy, ScrapeError } from './types.js';

function ensureDir(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Zapis atomowy — plik tymczasowy + rename, żeby Ctrl+C nie zostawił obciętego JSON-a. */
function writeJson(file: string, value: unknown): void {
  ensureDir(file);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Klucz pytania = treść + posortowane odpowiedzi. Samo „Which of the following is true?”
 * potrafi wystąpić w kilku quizach z innymi odpowiedziami; kolejność odpowiedzi bywa tasowana.
 */
export function questionId(text: string, options: string[]): string {
  const key = [normalizeText(text), ...options.map(normalizeText).sort()].join('\n').toLowerCase();
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

/** Siła dowodu: silniejsze źródło nadpisuje słabsze przy ponownym rozstrzygnięciu. */
const STRENGTH: Record<ResolvedBy, number> = { elimination: 0, explanation: 1, marked: 2, feedback: 3 };

/**
 * Przyrostowy magazyn danych: pytania trzymane w mapie po id, zapisywane po każdym kroku.
 * Dzięki temu przerwany scrape można wznowić bez utraty i bez duplikatów.
 */
export class Store {
  private questions = new Map<string, Question>();
  private pending = new Map<string, PendingQuestion>();
  private visited = new Set<string>();
  private errors: ScrapeError[] = [];

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const q of readJson<Question[]>(QUESTIONS_FILE, [])) this.questions.set(q.id, q);
    for (const p of readJson<PendingQuestion[]>(PENDING_FILE, [])) this.pending.set(p.id, p);
    for (const url of readJson<string[]>(VISITED_FILE, [])) this.visited.add(url);
    this.errors = readJson<ScrapeError[]>(ERRORS_FILE, []);
  }

  get questionCount(): number {
    return this.questions.size;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  hasVisited(url: string): boolean {
    return this.visited.has(url);
  }

  markVisited(url: string): void {
    this.visited.add(url);
  }

  getQuestion(id: string): Question | undefined {
    return this.questions.get(id);
  }

  getPending(id: string): PendingQuestion | undefined {
    return this.pending.get(id);
  }

  isPending(id: string): boolean {
    return this.pending.has(id);
  }

  pendingFor(sourceUrl: string): PendingQuestion[] {
    return [...this.pending.values()].filter((p) => p.sourceUrl === sourceUrl);
  }

  /** Tryb statyczny — zwraca liczbę faktycznie nowych pytań. */
  addQuestions(questions: Question[]): number {
    let added = 0;
    for (const q of questions) {
      if (this.resolve(q)) added += 1;
    }
    return added;
  }

  /** Zapisuje rozstrzygnięte pytanie. Zwraca true, jeśli wcześniej go nie było. */
  resolve(question: Question): boolean {
    this.pending.delete(question.id);
    const existing = this.questions.get(question.id);
    if (!existing) {
      this.questions.set(question.id, question);
      return true;
    }
    if (STRENGTH[question.resolvedBy] > STRENGTH[existing.resolvedBy]) {
      this.questions.set(question.id, { ...question, explanation: question.explanation ?? existing.explanation });
    } else if (!existing.explanation && question.explanation) {
      existing.explanation = question.explanation;
    }
    return false;
  }

  /** Rozstrzygnięcie okazało się błędne (np. wydedukowane, a werdykt mówi „incorrect”) — wraca do puli. */
  unresolve(id: string, pending: PendingQuestion): void {
    this.questions.delete(id);
    this.pending.set(id, pending);
  }

  setPending(pending: PendingQuestion): void {
    this.pending.set(pending.id, pending);
  }

  addError(url: string, message: string): void {
    this.errors.push({ url, message, at: new Date().toISOString() });
  }

  flush(): void {
    writeJson(QUESTIONS_FILE, [...this.questions.values()]);
    writeJson(PENDING_FILE, [...this.pending.values()]);
    writeJson(VISITED_FILE, [...this.visited]);
    if (this.errors.length > 0) writeJson(ERRORS_FILE, this.errors);
  }
}
