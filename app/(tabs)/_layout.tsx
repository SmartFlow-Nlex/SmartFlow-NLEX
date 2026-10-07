import React from 'react';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlerts } from '../../frontend/alerts';
import { useMobileConfig } from '../../frontend/lib/mobileConfig';
import { useTheme, useThemedStyles } from '../../frontend/theme';
import type { ThemePalette } from '../../frontend/theme';

/**
 * Outline when resting, solid when selected.
 *
 * Every tab used to draw its `-outline` glyph in both states, so the only
 * thing separating the current tab from the other four was a tint - which is
 * the one cue that disappears for a red-green colourblind user, and the one
 * that washes out on a phone in daylight. The filled shape says it too.
 */
const tabIcons = {
	dashboard: ['home-outline', 'home'],
	map: ['map-outline', 'map'],
	community: ['people-outline', 'people'],
	assistant: ['sparkles-outline', 'sparkles'],
	alerts: ['notifications-outline', 'notifications'],
} as const satisfies Record<string, readonly [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]>;

type TabName = keyof typeof tabIcons;

/**
 * Typed structurally rather than off `BottomTabBarButtonProps`.
 *
 * expo-router 57 vendors its navigation internals, so
 * `@react-navigation/bottom-tabs` is not resolvable as a direct import here.
 * These are the only props this button needs from the navigator, and a JSX
 * spread of the fuller object satisfies them.
 *
 * The selected flag arrives as **`aria-selected`**, not `accessibilityState`.
 * See BottomTabItem in expo-router's vendored copy: it calls
 * `button({ ..., 'aria-selected': focused, ... })`. Reading
 * `accessibilityState.selected` silently gave `undefined` on every tab, so the
 * highlight never appeared on the active one.
 */
interface TabButtonProps {
	name: TabName;
	label: string;
	/** Unread count, on the tabs that carry one. */
	badge?: number;
	onPress?: (event: GestureResponderEvent) => void;
	onLongPress?: (event: GestureResponderEvent) => void;
	'aria-selected'?: boolean | undefined;
	testID?: string | undefined;
}

/**
 * The whole tab - icon, label and highlight - drawn as one pressable.
 *
 * Two earlier attempts at the selected state both failed on the same thing.
 * `tabBarActiveBackgroundColor` with a radius on `tabBarItemStyle` paints the
 * navigator's own button box, which is laid out to the full height of the bar
 * and is not clipped to the radius: the result was a hard-edged square that
 * covered the icon, stopped dead above the label and sat high in the bar. A
 * pill drawn inside `tabBarIcon` was properly rounded but could only ever sit
 * behind the glyph, because react-navigation renders the icon and the label as
 * separate children - leaving the label orphaned outside the highlight.
 *
 * Replacing the button with `tabBarButton` is the only way to get both inside
 * one rounded box. The trade is that the badge is ours to draw too, since the
 * default icon wrapper is what normally renders it.
 */
const TabButton: React.FC<TabButtonProps> = ({
	name,
	label,
	badge,
	onPress,
	onLongPress,
	'aria-selected': ariaSelected,
	testID,
}) => {
	const { colors } = useTheme();
	const styles = useThemedStyles(makeStyles);
	const focused = ariaSelected === true;

	return (
		<Pressable
			accessibilityRole="tab"
			// Re-announce it ourselves - the navigator handed it in as an ARIA
			// attribute, which React Native's own a11y tree does not read.
			accessibilityState={{ selected: focused }}
			aria-selected={focused}
			accessibilityLabel={
				badge !== undefined && badge > 0 ? `${label}, ${badge} unread` : label
			}
			onPress={onPress}
			onLongPress={onLongPress}
			testID={testID}
			style={styles.pressable}
		>
			{({ pressed }) => (
				<View
					style={[
						styles.box,
						focused && styles.boxActive,
						pressed && !focused && styles.boxPressed,
					]}
				>
					<View style={styles.iconWrap}>
						<Ionicons
							name={tabIcons[name][focused ? 1 : 0]}
							size={22}
							color={focused ? colors.navy : colors.textTertiary}
						/>
						{/*
							Capped at "9+": the badge sits on a 21pt glyph and a
							three-digit number would overrun the tab. Hidden entirely at
							zero - a badge reading "0" is worse than none.
						*/}
						{badge !== undefined && badge > 0 ? (
							<View style={styles.badge}>
								<Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
							</View>
						) : null}
					</View>

					<Text
						numberOfLines={1}
						style={[styles.label, focused && styles.labelActive]}
					>
						{label}
					</Text>
				</View>
			)}
		</Pressable>
	);
};

