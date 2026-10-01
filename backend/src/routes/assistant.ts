import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import type { AssistantToolName } from '@smartflow/shared';
import {
  CorridorExit,
  describeFeedAge,
  findExit,
  getCorridorStatus,
} from '../services/corridor';

/**
 * SmartFlow NLEX assistant.
 *
 * The model never answers traffic questions from its own knowledge - it has
 * none about NLEX. It is given tools that read our live corridor feed, and the
 * system prompt forbids guessing. That is deliberate: people make driving
 * decisions on these answers, so an invented "the road is clear" is worse than
 * admitting the data is unavailable.
 *
 * The API key lives here on the server and never reaches the mobile app, where
 * it could be extracted from the JS bundle and used to run up charges.
 */

const router: Router = Router();

const QWEN_API_KEY = process.env.QWEN_API_KEY ?? '';
const QWEN_BASE_URL =
  process.env.QWEN_BASE_URL ?? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const QWEN_MODEL = process.env.QWEN_MODEL ?? 'qwen3.8-flash';

/**
 * Zero Data Retention.
 *
 * Only meaningful on OpenRouter: with it set, OpenRouter routes the request
 * ONLY to endpoints that carry a zero-retention policy, and refuses rather
 * than silently falling back to one that logs. That turns "the provider says
 * it does not keep prompts" from something you take on trust into something
 * enforced at the routing layer.
 *
 * Sent only when enabled - a provider that does not understand the field
 * could reject the whole request.
 */
const LLM_ZDR = (process.env.LLM_ZDR ?? '').trim().toLowerCase() === 'true';

/** OpenRouter asks callers to identify themselves; harmless elsewhere. */
const isOpenRouter = QWEN_BASE_URL.includes('openrouter.ai');

export const isAssistantConfigured = QWEN_API_KEY.length > 0;

/** Built lazily so an unconfigured server still starts and reports why. */
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (client === null) {
    client = new OpenAI({
      apiKey: QWEN_API_KEY,
      baseURL: QWEN_BASE_URL,
      defaultHeaders: isOpenRouter
        ? {
            'HTTP-Referer': 'https://github.com/SmartFlow-Nlex/Mobile-Application',
            'X-Title': 'SmartFlow NLEX Assistant',
          }
        : undefined,
    });
  }
  return client;
}

const SYSTEM_PROMPT_BASE = `You are Lex, the SmartFlow NLEX traffic assistant - a friendly little car mascot. If asked who you are, you are Lex. You help commuters and drivers on the NLEX expressway in the Philippines.

STRICT RULES:
1. You ONLY answer questions about CURRENT TRAFFIC CONDITIONS on the NLEX corridor, and about which exits exist and where they are. For anything else, politely say it is outside what you can help with and offer an NLEX-related suggestion instead.
1b. Route planning, travel time, journey duration and departure advice are NOT AVAILABLE IN THIS APP YET. Your tools return none of it - only congestion at exits - so any such answer would be invented.
1c. When asked for one, say two things and stop: that it is not available in this app yet, and that you can check traffic at an exit instead. IN THE USER'S OWN LANGUAGE - the Tagalog wording below is an example of the shape, not a script to copy when they wrote in English.
    Tagalog: "Wala pa pong travel time sa app na ito. Pero pwede kong i-check ang traffic sa Bocaue."
    English: "Travel times aren't in this app yet. I can check the traffic at Bocaue though."
    Name ONLY exits the user actually mentioned. If they named none, ask which exit they mean - never list the corridor.
    Then stop. Do NOT add a suggestion afterwards. "Pero pwede kang dumaan sa NLEX northbound" IS route advice and is forbidden - naming a direction, a road or an order of exits all count, even as a helpful aside.
1d. Say "not available in this app yet", never "SmartFlow cannot". The dashboard does track delay, so claiming the system cannot do travel times would be wrong about your own project.
2. NEVER state or guess a traffic condition without calling a tool first. You have no knowledge of current NLEX conditions.
2b. NEVER say a place is not an NLEX exit based on your own knowledge. The authoritative list is given below - check it. If a name is on that list, call get_corridor_status for it. Only if it is genuinely absent from that list may you say you do not recognise it.
3. If a tool reports data is unavailable, say so plainly. Do not substitute a guess.
4. Reply in the language named under REPLY LANGUAGE at the end of these instructions, and follow its style guide.
5. Be brief - most users are about to drive. Two or three sentences is usually right.
6. Answer ONLY what was asked. Do not volunteer conditions at other exits unless the user asked about them.
7. Write plain text only. No markdown - no **bold**, no *italics*, no # headings. The app shows your reply in a chat bubble that renders none of it, so the symbols appear literally.

CHOOSING A TOOL:
- The user named a place (Bocaue, Balintawak, Marilao...) -> get_corridor_status for THAT exit. One call.
- The user asked about NLEX generally, with no place named -> get_corridor_overview.
- The user asked WHERE traffic is slow, heavy, congested or moving ("saan mabagal", "saan may traffic", "where is it slow") -> get_corridor_overview. These are live traffic questions, NOT travel time: "daloy" means the flow of traffic, and "mabagal ang daloy" means traffic is slow. Rule 1b applies only to how long a trip takes.
- Never use get_corridor_overview to answer a question about one specific exit.

GEOGRAPHY: northbound runs from Balintawak (KM 0, Metro Manila) towards Sta. Ines (KM 86, near Clark). Southbound is the reverse. "Papuntang Manila" or "going to Manila" means SOUTHBOUND. "Papuntang Clark/Pampanga" means NORTHBOUND.`;

