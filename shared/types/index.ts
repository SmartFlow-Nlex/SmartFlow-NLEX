/**
 * Shared TypeScript types for SmartFlow NLEX
 * Used by both frontend (React Native) and backend (Node.js/Express)
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export enum SegmentStatus {
  NORTHBOUND = 'northbound',
  SOUTHBOUND = 'southbound',
  EASTBOUND = 'eastbound',
  WESTBOUND = 'westbound',
}

export enum TrafficCondition {
  NORMAL = 'normal',
  CONGESTED = 'congested',
  ACCIDENT = 'accident',
  CONSTRUCTION = 'construction',
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

// ============================================================================
// API RESPONSE/REQUEST TYPES
// ============================================================================

export interface TrafficData {
  id: string;
  roadName: string;
  duration: number; // in minutes
  condition: TrafficCondition;
  lastUpdated: string; // ISO 8601 timestamp
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

export interface SegmentStatusData {
  id: string;
  direction: SegmentStatus;
  startingPoint: string;
  destination: string;
  condition: TrafficCondition;
  distance: number; // in km
  estimatedTime: number; // in minutes
}

export interface EventForecast {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  timestamp: string; // ISO 8601 timestamp
  affectedSegments: string[]; // segment IDs
}

export interface HotspotData {
  id: string;
  name: string;
  location: {
    latitude: number;
    longitude: number;
  };
  reason: string; // e.g., "congestion", "accident", "construction"
  severity: AlertSeverity;
  timestamp: string; // ISO 8601 timestamp
}

export interface UserProfile {
  id: string;
  displayName: string;
  username: string;
  email: string;
  avatarUri?: string;
}

export interface SettingsState {
  notificationsEnabled: boolean;
  darkModeEnabled: boolean;
  language: string;
}

export type TrafficStatus = 'smooth' | 'moderate' | 'heavy' | 'incident';

/** Carriageway a post refers to — the two NLEX directions of travel. */
export type TravelDirection = 'northbound' | 'southbound';

export type ActiveCommunityTab = 'community' | 'incidents';

export interface CommunityPost {
  id: string;
  authorName: string;
  authorInitial: string;
  avatarColor: string;
  location: string;
  timeAgo: string;
  message: string;
  status: TrafficStatus;
  likes: number;
  likedByUser: boolean;
  media?: PostMedia[];
  direction?: TravelDirection;
}

export interface DashboardData {
  traffic: TrafficData[];
  segments: SegmentStatusData[];
  forecasts: EventForecast[];
  hotspots: HotspotData[];
  user: UserProfile;
}

// ============================================================================
// API ENDPOINTS RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DashboardResponse extends ApiResponse<DashboardData> {}

export interface TrafficResponse extends ApiResponse<TrafficData[]> {}

export interface SegmentsResponse extends ApiResponse<SegmentStatusData[]> {}

export interface ForecastsResponse extends ApiResponse<EventForecast[]> {}

export interface HotspotsResponse extends ApiResponse<HotspotData[]> {}

export interface UserResponse extends ApiResponse<UserProfile> {}

// ============================================================================
// REQUEST PAYLOADS
// ============================================================================

export interface DashboardRequestParams {
  includeForecasts?: boolean;
  includeHotspots?: boolean;
  radius?: number; // in km, for location-based queries
}

export interface UpdateUserRequest {
  displayName?: string;
  username?: string;
  email?: string;
  avatarUri?: string;
}

export type PostMediaType = 'image' | 'video';

/** A photo or clip attached to a community update or incident report. */
export interface PostMedia {
  /** Local device URI while composing; a hosted URL once uploaded. */
  uri: string;
  type: PostMediaType;
}

export interface ReportIncidentPayload {
  /** Formatted label, e.g. "Balintawak" or "Balintawak → NLEX Harbor Link". */
  location: string;
  description: string;
  status: TrafficStatus;
  reportedBy: string;
  media?: PostMedia[];
  direction?: TravelDirection;
}

export interface ShareUpdatePayload {
  /** Formatted label, e.g. "Balintawak" or "Balintawak → NLEX Harbor Link". */
  location: string;
  message: string;
  status: TrafficStatus;
  postedBy: string;
  media?: PostMedia[];
  direction?: TravelDirection;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// ASSISTANT TOOLS
// ============================================================================

/**
 * The data tools the traffic assistant is allowed to call.
 *
 * These names cross the wire: the backend registers them with the model and
 * reports which ones ran, and the chat UI turns each one into a label saying
 * where the answer came from. They live here because that is a contract
 * between the two - held separately, a tool added on the server shows up in
 * the app as a raw function name like "get corridor overview", which is
 * exactly what happened before this list existed.
 */
export const ASSISTANT_TOOLS = [
  'get_corridor_status',
  'get_corridor_overview',
  'list_exits',
  'get_road_reports',
  'get_maintenance',
  'get_community_posts',
  'get_event_forecasts',
  'get_incident_hotspots',
  'get_traffic_forecast',
  'get_road_rules',
] as const;

export type AssistantToolName = (typeof ASSISTANT_TOOLS)[number];
