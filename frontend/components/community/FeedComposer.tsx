import React, { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../auth';
import { useTheme, useThemedStyles, Radius, softShadow } from '../../theme';
import type { ThemePalette } from '../../theme';
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
        <Text style={styles.placeholder} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
          What are you seeing out there?
        </Text>
        <View style={styles.sendMark}>
          <Ionicons name="paper-plane" size={17} color={colors.textInverse} />
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
        <Ionicons name="warning-outline" size={21} color={colors.danger} />
        <Text style={styles.reportText}>Report an incident</Text>
      </Pressable>
      )}
    </View>
  );
};

export default FeedComposer;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    // One glass card holding both ways to post, so they read as one place.
    wrap: {
      gap: 12,
      padding: 14,
      marginBottom: 12,
      borderRadius: Radius.card + 2,
      backgroundColor: c.glass,
      borderWidth: 1,
      borderColor: c.glassBorder,
      ...softShadow(c),
    },
    composer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 8,
      borderRadius: Radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.glassBorder,
    },
    composerPressed: {
      backgroundColor: c.pressed,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primaryDark,
    },
    avatarText: {
      color: c.textInverse,
      fontSize: 15,
      fontWeight: '800',
    },
    placeholder: {
      flex: 1,
      color: c.textTertiary,
      fontSize: 15,
      fontWeight: '500',
    },
    sendMark: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    // A soft warning, below the composer and apart from it: reporting is the
    // rarer of the two and should not compete with it.
    reportButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      paddingVertical: 14,
      borderRadius: Radius.control + 2,
      backgroundColor: c.statusHeavyBg,
      borderWidth: 1,
      borderColor: c.statusHeavyBg,
    },
    reportPressed: {
      opacity: 0.78,
    },
    reportText: {
      color: c.statusHeavyText,
      fontSize: 17,
      fontWeight: '800',
    },
  });
