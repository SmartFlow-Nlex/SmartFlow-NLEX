import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GUTTER, Radius, softShadow, useTheme, useThemedStyles } from '../../../theme';
import ScreenShell from '../../../components/ui/ScreenShell';
import PageHero from '../../../components/ui/PageHero';
import { GlassCard, SectionTitle } from '../../../components/ui/Cards';
import MoodMascot from '../../../components/MoodMascot';
import MascotGreeting from '../../../components/MascotGreeting';
import { PressableScale, Reveal } from '../../../components/motion';
import type { ThemePalette } from '../../../theme';
import {
  AssistantError,
  ChatMessage,
  LanguageChoice,
  askAssistant,
  loadLanguageChoice,
  nextGreeting,
  saveLanguageChoice,
  toolLabel,
  wakeAssistant,
} from '../../../lib/assistantApi';
import { useMobileConfig } from '../../../lib/mobileConfig';
import { firstNameOf, useAuth } from '../../../auth';

/** Height of the mascot beside each reply. */
const MASCOT_SIZE = 40;

/** Lex's head, small, inside the chat field - the one other place he appears. */
const mascotIcon = require('../../../assets/mascot-icon.png');

const quickQuestions = [
  'How is NLEX right now?',
  'May traffic ba sa Bocaue?',
  'Show traffic at Balintawak',
  'Northbound conditions',
] as const;

/** What the assistant can actually answer, so the empty screen is not a blank prompt. */
const capabilities = [
  { icon: 'speedometer-outline', text: 'Live conditions at any of the 20 exits' },
  { icon: 'swap-vertical-outline', text: 'Northbound or southbound, by name' },
  { icon: 'language-outline', text: 'Replies in English or Tagalog - pick EN or TL above' },
] as const;

/** The reply-language switch in the heading, left to right. */
const languageOptions: { value: LanguageChoice; label: string; name: string }[] = [
  { value: 'english', label: 'EN', name: 'English' },
  { value: 'tagalog', label: 'TL', name: 'Tagalog' },
];

