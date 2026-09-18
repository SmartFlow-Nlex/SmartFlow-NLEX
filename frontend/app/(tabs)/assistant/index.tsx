import React, { useCallback, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme, useThemedStyles } from '../../../theme';
import AppHeader from '../../../components/AppHeader';
import PageHeading from '../../../components/PageHeading';
import AssistantMascot from '../../../components/AssistantMascot';
import type { ThemePalette } from '../../../theme';
import { Typography } from '../../../constants/typography';
import { AssistantError, ChatMessage, askAssistant, toolLabel } from '../../../lib/assistantApi';
import { useMobileConfig } from '../../../lib/mobileConfig';

const quickQuestions = [
  'How is NLEX right now?',
  'May traffic ba sa Bocaue?',
  'Is Balintawak clear southbound?',
] as const;

/**
 * Shown before the first question, as a panel rather than a chat bubble.
 *
 * It used to be seeded into the message list as an assistant message, which
 * made it look like the model had spoken when it had not. Every bubble in this
 * screen is now the model's own words and nothing else.
 */
const INTRO_TEXT = 'Ask about traffic, exits or travel times along the NLEX corridor.';

/** What the assistant can actually answer, so the empty screen is not a blank prompt. */
const capabilities = [
  { icon: 'speedometer-outline', text: 'Live conditions at any of the 20 exits' },
  { icon: 'swap-vertical-outline', text: 'Northbound or southbound, by name' },
  { icon: 'language-outline', text: 'Ask in English or Filipino' },
] as const;

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function AssistantScreen(): React.ReactElement {
  const { colors } = useTheme();

  // The suggested prompts are optional; the chat box below them is not, which
  // is why the Assistant tab has no "at least one section" floor.
  const { config: mobileConfig } = useMobileConfig();
  const quickQuestionsEnabled = mobileConfig.sections.assistant.quickQuestions;
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  /** The question behind the current error, so it can be resent in one tap. */
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

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

      setMessages((current) => [...current, userMessage]);
      setDraft('');
      setError(null);
      setIsThinking(true);

      try {
        const { reply, toolsUsed } = await askAssistant(question, history);
        setMessages((current) => [
          ...current,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: reply,
            at: Date.now(),
            toolsUsed,
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
    [isThinking, messages],
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
  }, []);

  const canSend = draft.trim().length > 0 && !isThinking;
  const hasConversation = messages.length > 0;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        {/*
          Both of these used to live INSIDE the scroll area, on a screen that
          calls scrollToEnd on every new message - so asking a question threw
          the brand bar and the screen's own title off the top of the display.
          A chat log scrolls; the chrome around it does not.
        */}
        <AppHeader />
        <PageHeading
          icon="sparkles"
          mark={<AssistantMascot size={42} />}
          title="Traffic Assistant"
          subtitle="Answers from the live NLEX corridor feed"
          action={
            hasConversation ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear the conversation"
                onPress={clearConversation}
                style={({ pressed }) => [styles.clearButton, pressed && styles.pressedDim]}
              >
                <Ionicons name="trash-outline" size={17} color={colors.textSecondary} />
              </Pressable>
            ) : undefined
          }
        />

        <ScrollView
          contentContainerStyle={styles.content}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View style={styles.intro}>
              <AssistantMascot size={76} />
              <Text style={styles.introText}>{INTRO_TEXT}</Text>

              <View style={styles.capabilityList}>
                {capabilities.map((item) => (
                  <View key={item.text} style={styles.capabilityRow}>
                    <View style={styles.capabilityIcon}>
                      <Ionicons name={item.icon} size={14} color={colors.accent} />
                    </View>
                    <Text style={styles.capabilityText}>{item.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {messages.map((message) =>
            message.role === 'assistant' ? (
              <View key={message.id} style={styles.chatRow}>
                <AssistantMascot size={32} style={styles.assistantBadge} />
                <View style={styles.chatColumn}>
                  <View style={styles.chatBubble}>
                    <Text style={styles.chatText}>{message.text}</Text>
                  </View>

                  {/*
                    Provenance, not decoration: this says the answer came from
                    the live feed rather than the model's own recollection.
                    Absent when the model answered without checking anything,
                    which is itself worth knowing.
                  */}
                  {message.toolsUsed !== undefined && message.toolsUsed.length > 0 ? (
                    <View style={styles.groundedRow}>
                      {message.toolsUsed.map((tool) => (
                        <View key={tool} style={styles.groundedChip}>
                          <Ionicons
                            name="shield-checkmark"
                            size={10}
                            color={colors.statusSmoothText}
                          />
                          <Text style={styles.groundedText}>
                            {toolLabel(tool)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <Text style={styles.timeText}>{formatTime(message.at)}</Text>
                </View>
              </View>
            ) : (
              <View key={message.id} style={styles.userRow}>
                <View style={styles.userColumn}>
                  <View style={styles.userBubble}>
                    <Text style={styles.userText}>{message.text}</Text>
                  </View>
                  <Text style={styles.userTimeText}>{formatTime(message.at)}</Text>
                </View>
              </View>
            ),
          )}

          {isThinking ? (
            <View style={styles.chatRow}>
              <AssistantMascot size={32} thinking style={styles.assistantBadge} />
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
              <Ionicons name="cloud-offline-outline" size={16} color={colors.statusHeavyText} />
              <Text style={styles.errorText}>{error}</Text>
              {/* Only offered when there is something to resend - a
                  configuration error would fail the same way every time. */}
              {failedQuestion !== null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                  disabled={isThinking}
                  hitSlop={8}
                  onPress={retryFailed}
                  style={({ pressed }) => [
                    styles.errorRetry,
                    pressed && styles.errorRetryPressed,
                  ]}
                >
                  <Text style={styles.errorRetryText}>Try again</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.composerShell}>
          {/*
            The quick questions were flanked by two caret glyphs standing in
            for "this scrolls sideways". They read as broken buttons; the row
            being cut off at the edge already says the same thing.
          */}
          {quickQuestionsEnabled && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickQuestionsRow}
          >
            {quickQuestions.map((item) => (
              <Pressable
                disabled={isThinking}
                key={item}
                onPress={() => void send(item)}
                style={({ pressed }) => [
                  styles.quickChip,
                  pressed && styles.quickChipPressed,
                  isThinking && styles.quickChipDisabled,
                ]}
              >
                <Ionicons name="flash-outline" size={12} color={colors.accent} />
                <Text numberOfLines={1} style={styles.quickChipText}>
                  {item}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          )}

          <View style={styles.inputRow}>
            <TextInput
              editable={!isThinking}
              onChangeText={setDraft}
              onSubmitEditing={() => void send(draft)}
              placeholder="Ask about traffic at any NLEX exit"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="send"
              style={styles.input}
              testID="assistant-input"
              value={draft}
            />
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
                size={20}
                color={canSend ? colors.textInverse : colors.textTertiary}
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    safeArea: {
      // Brand colour so the status-bar inset runs into the header instead of
      // leaving a white strip above it.
      flex: 1,
      backgroundColor: c.primary,
    },
    screen: {
      // Same reason as the Community tab: the chat bubbles are c.surface, so a
      // c.surface page made them invisible in dark mode.
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      paddingBottom: 18,
      flexGrow: 1,
    },
    pressedDim: {
      opacity: 0.7,
    },
    clearButton: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },

    intro: {
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 28,
      paddingTop: 34,
      paddingBottom: 20,
    },
    introText: {
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '600',
      lineHeight: 23,
      textAlign: 'center',
    },
    /*
     * Three concrete things it can do. An empty chat that only says "ask me
     * something" puts the whole burden of guessing the scope on the user.
     *
     * Brand navy, not the assistant violet this started as. The violet was
     * introduced to give the assistant its own identity; the mascot does that
     * now, and its blues and orange had nothing to do with a lavender panel.
     */
    capabilityList: {
      alignSelf: 'stretch',
      gap: 10,
      marginTop: 4,
      padding: 14,
      borderRadius: 14,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primarySoftBorder,
    },
    capabilityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    capabilityIcon: {
      width: 24,
      height: 24,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    capabilityText: {
      flex: 1,
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '500',
    },

    chatRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 16,
      paddingTop: 18,
    },
    // The mascot itself, not a tinted circle - it needs no plate, and at 32pt
    // the hard hat and the glowing eyes both still read.
    assistantBadge: {
      marginRight: 9,
    },
    chatColumn: {
      flex: 1,
    },
    chatBubble: {
      maxWidth: '92%',
      backgroundColor: c.surface,
      borderRadius: 16,
      // Flattened corner on the side the avatar is on, so the bubble points
      // back at who said it.
      borderTopLeftRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    thinkingBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      alignSelf: 'flex-start',
    },
    thinkingText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '500',
    },
    chatText: {
      color: c.text,
      fontSize: Typography.fontSize.base,
      lineHeight: 24,
    },
    groundedRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 7,
      marginLeft: 2,
    },
    groundedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 7,
      backgroundColor: c.statusSmoothBg,
    },
    groundedText: {
      color: c.statusSmoothText,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    timeText: {
      color: c.textTertiary,
      fontSize: Typography.fontSize.xs,
      marginTop: 6,
      marginLeft: 6,
    },
    userRow: {
      paddingHorizontal: 16,
      paddingTop: 16,
      alignItems: 'flex-end',
    },
    userColumn: {
      maxWidth: '86%',
      alignItems: 'flex-end',
    },
    userBubble: {
      backgroundColor: c.primary,
      borderRadius: 16,
      borderBottomRightRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    userText: {
      color: c.textInverse,
      fontSize: Typography.fontSize.base,
      lineHeight: 22,
    },
    userTimeText: {
      color: c.textTertiary,
      fontSize: Typography.fontSize.xs,
      marginTop: 6,
      marginRight: 4,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: c.statusHeavyBg,
    },
    errorRetry: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.statusHeavyText,
    },
    errorRetryPressed: {
      opacity: 0.65,
    },
    errorRetryText: {
      color: c.statusHeavyText,
      fontSize: Typography.fontSize.sm,
      fontWeight: Typography.fontWeight.bold,
    },
    errorText: {
      // Was c.danger on c.statusHeavyBg. In dark mode that is #FF6B61 on
      // #3A1717 - a red on a red, right at the edge of legibility. The paired
      // `statusHeavyText` token is what that background is designed against.
      color: c.statusHeavyText,
      fontSize: Typography.fontSize.sm,
      fontWeight: '600',
      flex: 1,
    },

    composerShell: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
      paddingHorizontal: 14,
      paddingBottom: 14,
      backgroundColor: c.surface,
    },
    quickQuestionsRow: {
      gap: 8,
      paddingBottom: 12,
      paddingRight: 6,
    },
    quickChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    quickChipPressed: {
      backgroundColor: c.primarySoft,
    },
    quickChipDisabled: {
      opacity: 0.5,
    },
    quickChipText: {
      color: c.text,
      fontSize: Typography.fontSize.xs,
      fontWeight: '600',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    input: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      // Had no background at all, so it inherited the composer's surface and
      // the only thing marking it as a field was a 1px border.
      backgroundColor: c.field,
      paddingHorizontal: 14,
      color: c.text,
      fontSize: Typography.fontSize.base,
    },
    sendButton: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceDisabled,
      borderWidth: 1,
      borderColor: c.border,
    },
    sendButtonActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
  });
