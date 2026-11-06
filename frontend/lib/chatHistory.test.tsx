import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ChatMessage } from './assistantApi';
import { useChatHistory } from './chatHistory';
import type { ChatHistory } from './chatHistory';

const store = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    },
  },
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

const KEY = 'smartflow.lex.chats.ysa@example.com';

/** Opens the history the way a fresh app start does. */
async function openHistory(): Promise<{ history: () => ChatHistory; close: () => Promise<void> }> {
  let current: ChatHistory;
  function Harness(): null {
    current = useChatHistory('ysa@example.com');
    return null;
  }
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<Harness />);
  });
  return {
    history: () => current,
    close: () =>
      act(async () => {
        renderer.unmount();
      }),
  };
}

const question: ChatMessage = { id: 'u1', role: 'user', text: 'May traffic ba sa Bocaue?', at: 1000 };
const answer: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  text: 'Bocaue is clear.',
  at: 2000,
  translations: { english: 'Bocaue is clear.', tagalog: 'Walang traffic sa Bocaue.' },
};

beforeEach(() => {
  store.clear();
});

it('keeps translations across an app restart', async () => {
  const first = await openHistory();
  await act(async () => {
    first.history().save('chat-1', [question, answer]);
  });
  await first.close();

  const second = await openHistory();
  expect(second.history().chats[0].messages[1].translations).toEqual({
    english: 'Bocaue is clear.',
    tagalog: 'Walang traffic sa Bocaue.',
  });
  expect(second.history().chats[0].messages[0].translations).toBeUndefined();
});

it('opens a chat saved before translations existed', async () => {
  store.set(
    KEY,
    JSON.stringify([
      {
        id: 'old',
        messages: [
          { id: 'u', role: 'user', text: 'Kumusta ang Dau?', at: 1 },
          { id: 'a', role: 'assistant', text: 'Dau is clear.', at: 2, toolsUsed: ['get_corridor_status'] },
        ],
      },
    ]),
  );
  const opened = await openHistory();
  const [chat] = opened.history().chats;
  expect(chat.messages).toHaveLength(2);
  expect(chat.messages[1].text).toBe('Dau is clear.');
  expect(chat.messages[1].translations).toBeUndefined();
});

it('drops an unreadable translation and keeps the message', async () => {
  store.set(
    KEY,
    JSON.stringify([
      {
        id: 'odd',
        messages: [
          { id: 'a', role: 'assistant', text: 'Dau is clear.', at: 2, translations: { tagalog: 7, french: 'x' } },
        ],
      },
    ]),
  );
  const opened = await openHistory();
  expect(opened.history().chats[0].messages[0].text).toBe('Dau is clear.');
  expect(opened.history().chats[0].messages[0].translations?.tagalog).toBeUndefined();
});

describe('update', () => {
  const older: ChatMessage = { id: 'o', role: 'assistant', text: 'Older', at: 500 };

  it('adds a translation without moving the chat up the list', async () => {
    const opened = await openHistory();
    await act(async () => {
      opened.history().save('old-chat', [older]);
      opened.history().save('new-chat', [question, answer]);
    });

    await act(async () => {
      opened.history().update('old-chat', (messages) =>
        messages.map((message) => ({ ...message, translations: { tagalog: 'Mas luma' } })),
      );
    });

    const { chats } = opened.history();
    expect(chats.map((chat) => chat.id)).toEqual(['new-chat', 'old-chat']);
    expect(chats[1].messages[0].translations?.tagalog).toBe('Mas luma');
  });

  it('does not bring back a chat deleted while its translation was on the way', async () => {
    const opened = await openHistory();
    await act(async () => {
      opened.history().save('chat-1', [question, answer]);
    });
    await act(async () => {
      opened.history().remove('chat-1');
    });
    await act(async () => {
      opened.history().update('chat-1', (messages) => messages);
    });
    expect(opened.history().chats).toEqual([]);
  });
});
