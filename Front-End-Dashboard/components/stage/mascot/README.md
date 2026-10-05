# NLEX mascot, 3D

> **Current design: v2, made cuter (6 Oct 2026).** The v2 body and "NLEX" cap, with: the drawn,
> animated face (`face.ts`, eyes redrawn in the reference sheet's style: a heavy lash line, a deep
> glossy blue iris, sparkle highlights, no full outline); a 1.12x widening for chubbier
> proportions; the cap down on the roof with the brim over the windscreen; short-stalked mirrors;
> thin-rimmed headlights clear of the tyres and a fuller bumper; and the sheet's sides and back
> (framed front and rear side windows, door handles, rear window, red-and-amber taillights, an "N"
> plate, the cap's strap). Shown a little from above. Overview only: sign-in shows the flat PNG.
> The v3-v7 notes below describe designs that were tried and set aside.

A procedural Three.js model of the NLEX mascot car, built from
`public/brand/nlex-mascot.png` with the img2threejs skill's core pipeline (local,
pure-Python tooling; no vision adapter, nothing uploaded). It is the hero on the
sign-in page and in the Overview hero; every other appearance of the mascot is the
PNG (`components/stage/Mascot.tsx`).

## Files

- `face.ts` — the drawn face (eyes, brows, cheeks, mouth on a canvas), which blinks, looks
  at a point and switches expression; projected by the face decal.
- `createNlexMascotModel.ts` — the factory. `createNlexMascotModel(options?)` returns
  a `THREE.Group` with `userData.mascot: NlexMascotHandles`.
- `nlex-mascot.sculpt-spec.json` — the sculpt spec the factory mirrors (component tree,
  materials, reference camera, build passes and their recorded reviews).
- `public/brand/mascot/decal-*.png` — flat textures cut from the PNG and projected onto
  the model: `decal-face.png` (eyes with brows, cheeks, open smile), `decal-cap-logo.png`
  (the NLEX logo on the cap front), `decal-hub-n.png` and `decal-badge-n.png` (the "N").

## Interface

```ts
interface NlexMascotHandles {
  wheels: THREE.Group[];            // [fl, fr, rl, rr]; origin on the axle, spin with rotation.x
  headlights: THREE.Mesh[];         // [l, r]
  headlightMaterials: THREE.MeshStandardMaterial[];
  setHeadlights(intensity01: number): void; // 0 off, 1 glow, >1 flash
  face: MascotFace | null;          // setBase / play(expression, s) / blink / look(x, y) / update
  ready: Promise<void>;             // all decals loaded
  dispose(): void;
}
```

Forward is +Z, Y up, the car's own left is +X; the origin is on the ground between the
axles. Named parts: `body-shell`, `windscreen-face-panel`, `cap` (`cap-crown`, brim and
front panel), `mirror-l` / `mirror-r` with stalks, `wheel-fl|fr|rl|rr` (tyre, blue hub,
hub "N", tread), `headlight-l` / `headlight-r` with chrome bezels and a soft glow,
`bumper-front` / `bumper-rear`, `side-window-l|r`, `taillight-l|r`, `bonnet-badge-n`.

## How it is used

