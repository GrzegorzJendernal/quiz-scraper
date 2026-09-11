export interface Answer {
  text: string;
  correct: boolean;
}

/** Skąd wiemy, która odpowiedź jest poprawna — przydaje się przy ocenie wiarygodności fiszki. */
export type ResolvedBy =
  /** odpowiedź oznaczona w DOM (tryb statyczny albo znacznik po CONFIRM) */
  | 'marked'
  /** zaznaczona odpowiedź dostała werdykt „correct” */
  | 'feedback'
  /** wyciągnięta z tekstu wyjaśnienia („The correct answer is C”) */
  | 'explanation'
  /** zostały wykluczone wszystkie pozostałe odpowiedzi */
  | 'elimination';

export interface Question {
  /** sha1 treści pytania + posortowanych odpowiedzi — stabilny klucz deduplikacji */
  id: string;
  sourceUrl: string;
  /** rozdział / quiz, z którego pochodzi pytanie — naturalny podział na talie fiszek */
  deck?: string;
  text: string;
  answers: Answer[];
  explanation?: string;
  resolvedBy: ResolvedBy;
  scrapedAt: string;
}

/** Pytanie z quizu interaktywnego, dla którego jeszcze nie znamy poprawnej odpowiedzi. */
export interface PendingQuestion {
  id: string;
  sourceUrl: string;
  deck?: string;
  text: string;
  options: string[];
  /** odpowiedzi, które już dostały werdykt „incorrect” */
  eliminated: string[];
  explanation?: string;
}

export interface ScrapeError {
  url: string;
  message: string;
  at: string;
}

export interface LoginConfig {
  /** "manual" — logujesz się sam w oknie przeglądarki; "auto" — skrypt wypełnia pola z .env */
  mode: 'manual' | 'auto';
  url: string;
  /** wymagane tylko dla mode = "auto" */
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  /** glob URL-a po udanym logowaniu, np. "**\/dashboard**" */
  successUrlPattern?: string;
}

export interface ListingConfig {
  /** strony startowe: listing pytań albo bezpośrednio strony z pytaniami / quizami */
  startUrls: string[];
  /** selektor linków do pojedynczych stron z pytaniami; pomiń, gdy pytania są wprost na startUrls */
  itemLinkSelector?: string;
  /** selektor przycisku/linku „następna strona” listingu */
  nextPageSelector?: string;
  maxPages: number;
}

/** Tryb statyczny: poprawne odpowiedzi są oznaczone w DOM od razu po załadowaniu strony. */
export interface QuestionConfig {
  /** kontener pojedynczego pytania (może być wiele na stronie) */
  containerSelector: string;
  /** treść pytania — selektor względem kontenera */
  textSelector: string;
  /** pojedyncza odpowiedź — selektor względem kontenera */
  answerSelector: string;
  /** poprawna odpowiedź — selektor względem kontenera (podzbiór answerSelector) */
  correctAnswerSelector: string;
  /** opcjonalne wyjaśnienie */
  explanationSelector?: string;
  /** opcjonalny klik odsłaniający odpowiedzi (np. „Pokaż rozwiązanie”) */
  revealSelector?: string;
}

/**
 * Tryb interaktywny: jedno pytanie na ekranie, poprawna odpowiedź pojawia się dopiero po
 * zaznaczeniu odpowiedzi i kliknięciu „Confirm”. Wartości to selektory Playwrighta —
 * CSS albo silniki `role=` / `text=` (np. `role=button[name=/confirm/i]`).
 */
export interface InteractiveConfig {
  /** treść pytania */
  questionTextSelector: string;
  /** pojedyncza klikalna odpowiedź (A/B/C/D) */
  optionSelector: string;
  /** tekst odpowiedzi wewnątrz opcji; bez tego z innerText opcji zdejmowana jest litera „A\n” */
  optionTextSelector?: string;
  confirmButton: string;
  nextButton: string;
  /** przycisk kończący quiz na ostatnim pytaniu, jeśli różni się od „Next” */
  finishButton?: string;
  /** przycisk startu quizu (ekran powitalny) */
  startButton?: string;
  /** przycisk ponownego podejścia (ekran wyników) */
  retakeButton?: string;
  /** element z werdyktem („This answer is correct.” / „…incorrect.”) */
  verdictSelector: string;
  /** regex (bez flag, dopasowanie bez rozróżniania wielkości liter) werdyktu poprawnej odpowiedzi */
  correctVerdictPattern: string;
  /** wyjaśnienie; bez tego brany jest tekst rodzica werdyktu minus sam werdykt */
  explanationSelector?: string;
  /**
   * regex z grupą 1 wyciągający poprawną odpowiedź z wyjaśnienia, np. "correct answer is ([A-D])\\b".
   * Grupa 1 = litera (A–Z, liczona w kolejności wyświetlania) albo tekst odpowiedzi.
   */
  explanationCorrectPattern?: string;
  /** opcja oznaczona jako poprawna po „Confirm” (np. zielona), jeśli strona ją oznacza */
  correctOptionSelector?: string;
  /** licznik „Question 1 of 20” — pozwala rozpoznać ostatnie pytanie */
  counterSelector?: string;
  /** tytuł quizu/rozdziału → pole `deck` */
  quizTitleSelector?: string;
  /** maksymalna liczba podejść do jednego quizu (siatka bezpieczeństwa dla nierozwiązanych pytań) */
  maxPasses: number;
}

export interface CrawlConfig {
  delayMs: number;
  timeoutMs: number;
  headless: boolean;
  /** waitUntil dla page.goto */
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
}

export interface SiteConfig {
  name: string;
  baseUrl: string;
  /** "static" (domyślnie) — odpowiedzi oznaczone w DOM; "interactive" — klikanie przez quiz */
  mode: 'static' | 'interactive';
  login: LoginConfig;
  listing: ListingConfig;
  question?: QuestionConfig;
  interactive?: InteractiveConfig;
  crawl: CrawlConfig;
}
