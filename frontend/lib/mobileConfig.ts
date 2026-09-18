import { useEffect, useState } from 'react';
import { API_TIMEOUT_MS, CORRIDOR_API_BASE_URL } from '../config/api';

/**
 * Which screens this build is allowed to show, and any advisory an operator has
 * published, both set from the dashboard's Mobile Control Centre.
 *
 * Served by the SmartFlow dashboard backend at GET /api/mobile-config — the same
 * host the corridor feed comes from, so if the corridor map can load, so can
 * this. The dashboard writes it at /dashboard/mobile; the contract lives in
 * Back-End/src/validators/mobile-config.validator.ts.
 */

const MOBILE_CONFIG_PATH = '/api/mobile-config';

export type MobileFeature = 'dashboard' | 'map' | 'community' | 'assistant' | 'alerts';
export type AdvisoryTone = 'info' | 'warning' | 'critical';

export interface MobileAdvisory {
	id: string;
	active: boolean;
	tone: AdvisoryTone;
	message: string;
}

/**
 * What is inside each tab. The keys match the screens that read them, so a
 * section can only be added here once the screen honours it.
 */
export interface MobileSections {
	dashboard: {
		statusSummary: boolean;
		segmentForecast: boolean;
		corridorOutlook: boolean;
		eventForecasts: boolean;
		mlHotspots: boolean;
	};
	map: { liveStatus: boolean; forecastView: boolean };
	community: { shareUpdate: boolean; reportIncident: boolean; filters: boolean };
	assistant: { quickQuestions: boolean; capabilities: boolean };
	alerts: { traffic: boolean; maintenance: boolean };
}

export interface MobileConfig {
	features: Record<MobileFeature, boolean>;
	sections: MobileSections;
	/** Every published advisory, in the order an operator arranged them. */
	advisories: MobileAdvisory[];
}

/**
 * Used until the first response arrives, and kept if that response never comes.
 *
 * Fails OPEN — every screen on, no advisory. A phone that cannot reach the
 * backend must still be a working app: failing closed would mean a flat Wi-Fi
 * moment hides the corridor map, which is the one screen a driver opened the
 * app for. The dashboard makes the same choice for the same reason, so an
 * unreachable database and an unreachable backend look identical to the user.
 */
export const DEFAULT_MOBILE_CONFIG: MobileConfig = {
	features: { dashboard: true, map: true, community: true, assistant: true, alerts: true },
	sections: {
		dashboard: {
			statusSummary: true,
			segmentForecast: true,
			corridorOutlook: true,
			eventForecasts: true,
			mlHotspots: true,
		},
		map: { liveStatus: true, forecastView: true },
		community: { shareUpdate: true, reportIncident: true, filters: true },
		assistant: { quickQuestions: true, capabilities: true },
		alerts: { traffic: true, maintenance: true },
	},
	advisories: [],
};

const FEATURE_KEYS: MobileFeature[] = ['dashboard', 'map', 'community', 'assistant', 'alerts'];
const TONES: AdvisoryTone[] = ['info', 'warning', 'critical'];

/**
 * Narrows an untrusted payload to MobileConfig, filling anything missing from
 * the defaults rather than rejecting the whole document.
 *
 * A dashboard that gains a sixth feature should not brick older builds of this
 * app: an unknown key is ignored and a missing one falls back to "on", so an
 * app released today keeps working against a backend released next term.
 */