/**
 * The exit list goes into the prompt itself, not just into a tool.
 *
 * Asked about Dau, the model replied that Dau is not an NLEX exit - it is, at
 * KM 71 - because it answered from its own knowledge rather than calling a
 * tool. Whether a place exists on this road is something it should never have
 * to guess at, so it is stated up front. Conditions still come only from
 * tools; this is the roster, not the traffic.
 *
 * Taken from the live feed, so an exit added upstream appears here without a
 * code change - but never waited for. Fetching the feed first meant that when
 * the team's dashboard was asleep every question stalled for up to 50s before
 * the model even started, the app gave up at 45s, and when the feed failed the
 * model ran without the list and fell back to guessing. So the prompt uses the
 * last list the feed gave, or this built-in copy of the 20 exits until then.
 */
const BUILT_IN_EXIT_NAMES = [
  'Balintawak', 'NLEX Harbor Link', 'Paso de Blas Valenzuela', 'Meycauayan', 'Marilao',
  'CDV/PH Arena', 'Bocaue Barrier', 'Bocaue Interchange', 'Tambubong', 'Tabang Guiguinto',
  'Balagtas', 'Sta. Rita Guiguinto', 'Pulilan', 'San Simon', 'San Fernando', 'Mexico',
  'Angeles', 'Dau', 'SCTEX', 'Sta. Ines',
];
let knownExitNames: string[] = BUILT_IN_EXIT_NAMES;

/** Refreshes the roster in the background; the reply never waits for it. */
function refreshExitNames(): void {
  void getCorridorStatus().then((corridor) => {
    if (corridor.available && corridor.data.exits.length > 0) {
      knownExitNames = corridor.data.exits.map((exit) => exit.display_name);
    }
  });
}

/**
 * What kind of answer this was, for the mascot beside it: `traffic` when the
 * road it looked at is slow or congested, `clear` when all of it is running
 * clear, `alert` for anything else - no lookup, an unknown exit, or the feed
 * being down. Read from the tool results, not the reply's wording, so it
 * follows the data whatever language the answer is in.
 */
export type ReplyMood = 'traffic' | 'clear' | 'alert';

function moodOf(result: unknown): ReplyMood | null {
  if (typeof result !== 'object' || result === null || 'error' in result) {
    return null;
  }
  const r = result as { status?: string; has_ramp?: boolean; counts?: { congested?: number; slow?: number } };
  if (r.counts !== undefined) {
    return (r.counts.congested ?? 0) + (r.counts.slow ?? 0) > 0 ? 'traffic' : 'clear';
  }
  if (r.has_ramp === false) {
    return null;
  }
  if (r.status === 'congested' || r.status === 'slow') {
    return 'traffic';
  }
  return r.status === 'clear' ? 'clear' : null;
}

/*
 * Which language to answer in, decided here rather than left to the model.
 *
 * "Reply in whichever language they used" was not enough: asked "congested ba
 * sa san fernando southbound?" the model answered in stiff, word-for-word
 * Tagalog - "Nagtataguyod ang traffic ... Ang bilis ng paglalakbay ay" - which
 * no one says, and "nagtataguyod" means to support or promote. So the question
 * is classified in code and the model is told the answer language outright,
 * with a style guide of the words Filipino drivers actually use.
 */
export type ReplyLanguage = 'english' | 'tagalog' | 'taglish';