`components/stage/mascot3d.ts` wraps the model as a stage actor: it imports this file
lazily, normalises the largest dimension to 3.5 and recentres with the scaled bounding
box (pivot at y = -0.4), lights it with the brief's key and fill, a sky-blue rim and a
soft studio environment (three's RoomEnvironment, prefiltered once), and animates it
(a 0.03 bob on 4.2 s, a ±10° sway on 9 s, pointer turn, a turn toward the camera with a
wheel spin-up on each sign-in story, headlight flash on the sign-in button, wheel spin-up
while a sign-in is pending; at rest the wheels settle with the hub "N" upright). If the model fails to load, the device reports less than
4 GB of memory, or reduced motion is on, the stage falls back to the 2.5D PNG.

## How it was built, and how far it got

Passes recorded in the spec (the pipeline's own reviews):

| Pass | Silhouette IoU (Tier 1) | AI-vision score | Decision |
|---|---|---|---|
| blockout | 0.867 | 0.70 | continue |
| structural-pass | 0.857 | 0.74 | continue |
| proportion-lock | 0.857 (0.874 own fit) | 0.75 | continue |
| feature-placement | renders and multi-angle checks captured (`renders/feature-placement/v1`) | — | not recorded: the build session ended at this step |

The feature-placement renders (front at the PNG's camera, three-quarter, side, rear and a
turntable) were reviewed by the lead on 5 Oct 2026: front-on it reads as the same
character (proportions, face and logo placement, headlights, badge, wheels with "N" hubs),
and it is in use.

## v2: hand-tuned past the pipeline (5 Oct 2026)

The pipeline's model read correctly front-on but looked wrong from any other angle: a
vertical box cabin with a step at the bonnet, a flat slab tail, wheels fully outside the
body like a buggy, flat white headlights, ball mirrors on long stalks, a helmet-like cap,
and paint that went indigo in dark mode. v2 changes, checked with renders from the front,
three-quarter, side and rear against the PNG:

- Body loft: a wide bumper the front wheels tuck behind, a bonnet that rolls into a raked
  windscreen (about 25°), a rounded roof and tail; rounded bumper lips front and rear.
- Side windows (tinted glass) and red taillights, so the sides and the tail read as a car.
- Headlights 20% larger, a lens texture (hot core to pale blue rim) and an additive glow.
- Mirrors: egg-shaped housings on short stalks, rooted on the A-pillar of the loft.
- Cap: a taller crown that no longer overhangs the tail, a longer arched brim, turned a
  little toward the car's left as in the PNG.
- Decals are snapped onto their host surface by ray-casting, so a reshaped body keeps them.
- Paint, chrome, glass and lenses take the studio environment; the rim light is `#6fa8ff`
  at 5 instead of `#5c7aff` at 10.

The constants in `createNlexMascotModel.ts` are now the source of truth; the sculpt spec
records the pipeline passes up to proportion-lock and no longer matches v2's body.

## v3: the character sheet (5 Oct 2026)

Rebuilt against the NLEX character sheet the team supplied (front, back, sides, top, bottom,
close-ups, palette, expressions; kept locally as
`.claude/skills/img2threejs/.img2threejs/nlex-mascot/template-sheet.jpg`, not uploaded anywhere):

- Face drawn, not cut (`face.ts`): the sheet's six expressions (happy, wink, excited,
  surprised, blush, curious) plus "focused", blinking on its own, pupils that follow a point.
- Palette from the sheet: paint `#1A86FF` (the sheet's `#0B6FFF`, lifted a step toward cyan
  because ACES pushes pure blue to violet), light-blue glass, a dark-gray `#2D3748` underbody.
- Bigger, chunkier wheels (radius 0.31) under painted wheel arches; headlights moved in and up
  so they sit on the bonnet clear of the tyres.
- Rear: a light-blue rear window, rounded red taillights with amber inner ends, a blue "N"
  plate; door handles; the cap's strap opening at the back; the cap squared to the car.
- Motion lives in `../mascot3d.ts`: it drives in and turns to face the reader, bobs, blinks,
  fidgets (hop, look around, wink, blush), reacts to hover and clicks, and keeps its sign-in
  reactions.

## v5: side by side with the sheet (5 Oct 2026)

- Wheels tucked under the body (track 0.53, wheel wells deepened), the tyres just proud of the
  fenders; the white windscreen-face inset with blue pillars either side; the face drawn about
  8% larger; headlights a little lower with a plain silver ring; a slimmer bumper.
- Cap level on the roof with a real peak: narrower, angled down, curving down at its sides; the
  white front panel wider again.
- Lighting about a quarter softer (key 12, hemisphere 0.6, less reflection on paint and face),
  less self-glow on the face and decals, a light clearcoat on the face so the eyes stay blue;
  paint `#2484FF`; irises lean cyan because ACES turns pure blue violet.

## v6: cute, not just accurate (5 Oct 2026)

The v5 car matched the sheet part by part but read tall, narrow and long-nosed. v6 goes after the
proportions and the face style that make the mascot cute:

- Built as before, then widened 1.2× (`WIDTH_SCALE`): squat and wide, about as wide as it is tall
  with its cap on. Decals project after the widening, so the face, logo and plate keep their shape.
- A shorter nose and the cabin brought forward over the middle (no lean back); the cap raised so
  white windscreen shows above the brows; mirrors tucked in close.
- The face redrawn in the sheet's style: tall eyes with a heavy navy outline and a pointed outer
  corner, an iris that fills the eye, a big pupil, two clean highlights; short thick brows; a
  bigger open smile on the blue bonnet between the cheeks.
- Flush headlights with a hairline ring, a slimmer bumper band.
- On the page the car is tipped 0.17 rad toward the camera (`BASE_PITCH` in `../mascot3d.ts`),
  so it is seen a little from above, as on the sheet.

## v7: the animated reference (6 Oct 2026)

Matched to `Downloads/Mascot/Reference.mp4` (frames pulled locally in headless Edge; nothing
uploaded):

- Cap: lower, so the crown hugs the roof like a cap on a head, the brim angled down over the
  windscreen and curving at its sides, turned a touch to the car's left; the logo is now the
  reference's round "N" badge (drawn, `buildCapBadgeTexture`) instead of the "NLEX" wordmark.
- Front, top to bottom as in the video: eyes on the white windscreen; pink cheeks just under it;
  the chrome "N" emblem between them; a bigger open smile under the emblem; warm ivory headlights
  (round, though the body is widened) beside the smile; a thicker bumper band.
- The face canvas grew to 1024x800 at the same scale, so the smile can sit lower.
- Paint `#3590EE` (the video reads `#3B86CA` on screen).
- Motion (`../mascot3d.ts`): rocks up onto two wheels and back with a laugh (its signature move,
  a fidget and on hover), twinkling four-point sparkles (warm white in dark, gold in light) in
  bursts and now and then on their own, and the mouth chatters while it laughs (`face.talk`).
- The bounce spring now runs in fixed 1/120 s steps: a long frame used to let it lock into
  flicking between squashed and stretched.

## What is approximate

- Only the front is in the reference. The rear and sides are inferred and stylised (the side
  windows and taillights are invented).
- The face and the logos are decals cut from the PNG, not sculpted (by design: a sculpted
  approximation of the face would read as a different character).
- The renderer's exposure for the car is 1.35, not the brief's 2.2: at 2.2 the ACES curve
  washed the paint to lilac under the blue rim light; 1.35 keeps the PNG's saturated blue
  (`PAINT_HEX` 0x1280ee, the median of 392k paint pixels). The wave shader grades itself
  and is unaffected.
- The key light's "soft shadows" are drawn as a soft contact ellipse under the wheels:
  a real-time shadow map left a hard edge where its frustum ended and cost a second render
  of the car per frame.

## v8 (7 Oct 2026): rebuilt to the user's two reference sheets

The sheets ("3D template / reference" and "3D model reference, three.js / img2threejs ready") are the
source of truth; v8 was tuned by rendering front, three-quarter, side, back and top views beside crops of
them. Same structure and mesh names as before, so `../mascot3d.ts` drives it unchanged.

- Body: longer and lower (a hatchback about 1.5x as long as it is tall), a tall upright front fascia,
  a short bonnet rolling into a steep windscreen, a thick full-width bumper band front and rear.
- Wheels straight (no toe-in), chunky, at the corners. Headlights bigger, chrome-ringed, lower and wider apart.
- Mirrors: big round housings at eye height with the white strip. Side glass deeper blue.
- Face panel wide, with the two brow humps; the drawn face (`face.ts`) re-laid out for it: round eyes
  that peek over the blue fascia (clipped at the windscreen's edge), one thick navy upper lid, deep blue
  glossy irises, big top-left highlights and a sparkle; short thick brows; a small rounded "D" smile with
  a pink tongue (made smaller at the user's request); pink cheeks.
- Cap: level on the roof, the visor joined to the crown (its inner edge runs along the crown's base;
  the sides bend down only as they reach out) and closed all round; the crown carries a short band
  below its equator so no gap shows. The badge is a blue ring round a bold blue "N" drawn on a canvas
  (`buildCapNTexture`), replacing the NLEX wordmark at the user's request.
- Later the same day (user requests): the cap badge redrawn crisp (1024 px canvas), deep blue, a thick
  ring and a bold "N", on a wider white front panel so the ring sits wholly on white; the smile made
  small (156 x 76 canvas px); and fine surface relief with no change of shape or colour: an orange-peel
  normal map (and roughness variation) on the paint, a woven-fabric normal map on the cap, a rubber grain
  on the tyres (tileable canvas maps from `tileNoise` / `weaveHeight`; UVs added to the body, bumpers,
  visor and cap panel). The body loft is denser (220 x 8 per key) so the wheel-arch pinch stays smooth.
