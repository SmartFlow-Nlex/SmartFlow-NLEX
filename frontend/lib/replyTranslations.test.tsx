import { useCallback, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ChatMessage, LanguageChoice } from './assistantApi';
import { shownText } from './assistantApi';
import { useReplyTranslations } from './replyTranslations';
import type { ReplyTranslationsResult } from './replyTranslations';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));
jest.mock('../config/api', () => ({
  ASSISTANT_TIMEOUT_MS: 75000,
  BACKEND_API_BASE_URL: 'http://test',
  GREETING_TIMEOUT_MS: 35000,
}));
jest.mock('./corridorApi', () => ({ wakeTrafficSource: async () => undefined }));
jest.mock('../auth/supabaseClient', () => ({ isSupabaseConfigured: false, getSupabase: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const realConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (!String(args[0]).includes('react-test-renderer is deprecated')) {
    realConsoleError(...args);
  }
};

interface Pending {
  text: string;
  language: LanguageChoice;
  answer: (translation: string | null) => Promise<void>;
}

let pending: Pending[];

beforeEach(() => {
  pending = [];
  (globalThis as { fetch: unknown }).fetch = jest.fn((_url: string, init: { body: string }) => {
    const { text, language } = JSON.parse(init.body) as { text: string; language: LanguageChoice };
    return new Promise((resolve) => {
      pending.push({
        text,
        language,
        answer: (translation) =>
          act(async () => {
            resolve({
              ok: translation !== null,
              json: async () =>
                translation === null ? { success: false } : { success: true, data: { translation } },
            });
          }),
      });
    });
  });
});

function user(id: string, text: string): ChatMessage {
  return { id, role: 'user', text, at: 1 };
}

function reply(id: string, text: string, language?: LanguageChoice): ChatMessage {
  return { id, role: 'assistant', text, at: 1, ...(language === undefined ? {} : { translations: { [language]: text } }) };
}

interface Screen {
  messages: () => ChatMessage[];
  hook: () => ReplyTranslationsResult;
  flip: (language: LanguageChoice) => Promise<void>;
  open: (owner: string, messages: ChatMessage[]) => Promise<void>;
  landed: { owner: string | null; id: string; language: LanguageChoice; text: string }[];
  renderer: ReactTestRenderer;
}

/** Keeps messages and language in state, the way the Assistant screen does. */
async function mount(messages: ChatMessage[], language: LanguageChoice, owner = 'chat-1'): Promise<Screen> {
  let hook: ReplyTranslationsResult;
  let shown: ChatMessage[] = messages;
  let setLanguage: (next: LanguageChoice) => void = () => undefined;
  let setView: (next: { owner: string; messages: ChatMessage[] }) => void = () => undefined;
  const landed: Screen['landed'] = [];

  function Harness(): null {
    const [view, setViewState] = useState({ owner, messages });
    const [current, setCurrent] = useState(language);
    setLanguage = setCurrent;
    setView = setViewState;
    shown = view.messages;

    const onTranslated = useCallback(
      (from: string | null, id: string, target: LanguageChoice, text: string): void => {
        landed.push({ owner: from, id, language: target, text });
        setViewState((state) =>
          state.owner !== from
            ? state
            : {
                ...state,
                messages: state.messages.map((message) =>
                  message.id === id
                    ? { ...message, translations: { ...message.translations, [target]: text } }
                    : message,
                ),
              },
        );
      },
      [],
    );

    hook = useReplyTranslations({ owner: view.owner, messages: view.messages, language: current, onTranslated });
    return null;
  }

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<Harness />);
  });

  return {
    messages: () => shown,
    hook: () => hook,
    flip: (next) =>
      act(async () => {
        setLanguage(next);
      }),
    open: (nextOwner, next) =>
      act(async () => {
        setView({ owner: nextOwner, messages: next });
      }),
    landed,
    renderer,
  };
}

const CHAT: ChatMessage[] = [
  user('u1', 'May traffic ba sa Bocaue?'),
  reply('a1', 'Bocaue is clear.', 'english'),
  user('u2', 'Sa Marilao?'),
  reply('a2', 'Marilao is slow at 54 km/h.', 'english'),
];

