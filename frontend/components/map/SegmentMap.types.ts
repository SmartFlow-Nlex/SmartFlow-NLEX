import type {
  ColouredJamLine,
  CorridorOverview,
  CorridorSegment,
  DirectionKey,
  LatLng,
} from '../../lib/corridorGeometry';

/**
 * Shared by `SegmentMap.tsx` (native, real map tiles) and `SegmentMap.web.tsx`
 * (schematic fallback). Kept in its own file so neither platform build has to
 * import the other - the point of the split is that react-native-maps never
 * reaches the web bundle.
 */
export interface SegmentMapProps {
  segment: CorridorSegment;
  /**
   * The whole corridor with every queue on it, drawn under `segment` so the
   * map shows all of NLEX with the tapped stretch highlighted. Only the Mapbox
   * map draws it; the others still show the stretch alone.
   */
  overview?: CorridorOverview;
  /**
   * Every queue on the drawn stretch, whichever exit it belongs to, coloured
   * and worst last. Drawn instead of `segment.jamLines` when given, so a
   * neighbour's queue that runs into the stretch is not painted out by it.
   */
  stretchJams?: ColouredJamLine[];
  /** Colour of corridor road with no queue on it. */
  corridorColor?: string;
  /**
   * The carriageways' base colour.
   *
   * Quiet when the backend told us where the queues are, because then the
   * queues carry the colour and the road under them should not. The status
   * colour when it did not, since the whole stretch is then all we can say.
   */
  nbColor: string;
  sbColor: string;
  /** Colour for one queue, by carriageway and its place in that list. */
  jamColorFor: (direction: DirectionKey, index: number) => string;
  /** Neutral colour for furniture that is not a traffic reading. */
  quietColor: string;
  exitName: string;
  /**
   * How much of the bottom of the map is covered by something else - the
   * corridor sheet. The road is framed above it, so pulling the sheet down
   * does not reveal a stretch that was hidden underneath it all along.
   */
  bottomInset?: number;
}

export type { CorridorSegment, DirectionKey, LatLng };
