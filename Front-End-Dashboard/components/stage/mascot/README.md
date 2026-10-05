# NLEX mascot, 3D

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