/** What Lex says when the backend cannot be reached for a fresh welcome. */
function offlineGreeting(name: string | null): string {
  return `${name === null ? 'Hi!' : `Hi ${name}!`} I'm Lex. Ask me about NLEX traffic.`;
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function AssistantScreen(): React.ReactElement {
  const { colors } = useTheme();

  // The suggested prompts are optional; the chat box below them is not, which
  // is why the Assistant tab has no "at least one section" floor.
  const { config: mobileConfig } = useMobileConfig();
  const quickQuestionsEnabled = mobileConfig.sections.assistant.quickQuestions;
  const capabilitiesEnabled = mobileConfig.sections.assistant.capabilities;
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  /** The question behind the current error, so it can be resent in one tap. */
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const { session } = useAuth();
  const firstName = firstNameOf(session?.fullName);
  /** Counts new chats: the screen opening is the first, every clear another. */
  const [chatNumber, setChatNumber] = useState<number>(0);
  /** Lex's welcome for this chat; null while it is being written. */
  const [greeting, setGreeting] = useState<string | null>(null);
  /** Which language Lex replies in, from the EN / TL switch. Remembered on the phone. */
  const [language, setLanguage] = useState<LanguageChoice>('english');

  useEffect(() => {
    void loadLanguageChoice().then(setLanguage);
  }, []);

  const pickLanguage = useCallback((choice: LanguageChoice): void => {
    setLanguage(choice);
    void saveLanguageChoice(choice);
  }, []);

  // Wake the backend and the team's dashboard as soon as the screen opens, so
  // they are up by the time a question is typed - see wakeAssistant.
  useEffect(() => {
    wakeAssistant();
  }, []);

  /*
   * A new welcome for every new chat, written by the model itself, so it
   * addresses the user by name and is never the same line twice. Usually it
   * was written in advance and shows at once - see nextGreeting. If the backend
   * cannot be reached, Lex still says hello with a fixed line rather than
   * leaving the panel waiting.
   */
  useEffect(() => {
    let cancelled = false;
    setGreeting(null);
    void nextGreeting(firstName).then((text) => {
      if (!cancelled) {
        setGreeting(text ?? offlineGreeting(firstName));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chatNumber, firstName]);

  const send = useCallback(
    async (text: string): Promise<void> => {
      const question = text.trim();
      if (question.length === 0 || isThinking) {
        return;
      }

      const userMessage: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: question,
        at: Date.now(),
      };

      // History is what came before this question - the new one is sent
      // separately, so including it here would duplicate it.
      const history = messages;

      wakeAssistant();
      setMessages((current) => [...current, userMessage]);
      setDraft('');
      setError(null);
      setIsThinking(true);

      try {
        const { reply, toolsUsed, mood } = await askAssistant(question, history, language);
        setMessages((current) => [
          ...current,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: reply,
            at: Date.now(),
            toolsUsed,
            mood,
          },
        ]);
      } catch (caught) {
        /*
         * Put the question back rather than leaving the user to retype it, and
         * take its bubble back out - it was never answered, so leaving it in
         * the transcript would make the next question look like a follow-up to
         * something that did not happen.
         */
        setMessages((current) => current.filter((item) => item.id !== userMessage.id));
        setDraft(question);
        setFailedQuestion(question);
        setError(
          caught instanceof AssistantError
            ? caught.message
            : 'Something went wrong. Please try again.',
        );
      } finally {
        setIsThinking(false);
      }
    },
    [isThinking, language, messages],
  );

  /** Resend whatever failed, straight from the error banner. */
  const retryFailed = useCallback((): void => {
    const question = failedQuestion;
    if (question === null) {
      return;
    }
    setFailedQuestion(null);
    void send(question);
  }, [failedQuestion, send]);

  const clearConversation = useCallback((): void => {
    setMessages([]);
    setError(null);
    setFailedQuestion(null);
    setChatNumber((current) => current + 1);
  }, []);

  const canSend = draft.trim().length > 0 && !isThinking;
  const hasConversation = messages.length > 0;

  /** EN / TL, and - once there is a conversation - a way to start over. */
  const heroControls = (
    <>
      {/* Which language Lex replies in, whatever language the question is in. */}
      <View accessibilityRole="radiogroup" accessibilityLabel="Reply language" style={styles.languageSwitch}>
        {languageOptions.map((option) => {
          const selected = option.value === language;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={`Reply in ${option.name}`}
              accessibilityState={{ selected }}
              hitSlop={4}
              onPress={() => pickLanguage(option.value)}
              style={[styles.languageOption, selected && styles.languageOptionSelected]}
            >
              <Text style={[styles.languageText, selected && styles.languageTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hasConversation ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear the conversation"
          onPress={clearConversation}
          style={({ pressed }) => [styles.clearButton, pressed && styles.pressedDim]}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </>
  );

  /** Pinned under the page and kept above the keyboard by ScreenShell. */
  const composer = (
    <View style={styles.composerShell}>
      {/* Mid-conversation the suggestions ride above the field; on the empty
          chat they are the "Try asking" grid instead. */}
      {hasConversation && quickQuestionsEnabled ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.quickQuestionsRow}
        >
          {quickQuestions.map((item) => (
            <PressableScale
              activeScale={0.96}
              disabled={isThinking}
              key={item}
              onPress={() => void send(item)}
              style={({ pressed }) => [
                styles.quickChip,
                pressed && styles.quickChipPressed,
                isThinking && styles.quickChipDisabled,
              ]}
            >
              <Ionicons name="flash-outline" size={13} color={colors.accent} />
              <Text numberOfLines={1} style={styles.quickChipText}>
                {item}
              </Text>
            </PressableScale>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.inputRow}>
        <View style={styles.inputPill}>
          <TextInput
            editable={!isThinking}
            onChangeText={setDraft}
            onSubmitEditing={() => void send(draft)}
            placeholder="Ask about traffic at any NLEX exit…"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="send"
            style={styles.input}
            testID="assistant-input"
            value={draft}
          />
          <Image
            source={mascotIcon}
            resizeMode="contain"
            style={styles.inputMascot}
            accessibilityIgnoresInvertColors
          />
        </View>
        <Pressable
          accessibilityLabel="Send message"
          accessibilityRole="button"
          disabled={!canSend}
          onPress={() => void send(draft)}
          style={({ pressed }) => [
            styles.sendButton,
            canSend && styles.sendButtonActive,
            pressed && canSend && styles.pressedDim,
          ]}
          testID="assistant-send"
        >
          <Ionicons
            name="arrow-up"
            size={22}
            color={canSend ? colors.textInverse : colors.textTertiary}
          />
        </Pressable>
      </View>
    </View>
  );

  return (
    <ScreenShell
      scene="assistant"
      keyboardAvoiding
      scrollRef={scrollRef}
      // Follow the conversation as it grows. Before the first question the
      // page is Lex's welcome, which should stay where it starts.
      onContentSizeChange={() => {
        if (hasConversation) {
          scrollRef.current?.scrollToEnd({ animated: true });
        }
      }}
      // No assistant shortcut on the assistant itself, so no room kept for one.
      bottomPadding={24}
      footer={composer}
    >
      <PageHero
        // Placed to the mockup: two lines right under the header, the
        // language switch level with the first.
        title={'Traffic\nAssistant'}
        subtitle={'Answers from the live\nNLEX corridor feed'}
        titleScale={0.089}
        offsetTop={19}
        topRight={heroControls}
      />

      {messages.length === 0 ? (
        <View style={styles.intro}>
          {/* The one big Lex in the app: this is his page. */}
          <MascotGreeting size={196} />

          {/* Lex's own words, so they get a bubble pointing back at him. */}
          {greeting === null ? (
            <View style={[styles.greetingBubble, styles.greetingWaiting]}>
              <View style={styles.greetingTail} />
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.thinkingText}>Lex is saying hi...</Text>
            </View>
          ) : (
            <Reveal delay={0} key={greeting} style={styles.greetingReveal}>
              <View style={styles.greetingBubble}>
                <View style={styles.greetingTail} />
                <Text style={styles.introText}>{greeting}</Text>
              </View>
            </Reveal>
          )}

          {capabilitiesEnabled && (
            <GlassCard padding={16} style={styles.capabilityCard}>
              {capabilities.map((item) => (
                <View key={item.text} style={styles.capabilityRow}>
                  <View style={styles.capabilityIcon}>
                    <Ionicons name={item.icon} size={19} color={colors.navy} />
                  </View>
                  <Text style={styles.capabilityText}>{item.text}</Text>
                </View>
              ))}
            </GlassCard>
          )}

          {quickQuestionsEnabled && (
            <View style={styles.tryAsking}>
              <SectionTitle icon="flash" title="Try asking" sparkle />
              {/* One row that scrolls sideways, two in view, as in the mockup. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.suggestionScroller}
                contentContainerStyle={styles.suggestionRow}
              >
                {quickQuestions.map((item) => (
                  <PressableScale
                    activeScale={0.97}
                    disabled={isThinking}
                    key={item}
                    onPress={() => void send(item)}
                    style={({ pressed }) => [
                      styles.suggestion,
                      pressed && styles.suggestionPressed,
                      isThinking && styles.quickChipDisabled,
                    ]}
                  >
                    <Ionicons name="flash-outline" size={16} color={colors.accent} />
                    <Text numberOfLines={1} style={styles.suggestionText}>
                      {item}
                    </Text>
                  </PressableScale>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      ) : null}

      {/*
        `delay={0}`, not a stagger: each bubble mounts once and fades in as it
        arrives. Staggering by index would make the tenth reply of a
        conversation wait behind nine that are already on screen.
      */}
      {messages.map((message, index) =>
        message.role === 'assistant' ? (
          <Reveal delay={0} key={message.id}>
            <View style={styles.chatRow}>
              {/* Acts out the answer; only the newest one moves. */}
              <MoodMascot
                mood={message.mood ?? 'alert'}
                size={MASCOT_SIZE}
                animate={index === messages.length - 1 && !isThinking}
                style={styles.assistantBadge}
              />
              <View style={styles.chatColumn}>
                <View style={styles.chatBubble}>
                  <Text style={styles.chatText}>{message.text}</Text>
                </View>

                {/*
                  Provenance, not decoration: this says the answer came from the
                  live feed rather than the model's own recollection. Absent when
                  the model answered without checking anything, which is itself
                  worth knowing.
                */}
                {message.toolsUsed !== undefined && message.toolsUsed.length > 0 ? (
                  <View style={styles.groundedRow}>
                    {message.toolsUsed.map((tool) => (
                      <View key={tool} style={styles.groundedChip}>
                        <Ionicons name="shield-checkmark" size={11} color={colors.statusSmoothText} />
                        <Text style={styles.groundedText}>{toolLabel(tool)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <Text style={styles.timeText}>{formatTime(message.at)}</Text>
              </View>
            </View>
          </Reveal>
        ) : (
          <Reveal delay={0} key={message.id}>
            <View style={styles.userRow}>
              <View style={styles.userColumn}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{message.text}</Text>
                </View>
                <Text style={styles.userTimeText}>{formatTime(message.at)}</Text>
              </View>
            </View>
          </Reveal>
        ),
      )}

      {isThinking ? (
        <View style={styles.chatRow}>
          <MoodMascot mood="thinking" size={MASCOT_SIZE} animate style={styles.assistantBadge} />
          <View style={styles.chatColumn}>
            <View style={[styles.chatBubble, styles.thinkingBubble]}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.thinkingText}>Checking live NLEX data...</Text>
            </View>
          </View>
        </View>
      ) : null}

      {error !== null ? (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.statusHeavyText} />
          <Text style={styles.errorText}>{error}</Text>
          {/* Only offered when there is something to resend - a configuration
              error would fail the same way every time. */}
          {failedQuestion !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try again"
              disabled={isThinking}
              hitSlop={8}
              onPress={retryFailed}
              style={({ pressed }) => [styles.errorRetry, pressed && styles.errorRetryPressed]}
            >
              <Text style={styles.errorRetryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScreenShell>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    pressedDim: {
      opacity: 0.7,
    },
    clearButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.glassStrong,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    /* A frosted pill track with the chosen language as a navy pill. */
    languageSwitch: {
      flexDirection: 'row',
      height: 46,
      padding: 4,
      borderRadius: Radius.pill,
      backgroundColor: c.glassStrong,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    languageOption: {
      minWidth: 44,
      paddingHorizontal: 10,
      borderRadius: Radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    languageOptionSelected: {
      backgroundColor: c.primaryDark,
    },
    languageText: {
      color: c.textSecondary,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    languageTextSelected: {
      color: c.textInverse,
    },

    // Lex rises into the hero's lower edge, where the mockup has him.
    intro: {
      alignItems: 'center',
      gap: 16,
      marginTop: -30,
    },
    greetingReveal: {
      alignSelf: 'stretch',
    },
    /* Speech bubble under Lex, its tail pointing up at him. */
    greetingBubble: {
      alignSelf: 'stretch',
      backgroundColor: c.surface,
      borderRadius: Radius.card,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    greetingWaiting: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    greetingTail: {
      position: 'absolute',
      top: -8,
      left: '50%',
      marginLeft: -8,
      width: 16,
      height: 16,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderColor: c.glassBorder,
      transform: [{ rotate: '45deg' }],
    },
    introText: {
      color: c.navy,
      fontSize: 17,
      fontWeight: '700',
      lineHeight: 23,
      textAlign: 'center',
    },
    /*
     * Three concrete things it can do. An empty chat that only says "ask me
     * something" puts the whole burden of guessing the scope on the user.
     */
    // Sky-tinted rather than white, so it reads apart from the greeting.
    capabilityCard: {
      alignSelf: 'stretch',
      gap: 12,
      backgroundColor: c.primarySoft,
      borderColor: c.primarySoftBorder,
    },
    capabilityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    capabilityIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.glassBorder,
    },
    capabilityText: {
      flex: 1,
      color: c.textSecondary,
      fontSize: 15.5,
      fontWeight: '500',
      lineHeight: 21,
    },
    tryAsking: {
      alignSelf: 'stretch',
      marginTop: 10,
    },
    // Edge to edge, so a chip scrolls in from the screen's side.
    suggestionScroller: {
      marginHorizontal: -GUTTER,
    },
    suggestionRow: {
      gap: 10,
      paddingHorizontal: GUTTER,
      paddingBottom: 4,
    },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 46,
      paddingHorizontal: 16,
      borderRadius: Radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    suggestionPressed: {
      backgroundColor: c.primarySoft,
    },
    suggestionText: {
      color: c.navy,
      fontSize: 14.5,
      fontWeight: '600',
    },

    chatRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingTop: 18,
    },
    // The mascot itself, not a tinted circle - it needs no plate, and at 40pt
    // the cap and the eyes both still read.
    assistantBadge: {
      marginRight: 10,
    },
    chatColumn: {
      flex: 1,
    },
    chatBubble: {
      maxWidth: '94%',
      alignSelf: 'flex-start',
      backgroundColor: c.surface,
      borderRadius: 20,
      // Flattened corner on the side the avatar is on, so the bubble points
      // back at who said it.
      borderTopLeftRadius: 6,
      paddingHorizontal: 16,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    thinkingBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    thinkingText: {
      color: c.textSecondary,
      fontSize: 15,
      fontWeight: '500',
    },
    chatText: {
      color: c.text,
      fontSize: 16,
      lineHeight: 24,
    },
    groundedRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 8,
      marginLeft: 2,
    },
    groundedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: Radius.pill,
      backgroundColor: c.statusSmoothBg,
    },
    groundedText: {
      color: c.statusSmoothText,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    timeText: {
      color: c.textTertiary,
      fontSize: 12,
      marginTop: 6,
      marginLeft: 6,
    },
    userRow: {
      paddingTop: 16,
      alignItems: 'flex-end',
    },
    userColumn: {
      maxWidth: '86%',
      alignItems: 'flex-end',
    },
    userBubble: {
      backgroundColor: c.primary,
      borderRadius: 20,
      borderBottomRightRadius: 6,
      paddingHorizontal: 16,
      paddingVertical: 13,
      ...softShadow(c, 'lifted'),
    },
    userText: {
      color: c.textInverse,
      fontSize: 16,
      lineHeight: 23,
    },
    userTimeText: {
      color: c.textTertiary,
      fontSize: 12,
      marginTop: 6,
      marginRight: 4,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: Radius.control,
      backgroundColor: c.statusHeavyBg,
    },
    errorRetry: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.statusHeavyText,
    },
    errorRetryPressed: {
      opacity: 0.65,
    },
    errorRetryText: {
      color: c.statusHeavyText,
      fontSize: 14,
      fontWeight: '700',
    },
    errorText: {
      // statusHeavyText is what statusHeavyBg is designed against; c.danger on
      // it was a red on a red in dark mode.
      color: c.statusHeavyText,
      fontSize: 14,
      fontWeight: '600',
      flex: 1,
    },

    composerShell: {
      paddingTop: 10,
      paddingHorizontal: GUTTER,
      paddingBottom: 12,
      backgroundColor: c.background,
    },
    quickQuestionsRow: {
      gap: 8,
      paddingBottom: 10,
      paddingRight: 6,
    },
    quickChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.glass,
      borderWidth: 1,
      borderColor: c.glassBorder,
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    quickChipPressed: {
      backgroundColor: c.primarySoft,
    },
    quickChipDisabled: {
      opacity: 0.5,
    },
    quickChipText: {
      color: c.navy,
      fontSize: 13.5,
      fontWeight: '700',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    /* The field as one rounded pill, Lex's head tucked inside its right end. */
    inputPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 50,
      borderRadius: 25,
      borderWidth: 1,
      borderColor: c.glassBorder,
      backgroundColor: c.surface,
      paddingLeft: 18,
      paddingRight: 8,
      ...softShadow(c),
    },
    input: {
      flex: 1,
      height: '100%',
      color: c.text,
      fontSize: 16,
    },
    inputMascot: {
      width: 38,
      height: 38,
    },
    sendButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceDisabled,
      borderWidth: 1,
      borderColor: c.glassBorder,
    },
    sendButtonActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
      ...softShadow(c, 'lifted'),
    },
  });
