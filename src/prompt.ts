import readline from 'node:readline';
import { stdin, stdout } from 'node:process';

export interface Prompter {
  /** Zadaje pytanie i czeka na linię. `null` = koniec wejścia (np. zamknięty terminal). */
  ask(question: string): Promise<string | null>;
  close(): void;
}

/**
 * Pytania w terminalu z buforowaniem linii. `readline.question` gubi linie, które przyjdą,
 * zanim pytanie zostanie zadane (np. wklejony adres z Enterem w trakcie ładowania strony);
 * iterator zdarzeń `line` je kolejkuje.
 */
export function createPrompter(): Prompter {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
  const lines = rl[Symbol.asyncIterator]();

  return {
    async ask(question) {
      stdout.write(question);
      const next = await lines.next();
      if (!stdin.isTTY) stdout.write('\n');
      return next.done ? null : next.value;
    },
    close() {
      rl.close();
    },
  };
}
