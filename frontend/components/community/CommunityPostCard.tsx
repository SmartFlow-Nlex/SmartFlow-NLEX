import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CommunityPost, TrafficStatus } from '@smartflow/shared';
import { useTheme, useThemedStyles, Radius, softShadow } from '../../theme';
import type { CongestionLevel } from '../../lib/trafficModel';
import { toneFor } from '../dashboard/severity';
import type { ThemePalette } from '../../theme';
import { Typography } from '../../constants/typography';
import MediaViewer from './MediaViewer';

export interface CommunityPostCardProps {
  post: CommunityPost;
  onLike: (id: string) => void;
}

/**
 * The condition the poster reported, as a tint rather than a badge.
 *
 * This used to be a pill reading "🚛 heavy" pinned to the top-right of every
 * card - an emoji and a lowercase enum value, loud enough to compete with the
 * post itself. The same fact now rides in the meta line as a coloured dot and
 * a word, next to the location it belongs with. The top-right corner it
 * vacated is where the timestamp sits.
 */
const conditionLevel: Record<TrafficStatus, CongestionLevel> = {
  smooth: 'low',
  moderate: 'moderate',
  heavy: 'severe',
  incident: 'severe',
};

const conditionLabel: Record<TrafficStatus, string> = {
  smooth: 'Smooth',
  moderate: 'Moderate',
  heavy: 'Heavy',
  incident: 'Incident',
};

const CommunityPostCard: React.FC<CommunityPostCardProps> = ({ post, onLike }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const media = post.media ?? [];
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.authorSection}>
          <View style={[styles.avatar, { backgroundColor: post.avatarColor }]}>
            <Text style={styles.avatarText}>{post.authorInitial}</Text>
          </View>

          <View style={styles.authorMeta}>
            {/* The age shares the name's line only, so the place and both
                chips get the whole width beneath, as in the mockup. */}
            <View style={styles.nameRow}>
              <Text style={styles.authorName} numberOfLines={1}>
                {post.authorName}
              </Text>
              <View style={styles.timeGroup}>
                <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
                <Text style={styles.timeText}>{post.timeAgo}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
              <Text style={styles.metaText}>{post.location}</Text>
              {post.direction !== undefined ? (
                <View style={styles.directionChip}>
                  <Text style={styles.directionChipText}>
                    {post.direction === 'northbound' ? 'NB' : 'SB'}
                  </Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.conditionChip,
                  { backgroundColor: toneFor(conditionLevel[post.status], colors).background },
                ]}
              >
                <View
                  style={[
                    styles.conditionDot,
                    { backgroundColor: toneFor(conditionLevel[post.status], colors).solid },
                  ]}
                />
                <Text
                  style={[
                    styles.conditionChipText,
                    { color: toneFor(conditionLevel[post.status], colors).text },
                  ]}
                >
                  {conditionLabel[post.status]}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <Text style={styles.message}>{post.message}</Text>

      {media.length > 0 ? (
        <View style={styles.mediaRow}>
          {media.map((item, index) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.type === 'image' ? 'View photo' : 'View video'}
              key={`${item.uri}-${index}`}
              onPress={() => setViewerIndex(index)}
              style={({ pressed }) => [styles.mediaThumbWrap, pressed && styles.mediaThumbPressed]}
            >
              {item.type === 'image' ? (
                <Image source={{ uri: item.uri }} style={styles.mediaThumb} />
              ) : (
                <View style={[styles.mediaThumb, styles.mediaVideo]}>
                  <Ionicons name="play-circle" size={26} color={colors.textInverse} />
                </View>
              )}
              {/* Small cue that the thumbnail opens larger. */}
              <View style={styles.expandBadge}>
                <Ionicons name="expand-outline" size={11} color={colors.textInverse} />
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      <MediaViewer
        media={media}
        onClose={() => setViewerIndex(null)}
        startIndex={viewerIndex ?? 0}
        visible={viewerIndex !== null}
      />

      <Pressable onPress={() => onLike(post.id)} style={styles.likeRow}>
        <Ionicons
          name={post.likedByUser ? 'thumbs-up' : 'thumbs-up-outline'}
          size={14}
          color={colors.textTertiary}
        />
        <Text style={styles.likeText}>{post.likes}</Text>
      </Pressable>
    </View>
  );
};

export default CommunityPostCard;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
  card: {
    backgroundColor: c.glass,
    borderRadius: Radius.card,
    padding: 18,
    marginBottom: 14,
    // A drawn edge as well as the shadow: shadows carry the card on a light
    // background but contribute almost nothing on a dark one.
    borderWidth: 1,
    borderColor: c.glassBorder,
    ...softShadow(c),
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  authorSection: {
    flexDirection: 'row',
    flex: 1,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: c.textInverse,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
  },
  authorMeta: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 5,
  },
  authorName: {
    flexShrink: 1,
    color: c.navy,
    fontSize: 16.5,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaText: {
    color: c.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  timeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // Never squeezed by a long location name, and nudged onto the author-name
    // line - that name carries 4pt of bottom margin, so an unshifted stamp
    // sits a touch high against it.
    flexShrink: 0,
    marginTop: 1,
  },
  timeText: {
    // A step quieter than the location: it is the least actionable fact on the
    // card, and it now sits alone where nothing else competes for the eye.
    color: c.textTertiary,
    fontSize: 13,
    fontWeight: '500',
  },
  conditionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  conditionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  conditionChipText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  directionChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: c.primarySoft,
  },
  directionChipText: {
    color: c.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  message: {
    color: c.text,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 23,
    marginTop: 16,
    marginBottom: 14,
  },
  mediaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  mediaThumbWrap: {
    width: 104,
    height: 104,
  },
  mediaThumbPressed: {
    opacity: 0.75,
  },
  expandBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaThumb: {
    width: 104,
    height: 104,
    borderRadius: 16,
    backgroundColor: c.surfaceMuted,
  },
  mediaVideo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.primary,
  },
  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  likeText: {
    color: c.textTertiary,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
  },
});
