import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { needsTranslation, translateReply } from './assistantApi';
import type { ChatMessage, LanguageChoice } from './assistantApi';

/**
 * Keeps Navie's replies in the language of the EN / TL switch, whichever language
 * each was first written in. The user's own messages are never touched.
 *
 * Runs whenever the messages on screen or the switch change, so flipping the
 * switch and reopening an old chat are the same case: any reply not yet written
 * in this language gets translated.
 */

/** Few enough to be gentle on the free-tier backend, enough that a chat turns over quickly. */
const AT_ONCE = 3;

export type TranslationState = 'ready' | 'waiting' | 'failed';

export interface ReplyTranslationsOptions {
  /** The saved chat these messages belong to; null for the greeting, which is not saved. */
  owner: string | null;
  messages: ChatMessage[];
  language: LanguageChoice;
  /** A translation arrived. It belongs to `owner`, which may no longer be on screen. */
  onTranslated: (owner: string | null, messageId: string, language: LanguageChoice, text: string) => void;
}

export interface ReplyTranslationsResult {
  stateOf: (message: ChatMessage) => TranslationState;
  /** Tries every failed reply again. */
  retry: () => void;
}

function keyFor(messageId: string, language: LanguageChoice): string {
  return `${messageId}:${language}`;
}

export function useReplyTranslations({
  owner,
  messages,
  language,
  onTranslated,
}: ReplyTranslationsOptions): ReplyTranslationsResult {
  /** Requests on their way. A ref, as the check and the start must happen in one step. */
  const underWay = useRef<Set<string>>(new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  /** Bumped when a request ends, so the next reply in line gets its turn. */
  const [turn, nextTurn] = useReducer((count: number) => count + 1, 0);

  // A flip is the user asking again, so what failed before gets another go.
  useEffect(() => {
    setFailed(new Set());
  }, [language]);

  useEffect(() => {
    /*
     * Newest first, because that is what is on screen. Requests still running
     * when the switch flips or another chat opens are left to finish: what they
     * bring back is still right for the reply it was asked about, and is kept.
     */
    const waiting = [...messages]
      .reverse()
      .filter((message) => needsTranslation(message, language))
      .filter((message) => {
        const key = keyFor(message.id, language);
        return !underWay.current.has(key) && !failed.has(key);
      })
      .slice(0, Math.max(0, AT_ONCE - underWay.current.size));

    for (const message of waiting) {
      const key = keyFor(message.id, language);
      underWay.current.add(key);
      void translateReply(message.text, language).then((translated) => {
        underWay.current.delete(key);
        if (translated === null) {
          setFailed((current) => new Set(current).add(key));
        } else {
          onTranslated(owner, message.id, language, translated);
        }
        nextTurn();
      });
    }
  }, [failed, language, messages, onTranslated, owner, turn]);

  const stateOf = useCallback(
    (message: ChatMessage): TranslationState => {
      if (!needsTranslation(message, language)) {
        return 'ready';
      }
      return failed.has(keyFor(message.id, language)) ? 'failed' : 'waiting';
    },
    [failed, language],
  );

  const retry = useCallback((): void => {
    setFailed(new Set());
  }, []);

  return { stateOf, retry };
}
