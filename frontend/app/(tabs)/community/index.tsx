import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AIAssistantFAB, { FAB_CLEARANCE } from '../../../components/community/AIAssistantFAB';
import CommunityPostCard from '../../../components/community/CommunityPostCard';
import FeedComposer from '../../../components/community/FeedComposer';
import FilterTabs from '../../../components/community/FilterTabs';
import ReportIncidentModal from '../../../components/community/ReportIncidentModal';
import ShareUpdateModal from '../../../components/community/ShareUpdateModal';
import { useMobileConfig } from '../../../lib/mobileConfig';
import { useTheme, useThemedStyles } from '../../../theme';
import AppHeader from '../../../components/AppHeader';
import PageHeading from '../../../components/PageHeading';
import { SkeletonPostCard } from '../../../components/Skeleton';
import type { ThemePalette } from '../../../theme';
import { Typography } from '../../../constants/typography';
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
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.screen}>
        {/* Fixed chrome: the feed scrolls, the brand bar and page name do not. */}
        <AppHeader />
        <PageHeading
          icon="people-outline"
          title="Community"
          subtitle="Share what you see and help the people behind you"
        />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.body}>
            <FeedComposer
              onShare={() => setShowShareModal(true)}
              onReport={() => setShowReportModal(true)}
              showShare={communitySections.shareUpdate}
              showReport={communitySections.reportIncident}
            />

            {communitySections.filters && (
              <FilterTabs activeTab={activeTab} onTabChange={setActiveTab} />
            )}

            <View style={styles.sectionHeader}>
              <Ionicons name={sectionIcon} size={16} color={colors.accent} />
              <Text style={styles.sectionHeaderText}>{sectionTitle}</Text>
              {!isLoading && error === null ? (
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{posts.length}</Text>
                </View>
              ) : null}
            </View>

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

            {posts.map((post) => (
              <CommunityPostCard key={post.id} onLike={handleLike} post={post} />
            ))}
          </View>
        </ScrollView>

        {/*
          Was a modal that explained the assistant and then fired
          Alert('AI assistant modal opened') - a dead end. It goes to the
          assistant now, like the same button on every other tab.
        */}
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
      </View>
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
      // c.background, not c.surface: the post cards are c.surface, and in dark
      // mode both were #142234 - the cards vanished into the page because a drop
      // shadow does not read against a dark ground the way it does on white.
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      paddingBottom: FAB_CLEARANCE,
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    actionPressed: {
      opacity: 0.82,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14,
    },
    sectionHeaderText: {
      flex: 1,
      color: c.text,
      fontSize: Typography.fontSize.lg,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    countPill: {
      minWidth: 22,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primarySoftBorder,
      alignItems: 'center',
    },
    countPillText: {
      color: c.accent,
      fontSize: 11,
      fontWeight: '800',
    },
    pendingStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primarySoftBorder,
      marginBottom: 12,
    },
    pendingText: {
      color: c.accent,
      fontSize: Typography.fontSize.sm,
      fontWeight: '600',
    },

    // One shared shell for "nothing here" and "it broke", so the two states
    // are the same shape and only the words and the icon differ.
    stateCard: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 28,
      paddingHorizontal: 22,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
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
      color: c.text,
      fontSize: Typography.fontSize.base,
      fontWeight: '800',
      textAlign: 'center',
    },
    stateText: {
      color: c.textSecondary,
      fontSize: Typography.fontSize.sm,
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
      borderRadius: 12,
      backgroundColor: c.primary,
      marginTop: 2,
    },
    retryButtonText: {
      color: c.textInverse,
      fontSize: Typography.fontSize.sm,
      fontWeight: '700',
    },
  });