describe('flipping the switch', () => {
  it('does nothing while the chat is already in that language', async () => {
    const screen = await mount(CHAT, 'english');
    expect(pending).toHaveLength(0);
    expect(screen.hook().stateOf(CHAT[1])).toBe('ready');
  });

  it("translates Navie's replies and never the user's words", async () => {
    const screen = await mount(CHAT, 'english');
    await screen.flip('tagalog');

    expect(pending.map((request) => request.text).sort()).toEqual(['Bocaue is clear.', 'Marilao is slow at 54 km/h.']);
    expect(pending.every((request) => request.language === 'tagalog')).toBe(true);

    await pending[0].answer('Mabagal sa Marilao, 54 km/h.');
    await pending[1].answer('Walang traffic sa Bocaue.');

    const shown = screen.messages().map((message) => shownText(message, 'tagalog'));
    expect(shown).toEqual([
      'May traffic ba sa Bocaue?',
      'Walang traffic sa Bocaue.',
      'Sa Marilao?',
      'Mabagal sa Marilao, 54 km/h.',
    ]);
  });

  it('flips back at once, without asking again', async () => {
    const screen = await mount(CHAT, 'english');
    await screen.flip('tagalog');
    await pending[0].answer('Mabagal sa Marilao, 54 km/h.');
    await pending[1].answer('Walang traffic sa Bocaue.');
    const asked = pending.length;

    await screen.flip('english');
    expect(pending).toHaveLength(asked);
    expect(shownText(screen.messages()[3], 'english')).toBe('Marilao is slow at 54 km/h.');

    await screen.flip('tagalog');
    expect(pending).toHaveLength(asked);
    expect(shownText(screen.messages()[3], 'tagalog')).toBe('Mabagal sa Marilao, 54 km/h.');
  });

  it('starts with the newest reply and never runs more than three at once', async () => {
    const long = Array.from({ length: 8 }, (_, index) => reply(`a${index}`, `Reply ${index}`, 'english'));
    const screen = await mount(long, 'english');
    await screen.flip('tagalog');

    expect(pending.map((request) => request.text)).toEqual(['Reply 7', 'Reply 6', 'Reply 5']);

    await pending[0].answer('Sagot 7');
    expect(pending).toHaveLength(4);
    expect(pending[3].text).toBe('Reply 4');

    for (let index = 1; index < 8; index += 1) {
      await pending[index].answer(`Sagot ${pending[index].text.slice(-1)}`);
    }
    expect(pending).toHaveLength(8);
    expect(screen.messages().every((message) => screen.hook().stateOf(message) === 'ready')).toBe(true);
  });

  it('translates a chat saved before the switch translated anything', async () => {
    const screen = await mount([reply('old', 'Bocaue is clear.')], 'tagalog');
    expect(pending.map((request) => request.text)).toEqual(['Bocaue is clear.']);
    await pending[0].answer('Walang traffic sa Bocaue.');
    expect(shownText(screen.messages()[0], 'tagalog')).toBe('Walang traffic sa Bocaue.');
  });
});

describe('when a translation fails', () => {
  it('keeps the reply readable, does not keep asking, and tries again on request', async () => {
    const screen = await mount(CHAT.slice(0, 2), 'english');
    await screen.flip('tagalog');
    expect(screen.hook().stateOf(CHAT[1])).toBe('waiting');

    await pending[0].answer(null);
    expect(screen.hook().stateOf(CHAT[1])).toBe('failed');
    expect(pending).toHaveLength(1);
    expect(shownText(screen.messages()[1], 'tagalog')).toBe('Bocaue is clear.');

    await act(async () => {
      screen.hook().retry();
    });
    expect(pending).toHaveLength(2);
    await pending[1].answer('Walang traffic sa Bocaue.');
    expect(shownText(screen.messages()[1], 'tagalog')).toBe('Walang traffic sa Bocaue.');
    expect(screen.hook().stateOf(screen.messages()[1])).toBe('ready');
  });

  it('tries again when the switch is flipped away and back', async () => {
    const screen = await mount(CHAT.slice(0, 2), 'english');
    await screen.flip('tagalog');
    await pending[0].answer(null);

    await screen.flip('english');
    await screen.flip('tagalog');
    expect(pending).toHaveLength(2);
  });

  it('leaves the other replies to finish', async () => {
    const screen = await mount(CHAT, 'english');
    await screen.flip('tagalog');
    await pending[0].answer(null);
    await pending[1].answer('Walang traffic sa Bocaue.');
    expect(screen.hook().stateOf(screen.messages()[3])).toBe('failed');
    expect(screen.hook().stateOf(screen.messages()[1])).toBe('ready');
  });
});

describe('things changing while a translation is on its way', () => {
  it('keeps a result that lands after the switch flipped again', async () => {
    const screen = await mount(CHAT.slice(0, 2), 'english');
    await screen.flip('tagalog');
    await screen.flip('english');

    await pending[0].answer('Walang traffic sa Bocaue.');

    expect(shownText(screen.messages()[1], 'english')).toBe('Bocaue is clear.');
    await screen.flip('tagalog');
    expect(pending).toHaveLength(1);
    expect(shownText(screen.messages()[1], 'tagalog')).toBe('Walang traffic sa Bocaue.');
  });

  it('sends a result to the chat it was asked for, not the one now open', async () => {
    const screen = await mount([reply('first', 'Bocaue is clear.', 'english')], 'english', 'chat-1');
    await screen.flip('tagalog');
    await screen.open('chat-2', [reply('second', 'Dau is clear.', 'english')]);

    const forFirst = pending.find((request) => request.text === 'Bocaue is clear.') as Pending;
    await forFirst.answer('Walang traffic sa Bocaue.');

    expect(screen.landed).toEqual([
      { owner: 'chat-1', id: 'first', language: 'tagalog', text: 'Walang traffic sa Bocaue.' },
    ]);
    expect(shownText(screen.messages()[0], 'tagalog')).toBe('Dau is clear.');
  });

  it('asks once for a reply that arrives during a flip', async () => {
    const screen = await mount(CHAT.slice(0, 2), 'english');
    await screen.flip('tagalog');
    await screen.open('chat-1', [...screen.messages(), reply('a9', 'Dau is clear.', 'english')]);
    const texts = pending.map((request) => request.text);
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts).toContain('Dau is clear.');
  });
});

// A request left open keeps its 75 s timeout running, which holds the test run open.
afterEach(async () => {
  for (const request of pending) {
    await request.answer(null);
  }
});

it('counts a server error as a failed translation rather than showing it', async () => {
  (globalThis as { fetch: unknown }).fetch = jest.fn(async () => {
    throw new Error('offline');
  });
  const screen = await mount(CHAT.slice(0, 2), 'tagalog');
  await act(async () => undefined);
  expect(screen.hook().stateOf(CHAT[1])).toBe('failed');
  expect(shownText(screen.messages()[1], 'tagalog')).toBe('Bocaue is clear.');
});
