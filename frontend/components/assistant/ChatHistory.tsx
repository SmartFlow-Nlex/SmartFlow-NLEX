import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, softShadow, useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import SheetModal from '../SheetModal';
import { historyGroup, whenLabel } from '../../lib/chatHistory';
import type { SavedChat } from '../../lib/chatHistory';

/** Navie's last words in a chat, which say more about it than the question does. */
function previewOf(chat: SavedChat): string {
  const reply = [...chat.messages].reverse().find((message) => message.role === 'assistant');
  return (reply?.text ?? chat.messages[chat.messages.length - 1].text).replace(/\s+/g, ' ').trim();
}

function questionCount(chat: SavedChat): string {
  const count = chat.messages.filter((message) => message.role === 'user').length;
  return `${count} ${count === 1 ? 'question' : 'questions'}`;
}

export interface ChatHistoryRowProps {
  chat: SavedChat;
  /** The chat on screen right now. */
  active: boolean;
  /** Navie is still answering in this chat. */
  pending: boolean;
  onPress: () => void;
  /** Offered in the full history only; the short list on the empty chat is for opening. */
  onDelete?: () => void;
}

export const ChatHistoryRow: React.FC<ChatHistoryRowProps> = ({
  chat,
  active,
  pending,
  onPress,
  onDelete,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open chat: ${chat.title}`}
      accessibilityHint={whenLabel(chat.updatedAt)}
      onPress={onPress}
      style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowIcon, active && styles.rowIconActive]}>
        <Ionicons
          name={active ? 'chatbubbles' : 'chatbubbles-outline'}
          size={19}
          color={active ? colors.textInverse : colors.accent}
        />
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {chat.title}
          </Text>
          <Text style={styles.rowWhen}>{whenLabel(chat.updatedAt)}</Text>
        </View>
        <Text numberOfLines={2} style={styles.rowPreview}>
          {pending ? 'Navie is still answering…' : previewOf(chat)}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={styles.rowMetaText}>{questionCount(chat)}</Text>
          {active ? (
            <View style={styles.openChip}>
              <Text style={styles.openChipText}>Open now</Text>
            </View>
          ) : null}
        </View>
      </View>

      {onDelete !== undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete chat: ${chat.title}`}
          hitSlop={8}
          onPress={onDelete}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.pressedDim]}
        >
          <Ionicons name="trash-outline" size={17} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
};

export interface ChatHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  chats: SavedChat[];
  activeChatId: string | null;
  pendingChatId: string | null;
  onOpen: (chat: SavedChat) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  /** Absent while the chat on screen is already a new one. */
  onNewChat?: () => void;
}

/**
 * Every past chat with Navie, grouped by when it was last active, to reopen and
 * carry on. A sheet over the chat rather than its own screen: you dip in, pick
 * one, and are straight back in the conversation.
 */