const TAGALOG_WORDS = new Set([
  'ba', 'sa', 'ang', 'ng', 'mga', 'po', 'opo', 'ngayon', 'may', 'meron', 'mayroon', 'wala', 'walang',
  'ko', 'mo', 'naman', 'lang', 'pa', 'na', 'yung', 'kasi', 'paano', 'saan', 'ano', 'pwede', 'puwede',
  'kumusta', 'kamusta', 'bakit', 'dito', 'doon', 'dun', 'diyan', 'papunta', 'papuntang', 'galing',
  'masikip', 'maluwag', 'mabigat', 'mabagal', 'trapik', 'trapiko', 'nga', 'din', 'rin', 'tayo', 'ako',
  'ikaw', 'kayo', 'niyo', 'natin', 'oo', 'hindi', 'di', 'sana', 'gusto', 'pakicheck', 'daan', 'daloy',
  'ba\'t', 'gaano', 'katagal', 'mula', 'hanggang', 'ito', 'iyan', 'yan', 'yun', 'nang', 'kung', 'ay',
]);

/*
 * English is recognised from its own common words, and everything else counts
 * for neither side. Counting every non-Tagalog word as English made place
 * names ("Bocaue", "Manila") and Tagalog words missing from the list ("lagay")
 * turn plain Tagalog into Taglish. "traffic" is deliberately absent: "may
 * traffic ba sa Dau?" is ordinary Tagalog.
 */
const ENGLISH_WORDS = new Set([
  'is', 'are', 'am', 'was', 'the', 'a', 'an', 'what', 'whats', 'how', 'hows', 'there', 'any', 'now',
  'right', 'congested', 'congestion', 'clear', 'heavy', 'light', 'slow', 'fast', 'busy', 'jam',
  'jammed', 'northbound', 'southbound', 'going', 'to', 'at', 'on', 'in', 'of', 'and', 'or', 'can',
  'could', 'you', 'please', 'check', 'road', 'today', 'tonight', 'currently', 'status', 'condition',
  'conditions', 'bad', 'good', 'moving', 'speed', 'near', 'from', 'toward', 'towards', 'for', 'it',
  'its', 'does', 'do', 'will', 'should', 'i', 'my', 'me', 'we', 'route', 'avoid', 'time', 'travel',
  'long', 'hello', 'hi', 'hey', 'thanks', 'thank', 'yes', 'which', 'where', 'when', 'why', 'who',
  'much', 'many', 'lane', 'lanes', 'accident', 'update', 'latest', 'like', 'about', 'tell', 'show',
  'expressway', 'highway', 'exits', 'still', 'already', 'very', 'really', 'so',
]);

