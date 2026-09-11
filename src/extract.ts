import type { Page } from 'playwright';
import { normalizeText, questionId } from './store.js';
import type { Question, QuestionConfig } from './types.js';

interface RawQuestion {
  text: string;
  answers: { text: string; correct: boolean }[];
  explanation: string | null;
}

/**
 * Wyciąga pytania ze strony na podstawie selektorów z config/site.json.
 * Cała logika DOM-owa idzie do page.evaluate, bo selektory odpowiedzi są względne wobec kontenera pytania.
 */
export async function extractQuestions(page: Page, cfg: QuestionConfig): Promise<Question[]> {
  if (cfg.revealSelector) {
    // Odsłonięcie odpowiedzi ("Pokaż rozwiązanie") — klikamy wszystkie przyciski, jeśli są.
    const reveals = page.locator(cfg.revealSelector);
    const count = await reveals.count();
    for (let i = 0; i < count; i += 1) {
      const button = reveals.nth(i);
      if (await button.isVisible()) {
        await button.click({ timeout: 5_000 }).catch(() => undefined);
      }
    }
    if (count > 0) {
      await page.locator(cfg.correctAnswerSelector).first().waitFor({ state: 'attached' }).catch(() => undefined);
    }
  }

  const raw = await page.evaluate((selectors: QuestionConfig): RawQuestion[] => {
    const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();

    return [...document.querySelectorAll(selectors.containerSelector)].map((container) => {
      const textEl = container.querySelector(selectors.textSelector);
      const correctSet = new Set<Element>(container.querySelectorAll(selectors.correctAnswerSelector));

      const answers = [...container.querySelectorAll(selectors.answerSelector)].map((el) => ({
        text: clean(el.textContent),
        // element jest poprawną odpowiedzią albo ją zawiera (np. marker <span class="correct"> wewnątrz <li>)
        correct: correctSet.has(el) || [...correctSet].some((c) => el.contains(c) || c.contains(el)),
      }));

      const explanationEl = selectors.explanationSelector
        ? container.querySelector(selectors.explanationSelector)
        : null;

      return {
        text: clean(textEl?.textContent),
        answers: answers.filter((a) => a.text.length > 0),
        explanation: explanationEl ? clean(explanationEl.textContent) || null : null,
      };
    });
  }, cfg);

  const scrapedAt = new Date().toISOString();
  const sourceUrl = page.url();

  return raw
    .filter((q) => normalizeText(q.text).length > 0 && q.answers.length > 0)
    .map((q) => ({
      id: questionId(q.text, q.answers.map((a) => a.text)),
      sourceUrl,
      text: normalizeText(q.text),
      answers: q.answers,
      ...(q.explanation ? { explanation: q.explanation } : {}),
      resolvedBy: 'marked' as const,
      scrapedAt,
    }));
}

/** Linki do pojedynczych stron z pytaniami, zamienione na bezwzględne URL-e. */
export async function extractLinks(page: Page, selector: string): Promise<string[]> {
  const hrefs = await page.evaluate((sel: string) => {
    const allowed = new Set(['http:', 'https:', 'file:']);
    return [...document.querySelectorAll<HTMLAnchorElement>(sel)]
      .map((a) => a.href)
      .filter((href) => {
        try {
          return allowed.has(new URL(href).protocol);
        } catch {
          return false;
        }
      });
  }, selector);
  return [...new Set(hrefs)];
}
