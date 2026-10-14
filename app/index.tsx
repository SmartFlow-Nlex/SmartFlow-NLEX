import React from 'react';
import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../frontend/auth';
import LoadingMascot from '../frontend/components/ui/LoadingMascot';
import { useThemedStyles } from '../frontend/theme';
import type { ThemePalette } from '../frontend/theme';

export default function Index(): React.ReactElement {
	const { status } = useAuth();
	const styles = useThemedStyles(makeStyles);

	// Hold the launch route for the moment the auth state takes to settle. It
	// always settles signed out - every launch starts at the sign-in screen -
	// so the dashboard branch below is only for arriving here mid-session.
	if (status === 'loading') {
		return (
			<View style={styles.screen}>
				<LoadingMascot size={132} label="Opening SmartFlow NLEX" />
			</View>
		);
	}

	return <Redirect href={status === 'signedIn' ? '/(tabs)/dashboard' : '/sign-in'} />;
}

const makeStyles = (c: ThemePalette) =>
	StyleSheet.create({
		screen: {
			flex: 1,
			alignItems: 'center',
			justifyContent: 'center',
			backgroundColor: c.background,
		},
	});
