import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';

interface CapturedResponse {
  file: string;
  method: string;
  status: number;
  url: string;
}

/**
 * Zapisuje odpowiedzi JSON z XHR/fetch do katalogu. Jeśli API quizu zwraca poprawne odpowiedzi,
 * będzie je widać tutaj — wtedy da się zbierać dane bez klikania przez quiz.
 */
export function captureJsonResponses(page: Page, dir: string): () => CapturedResponse[] {
  fs.mkdirSync(dir, { recursive: true });
  const captured: CapturedResponse[] = [];

  page.on('response', async (response) => {
    const type = response.request().resourceType();
    if (type !== 'xhr' && type !== 'fetch') return;
    if (!(response.headers()['content-type'] ?? '').includes('json')) return;

    let body: string;
    try {
      body = await response.text();
    } catch {
      return; // odpowiedź bez treści (redirect, przerwane żądanie)
    }

    const { pathname } = new URL(response.url());
    const slug = pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'root';
    const file = `${String(captured.length + 1).padStart(3, '0')}-${response.request().method()}-${slug}.json`;

    let pretty = body;
    try {
      pretty = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      // zostaw surowy tekst
    }
    fs.writeFileSync(path.join(dir, file), pretty, 'utf8');
    captured.push({ file, method: response.request().method(), status: response.status(), url: response.url() });
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(captured, null, 2), 'utf8');
  });

  return () => captured;
}