export default function TabLayout(): React.ReactElement {
	const { colors, isDark } = useTheme();
	const { unreadCount } = useAlerts();

	// Which tabs this build may show is set by an operator in the dashboard's
	// Mobile Control Centre (/dashboard/mobile). Until that answer lands the
	// defaults leave every tab in place, so a slow network never blanks the bar.
	const { config: mobileConfig } = useMobileConfig();
	const insets = useSafeAreaInsets();

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			{/*
			 * Every tab tops out in its own sky now, not the old navy bar: a pale
			 * sky by day needs dark status icons, the night scene light ones.
			 */}
			<StatusBar style={isDark ? 'light' : 'dark'} />

			<Tabs
				screenOptions={{
					headerShown: false,
					// The page colour behind the bar's rounded corners.
					sceneStyle: { backgroundColor: colors.background },
					tabBarStyle: {
						/*
						 * The row itself is 66pt; the bottom inset is added under it
						 * so the labels clear the home indicator. On web and older
						 * phones the inset is 0 and nothing changes.
						 */
						height: 66 + insets.bottom,
						paddingBottom: insets.bottom,
						paddingTop: 0,
						paddingHorizontal: 8,
						backgroundColor: colors.glassStrong,
						borderTopWidth: 1,
						borderTopColor: colors.glassBorder,
						borderTopLeftRadius: 26,
						borderTopRightRadius: 26,
						// Lifted off the page with a soft upward haze.
						shadowColor: colors.cardShadow,
						shadowOpacity: 0.1,
						shadowRadius: 20,
						shadowOffset: { width: 0, height: -6 },
						elevation: 12,
					},
					// TabButton owns the icon, the label and the highlight, so none
					// of the navigator's own tint or background options apply.
					tabBarItemStyle: {
						padding: 0,
					},
				}}
			>
				<Tabs.Screen
					name="dashboard"
					options={{
						href: mobileConfig.features.dashboard ? undefined : null,
						title: 'Dashboard',
						tabBarButton: (props) => (
							<TabButton {...props} name="dashboard" label="Dashboard" />
						),
					}}
				/>
				<Tabs.Screen
					name="map"
					options={{
						href: mobileConfig.features.map ? undefined : null,
						// The route keeps its `map` filename; only the label changes, so
						// every existing router.push('/(tabs)/map') still resolves.
						title: 'Corridor',
						tabBarButton: (props) => (
							<TabButton {...props} name="map" label="Corridor" />
						),
					}}
				/>
				<Tabs.Screen
					name="community"
					options={{
						href: mobileConfig.features.community ? undefined : null,
						title: 'Community',
						tabBarButton: (props) => (
							<TabButton {...props} name="community" label="Community" />
						),
					}}
				/>
				<Tabs.Screen
					name="assistant"
					options={{
						href: mobileConfig.features.assistant ? undefined : null,
						title: 'Assistant',
						tabBarButton: (props) => (
							<TabButton {...props} name="assistant" label="Assistant" />
						),
					}}
				/>
				<Tabs.Screen
					name="alerts"
					options={{
						href: mobileConfig.features.alerts ? undefined : null,
						title: 'Alerts',
						tabBarButton: (props) => (
							<TabButton {...props} name="alerts" label="Alerts" badge={unreadCount} />
						),
					}}
				/>
			</Tabs>
			{/*
			 * The car that peeked up over the active tab is retired: each page now
			 * has Lex in its hero and the assistant shortcut, and a third copy on
			 * every screen was the "mascot stickers everywhere" the redesign set
			 * out to avoid. TabPeekMascot is kept, should it come back.
			 */}
		</View>
	);
}

const makeStyles = (c: ThemePalette) =>
	StyleSheet.create({
		pressable: {
			flex: 1,
			// The bar sets its own vertical padding to zero, so the button fills
			// the row and the highlight can span the whole tab.
			justifyContent: 'center',
			paddingVertical: 6,
			paddingHorizontal: 3,
		},
		box: {
			flex: 1,
			alignItems: 'center',
			justifyContent: 'center',
			gap: 4,
			borderRadius: 18,
			// A plain View, so the radius actually clips - which was the whole
			// problem with letting the navigator paint this.
			backgroundColor: 'transparent',
		},
		boxActive: {
			backgroundColor: c.primarySoft,
		},
		boxPressed: {
			backgroundColor: c.pressed,
		},
		iconWrap: {
			// Gives the badge something to anchor to without shifting the glyph.
			position: 'relative',
		},
		label: {
			color: c.textTertiary,
			fontSize: 11,
			fontWeight: '700',
		},
		labelActive: {
			color: c.navy,
			fontWeight: '800',
		},
		badge: {
			position: 'absolute',
			top: -5,
			right: -9,
			minWidth: 16,
			height: 16,
			borderRadius: 8,
			paddingHorizontal: 4,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: c.danger,
			// Ring in the bar's own colour so the badge reads as lifted off the
			// glyph rather than merged into it.
			borderWidth: 1.5,
			borderColor: c.surface,
		},
		badgeText: {
			color: '#FFFFFF',
			fontSize: 9,
			fontWeight: '800',
			lineHeight: 12,
		},
	});
