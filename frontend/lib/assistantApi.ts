import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AssistantToolName } from '@smartflow/shared';
import {
  ASSISTANT_TIMEOUT_MS,
  BACKEND_API_BASE_URL,
  GREETING_TIMEOUT_MS,
} from '../config/api';
import { wakeTrafficSource } from './corridorApi';

/**
 * Talks to SmartFlow's own backend, never to the model provider directly.
 *
 * The LLM API key stays on the server. Anything bundled into this app can be
 * extracted from the JS bundle, and a leaked key is someone else spending our
 * quota - so the app only ever sees our own endpoint.
 */

const CHAT_PATH = '/api/assistant/chat';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  at: number;
  /**
   * Data tools the model consulted for this reply, on assistant messages.
   * Only ever set locally - `toWireHistory` strips it, so it never goes back
   * to the server as part of the conversation.
   */
  toolsUsed?: string[];
  /** What the answer found, for the mascot beside it. Assistant messages only. */
  mood?: ReplyMood;
}

/**
 * What kind of answer a reply is, decided on the server from the live data it
 * looked up rather than from the reply's wording: `traffic` for slow or
 * congested road, `clear` for road running clear, `alert` for anything else.
 */
export type ReplyMood = 'traffic' | 'clear' | 'alert';
const MOODS: readonly ReplyMood[] = ['traffic', 'clear', 'alert'];

/**
 * Tool name -> what to tell the user it looked at.
 *
 * The backend already returned `toolsUsed` and the field was documented as
 * being "so the UI can show it was grounded", but nothing rendered it. An
 * answer about a road is worth more when you can see it checked the road.
 *
 * Keyed by `AssistantToolName` rather than `string`, so adding a tool on the
 * server without a label here fails the build instead of printing the raw
 * function name into the transcript.
 */
const labels: Record<AssistantToolName, string> = {
  // Reads ONE named exit in one direction - not the whole corridor, which is
  // what the old "Live corridor feed" label claimed.
  get_corridor_status: 'Live exit reading',
  get_corridor_overview: 'Live corridor snapshot',
  list_exits: 'Exit directory',
};

/**
 * What to show on the provenance chip for a tool the server reported.
 *
 * Falls back to the de-underscored name because `toolsUsed` arrives as plain
 * strings off the wire: a server running ahead of the app can still name a
 * tool this build has never heard of, and a rough label beats an empty chip.
 */
export function toolLabel(tool: string): string {
  return labels[tool as AssistantToolName] ?? tool.replace(/_/g, ' ');
}

export interface AssistantReply {
  reply: string;
  /** Which data tools the model consulted, so the UI can show it was grounded. */
  toolsUsed: string[];
  mood: ReplyMood;
}

/**
 * Wakes everything a question depends on, without waiting for any of it.
 *
 * Both our backend and the team's dashboard sleep when idle. The dashboard
 * cannot be woken by our backend at all - Render refuses it with 429 - so a
 * question asked cold stalled until the app gave up. Called when the screen
 * opens and on every send, so by the time a question is typed and sent both
 * are usually up.
 */
export function wakeAssistant(): void {
  void fetch(`${BACKEND_API_BASE_URL}/health`).catch(() => undefined);
  void wakeTrafficSource();
}

/** Lex's last few welcomes on this phone, sent back so the next one differs. */
const RECENT_GREETINGS_KEY = 'smartflow.lex.recentGreetings';
const RECENT_GREETINGS_KEPT = 6;

async function recentGreetings(): Promise<string[]> {
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(RECENT_GREETINGS_KEY)) ?? '[]') as unknown;
    return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * A fresh welcome from Lex for a new chat, written by the model, or null when
 * the backend cannot be reached in time.
 *
 * The server picks the opening and angle and is told the greetings this phone
 * saw recently, so opening the chat twice never gives the same line. Remembered
 * in AsyncStorage rather than memory so that holds across app restarts too;
 * storage failing only costs that memory, never the greeting.
 */