export const ChatHistorySheet: React.FC<ChatHistorySheetProps> = ({
  visible,
  onClose,
  chats,
  activeChatId,
  pendingChatId,
  onOpen,
  onDelete,
  onClearAll,
  onNewChat,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  // Already newest first, so each group's chats are too, and the groups come
  // out in order.
  const groups: { label: string; chats: SavedChat[] }[] = [];
  for (const chat of chats) {
    const label = historyGroup(chat.updatedAt);
    const group = groups.find((item) => item.label === label);
    if (group === undefined) {
      groups.push({ label, chats: [chat] });
    } else {
      group.chats.push(chat);
    }
  }

  const confirmDelete = (chat: SavedChat): void => {
    Alert.alert('Delete this chat?', chat.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(chat.id) },
    ]);
  };

  const confirmClearAll = (): void => {
    Alert.alert('Clear all chats?', 'Every past chat with Navie on this phone will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: onClearAll },
    ]);
  };

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.grabber} />

        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Chat history</Text>
            <Text style={styles.subtitle}>
              {chats.length === 0
                ? 'Saved on this phone'
                : `${chats.length} ${chats.length === 1 ? 'chat' : 'chats'} · saved on this phone`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressedDim]}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {onNewChat !== undefined ? (
          <Pressable
            accessibilityRole="button"
            onPress={onNewChat}
            style={({ pressed }) => [styles.newChat, pressed && styles.pressedDim]}
          >
            <Ionicons name="add" size={20} color={colors.textInverse} />
            <Text style={styles.newChatText}>New chat</Text>
          </Pressable>
        ) : null}

        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {chats.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="time-outline" size={26} color={colors.accent} />
              </View>
              <Text style={styles.emptyTitle}>No past chats yet</Text>
              <Text style={styles.emptyText}>
                Chats with Navie are kept here, so you can come back to one and pick up where you left off.
              </Text>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.label} style={styles.group}>
                <Text accessibilityRole="header" style={styles.groupLabel}>
                  {group.label}
                </Text>
                {group.chats.map((chat) => (
                  <ChatHistoryRow
                    key={chat.id}
                    chat={chat}
                    active={chat.id === activeChatId}
                    pending={chat.id === pendingChatId}
                    onPress={() => onOpen(chat)}
                    onDelete={() => confirmDelete(chat)}
                  />
                ))}
              </View>
            ))
          )}

          {chats.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={6}
              onPress={confirmClearAll}
              style={({ pressed }) => [styles.clearAll, pressed && styles.pressedDim]}
            >
              <Ionicons name="trash-outline" size={16} color={colors.statusHeavyText} />
              <Text style={styles.clearAllText}>Clear all chats</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </SheetModal>
  );
};

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    pressedDim: {
      opacity: 0.6,
    },

    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
      borderRadius: Radius.control,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    rowActive: {
      backgroundColor: c.primarySoft,
      borderColor: c.primarySoftBorder,
    },
    rowPressed: {
      opacity: 0.75,
    },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: Radius.chip,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
    },
    rowIconActive: {
      backgroundColor: c.primary,
    },
    rowBody: {
      flex: 1,
      gap: 3,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    rowTitle: {
      flex: 1,
      color: c.navy,
      fontSize: 15.5,
      fontWeight: '700',
    },
    rowWhen: {
      color: c.textTertiary,
      fontSize: 12,
      fontWeight: '600',
    },
    rowPreview: {
      color: c.textSecondary,
      fontSize: 14,
      lineHeight: 19,
    },
    rowMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 3,
    },
    rowMetaText: {
      color: c.textTertiary,
      fontSize: 12,
      fontWeight: '600',
    },
    openChip: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: Radius.pill,
      backgroundColor: c.primary,
    },
    openChipText: {
      color: c.textInverse,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    deleteButton: {
      width: 34,
      height: 34,
      marginTop: 3,
      marginRight: -4,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Same frame as the dashboard's View All sheet, taller: a history is a
    // list you scroll.
    sheet: {
      backgroundColor: c.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 16,
      maxHeight: '86%',
    },
    grabber: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderLight,
      marginTop: 10,
      marginBottom: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingBottom: 14,
      marginBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerText: {
      flex: 1,
    },
    title: {
      color: c.text,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    subtitle: {
      color: c.textTertiary,
      fontSize: 12.5,
      fontWeight: '600',
      marginTop: 3,
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    newChat: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 48,
      marginBottom: 16,
      borderRadius: Radius.pill,
      backgroundColor: c.primary,
      ...softShadow(c, 'lifted'),
    },
    newChatText: {
      color: c.textInverse,
      fontSize: 16,
      fontWeight: '700',
    },
    list: {
      gap: 18,
      paddingBottom: 8,
    },
    group: {
      gap: 10,
    },
    groupLabel: {
      color: c.textTertiary,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginLeft: 4,
    },
    empty: {
      alignItems: 'center',
      gap: 8,
      paddingVertical: 28,
      paddingHorizontal: 20,
    },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
      marginBottom: 4,
    },
    emptyTitle: {
      color: c.navy,
      fontSize: 17,
      fontWeight: '800',
    },
    emptyText: {
      color: c.textSecondary,
      fontSize: 14.5,
      lineHeight: 20,
      textAlign: 'center',
    },
    clearAll: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      alignSelf: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    clearAllText: {
      color: c.statusHeavyText,
      fontSize: 14,
      fontWeight: '700',
    },
  });
