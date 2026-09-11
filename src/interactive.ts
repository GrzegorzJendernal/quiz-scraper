import type { Locator, Page } from 'playwright';
import { normalizeText, questionId, type Store } from './store.js';
import type { InteractiveConfig, PendingQuestion, Question, ResolvedBy } from './types.js';

export interface QuizResult {
  passes: number;
  seen: number;
  newlyResolved: number;
  pending: number;
}

interface StepOutcome {
  id: string;
  text: string;
  position: number | null;
  total: number | null;
  status: 'resolved' | 'pending' | 'known';
  resolvedBy?: ResolvedBy;
}

type Log = (line: string) => void;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** „A\nPractice of…” → „Practice of…” — zdejmuje literę opcji, gdy siedzi w osobnym elemencie. */
export function stripOptionLetter(raw: string): string {
  return normalizeText(raw.replace(/^\s*[A-Z](?:[.)]\s*|\s*\n\s*)/, ''));
}

export async function optionText(option: Locator, cfg: InteractiveConfig): Promise<string> {
  if (cfg.optionTextSelector) {
    return normalizeText(await option.locator(cfg.optionTextSelector).first().innerText());
  }
  return stripOptionLetter(await option.innerText());
}

async function readOptions(page: Page, cfg: InteractiveConfig): Promise<string[]> {
  const options = page.locator(cfg.optionSelector);
  const count = await options.count();
  const texts: string[] = [];
  for (let i = 0; i < count; i += 1) texts.push(await optionText(options.nth(i), cfg));
  return texts;
}

async function readCounter(page: Page, cfg: InteractiveConfig): Promise<{ position: number | null; total: number | null }> {
  if (!cfg.counterSelector) return { position: null, total: null };
  const counter = page.locator(cfg.counterSelector).first();
  if ((await counter.count()) === 0) return { position: null, total: null };
  const match = /(\d+)\D+(\d+)/.exec(await counter.innerText());
  return match ? { position: Number(match[1]), total: Number(match[2]) } : { position: null, total: null };
}

export async function readExplanation(
  page: Page,
  cfg: InteractiveConfig,
  verdict: Locator,
  verdictText: string,
): Promise<string | undefined> {
  if (cfg.explanationSelector) {
    const explanation = page.locator(cfg.explanationSelector).first();
    if ((await explanation.count()) === 0) return undefined;
    return normalizeText(await explanation.innerText()) || undefined;
  }
  // Brak osobnego selektora: wyjaśnienie siedzi w tym samym boksie co werdykt.
  const boxText = normalizeText(await verdict.locator('..').innerText());
  return normalizeText(boxText.replace(verdictText, '')) || undefined;
}

/** Poprawna odpowiedź wyczytana z wyjaśnienia — litera (w kolejności wyświetlania) albo tekst. */
export function correctFromExplanation(cfg: InteractiveConfig, explanation: string | undefined, options: string[]): string[] {
  if (!cfg.explanationCorrectPattern || !explanation) return [];
  const match = new RegExp(cfg.explanationCorrectPattern, 'i').exec(explanation);
  const captured = match?.[1]?.trim();
  if (!captured) return [];

  if (/^[A-Z]$/i.test(captured)) {
    const option = options[captured.toUpperCase().charCodeAt(0) - 65];
    return option ? [option] : [];
  }
  const needle = normalizeText(captured).toLowerCase();
  return options.filter((o) => o.toLowerCase() === needle || o.toLowerCase().startsWith(needle));
}

export async function correctFromMarkers(page: Page, cfg: InteractiveConfig, options: string[]): Promise<string[]> {
  if (!cfg.correctOptionSelector) return [];
  const marked = page.locator(cfg.correctOptionSelector);
  const count = await marked.count();
  const texts: string[] = [];
  for (let i = 0; i < count; i += 1) texts.push(await optionText(marked.nth(i), cfg));
  return options.filter((o) => texts.includes(o));
}

/** Wejście do quizu: goto + ewentualny klik „Start” / „Retake”, aż pojawi się pierwsze pytanie. */
async function openQuiz(page: Page, url: string, cfg: InteractiveConfig, waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit'): Promise<void> {
  await page.goto(url, { waitUntil });

  const question = page.locator(cfg.questionTextSelector).first();
  const entries = [cfg.startButton, cfg.retakeButton]
    .filter((s): s is string => Boolean(s))
    .map((s) => page.locator(s).first());

  let anything: Locator = question;
  for (const entry of entries) anything = anything.or(entry);
  await anything.first().waitFor({ state: 'visible' });

  if (await question.isVisible()) return;
  for (const entry of entries) {
    if (await entry.isVisible()) {
      await entry.click();
      break;
    }
  }
  await question.waitFor({ state: 'visible' });
}

