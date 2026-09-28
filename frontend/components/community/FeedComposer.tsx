import React, { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';
import { initialsFor } from '../AppHeader';

export interface FeedComposerProps {
  onShare: () => void;
  onReport: () => void;
  /** Operator switches from the dashboard. Default on, so existing callers
   *  that pass neither behave exactly as before. */
  showShare?: boolean;
  showReport?: boolean;
}

/**
 * The prompt at the top of the feed.
 *
 * Replaces two equally loud filled buttons sitting side by side. They gave
 * sharing and incident-reporting the same weight and took 46pt of the first
 * screenful before a single post, and neither said what it would do. A
 * composer row reads as "write something here" without being explained, and
 * demoting the report action to an outline puts the two in the order people
 * actually use them.
 */
const FeedComposer: React.FC<FeedComposerProps> = ({
  onShare,
  onReport,
  showShare = true,
  showReport = true,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { session } = useAuth();

  const initials = useMemo(() => initialsFor(session?.fullName), [session?.fullName]);

  // Both withdrawn means there is nothing to compose with, and an empty
  // bordered box above the feed reads as a rendering fault. Render nothing.
  if (!showShare && !showReport) return null;

  return (
    <View style={styles.wrap}>
      {showShare && (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share a traffic update"
        onPress={onShare}
        style={({ pressed }) => [styles.composer, pressed && styles.composerPressed]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.placeholder} numberOfLines={1}>
          What are you seeing out there?
        </Text>
        <View style={styles.sendMark}>
          <Ionicons name="paper-plane" size={14} color={colors.textInverse} />
        </View>
      </Pressable>
      )}

      {showReport && (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report an incident"
        onPress={onReport}
        style={({ pressed }) => [styles.reportButton, pressed && styles.reportPressed]}
      >
        <Ionicons name="warning-outline" size={15} color={colors.danger} />
        <Text style={styles.reportText}>Report an incident</Text>
      </Pressable>
      )}
    </View>
  );
};

export default FeedComposer;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    wrap: {
      gap: 9,
      marginBottom: 18,
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: c.cardShadow,
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    composerPressed: {
      backgroundColor: c.pressed,
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    avatarText: {
      color: c.textInverse,
      fontSize: Typography.fontSize.xs,
      fontWeight: '800',
    },
    placeholder: {
      flex: 1,
      color: c.textTertiary,
      fontSize: Typography.fontSize.sm,
      fontWeight: '500',
    },
    sendMark: {
      width: 32,
      height: 32,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    // Outlined, not filled: reporting an incident is the rarer of the two and
    // should not compete with the composer above it.
    reportButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 11,
      borderRadius: 14,
      backgroundColor: c.statusHeavyBg,
      borderWidth: 1,
      borderColor: c.border,
    },
    reportPressed: {
      opacity: 0.78,
    },
    reportText: {
      color: c.statusHeavyText,
      fontSize: Typography.fontSize.sm,
      fontWeight: '700',
    },
  });
