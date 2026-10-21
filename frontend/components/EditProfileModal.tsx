import React, { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { UserProfile } from '@smartflow/shared';
import { validateFullName } from '../auth';
import { initialsFor } from './AppHeader';
import { useTheme, useThemedStyles } from '../theme';
import SheetModal from './SheetModal';
import type { ThemePalette } from '../theme';
import { Typography } from '../constants/typography';

export interface EditProfileModalProps {
  visible: boolean;
  user: UserProfile;
  onClose: () => void;
  onSave: (updated: UserProfile) => void;
  /** The save is on its way to the account. */
  busy?: boolean;
}

const EditProfileModal: React.FC<EditProfileModalProps> = ({
  visible,
  user,
  onClose,
  onSave,
  busy = false,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState<UserProfile>(user);

  useEffect(() => {
    setDraft(user);
  }, [user]);

  const handlePickImage = async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setDraft((current) => ({
        ...current,
        avatarUri: result.assets[0].uri,
      }));
    }
  };

  // The same monogram as the Profile card behind this sheet.
  const initials = initialsFor(draft.displayName);
  const nameProblem = validateFullName(draft.displayName);

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Edit Profile</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              onPress={handlePickImage}
              style={styles.avatarSection}
            >
              {draft.avatarUri ? (
                <Image source={{ uri: draft.avatarUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{initials || 'U'}</Text>
                </View>
              )}
              <Text style={styles.changePhotoText}>Change profile photo</Text>
            </Pressable>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Profile Name</Text>
              <TextInput
                onChangeText={(displayName) => setDraft((current) => ({ ...current, displayName }))}
                placeholder="Enter full name"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
                value={draft.displayName}
              />
              {nameProblem !== null ? <Text style={styles.nameError}>{nameProblem}</Text> : null}
            </View>

            {/*
              Username and email are fixed at sign-up: they identify the
              account, so they are shown for reference rather than edited here.
              Only the profile name and photo are the user's to change.
            */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.readOnlyField}>
                <Text numberOfLines={1} style={styles.readOnlyValue}>
                  {draft.username}
                </Text>
                <Ionicons name="lock-closed" size={15} color={colors.textTertiary} />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.readOnlyField}>
                <Text numberOfLines={1} style={styles.readOnlyValue}>
                  {draft.email}
                </Text>
                <Ionicons name="lock-closed" size={15} color={colors.textTertiary} />
              </View>
              <Text style={styles.readOnlyHint}>
                Your username and email come from the account you signed in with.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || nameProblem !== null, busy }}
              disabled={busy || nameProblem !== null}
              onPress={() => onSave(draft)}
              style={({ pressed }) => [
                styles.saveButton,
                pressed && styles.saveButtonPressed,
                (busy || nameProblem !== null) && styles.saveButtonDisabled,
              ]}
            >
              <Text style={styles.saveButtonText}>{busy ? 'Saving…' : 'Save Changes'}</Text>
            </Pressable>
          </ScrollView>
      </View>
    </SheetModal>
  );
};

export default EditProfileModal;

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  handle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: c.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  title: {
    color: c.text,
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.pressed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 18,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 12,
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.primary,
    marginBottom: 12,
  },
  avatarInitials: {
    color: c.textInverse,
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
  },
  changePhotoText: {
    color: c.accent,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  label: {
    color: c.textSecondary,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    marginBottom: 8,
  },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.field,
    paddingHorizontal: 14,
    color: c.text,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
  },
  readOnlyField: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.hairline,
    backgroundColor: c.surfaceDisabled,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  readOnlyValue: {
    color: c.textSecondary,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    flexShrink: 1,
  },
  readOnlyHint: {
    color: c.textTertiary,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.normal,
    marginTop: 8,
  },
  saveButton: {
    marginTop: 10,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.primary,
  },
  saveButtonPressed: {
    opacity: 0.9,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  nameError: {
    color: c.danger,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    marginTop: 6,
  },
  saveButtonText: {
    color: c.textInverse,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
  },
});