/** Odpowiada na pytanie widoczne na ekranie i zapisuje, czego się dowiedział. */
async function answerCurrent(
  page: Page,
  quizUrl: string,
  deck: string | undefined,
  cfg: InteractiveConfig,
  store: Store,
): Promise<StepOutcome> {
  const questionLocator = page.locator(cfg.questionTextSelector).first();
  await questionLocator.waitFor({ state: 'visible' });
  const text = normalizeText(await questionLocator.innerText());
  const { position, total } = await readCounter(page, cfg);
  const options = await readOptions(page, cfg);
  if (options.length === 0) throw new Error(`brak odpowiedzi do wyboru przy pytaniu: ${text.slice(0, 80)}`);

  const id = questionId(text, options);
  const known = store.getQuestion(id);
  const eliminated = new Set(store.getPending(id)?.eliminated ?? []);

  // Znane pytanie → klikamy poprawną (quiz przechodzi „na zielono”); nieznane → pierwszą niewykluczoną.
  const knownCorrect = known?.answers.find((a) => a.correct)?.text;
  let choice = knownCorrect ? options.indexOf(knownCorrect) : options.findIndex((o) => !eliminated.has(o));
  if (choice < 0) choice = 0;
  const chosen = options[choice]!;

  await page.locator(cfg.optionSelector).nth(choice).click();
  await page.locator(cfg.confirmButton).first().click();

  const verdict = page.locator(cfg.verdictSelector).first();
  await verdict.waitFor({ state: 'visible' });
  const verdictText = normalizeText(await verdict.innerText());
  const isCorrect = new RegExp(cfg.correctVerdictPattern, 'i').test(verdictText);
  const explanation = await readExplanation(page, cfg, verdict, verdictText);

  let correct: string[] = [];
  let resolvedBy: ResolvedBy | undefined;

  if (isCorrect) {
    correct = [chosen];
    resolvedBy = 'feedback';
  } else {
    eliminated.add(chosen);
    const marked = await correctFromMarkers(page, cfg, options);
    const fromExplanation = correctFromExplanation(cfg, explanation, options);
    const remaining = options.filter((o) => !eliminated.has(o));
    if (marked.length > 0) {
      correct = marked;
      resolvedBy = 'marked';
    } else if (fromExplanation.length > 0) {
      correct = fromExplanation;
      resolvedBy = 'explanation';
    } else if (remaining.length === 1) {
      correct = remaining;
      resolvedBy = 'elimination';
    }
  }

  const pending: PendingQuestion = {
    id,
    sourceUrl: quizUrl,
    ...(deck ? { deck } : {}),
    text,
    options,
    eliminated: [...eliminated],
    ...(explanation ? { explanation } : {}),
  };

  if (known && !isCorrect && knownCorrect === chosen) {
    // Mieliśmy rozstrzygnięcie, a strona mówi „incorrect” — nie ufamy mu dłużej.
    store.addError(quizUrl, `sprzeczność: „${chosen}” oznaczone jako poprawne (${known.resolvedBy}), werdykt: ${verdictText}`);
    store.unresolve(id, pending);
  }

  if (correct.length > 0 && resolvedBy) {
    const question: Question = {
      id,
      sourceUrl: quizUrl,
      ...(deck ? { deck } : {}),
      text,
      answers: options.map((o) => ({ text: o, correct: correct.includes(o) })),
      ...(explanation ? { explanation } : {}),
      resolvedBy,
      scrapedAt: new Date().toISOString(),
    };
    const isNew = store.resolve(question);
    return { id, text, position, total, status: isNew ? 'resolved' : 'known', resolvedBy };
  }

  store.setPending(pending);
  return { id, text, position, total, status: 'pending' };
}

/** Przejście dalej. Zwraca false, gdy quiz się skończył. */
async function goNext(page: Page, cfg: InteractiveConfig, previousText: string, isLast: boolean): Promise<boolean> {
  const buttons = [cfg.nextButton, cfg.finishButton].filter((s): s is string => Boolean(s));
  let next: Locator = page.locator(buttons[0]!);
  for (const selector of buttons.slice(1)) next = next.or(page.locator(selector));
  next = next.first();

  if (!(await next.isVisible())) return false;
  await next.click();
  if (isLast) return false;

  const exactPrevious = new RegExp(`^\\s*${escapeRegex(previousText)}\\s*$`);
  const newQuestion = page.locator(cfg.questionTextSelector).filter({ hasNotText: exactPrevious }).first();
  let arrived: Locator = newQuestion;
  if (cfg.retakeButton) arrived = arrived.or(page.locator(cfg.retakeButton)).first();
  await arrived.waitFor({ state: 'visible' });
  return newQuestion.isVisible();
}

/**
 * Przechodzi quiz do skutku: każde podejście odpowiada na wszystkie pytania; kolejne podejścia
 * są potrzebne tylko wtedy, gdy strona nie zdradziła poprawnej odpowiedzi po złym strzale.
 */
export async function runQuiz(
  page: Page,
  quizUrl: string,
  cfg: InteractiveConfig,
  store: Store,
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit',
  log: Log,
): Promise<QuizResult> {
  const seen = new Set<string>();
  let newlyResolved = 0;
  let passes = 0;

  for (let pass = 1; pass <= cfg.maxPasses; pass += 1) {
    passes = pass;
    await openQuiz(page, quizUrl, cfg, waitUntil);

    const deck = cfg.quizTitleSelector
      ? normalizeText(await page.locator(cfg.quizTitleSelector).first().innerText().catch(() => '')) || undefined
      : undefined;
    if (pass === 1 && deck) log(`  quiz: ${deck}`);

    for (let guard = 0; guard < 1000; guard += 1) {
      const step = await answerCurrent(page, quizUrl, deck, cfg, store);
      seen.add(step.id);
      if (step.status === 'resolved') newlyResolved += 1;
      store.flush();

      const where = step.position && step.total ? `${step.position}/${step.total}` : `#${guard + 1}`;
      const label = step.status === 'pending' ? 'nierozstrzygnięte' : (step.resolvedBy ?? step.status);
      log(`  [podejście ${pass}] ${where} ${label.padEnd(18)} ${step.text.slice(0, 70)}`);

      const isLast = step.position !== null && step.total !== null && step.position >= step.total;
      if (!(await goNext(page, cfg, step.text, isLast))) break;
    }

    const stillPending = [...seen].filter((id) => store.isPending(id)).length;
    if (stillPending === 0) break;
    log(`  po podejściu ${pass}: ${stillPending} pytań bez rozstrzygnięcia — kolejne podejście`);
  }

  return {
    passes,
    seen: seen.size,
    newlyResolved,
    pending: [...seen].filter((id) => store.isPending(id)).length,
  };
}