async function fetchGreeting(name: string | null): Promise<string | null> {
  const avoid = await recentGreetings();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GREETING_TIMEOUT_MS);
  try {
    const response = await fetch(`${BACKEND_API_BASE_URL}/api/assistant/greeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, hour: new Date().getHours(), avoid }),
      signal: controller.signal,
    });
    const payload = (await response.json()) as { success?: boolean; data?: { greeting?: string } };
    const greeting = payload.data?.greeting?.trim();
    if (!response.ok || payload.success !== true || greeting === undefined || greeting.length === 0) {
      return null;
    }
    try {
      await AsyncStorage.setItem(
        RECENT_GREETINGS_KEY,
        JSON.stringify([...avoid, greeting].slice(-RECENT_GREETINGS_KEPT)),
      );
    } catch {
      // Next greeting just will not know about this one.
    }
    return greeting;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The greeting for the chat after this one, written ahead of time.
 *
 * Fetching on open meant every new chat waited on the model, and a sleeping
 * backend made that 20-30s of "Lex is saying hi...". Kept in AsyncStorage so
 * it is ready even after the app restarts. It is thrown away if it was written
 * for a different name, a different part of the day ("Good morning" read at
 * night), or more than a few hours ago.
 */
const NEXT_GREETING_KEY = 'smartflow.lex.nextGreeting';
const NEXT_GREETING_MAX_AGE_MS = 3 * 60 * 60 * 1000;

interface StoredGreeting {
  text: string;
  name: string | null;
  partOfDay: string;
  at: number;
}

function partOfDayNow(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

async function takeStoredGreeting(name: string | null): Promise<string | null> {
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(NEXT_GREETING_KEY)) ?? 'null') as StoredGreeting | null;
    // Taken once: a greeting shown twice would not be "new" any more.
    await AsyncStorage.removeItem(NEXT_GREETING_KEY);
    if (
      stored !== null &&
      typeof stored.text === 'string' &&
      stored.name === name &&
      stored.partOfDay === partOfDayNow() &&
      Date.now() - stored.at < NEXT_GREETING_MAX_AGE_MS
    ) {
      return stored.text;
    }
  } catch {
    // Nothing usable stored; the caller asks the server instead.
  }
  return null;
}

async function prepareNextGreeting(name: string | null): Promise<void> {
  const text = await fetchGreeting(name);
  if (text === null) {
    return;
  }
  const stored: StoredGreeting = { text, name, partOfDay: partOfDayNow(), at: Date.now() };
  try {
    await AsyncStorage.setItem(NEXT_GREETING_KEY, JSON.stringify(stored));
  } catch {
    // The next chat will just fetch its own.
  }
}

/**
 * Lex's welcome for a new chat: the one written in advance when there is one,
 * otherwise a fresh one from the server, or null when it cannot be reached.
 * Either way the following chat's greeting starts being written straight away.
 */
export async function nextGreeting(name: string | null): Promise<string | null> {
  const ready = await takeStoredGreeting(name);
  const greeting = ready ?? (await fetchGreeting(name));
  void prepareNextGreeting(name);
  return greeting;
}

export type AssistantErrorKind = 'unreachable' | 'notConfigured' | 'failed';

export class AssistantError extends Error {
  readonly kind: AssistantErrorKind;

  constructor(kind: AssistantErrorKind, message: string) {
    super(message);
    this.name = 'AssistantError';
    this.kind = kind;
  }
}

/** Only role and content go to the server; ids and timestamps are ours. */
function toWireHistory(history: ChatMessage[]): { role: ChatRole; content: string }[] {
  return history.slice(-10).map((message) => ({
    role: message.role,
    content: message.text,
  }));
}

/** Pause between the first attempt and the retry. */
const RETRY_DELAY_MS = 1200;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The EN / TL switch in the Assistant header: which language Lex replies in. */
export type LanguageChoice = 'english' | 'tagalog';

const LANGUAGE_KEY = 'smartflow.lex.language';

/** The language picked last time; English until one has been picked. */
export async function loadLanguageChoice(): Promise<LanguageChoice> {
  try {
    return (await AsyncStorage.getItem(LANGUAGE_KEY)) === 'tagalog' ? 'tagalog' : 'english';
  } catch {
    return 'english';
  }
}

export async function saveLanguageChoice(choice: LanguageChoice): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, choice);
  } catch {
    // The pick still applies for this session; it just will not be remembered.
  }
}

async function postOnce(
  url: string,
  message: string,
  history: ChatMessage[],
  language: LanguageChoice,
): Promise<Response> {
  // The model reasons and may call tools, so this needs to be generous - but
  // not unbounded, or a dead backend leaves the user watching a spinner.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ASSISTANT_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: toWireHistory(history), language }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function askAssistant(
  message: string,
  history: ChatMessage[],
  language: LanguageChoice,
): Promise<AssistantReply> {
  const url = `${BACKEND_API_BASE_URL}${CHAT_PATH}`;

  /*
   * One retry, and only when nothing completed.
   *
   * Both services are on a free tier that sleeps, so the first request after an
   * idle spell can take long enough that the phone gives up while the server is
   * still starting. By the second attempt it is usually awake. A dropped mobile
   * signal behaves the same way.
   *
   * Deliberately not retried for anything the server actually answered: a
   * missing key will not fix itself, and a failed generation would just be paid
   * for twice.
   */
  let response: Response;
  const startedAt = Date.now();
  try {
    response = await postOnce(url, message, history, language);
  } catch {
    // A request that ran the full timeout is not retried: the server may still
    // be answering it, so a second copy only doubles the wait and the cost.
    if (Date.now() - startedAt >= ASSISTANT_TIMEOUT_MS - 1000) {
      throw new AssistantError(
        'unreachable',
        "The assistant didn't respond in time. It may be waking up - try again.",
      );
    }
    await wait(RETRY_DELAY_MS);
    try {
      response = await postOnce(url, message, history, language);
    } catch {
      throw new AssistantError(
        'unreachable',
        "The assistant didn't respond in time. It may be waking up - try again.",
      );
    }
  }

  if (response.status === 503) {
    throw new AssistantError(
      'notConfigured',
      'The assistant is not configured on the server yet.',
    );
  }

  let payload: { success?: boolean; data?: AssistantReply; message?: string };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new AssistantError('failed', 'The assistant sent a reply we could not read.');
  }

  if (!response.ok || payload.success !== true || payload.data === undefined) {
    throw new AssistantError('failed', payload.message ?? 'The assistant could not answer.');
  }

  // A server from before moods existed sends none; that is an "anything else".
  const mood = MOODS.includes(payload.data.mood) ? payload.data.mood : 'alert';
  return { reply: payload.data.reply, toolsUsed: payload.data.toolsUsed ?? [], mood };
}
