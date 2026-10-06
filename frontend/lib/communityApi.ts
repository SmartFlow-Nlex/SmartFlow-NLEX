import {
  CommunityPost,
  PostMedia,
  ReportIncidentPayload,
  ShareUpdatePayload,
  TrafficStatus,
  TravelDirection,
} from '@smartflow/shared';
import { getSupabase } from '../auth/supabaseClient';

/**
 * Community feed storage, backed by Supabase.
 *
 * The schema lives in supabase/community-schema.sql and has to be applied once
 * in the dashboard - the app's publishable key cannot create tables.
 */

const POSTS_TABLE = 'community_posts';
const LIKES_TABLE = 'community_post_likes';
const MEDIA_BUCKET = 'community-media';

export type PostKind = 'update' | 'incident';

interface PostRow {
  id: string;
  created_at: string;
  author_id: string;
  author_name: string;
  kind: PostKind;
  location: string;
  direction: TravelDirection | null;
  message: string;
  status: TrafficStatus;
  media: PostMedia[] | null;
  community_post_likes: { user_id: string }[] | null;
}

/** Deterministic avatar colour, so one author looks the same to every viewer. */
const AVATAR_COLORS = ['#152A48', '#2F4E7E', '#0F766E', '#7C3AED', '#B45309', '#BE123C'];

function avatarColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initialFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'U';
}

