import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isReplyMood } from './assistantApi';
import type { ChatMessage } from './assistantApi';

/**
 * Past conversations with Navie, kept on this phone so they can be reopened and
 * carried on from the Assistant's history.
 *
 * One list per account, keyed by the signed-in email: a second person signing
 * in on the same phone must not see the first person's questions. The chat
 * endpoint is stateless and never learns who is asking, so there is nothing on
 * the server to keep them in.
 */

export interface SavedChat {
  id: string;
  /** The first question, which is what people remember a chat by. */
  title: string;
  createdAt: number;
  /** When the last message arrived; the list is newest first by this. */
  updatedAt: number;
  messages: ChatMessage[];
}

const KEY_PREFIX = 'smartflow.lex.chats.';
/** Older chats are dropped past this, so storage cannot grow without bound. */
const MAX_CHATS = 50;
/** A longer chat loses its oldest messages; only the last 10 ever reach the model. */
const MAX_MESSAGES = 200;
const TITLE_LENGTH = 60;

function storageKey(account: string | null): string {
  const normalised = account?.trim().toLowerCase() ?? '';
  return KEY_PREFIX + (normalised.length > 0 ? normalised : 'guest');
}

function titleFor(messages: ChatMessage[]): string {
  const first = messages.find((message) => message.role === 'user')?.text ?? 'Chat with Navie';
  const flat = first.replace(/\s+/g, ' ').trim();
  return flat.length > TITLE_LENGTH ? `${flat.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : flat;
}

/** Title and times are worked out from the messages, so only those are stored. */
function toSavedChat(id: string, messages: ChatMessage[]): SavedChat {
  return {
    id,
    title: titleFor(messages),
    createdAt: messages[0].at,
    updatedAt: messages[messages.length - 1].at,
    messages,
  };
}

function newestFirst(chats: SavedChat[]): SavedChat[] {
  return [...chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
}

function readMessage(raw: unknown): ChatMessage | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const item = raw as Record<string, unknown>;
  if (
    typeof item.id !== 'string' ||
    (item.role !== 'user' && item.role !== 'assistant') ||
    typeof item.text !== 'string' ||
    typeof item.at !== 'number'
  ) {
    return null;
  }
  const message: ChatMessage = { id: item.id, role: item.role, text: item.text, at: item.at };
  if (Array.isArray(item.toolsUsed)) {
    message.toolsUsed = item.toolsUsed.filter((tool): tool is string => typeof tool === 'string');
  }
  if (isReplyMood(item.mood)) {
    message.mood = item.mood;
  }
  return message;
}

/**
 * What is stored, checked message by message: a chat saved by an older build
 * loses only the parts this one cannot read, never the whole history.
 */
function readChats(raw: string | null): SavedChat[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const chats = parsed.flatMap((entry: unknown) => {
    const stored = entry as { id?: unknown; messages?: unknown } | null;
    if (stored === null || typeof stored.id !== 'string' || !Array.isArray(stored.messages)) {
      return [];
    }
    const messages = stored.messages
      .map(readMessage)
      .filter((message): message is ChatMessage => message !== null);
    return messages.length > 0 ? [toSavedChat(stored.id, messages)] : [];
  });
  return newestFirst(chats);
}

export function isSameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Whole calendar days between `at` and today: 0 today, 1 yesterday. */
function daysAgo(at: number): number {
  const startOf = (time: number): number => new Date(time).setHours(0, 0, 0, 0);
  return Math.round((startOf(Date.now()) - startOf(at)) / 86_400_000);
}

/** "Today", "Yesterday", or the date, for the day a message was sent. */
export function dayLabel(at: number): string {
  const days = daysAgo(at);
  if (days === 0) {
    return 'Today';
  }
  if (days === 1) {
    return 'Yesterday';
  }
  const sameYear = new Date(at).getFullYear() === new Date().getFullYear();
  return new Date(at).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** The time a chat was last active, as short as it can be while still clear. */
export function whenLabel(at: number): string {
  const days = daysAgo(at);
  if (days === 0) {
    return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return new Date(at).toLocaleDateString([], { weekday: 'short' });
  }
  const sameYear = new Date(at).getFullYear() === new Date().getFullYear();
  return new Date(at).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Which heading a chat is listed under in the history. */
export function historyGroup(at: number): string {
  const days = daysAgo(at);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'Previous 7 days' : 'Older';
}

export interface ChatHistory {
  /** Newest activity first. */
  chats: SavedChat[];
  /** Adds the chat, or replaces the stored copy of it. */
  save: (id: string, messages: ChatMessage[]) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export function useChatHistory(account: string | null): ChatHistory {
  const key = storageKey(account);
  const [chats, setChats] = useState<SavedChat[]>([]);
  /** The list as of the latest change, for changes made in quick succession. */
  const chatsRef = useRef<SavedChat[]>([]);
  /**
   * Writes run one at a time, after the load. A chat saved before the stored
   * list had been read would otherwise be written over everything stored.
   */
  const writes = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    chatsRef.current = [];
    setChats([]);
    writes.current = AsyncStorage.getItem(key)
      .catch(() => null)
      .then((raw) => {
        if (cancelled) {
          return;
        }
        // Anything saved while this was loading is newer than its stored copy.
        const savedMeanwhile = chatsRef.current;
        const stored = readChats(raw).filter(
          (chat) => !savedMeanwhile.some((recent) => recent.id === chat.id),
        );
        chatsRef.current = newestFirst([...savedMeanwhile, ...stored]);
        setChats(chatsRef.current);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const change = useCallback(
    (next: (current: SavedChat[]) => SavedChat[]): void => {
      chatsRef.current = next(chatsRef.current);
      setChats(chatsRef.current);
      writes.current = writes.current
        .then(() =>
          AsyncStorage.setItem(
            key,
            JSON.stringify(chatsRef.current.map(({ id, messages }) => ({ id, messages }))),
          ),
        )
        // A failed write only costs this change; the chat on screen is untouched.
        .catch(() => undefined);
    },
    [key],
  );

  const save = useCallback(
    (id: string, messages: ChatMessage[]): void => {
      if (messages.length === 0) {
        return;
      }
      const chat = toSavedChat(id, messages.slice(-MAX_MESSAGES));
      change((current) => newestFirst([chat, ...current.filter((item) => item.id !== id)]));
    },
    [change],
  );

  const remove = useCallback(
    (id: string): void => {
      change((current) => current.filter((item) => item.id !== id));
    },
    [change],
  );

  const clear = useCallback((): void => {
    change(() => []);
  }, [change]);

  return { chats, save, remove, clear };
}
