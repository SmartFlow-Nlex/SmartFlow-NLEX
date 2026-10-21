import React, { useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SettingsState, UserProfile } from '../../shared/types/index';
import EditProfileModal from '../../frontend/components/EditProfileModal';
import SectionHeader from '../../frontend/components/SectionHeader';
import SettingsRow from '../../frontend/components/SettingsRow';
import ThemeModePicker, { themeModeLabel } from '../../frontend/components/ThemeModePicker';
import { initialsFor } from '../../frontend/components/AppHeader';
import { useNotifications } from '../../frontend/notifications';
import { useTheme, useThemedStyles } from '../../frontend/theme';
import type { ThemePalette } from '../../frontend/theme';
import { Typography } from '../../frontend/constants/typography';
import { useAuth } from '../../frontend/auth';

export default function ProfileScreen(): React.ReactElement {
  const { colors, mode: themeMode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const notifications = useNotifications();

  /**
   * Why the switch will not move, when it will not.
   *
   * An unexplained switch that springs back is the worst version of this: on
   * web there is nothing to deliver to, and once the OS prompt has been
   * refused it never appears again, so the only way back is system settings.
   */
  const notificationsHint = !notifications.available
    ? 'Not available here'
    : notifications.blocked
      ? 'Blocked in system settings'
      : undefined;
  const { session, signOut, updateFullName } = useAuth();
  /**
   * A deep link or a browser refresh lands here with no history behind it, and
   * a bare `router.back()` then fails with "GO_BACK was not handled by any
   * navigator" and traps the user on the screen. Fall back to the dashboard.
   */
  const goBack = (): void => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/dashboard');
    }
  };


  /*
   * Name and email straight from the signed-in account - the same values the
   * greeting, Navie and Community read. They used to come from a profile
   * server that was never wired to sign-in: a mock that answers "NLEX
   * Traveler / user1@example.com" to everyone, so this screen showed the
   * right person only when that server could not be reached (with an error
   * under the name), and a saved name went nowhere.
   */
  /** The photo picked in Edit Profile. Not stored yet: it lasts while this screen is open. */
  const [avatarUri, setAvatarUri] = useState<string | undefined>(undefined);
  const user = useMemo<UserProfile>(
    () => ({
      id: 'account',
      displayName: session?.fullName ?? '',
      username: session?.email.split('@')[0] ?? '',
      email: session?.email ?? '',
      avatarUri,
    }),
    [session, avatarUri],
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState<boolean>(false);
  const [isThemePickerVisible, setIsThemePickerVisible] = useState<boolean>(false);
  const [settings, setSettings] = useState<SettingsState>({
    notificationsEnabled: true,
    darkModeEnabled: false,
    language: 'English',
  });

  /*
   * Shared with the avatar in every tab's header - this screen used to take
   * the first TWO words ("Kiarra Jem Dela Cruz" -> KJ) while the header took
   * first and last (-> KC), so the same account wore two different monograms
   * depending on which one you were looking at.
   */
  const initials = useMemo(() => initialsFor(user.displayName), [user.displayName]);

  const handleSaveProfile = async (updated: UserProfile): Promise<void> => {
    setIsSaving(true);
    try {
      if (updated.displayName.trim() !== user.displayName) {
        await updateFullName(updated.displayName);
      }
      setAvatarUri(updated.avatarUri);
      setIsEditModalVisible(false);
    } catch (caught) {
      // The sheet stays open with the edit in it, so nothing typed is lost.
      Alert.alert('Could not save', caught instanceof Error ? caught.message : 'Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenLink = async (url: string): Promise<void> => {
    await Linking.openURL(url);
  };

  const handleLogout = (): void => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/sign-in');
        },
      },
    ]);
  };

  return (
    /*
     * edges={['top']} is the fix for an unpressable back button.
     *
     * This screen was a plain View with 16pt of padding, so on a phone the
     * 40pt button sat inside the status bar / Dynamic Island and the top of it
     * could not be tapped at all. Every tab screen already insets its top; this
     * Stack route was missed.
     */
    <SafeAreaView edges={['top']} style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Outside the ScrollView, so the way back never scrolls off. */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <View style={styles.userCard}>
          {user.avatarUri ? (
            <Image source={{ uri: user.avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}

          <View style={styles.userTextGroup}>
            <Text style={styles.userName}>{user.displayName}</Text>
            <Text style={styles.userSubtitle}>{user.email}</Text>
          </View>
        </View>

        <SectionHeader title="Personal" />
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="create-outline"
            label="Edit Profile"
            onPress={() => setIsEditModalVisible(true)}
          />
        </View>

        <SectionHeader title="General" />
        <View style={styles.sectionCard}>
          {/*
            The real switch now, not a remembered boolean.
            
            Turning it on asks the OS for permission, and `setEnabled` answers
            false if that is refused - so the switch falls back instead of
            sitting on showing a state the system has already denied. It reads
            its own stored preference, so `settings.notificationsEnabled` is no
            longer the source of truth for it.
          */}
          <SettingsRow
            icon="notifications-outline"
            label="Notifications"
            value={notificationsHint}
            toggle
            toggleValue={notifications.enabled}
            onToggle={(next) => {
              void (async () => {
                const applied = await notifications.setEnabled(next);
                setSettings((current) => ({ ...current, notificationsEnabled: applied }));
              })();
            }}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="moon-outline"
            label="Dark Mode"
            value={themeModeLabel[themeMode]}
            onPress={() => setIsThemePickerVisible(true)}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => void handleOpenLink('https://example.com/privacy')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => void handleOpenLink('https://example.com/terms')}
          />
        </View>

        <SectionHeader title="Help" />
        <View style={styles.sectionCard}>
          <SettingsRow
            icon="help-circle-outline"
            label="FAQ"
            onPress={() => void handleOpenLink('https://example.com/faq')}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="information-circle-outline"
            label="App Version"
            value="v1.0.0"
          />
        </View>

        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>

      <EditProfileModal
        onClose={() => setIsEditModalVisible(false)}
        onSave={(updated) => void handleSaveProfile(updated)}
        busy={isSaving}
        user={user}
        visible={isEditModalVisible}
      />

      <ThemeModePicker
        visible={isThemePickerVisible}
        onClose={() => setIsThemePickerVisible(false)}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
  },
  topBarTitle: {
    color: c.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  backButtonPressed: {
    opacity: 0.6,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 24,
    backgroundColor: c.primary,
    marginBottom: 22,
    shadowColor: c.primaryShadow,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarInitials: {
    color: c.textInverse,
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
  },
  userTextGroup: {
    marginLeft: 16,
    flex: 1,
  },
  userName: {
    color: c.textInverse,
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    marginBottom: 4,
  },
  userSubtitle: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
  },
  sectionCard: {
    backgroundColor: c.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
    marginBottom: 22,
    shadowColor: c.cardShadow,
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  divider: {
    height: 1,
    backgroundColor: c.hairline,
    marginLeft: 62,
  },
  logoutButton: {
    marginTop: 4,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  logoutText: {
    color: c.danger,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },
});