/** "5m ago" style relative time, derived from the row's own timestamp. */
export function timeAgoFrom(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) {
    return 'Just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

function toCommunityPost(row: PostRow, viewerId: string | null): CommunityPost {
  const likeRows = row.community_post_likes ?? [];
  return {
    id: row.id,
    authorName: row.author_name,
    authorInitial: initialFor(row.author_name),
    avatarColor: avatarColorFor(row.author_id),
    location: row.location,
    timeAgo: timeAgoFrom(row.created_at),
    message: row.message,
    status: row.status,
    likes: likeRows.length,
    likedByUser: viewerId !== null && likeRows.some((like) => like.user_id === viewerId),
    media: row.media ?? undefined,
    direction: row.direction ?? undefined,
  };
}

/**
 * Copies one attachment into the storage bucket and returns its public URL.
 *
 * The picker hands back a local `file://` (or `blob:` on web) URI, which means
 * nothing on anyone else's device - so the bytes have to be uploaded before the
 * post is written, or every other viewer sees a broken image.
 */
async function uploadMedia(item: PostMedia, authorId: string): Promise<PostMedia> {
  const supabase = getSupabase();
  const isVideo = item.type === 'video';
  const guessed = item.uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const ext = /^[a-z0-9]{2,4}$/.test(guessed) ? guessed : isVideo ? 'mp4' : 'jpg';
  const contentType = isVideo
    ? `video/${ext === 'mov' ? 'quicktime' : ext}`
    : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const objectPath = `${authorId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const response = await fetch(item.uri);
  const bytes = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(objectPath, bytes, { contentType, upsert: false });

  if (error !== null) {
    throw new Error(`Could not upload attachment: ${error.message}`);
  }

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(objectPath);
  return { uri: data.publicUrl, type: item.type };
}

async function uploadAllMedia(media: PostMedia[], authorId: string): Promise<PostMedia[]> {
  if (media.length === 0) {
    return [];
  }
  return Promise.all(media.map((item) => uploadMedia(item, authorId)));
}

async function requireUser(): Promise<{ id: string; name: string }> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error !== null || data.user === null) {
    throw new Error('You need to be signed in to post.');
  }
  const metadata = data.user.user_metadata as { full_name?: unknown } | null;
  const name =
    typeof metadata?.full_name === 'string' && metadata.full_name.trim().length > 0
      ? metadata.full_name.trim()
      : (data.user.email ?? 'Community User').split('@')[0];
  return { id: data.user.id, name };
}

/** Newest first, with each post's likes attached so counts need no second trip. */
export async function fetchPosts(kind: PostKind): Promise<CommunityPost[]> {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const viewerId = userData.user?.id ?? null;

  const { data, error } = await supabase
    .from(POSTS_TABLE)
    .select('*, community_post_likes ( user_id )')
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error !== null) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as PostRow[];
  return rows.map((row) => toCommunityPost(row, viewerId));
}

async function insertPost(input: {
  kind: PostKind;
  location: string;
  direction?: TravelDirection;
  message: string;
  status: TrafficStatus;
  media?: PostMedia[];
}): Promise<CommunityPost> {
  const supabase = getSupabase();
  const user = await requireUser();

  // Uploads happen first: a post that references media we failed to store
  // would render broken for everyone, so let the whole submit fail instead.
  const uploaded = await uploadAllMedia(input.media ?? [], user.id);

  const { data, error } = await supabase
    .from(POSTS_TABLE)
    .insert({
      author_id: user.id,
      author_name: user.name,
      kind: input.kind,
      location: input.location,
      direction: input.direction ?? null,
      message: input.message,
      status: input.status,
      media: uploaded,
    })
    .select('*, community_post_likes ( user_id )')
    .single();

  if (error !== null) {
    throw new Error(error.message);
  }

  return toCommunityPost(data as unknown as PostRow, user.id);
}

export async function createUpdate(payload: ShareUpdatePayload): Promise<CommunityPost> {
  return insertPost({
    kind: 'update',
    location: payload.location,
    direction: payload.direction,
    message: payload.message,
    status: payload.status,
    media: payload.media,
  });
}

export async function createIncident(payload: ReportIncidentPayload): Promise<CommunityPost> {
  return insertPost({
    kind: 'incident',
    location: payload.location,
    direction: payload.direction,
    message: payload.description,
    status: payload.status,
    media: payload.media,
  });
}

/** Adds or removes the viewer's like. Callers update their UI optimistically. */
export async function setLiked(postId: string, liked: boolean): Promise<void> {
  const supabase = getSupabase();
  const user = await requireUser();

  if (liked) {
    const { error } = await supabase
      .from(LIKES_TABLE)
      .upsert({ post_id: postId, user_id: user.id }, { onConflict: 'post_id,user_id' });
    if (error !== null) {
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase
    .from(LIKES_TABLE)
    .delete()
    .eq('post_id', postId)
    .eq('user_id', user.id);
  if (error !== null) {
    throw new Error(error.message);
  }
}

/** A community incident report, as the Alerts tab shows it to everyone else. */
export interface CommunityIncidentAlert {
  id: string;
  authorName: string;
  location: string;
  direction: TravelDirection | null;
  message: string;
  status: TrafficStatus;
  createdAt: Date;
}

/**
 * How long a driver's incident report stays an alert. Long enough to outlast
 * the clearing of a typical crash, short enough that yesterday's report is not
 * telling anyone about today's road. The Community tab keeps the full history.
 */
const INCIDENT_ALERT_HOURS = 3;

/**
 * Recent incident reports by OTHER drivers, newest first.
 *
 * Your own reports are left out - you do not need alerting to something you
 * just told everyone. Reading needs a signed-in session (the table's row-level
 * security), so a signed-out app gets an empty list rather than an error.
 */
export async function fetchCommunityIncidentAlerts(): Promise<CommunityIncidentAlert[]> {
  const supabase = getSupabase();
  // The cached session, not getUser(): this runs every minute, and getUser()
  // is a round trip to the auth server each time.
  const { data: sessionData } = await supabase.auth.getSession();
  const viewerId = sessionData.session?.user.id ?? null;
  if (viewerId === null) {
    return [];
  }

  const since = new Date(Date.now() - INCIDENT_ALERT_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from(POSTS_TABLE)
    .select('id, created_at, author_id, author_name, location, direction, message, status')
    .eq('kind', 'incident')
    .neq('author_id', viewerId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error !== null) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as PostRow[]).map((row) => ({
    id: row.id,
    authorName: row.author_name,
    location: row.location,
    direction: row.direction,
    message: row.message,
    status: row.status,
    createdAt: new Date(row.created_at),
  }));
}