export function detectLanguage(message: string): ReplyLanguage {
  const words = message.toLowerCase().match(/[a-zñ']+/g) ?? [];
  let tagalog = 0;
  let english = 0;
  for (const word of words) {
    if (TAGALOG_WORDS.has(word)) tagalog += 1;
    else if (ENGLISH_WORDS.has(word)) english += 1;
  }
  if (tagalog === 0) return 'english';
  return english === 0 ? 'tagalog' : 'taglish';
}

const LANGUAGE_REMINDER: Record<ReplyLanguage, string> = {
  english: 'Reply in plain English only.',
  tagalog:
    'Sumagot sa natural na Tagalog, hal. "May traffic ngayon sa ..., mga 4 km/h lang ang takbo." o "Walang traffic ngayon sa ..., maluwag ang daan." Huwag gamitin ang "bilis ng paglalakbay", "humigit-kumulang" o "nagtataguyod".',
  taglish:
    'Reply in natural Taglish, e.g. "Congested ngayon sa ... southbound, mga 4 km/h lang ang takbo." or "Clear ngayon sa ... northbound, walang traffic." Never "bilis ng paglalakbay", "humigit-kumulang" or "nagtataguyod".',
};

/** Earlier replies may predate these rules, and the model copies their wording otherwise. */
const HISTORY_NOTE =
  'Earlier replies in this conversation may use wording that breaks these rules. Do not copy their phrasing; follow the style guide above.';

const LANGUAGE_GUIDE: Record<ReplyLanguage, string> = {
  english: `REPLY LANGUAGE: English. The user wrote in English, so answer entirely in plain, everyday English. No Tagalog words at all.
Examples: "Traffic is heavy at San Fernando southbound right now, moving at about 4 km/h." / "Bocaue northbound is clear right now."`,
  tagalog: `REPLY LANGUAGE: Tagalog. The user wrote in Tagalog, so answer in natural, conversational Tagalog - the way a Filipino driver actually talks, not a formal or word-for-word translation. Keep "km/h", exit names and "NLEX" as they are, and use "po" only if the user did.
Say it this way: "may traffic", "walang traffic", "mabigat ang daloy", "maluwag ang daan", "mabagal ang takbo", "mga 4 km/h lang ang takbo", "papuntang Manila".
NEVER use stiff or literal words: not "nagtataguyod", not "bilis ng paglalakbay", not "paglalakbay", not "humigit-kumulang" (say "mga"), not "kasalukuyan", not "siksikan ng trapiko".
Examples: "May traffic ngayon sa San Fernando papuntang Manila, mga 4 km/h lang ang takbo." / "Walang traffic ngayon sa Bocaue papuntang Clark, maluwag ang daan."`,
  taglish: `REPLY LANGUAGE: Taglish. The user mixed Tagalog and English, so answer the same way - Tagalog sentence structure with the everyday English traffic terms Filipinos use when texting: "traffic", "congested", "clear", "southbound", "northbound", "right now".
NEVER use stiff or literal Tagalog: not "nagtataguyod", not "bilis ng paglalakbay", not "paglalakbay", not "humigit-kumulang" (say "mga").
Examples: "Congested ngayon sa San Fernando southbound, mga 4 km/h lang ang takbo." / "Clear ngayon sa Bocaue northbound, walang traffic."`,
};

/*
 * The exit a message names, if any, so an answer that skips the lookup can be
 * caught. Matched on the name's distinctive words ("paso de blas", "harbor
 * link", "sta rita"), since nobody types "Paso de Blas Valenzuela" in full.
 */
const GENERIC_NAME_WORDS = new Set(['nlex', 'interchange', 'barrier', 'valenzuela', 'guiguinto']);

function normaliseText(value: string): string {
  return ` ${value.toLowerCase().replace(/santa /g, 'sta ').replace(/[.,'"?!]/g, ' ').replace(/\s+/g, ' ')} `;
}

export function mentionedExit(message: string, exitNames: string[]): string | null {
  const text = normaliseText(message);
  for (const name of exitNames) {
    for (const part of name.split('/')) {
      const key = normaliseText(part)
        .trim()
        .split(' ')
        .filter((word) => word.length > 0 && !GENERIC_NAME_WORDS.has(word))
        .join(' ');
      if (key.length >= 3 && text.includes(` ${key} `)) {
        return name;
      }
    }
  }
  return null;
}

/*
 * Whether a message asks about live traffic, so an answer that skipped the
 * lookup can be caught when no exit is named. Asked "saan mabagal ang daloy ng
 * traffic ngayon?" - where is traffic slow right now - the model took "daloy"
 * (flow) for travel time and replied that travel times are not in the app.
 * Real travel-time questions are excluded: those do get that reply.
 */
const TRAFFIC_WORDS =
  /\b(traffic|trapik|trapiko|congest\w*|mabagal|mabigat|daloy|siksik\w*|masikip|sikip|maluwag|slow|heavy|jam\w*|busy|lagay)\b/i;
const TRAVEL_TIME_WORDS =
  /(gaano katagal|katagal|how long|travel time|\beta\b|ilang oras|ilang minuto|duration)/i;

export function asksAboutTraffic(message: string): boolean {
  return TRAFFIC_WORDS.test(message) && !TRAVEL_TIME_WORDS.test(message);
}

function buildSystemPrompt(exitNames: string[]): string {
  if (exitNames.length === 0) {
    return SYSTEM_PROMPT_BASE;
  }
  return `${SYSTEM_PROMPT_BASE}

THE COMPLETE LIST OF NLEX EXITS (authoritative - nothing else is an NLEX exit, and everything here IS one):
${exitNames.join(', ')}`;
}

/**
 * A tool whose name is one the app has a label for.
 *
 * Registering a tool here that is not in the shared `ASSISTANT_TOOLS` list is
 * a compile error, which is the point: the chat UI shows the reader which
 * tools ran, and an unlisted one reaches them as a bare function name.
 */
type LabelledTool = ChatCompletionTool & { function: { name: AssistantToolName } };

const tools: LabelledTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_corridor_status',
      description:
        'Live traffic status at ONE named NLEX exit in one direction. Use this whenever the user mentions a specific place, e.g. "Is Bocaue jammed?". Preferred over get_corridor_overview for any question about a named exit.',
      parameters: {
        type: 'object',
        properties: {
          exit_name: {
            type: 'string',
            description: 'Exit name, e.g. "Bocaue Barrier", "Balintawak", "Marilao".',
          },
          direction: {
            type: 'string',
            enum: ['northbound', 'southbound'],
            description: 'northbound = towards Clark, southbound = towards Manila.',
          },
        },
        required: ['exit_name', 'direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_corridor_overview',
      description:
        'Corridor-wide summary: counts, plus where traffic is congested and where it is slow right now. Use when the user asks about NLEX as a whole or asks WHERE traffic is bad, slow or flowing, without naming an exit - e.g. "How is NLEX right now?", "Where is it congested?", "Saan mabagal ang daloy ng traffic?", "Saan may traffic ngayon?". Do NOT use this to answer about a single named exit.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_exits',
      description:
        'All NLEX exits in order with their KM markers. Use to check a name or answer questions about which exits exist.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

/** Everything the model is allowed to learn about the road, in one place. */
async function runTool(name: string, rawArgs: string): Promise<unknown> {
  const corridor = await getCorridorStatus();
  if (!corridor.available) {
    return { error: corridor.reason };
  }
  const { exits, counts, feed } = corridor.data;

  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs) as Record<string, unknown>;
  } catch {
    return { error: 'Could not read the tool arguments.' };
  }

  if (name === 'list_exits') {
    return {
      exits: exits.map((exit) => ({ name: exit.display_name, km: exit.km })),
    };
  }

  if (name === 'get_corridor_overview') {
    // Slow spots too, not only congested ones: "saan mabagal ang daloy?" asks
    // where traffic is SLOW, and a list of only the worst spots cannot say.
    const spots = (status: 'congested' | 'slow') =>
      exits
        .flatMap((exit: CorridorExit) =>
          (['NB', 'SB'] as const)
            .filter((key) => exit.directions[key].status === status)
            .map((key) => ({
              exit: exit.display_name,
              direction: key === 'NB' ? 'northbound' : 'southbound',
              speedKmh: exit.directions[key].speedKmh,
            })),
        )
        .slice(0, 6);

    /*
     * Finished statements as well as the lists. Given only the lists, the model
     * dropped a congested spot and called a slow one "walang traffic, maluwag
     * ang daan" - slow means moving but slower than normal, never clear. So the
     * wording of each spot is decided here and the model only phrases it.
     */
    const line = (s: { exit: string; direction: string; speedKmh: number | null }) =>
      `${s.exit} ${s.direction}${s.speedKmh === null ? '' : ` (${Math.round(s.speedKmh)} km/h)`}`;
    const congested = spots('congested');
    const slow = spots('slow');
    return {
      feed: describeFeedAge(feed),
      stale: feed.stale,
      counts,
      congested_spots: congested,
      slow_spots: slow,
      facts: [
        congested.length > 0
          ? `CONGESTED (heavy traffic): ${congested.map(line).join('; ')}.`
          : 'No congested spots right now.',
        slow.length > 0
          ? `SLOW (moving, but slower than normal - NOT clear): ${slow.map(line).join('; ')}.`
          : 'No slow spots right now.',
        `Everywhere else on NLEX is clear.`,
      ],
      instructions:
        'Mention EVERY congested spot and EVERY slow spot listed in facts, each with its direction and speed. Never describe a slow spot as clear or as having no traffic. Do not mention clear exits unless asked.',
    };
  }

  if (name === 'get_corridor_status') {
    const exitName = typeof args.exit_name === 'string' ? args.exit_name : '';
    const direction = args.direction === 'northbound' ? 'NB' : 'SB';
    const exit = findExit(exits, exitName);

    if (exit === null) {
      return {
        error: `No NLEX exit matches "${exitName}".`,
        valid_exits: exits.map((item) => item.display_name),
      };
    }

    const status = exit.directions[direction];
    return {
      exit: exit.display_name,
      km: exit.km,
      direction: direction === 'NB' ? 'northbound' : 'southbound',
      status: status.status,
      speed_kmh: status.speedKmh,
      jam_count: status.jamCount,
      has_ramp: status.hasRamp,
      feed: describeFeedAge(feed),
      stale: feed.stale,
    };
  }

  return { error: `Unknown tool "${name}".` };
}

/**
 * Strip markdown the chat bubble cannot render.
 *
 * The system prompt asks for plain text, but that is a request rather than a
 * guarantee - Qwen3 14B reaches for **bold** when listing congested exits. The
 * bubble is a plain Text node, so the asterisks would show up literally.
 *
 * Deliberately narrow: emphasis markers and list bullets only. It does not try
 * to be a general markdown parser, because mangling a reply is worse than
 * leaving an odd character in it.
 */
export function toPlainText(reply: string): string {
  return reply
    // **bold** and __bold__
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // *italic* - single markers, not spanning lines
    .replace(/\*([^*\n]+)\*/g, '$1')
    // "- item" / "* item" at the start of a line becomes a real bullet
    .replace(/^[ \t]*[-*][ \t]+/gm, '\u2022 ')
    // "# Heading"
    .replace(/^#{1,6}[ \t]+/gm, '')
    // Collapse the blank-line gaps markdown leaves behind
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface ChatRequestBody {
  message?: unknown;
  history?: unknown;
}

/** Caps the tool loop so a confused model cannot spin forever on our bill. */
const MAX_TOOL_ROUNDS = 4;

router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  if (!isAssistantConfigured) {
    res.status(503).json({
      success: false,
      error: 'Assistant not configured',
      message: 'Set QWEN_API_KEY in backend/.env and restart the server.',
    });
    return;
  }

  const body = req.body as ChatRequestBody;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length === 0) {
    res.status(400).json({ success: false, error: 'A message is required.' });
    return;
  }

  // Prior turns let the model resolve "what about southbound?" against the
  // exit the user named a message ago.
  const history: ChatCompletionMessageParam[] = Array.isArray(body.history)
    ? (body.history as ChatCompletionMessageParam[]).slice(-10)
    : [];

  // The roster comes from the last good feed (see knownExitNames) and is
  // refreshed alongside, never awaited. Starting the fetch now also means a
  // tool call a moment later joins the request already under way.
  refreshExitNames();

  const language = detectLanguage(message);
  const namedExit = mentionedExit(message, knownExitNames);
  const trafficQuestion = asksAboutTraffic(message);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `${buildSystemPrompt(knownExitNames)}\n\n${LANGUAGE_GUIDE[language]}\n${HISTORY_NOTE}`,
    },
    ...history,
    // The reminder rides on the question itself: with a stiff earlier reply in
    // the history, the model copied its wording despite the system prompt, and
    // the latest message is what it weighs most. Only the model sees this.
    { role: 'user', content: `${message}\n\n[${LANGUAGE_REMINDER[language]}]` },
  ];

  try {
    const toolsUsed: string[] = [];
    const moods: ReplyMood[] = [];
    let sentBackToLook = false;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const params: ChatCompletionCreateParamsNonStreaming = {
        model: QWEN_MODEL,
        messages,
        tools,
        tool_choice: 'auto',
        // Picking the right tool should not vary between identical questions.
        temperature: 0.2,
        // Replies are two or three sentences; this is already generous. Without
        // it the model's full 131k output ceiling is assumed, and OpenRouter
        // rejects the request up front unless the account can afford that worst
        // case - a 402 even though the real answer is ~80 tokens. It also caps
        // what a runaway response can cost.
        max_tokens: 800,
      };

      /*
       * `provider` and `reasoning` are OpenRouter extensions rather than part
       * of the OpenAI schema, so they are attached by cast.
       *
       * reasoning.enabled=false matters: Qwen3 is a hybrid thinking model, and
       * its internal reasoning is spent from the SAME budget as max_tokens. A
       * long think leaves nothing for the visible answer, so `content` comes
       * back empty and the user sees a blank bubble. We have no use for the
       * reasoning either - tool choice is already pinned by explicit rules in
       * the prompt - so it is pure cost and latency.
       *
       * `provider` is sent only when ZDR is on, since a provider that does not
       * know the field could reject the whole request.
       */
      const extras: Record<string, unknown> = { reasoning: { enabled: false } };
      if (LLM_ZDR) {
        extras.provider = { zdr: true };
      }

      const completion = await getClient().chat.completions.create({
        ...params,
        ...extras,
      } as ChatCompletionCreateParamsNonStreaming);

      const choice = completion.choices[0]?.message;
      if (choice === undefined) {
        throw new Error('The model returned no message.');
      }

      const calls = choice.tool_calls ?? [];

      /*
       * An exit was named but nothing was looked up. Asked "congested ba sa san
       * fernando southbound?" right after a Mexico question, the model skipped
       * the tool and answered "10.5 km/h" from the pattern of its last reply -
       * the live reading was 4.3. Rule 2 says never do that, but a rule in the
       * prompt is a request; this is the check. Sent back once to look first.
       */
      if (calls.length === 0 && toolsUsed.length === 0 && namedExit !== null && !sentBackToLook) {
        sentBackToLook = true;
        messages.push({
          role: 'system',
          content: `You answered without checking. Call get_corridor_status for "${namedExit}" first, then answer from what it returns.`,
        });
        continue;
      }
      // The same check for a traffic question that names no exit.
      if (calls.length === 0 && toolsUsed.length === 0 && namedExit === null && trafficQuestion && !sentBackToLook) {
        sentBackToLook = true;
        messages.push({
          role: 'system',
          content:
            'That is a live traffic question, not travel time. Call get_corridor_overview first, then answer from what it returns.',
        });
        continue;
      }

      if (calls.length === 0) {
        const reply = toPlainText(choice.content ?? '');

        /*
         * An empty reply renders as a blank chat bubble, which reads as a
         * broken app rather than a failure. It happens when the model spends
         * its whole budget before writing anything - finish_reason 'length'.
         * Say something useful instead, and log why so it is diagnosable
         * without reproducing it against a paid API.
         */
        if (reply.length === 0) {
          const why = completion.choices[0]?.finish_reason ?? 'unknown';
          console.error(`[assistant] empty reply from ${completion.model} (finish_reason: ${why})`);
          // Reported as a failure rather than answered with words of our own.
          // Every chat bubble in the app is the model speaking; when it says
          // nothing, the app must show an error, not something we wrote.
          res.status(502).json({
            success: false,
            error: 'Empty reply',
            message: 'The assistant did not return an answer. Please try again.',
          });
          return;
        }

        /*
         * Which company actually served the request. OpenRouter returns this
         * as a `provider` field outside the OpenAI schema, hence the cast.
         *
         * Worth logging rather than inferring: with ZDR on, the provider IS
         * the zero-retention guarantee. "Alibaba" appearing here would mean
         * the guarantee is not holding, and that is not something to find out
         * by reasoning about which providers exist.
         */
        const servedBy =
          (completion as unknown as { provider?: string }).provider ?? 'unknown';
        console.log(
          `[assistant] answered using [${toolsUsed.join(', ') || 'no tools'}] ` +
            `via ${completion.model} on ${servedBy} (zdr=${LLM_ZDR})`,
        );
        // Traffic anywhere it looked outweighs clear elsewhere.
        const mood: ReplyMood = moods.includes('traffic')
          ? 'traffic'
          : moods.includes('clear')
            ? 'clear'
            : 'alert';
        res.json({
          success: true,
          data: { reply, toolsUsed, model: completion.model, mood },
        });
        return;
      }

      messages.push(choice);

      for (const call of calls) {
        if (call.type !== 'function') {
          continue;
        }
        toolsUsed.push(call.function.name);
        const result = await runTool(call.function.name, call.function.arguments);
        const mood = moodOf(result);
        if (mood !== null) {
          moods.push(mood);
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Ran out of rounds while still asking for tools, so the model never
    // produced an answer. Surfaced as a failure for the same reason as above:
    // we do not put words in the assistant's mouth.
    console.error(`[assistant] tool loop hit ${MAX_TOOL_ROUNDS} rounds without an answer`);
    res.status(502).json({
      success: false,
      error: 'No answer',
      message: 'The assistant could not work that out. Please try rephrasing.',
    });
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : 'Unknown error';
    console.error('[assistant]', detail);
    res.status(502).json({
      success: false,
      error: 'Assistant unavailable',
      message: 'Could not reach the assistant service. Please try again.',
    });
  }
});

/*
 * POST /api/assistant/greeting - Lex says hello when a new chat opens.
 *
 * Written by the model each time, so it comes from the same "brain" as the
 * answers. Left to itself the model opened every one "Hi <name>! I'm Lex" and
 * repeated a whole greeting within six tries, so variety is decided here:
 * an opening and an angle are drawn at random, openings used in the app's
 * recent greetings are skipped, a near-repeat is regenerated once, and extra
 * emoji are trimmed.
 *
 * It must not state any traffic condition - nothing has been looked up yet,
 * and a welcome that guessed "the road is clear!" would break the rule that
 * every condition comes from the live feed.
 */
const GREETING_ANGLES = [
  'ask where they are headed on NLEX today',
  'offer to check the traffic at any of the 20 exits',
  'wish them a safe and smooth drive',
  'mention that you read live traffic, so they can ask before they leave',
  'invite them to ask about northbound or southbound',
  'be cheerful about being their road buddy for the trip',
  'say you are ready whenever they are',
  'suggest they ask about a place they pass often',
];

type GreetingLanguage = 'english' | 'taglish';

/** Opening lines; {name} and {time} are filled in, {name} dropped when unknown. */
const GREETING_OPENINGS: Record<GreetingLanguage, string[]> = {
  english: [
    'Hey {name}!',
    'Good {time}, {name}!',
    'Hello there, {name}!',
    'Welcome, {name}!',
    'Look who is here, {name}!',
    'Hi hi, {name}!',
    'Great to see you, {name}!',
    'Ready to roll, {name}?',
  ],
  taglish: [
    'Uy, {name}!',
    'Kumusta, {name}?',
    'Magandang {time}, {name}!',
    'Hello, {name}! Tara,',
    'Musta na, {name}?',
    'Hi {name}! Andito na si Lex,',
    'Welcome back, {name}!',
    'Ayan, {name}!',
  ],
};

const TIME_WORDS: Record<GreetingLanguage, Record<'morning' | 'afternoon' | 'evening', string>> = {
  english: { morning: 'morning', afternoon: 'afternoon', evening: 'evening' },
  taglish: { morning: 'umaga', afternoon: 'hapon', evening: 'gabi' },
};

function hourInManila(): number {
  return (
    Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false }).format(
        new Date(),
      ),
    ) % 24
  );
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** First two words, lowercased - what makes two greetings sound alike. */
function openingOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