function parseConfig(raw: unknown): MobileConfig {
	if (raw === null || typeof raw !== 'object') return DEFAULT_MOBILE_CONFIG;
	const obj = raw as Record<string, unknown>;

	const features = { ...DEFAULT_MOBILE_CONFIG.features };
	const rawFeatures = obj.features;
	if (rawFeatures !== null && typeof rawFeatures === 'object') {
		for (const key of FEATURE_KEYS) {
			const value = (rawFeatures as Record<string, unknown>)[key];
			if (typeof value === 'boolean') features[key] = value;
		}
	}

	// Same rule as features: start from the defaults and overwrite only what the
	// payload actually carries a boolean for. A tab the server has never heard
	// of keeps its local default rather than disappearing.
	const sections = {
		dashboard: { ...DEFAULT_MOBILE_CONFIG.sections.dashboard },
		map: { ...DEFAULT_MOBILE_CONFIG.sections.map },
		community: { ...DEFAULT_MOBILE_CONFIG.sections.community },
		assistant: { ...DEFAULT_MOBILE_CONFIG.sections.assistant },
		alerts: { ...DEFAULT_MOBILE_CONFIG.sections.alerts },
	};
	const rawSections = obj.sections;
	if (rawSections !== null && typeof rawSections === 'object') {
		for (const tab of FEATURE_KEYS) {
			const group = (rawSections as Record<string, unknown>)[tab];
			if (group === null || typeof group !== 'object') continue;
			const target = sections[tab] as Record<string, boolean>;
			for (const key of Object.keys(target)) {
				const value = (group as Record<string, unknown>)[key];
				if (typeof value === 'boolean') target[key] = value;
			}
		}
	}

	// An advisory with no text is never shown even if its flag says active, so a
	// half-saved row cannot push a blank card to every phone.
	const readAdvisory = (raw: unknown, fallbackId: string): MobileAdvisory | null => {
		if (raw === null || typeof raw !== 'object') return null;
		const a = raw as Record<string, unknown>;
		const message = typeof a.message === 'string' ? a.message.trim() : '';
		if (message.length === 0) return null;
		return {
			id: typeof a.id === 'string' && a.id.length > 0 ? a.id : fallbackId,
			active: a.active === true,
			tone: TONES.includes(a.tone as AdvisoryTone) ? (a.tone as AdvisoryTone) : 'info',
			message,
		};
	};

	const advisories: MobileAdvisory[] = [];
	if (Array.isArray(obj.advisories)) {
		obj.advisories.forEach((raw, i) => {
			const parsed = readAdvisory(raw, `advisory-${i}`);
			if (parsed !== null) advisories.push(parsed);
		});
	} else {
		// A server older than the list sends a single `advisory` instead.
		const legacy = readAdvisory(obj.advisory, 'legacy');
		if (legacy !== null) advisories.push(legacy);
	}

	return { features, sections, advisories };
}

export async function fetchMobileConfig(signal?: AbortSignal): Promise<MobileConfig> {
	const url = `${CORRIDOR_API_BASE_URL}${MOBILE_CONFIG_PATH}`;

	// A dead host does not refuse the connection, it just never answers; without
	// our own deadline the app would sit on the splash screen waiting for the
	// platform default.
	const timeoutController = new AbortController();
	const timeoutId = setTimeout(() => timeoutController.abort(), API_TIMEOUT_MS);
	const onCallerAbort = (): void => timeoutController.abort();
	signal?.addEventListener('abort', onCallerAbort);

	try {
		const response = await fetch(url, { signal: timeoutController.signal });
		if (!response.ok) return DEFAULT_MOBILE_CONFIG;
		const body = (await response.json()) as { success?: boolean; data?: unknown };
		if (body?.success !== true) return DEFAULT_MOBILE_CONFIG;
		return parseConfig(body.data);
	} catch {
		// Deliberately swallowed. Every failure here means the same thing to the
		// user - the app runs with everything enabled - and there is no screen
		// on which an operator-configuration error would mean anything to them.
		return DEFAULT_MOBILE_CONFIG;
	} finally {
		clearTimeout(timeoutId);
		signal?.removeEventListener('abort', onCallerAbort);
	}
}

export interface UseMobileConfigResult {
	config: MobileConfig;
	/** False until the first answer (or its failure) has landed. */
	ready: boolean;
}

/**
 * Reads the configuration once per mount.
 *
 * Deliberately not polled. Hiding a tab out from under someone mid-tap is worse
 * than showing it until the next launch, and expo-router would have to tear down
 * a mounted route to do it. Operators are told as much on the dashboard: the
 * save confirmation says it applies on the next launch or refresh.
 */
export function useMobileConfig(): UseMobileConfigResult {
	const [config, setConfig] = useState<MobileConfig>(DEFAULT_MOBILE_CONFIG);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const controller = new AbortController();
		let cancelled = false;

		void fetchMobileConfig(controller.signal).then((next) => {
			if (cancelled) return;
			setConfig(next);
			setReady(true);
		});

		return () => {
			cancelled = true;
			controller.abort();
		};
	}, []);

	return { config, ready };
}
