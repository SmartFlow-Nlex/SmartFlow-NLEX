import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AIAssistantFAB from '../../../components/community/AIAssistantFAB';
import CommunityPostCard from '../../../components/community/CommunityPostCard';
import { Reveal } from '../../../components/motion';
import FeedComposer from '../../../components/community/FeedComposer';
import FilterTabs from '../../../components/community/FilterTabs';
import ReportIncidentModal from '../../../components/community/ReportIncidentModal';
import ShareUpdateModal from '../../../components/community/ShareUpdateModal';
import { useMobileConfig } from '../../../lib/mobileConfig';
import { Radius, softShadow, useTheme, useThemedStyles } from '../../../theme';
import ScreenShell from '../../../components/ui/ScreenShell';
import PageHero from '../../../components/ui/PageHero';
import HeroMascot from '../../../components/ui/HeroMascot';
import { CountBadge, SectionTitle } from '../../../components/ui/Cards';
import { SkeletonPostCard } from '../../../components/Skeleton';
import type { ThemePalette } from '../../../theme';
import { useCommunityFeed } from '../../../hooks/useCommunityFeed';

export default function CommunityScreen(): React.ReactElement {
  // Composer actions and feed filters are switched from the dashboard's
  // Mobile Control Centre.
  const { config: mobileConfig } = useMobileConfig();
  const communitySections = mobileConfig.sections.community;

  const { colors } = useTheme();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const {
    posts,
    isLoading,
    error,
    isSubmitting,
    activeTab,
    setActiveTab,
    handleLike,
    handleShareUpdate,
    handleReportIncident,
    refresh,
  } = useCommunityFeed();
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  const sectionTitle = activeTab === 'community' ? 'Community Updates' : 'Recent Incidents';
  const sectionIcon: keyof typeof Ionicons.glyphMap =
    activeTab === 'community' ? 'people-outline' : 'warning-outline';

  const isEmpty = !isLoading && error === null && posts.length === 0;

  return (
    <ScreenShell
      scene="community"
      overlay={
        <>
          {/* The route stops resolving when the Assistant tab is off, so the
              shortcut to it goes too rather than navigating nowhere. */}
          {mobileConfig.features.assistant && (
            <AIAssistantFAB onPress={() => router.push('/(tabs)/assistant')} />
          )}
          <ShareUpdateModal
            onClose={() => setShowShareModal(false)}
            onSubmit={(payload) => void handleShareUpdate(payload).catch(() => undefined)}
            visible={showShareModal}
          />
          <ReportIncidentModal
            onClose={() => setShowReportModal(false)}
            onSubmit={(payload) => void handleReportIncident(payload).catch(() => undefined)}
            visible={showReportModal}
          />
        </>
      }
    >
      <PageHero
        // Placed to the mockup, except that Lex stands whole on the composer
        // card: cut off at its edge as the mockup has him, only his cap and
        // eyes showed - this Lex's cap is taller than the mockup's.
        title="Community"
        subtitle={'Share what you see and help\nthe people behind you.'}
        titleScale={0.082}
        offsetTop={76}
        mascot={<HeroMascot size={124} />}
        mascotWidth={140}
        mascotPlacement={{ top: 67, bleed: 8 }}
        minHeight={191}
      />
      <View>
        <FeedComposer
          onShare={() => setShowShareModal(true)}
          onReport={() => setShowReportModal(true)}
          showShare={communitySections.shareUpdate}
          showReport={communitySections.reportIncident}
        />

        {communitySections.filters && (
          <FilterTabs activeTab={activeTab} onTabChange={setActiveTab} />
        )}

        <SectionTitle
          icon={sectionIcon}
          title={sectionTitle}
          right={!isLoading && error === null ? <CountBadge value={posts.length} /> : null}
        />

        {/*
          A post being sent gets its own strip rather than the old
          "Posting..." line above the list: it stays visible where the new
          card will appear, so it is obvious what is pending.
        */}
        {isSubmitting ? (
          <View style={styles.pendingStrip}>
            <Ionicons name="cloud-upload-outline" size={15} color={colors.accent} />
            <Text style={styles.pendingText}>Publishing your post...</Text>
          </View>
        ) : null}

        {/*
          Skeletons in the shape of the cards that will replace them. The
          feed used to show a bare "Loading community feed..." line, which
          gave no idea how much was coming and made the layout jump when it
          landed.
        */}
        {isLoading ? (
          <View accessibilityLabel="Loading community feed">
            <SkeletonPostCard />
            <SkeletonPostCard />
            <SkeletonPostCard />
          </View>
        ) : null}

        {/*
          There is no sample data behind this any more, so an empty feed
          genuinely means nobody has posted - and a failure has to say so
          rather than looking like an empty feed.
        */}
        {error !== null ? (
          <View style={styles.stateCard}>
            <View style={[styles.stateIcon, styles.stateIconDanger]}>
              <Ionicons name="cloud-offline-outline" size={22} color={colors.danger} />
            </View>
            <Text style={styles.stateTitle}>Could not load the feed</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={refresh}
              style={({ pressed }) => [styles.retryButton, pressed && styles.actionPressed]}
            >
              <Ionicons name="refresh" size={15} color={colors.textInverse} />
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {isEmpty ? (
          <View style={styles.stateCard}>
            <View style={styles.stateIcon}>
              <Ionicons
                name={activeTab === 'community' ? 'chatbubbles-outline' : 'shield-checkmark-outline'}
                size={22}
                color={colors.accent}
              />
            </View>
            <Text style={styles.stateTitle}>
              {activeTab === 'community' ? 'No updates yet' : 'No incidents reported'}
            </Text>
            <Text style={styles.stateText}>
              {activeTab === 'community'
                ? 'Be the first to tell the corridor what it looks like out there.'
                : 'Nothing has been flagged on the corridor. Report one if you see it.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                activeTab === 'community' ? setShowShareModal(true) : setShowReportModal(true)
              }
              style={({ pressed }) => [styles.retryButton, pressed && styles.actionPressed]}
            >
              <Ionicons
                name={activeTab === 'community' ? 'paper-plane-outline' : 'warning-outline'}
                size={15}
                color={colors.textInverse}
              />
              <Text style={styles.retryButtonText}>
                {activeTab === 'community' ? 'Share an update' : 'Report an incident'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/*
          Staggered by position, so the feed deals itself out rather than
          appearing all at once. The index is capped inside Reveal, so a
          feed of forty posts still finishes arriving in under half a
          second instead of trickling for a minute.
        */}
        {posts.map((post, index) => (
          <Reveal index={index} key={post.id}>
            <CommunityPostCard onLike={handleLike} post={post} />
          </Reveal>
        ))}
      </View>
    </ScreenShell>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    actionPressed: {
      opacity: 0.82,
    },
    pendingStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: Radius.control,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primarySoftBorder,
      marginBottom: 12,
    },
    pendingText: {
      color: c.accent,
      fontSize: 14,
      fontWeight: '600',
    },

    // One shared shell for "nothing here" and "it broke", so the two states
    // are the same shape and only the words and the icon differ.
    stateCard: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 30,
      paddingHorizontal: 22,
      borderRadius: Radius.card,
      backgroundColor: c.glass,
      borderWidth: 1,
      borderColor: c.glassBorder,
      marginBottom: 12,
      ...softShadow(c),
    },
    stateIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
    },
    stateIconDanger: {
      backgroundColor: c.statusHeavyBg,
    },
    stateTitle: {
      color: c.navy,
      fontSize: 17,
      fontWeight: '800',
      textAlign: 'center',
    },
    stateText: {
      color: c.textSecondary,
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
      textAlign: 'center',
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: Radius.pill,
      backgroundColor: c.primary,
      marginTop: 2,
    },
    retryButtonText: {
      color: c.textInverse,
      fontSize: 14,
      fontWeight: '700',
    },
  });