/** Keeps the first emoji and drops any after it. */
function oneEmoji(text: string): string {
  let seen = false;
  return text
    .replace(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu, (match) => {
      if (seen) return '';
      seen = true;
      return match;
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

router.post('/greeting', async (req: Request, res: Response): Promise<void> => {
  if (!isAssistantConfigured) {
    res.status(503).json({ success: false, error: 'Assistant not configured' });
    return;
  }

  const body = req.body as { name?: unknown; hour?: unknown; avoid?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
  const hour =
    typeof body.hour === 'number' && Number.isInteger(body.hour) && body.hour >= 0 && body.hour < 24
      ? body.hour
      : hourInManila();
  const avoid = Array.isArray(body.avoid)
    ? body.avoid
        .filter((item): item is string => typeof item === 'string')
        .slice(-6)
        .map((item) => item.slice(0, 200))
    : [];
  const recentOpenings = new Set(avoid.map(openingOf));

  const partOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const language: GreetingLanguage = Math.random() < 0.5 ? 'english' : 'taglish';
  const fill = (template: string): string =>
    (name.length > 0 ? template.replace('{name}', name) : template.replace(/,?\s*\{name\}/, '')).replace(
      '{time}',
      TIME_WORDS[language][partOfDay],
    );
  const openings = GREETING_OPENINGS[language].map(fill);
  const fresh = openings.filter((opening) => !recentOpenings.has(openingOf(opening)));
  const opening = pick(fresh.length > 0 ? fresh : openings);
  const angle = pick(GREETING_ANGLES);
  const languageLine =
    language === 'english'
      ? 'plain, friendly English'
      : 'natural Taglish (Tagalog sentence structure with everyday English words, the way Filipinos text)';
  const avoidLines =
    avoid.length > 0
      ? `- It must not resemble any of these earlier greetings:\n${avoid.map((g) => `  "${g}"`).join('\n')}`
      : '';

  const system = `You are Lex, the SmartFlow NLEX traffic assistant - a friendly little car mascot in a commuter app for the NLEX expressway in the Philippines.
Write ONE short greeting that welcomes the user to a new chat with you.
- Start with exactly: "${opening}"
- Mention that you are Lex somewhere in it, in your own words - not necessarily "I'm Lex".
- For this greeting: ${angle}.
- Write it in ${languageLine}.
- One or two sentences, at most 30 words. Plain text only, no markdown, at most one emoji.
- NEVER state or guess any traffic condition, speed or road status - you have not checked anything yet.
${avoidLines}`;

  const extras: Record<string, unknown> = { reasoning: { enabled: false } };
  if (LLM_ZDR) {
    extras.provider = { zdr: true };
  }

  const generate = async (): Promise<{ text: string; model: string }> => {
    const completion = await getClient().chat.completions.create({
      model: QWEN_MODEL,
      messages: [
        { role: 'system', content: system },
        // "/no_think" is Qwen3's own switch. reasoning.enabled=false alone was
        // not honoured here: the model thought out loud, spent the whole token
        // budget on it and returned no greeting at all.
        { role: 'user', content: 'Greet me. /no_think' },
      ],
      temperature: 1,
      max_tokens: 300,
      ...extras,
    } as ChatCompletionCreateParamsNonStreaming);
    const raw = (completion.choices[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '');
    return {
      text: oneEmoji(toPlainText(raw).trim().replace(/^["']|["']$/g, '')),
      model: completion.model,
    };
  };

  /** Same words as a recent greeting, or the same first five words. */
  const firstFive = (s: string): string => s.toLowerCase().split(/\s+/).slice(0, 5).join(' ');
  const tooClose = (text: string): boolean =>
    avoid.some((g) => g.trim() === text || firstFive(g) === firstFive(text));

  try {
    let result = await generate();
    if (result.text.length === 0 || tooClose(result.text)) {
      result = await generate();
    }
    if (result.text.length === 0) {
      res.status(502).json({ success: false, error: 'Empty greeting' });
      return;
    }
    res.json({ success: true, data: { greeting: result.text, model: result.model } });
  } catch (caught) {
    console.error('[assistant] greeting failed:', caught instanceof Error ? caught.message : caught);
    res.status(502).json({ success: false, error: 'Greeting unavailable' });
  }
});

export default router;
