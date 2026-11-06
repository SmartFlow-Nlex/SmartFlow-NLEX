import { HINTS, HUB_LINES, NLEX_LINES, OBJECTIVES } from '../core/content';
import { savings } from '../core/emissions';
import { DEPOT_BEFORE, facilityDay } from '../core/facility';
import { chosenUpgrades, currentStep, DELIVERY_MISSION, ECO_MISSION, GRIDLOCK_MISSION, HORNBILL_MISSION, isFinished, missionById, missionTransport, MISSIONS, newRun, RIVER_MISSION, setFlag, type MissionDef, type MissionRun } from '../core/mission';
import { missionOpen, NLEX_STOPS, progress } from '../core/nlex';
import { allModeSets, BOCAUE_PLAZA, plazaSolved, simulatePlaza } from '../core/plaza';
import { ACHIEVEMENTS, COLLECTIBLES, DISCOVERIES, GEAR, GEAR_EFFECT } from '../core/progression';
import { CIRCUITS, DIALS, LOADS } from '../core/puzzles';
import { awardAchievements, buyGear, buyUpgrade, bumpRevision, collect, completeMission, discover, loadSave, serializeSave, sideStep, UPGRADES, type SaveData, type SimPart } from '../core/save';
import type { SpeciesRecord } from '../core/species';
import { ROSTER } from '../core/speciesFacts';
import { comparePlan, type Comparison, type Plan } from '../core/transport';
import { newActor, pose, poseBird } from './anim';
import { GameAudio } from './audio';
import { button, h, icon } from './dom';
import { Game, HERO_ORDER } from './game';
import { placement, mat4, type Vec3 } from './gl/math';
import { Renderer } from './gl/renderer';
import { HornbillScript, nextSeason } from './hornbill';
import { navieKey, type MissionContext, type MissionScript } from './missions/base';
import { DeliveryScript } from './missions/delivery';
import { EcoScript } from './missions/eco';
import { GridlockScript, lanesFromFlags, plazaFor } from './missions/gridlock';
import { HubScript, type HubPlace } from './hub';
import { achievementGallery, navieMenu, noticeBoard, quizScreen, workshopScreen } from './ui/hubScreens';
import { circuitPuzzle, dialPuzzle, loadPuzzle, type PuzzleHandle } from './ui/puzzles';
import { RiverScript } from './missions/river';
import { NAVIE_ART } from './navieArt';
import { depotHow, energyPlanner, lanePuzzle, missionBriefing, nlexResults, opsBoardScreen, plazaHow, progressDashboard } from './ui/nlex';
import type { Host } from './host';
import { InputController } from './input';
import { makeAwit, makeBaging, makeChief, makeDayo, makeDriver, makeHornbill, makeOfficer, makeRanger, makeResident, makeSpecialist, makeSukat, makeVet, type HeroId, type Portraits } from './models';
import type { Texture } from './gl/renderer';
import { howCalculated, transportBoard } from './ui/board';
import { Hud } from './ui/hud';
import { atlasScreen, dispatchOverlay, galleryScreen, mapScreen, notesScreen, recapScreen, resultsScreen, settingsScreen, speciesDetail, teamScreen, titleScreen, upgradesScreen } from './ui/screens';

/**
 * The whole page: starts the renderer, bakes portraits, runs the menus, the flow of a
 * mission from briefing to next season, and the save. The 3D world is in game.ts, and
 * the mission itself is in hornbill.ts.
 */

const DEV_FRAME = 1 / 30;

export class WildwayApp {
  private root!: HTMLElement;
  private save!: SaveData;
  private readonly audio = new GameAudio();
  private renderer: Renderer | null = null;
  private game!: Game;
  private hud!: Hud;
  private input!: InputController;
  private canvas!: HTMLCanvasElement;
  private overlayRoot!: HTMLElement;
  private fadeEl!: HTMLElement;
  private portraits: Portraits = {};
  private script: MissionScript | null = null;
  /** The Command Center's living parts, between missions. */
  private hub: HubScript | null = null;
  /** The puzzle on screen, if any: development hooks can finish it. */
  private activePuzzle: PuzzleHandle | null = null;
  /** The guide shows for a while after a hint, even with the arrow turned off. */
  private hintShowUntil = 0;
  private worldTime = 0;
  /** Development: finish any puzzle that opens, as the play-through bot does. */
  autoSolve = false;
  /** The mission being played, or last played. */
  private mission: MissionDef = HORNBILL_MISSION;
  private run: MissionRun | null = null;
  /** Pictures that change with progress: the Operations Board and progress screens. */
  private liveTextures: { ops: Texture | null; progress: Texture | null } = { ops: null, progress: null };
  private comparison: Comparison | null = null;
  private raf = 0;
  private last = 0;
  private disposed = false;
  /** A menu is covering the world: don't run the world's input. */
  private inWorld = false;
  private titleOrbit = false;
  private orbit = 0;
  private waits: { left: number; done: () => void }[] = [];
  private saveFailed = false;
  private backAction: (() => void) | null = null;
  private touchGuard = 0;
  private atlasChapter = 1;
  private resizeObserver: ResizeObserver | null = null;
  private readonly cleanups: (() => void)[] = [];
  /** Development only: walk and act by itself, to test a whole mission. */
  autoplay = false;
  autoSpeechFrames = 1;
  /** The bot takes the second-choice hero at each obstacle. */
  autoAlt = false;
  private autoSpeech = 0;
  private autoLook = 0;
  private autoAt = { x: 0, z: 0 };
  private autoStuck = 0;
  private autoSide = 0;
  private autoSideDir = 1;

  constructor(private readonly host: Host) {}

  start(root: HTMLElement): void {
    this.root = root;
    this.save = loadSave(this.host.boot.save).save;
    if (this.host.boot.reduceMotion) {
      this.save.settings.reduceMotion = true;
    }
    this.saveFailed = !this.host.boot.storageOk;
    const { insets } = this.host.boot;
    const style = document.documentElement.style;
    if (insets.top > 0 || insets.bottom > 0) {
      style.setProperty('--safe-top', `${insets.top}px`);
      style.setProperty('--safe-bottom', `${insets.bottom}px`);
      style.setProperty('--safe-left', `${insets.left}px`);
      style.setProperty('--safe-right', `${insets.right}px`);
    }
    this.canvas = h('canvas', { attrs: { id: 'world', 'aria-hidden': 'true' } });
    this.overlayRoot = h('div', { class: 'overlays' });
    this.fadeEl = h('div', { class: 'fade' });
    root.append(this.canvas);
    try {
      this.renderer = new Renderer(this.canvas);
    } catch {
      root.replaceChildren(
        h('div', { class: 'screen no-3d' }, h('h2', { text: 'This phone cannot show the 3D world' }), h('p', { text: 'NLEX: Wildway Guardians needs WebGL, which is not available here.' }), button('Back to the Arcade', () => this.host.send({ type: 'exit' }), { iconName: 'back' })),
      );
      this.host.send({ type: 'ready' });
      return;
    }
    this.fitCanvas();
    this.bakePortraits();
    this.navieArt();
    this.hud = new Hud(this.portraits, {
      onPause: () => this.showPause(),
      onHero: (id) => this.game.switchHero(id),
      onActionDown: () => {
        this.audio.unlock();
        this.input.state.actionHeld = true;
        this.onActionPressed();
      },
      onActionUp: () => {
        this.input.state.actionHeld = false;
      },
      onAbilityDown: () => {
        this.input.state.abilityHeld = true;
      },
      onAbilityUp: () => {
        this.input.state.abilityHeld = false;
      },
      onAtlas: () => this.openAtlasFromWorld(),
      onHint: () => this.hint(),
      onGo: () => this.goNear(),
    });
    root.append(this.hud.el, this.overlayRoot, this.fadeEl);
    this.input = new InputController(this.hud.surface, this.hud.stick, this.hud.knob);
    this.input.onPause = () => this.showPause();
    this.game = new Game(this.renderer, this.audio, this.input);
    this.game.onNotice = (t) => this.hud.notice(t);
    this.makeTextures();
    this.applySettings();
    this.resizeObserver = new ResizeObserver(() => this.fitCanvas());
    this.resizeObserver.observe(root);

    this.cleanups.push(
      this.host.onMessage((message) => {
        switch (message.type) {
          case 'pause':
            if (this.inWorld) {
              this.showPause();
            }
            this.audio.suspend();
            break;
          case 'back':
            this.goBack();
            break;
          case 'saved':
            this.saveFailed = false;
            break;
          case 'saveFailed':
            this.saveFailed = true;
            break;
          default:
            break;
        }
      }),
    );
    const hide = (): void => {
      if (document.hidden) {
        if (this.inWorld) {
          this.showPause();
        }
        this.audio.suspend();
      }
    };
    document.addEventListener('visibilitychange', hide);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', hide));
    const tap = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', tap);
    this.cleanups.push(() => window.removeEventListener('pointerdown', tap));
    if (this.host.boot.debug) {
      (window as unknown as { __ww: unknown; __wwDev: unknown }).__ww = this;
      (window as unknown as { __wwDev: unknown }).__wwDev = { ROSTER, notesScreen, MISSIONS, PLAZA: { allModeSets, simulatePlaza, plazaSolved, plazaFor } };
      this.autoGraphics = false;
    }

    this.game.loadZone('station', this.save.upgrades);
    this.game.placeTeam(0, 4, 0.8);
    this.showTitle();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.host.send({ type: 'ready' });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.cleanups.forEach((fn) => fn());
    this.input?.dispose();
    this.audio.dispose();
  }

  /* ---- Plumbing ---- */

  private fitCanvas(): void {
    if (this.renderer === null) {
      return;
    }
    const smooth = this.save.settings.graphics === 'smooth';
    const dpr = Math.min(window.devicePixelRatio || 1, smooth ? 1.25 : 2);
    this.renderer.resize(window.innerWidth, window.innerHeight, dpr);
  }

  private applySettings(): void {
    const s = this.save.settings;
    document.documentElement.style.setProperty('--text-scale', String(s.textScale));
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
    this.audio.setOptions(s.sound, s.music);
    if (this.game !== undefined) {
      this.game.highDetail = s.graphics === 'detailed';
      this.game.showShadows = true;
      this.game.reduceMotion = s.reduceMotion;
      this.applyGear();
    }
    this.fitCanvas();
  }

  /** Workshop gear changes how the heroes move and reach. */
  private applyGear(): void {
    const has = (id: string): boolean => this.save.gear.includes(id);
    this.game.speedBoost = has('boots') ? GEAR_EFFECT.bootsSpeed : 1;
    this.game.glideMax = has('kite') ? GEAR_EFFECT.kiteSeconds : GEAR_EFFECT.baseKiteSeconds;
    this.game.vinesExtra = has('vines') ? GEAR_EFFECT.vinesExtra : 0;
  }

  /** Saves a step forward outside the story, then grants any achievement it earned, once. */
  private progressed(next: SaveData): void {
    const { save, ids } = awardAchievements(next);
    this.persist(save);
    ids.forEach((id, i) => {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (a !== undefined && this.inWorld) {
        window.setTimeout(() => {
          this.audio.play('star');
          this.hud.notice(`Achievement: ${a.title}! +10 points`, 3.4);
        }, 900 + i * 3600);
      }
    });
  }

  private persist(next: SaveData): void {
    const changed = next.missions !== this.save.missions || next.upgrades !== this.save.upgrades;
    this.save = bumpRevision(next);
    if (changed) {
      this.paintLiveScreens();
    }
    this.host.send({ type: 'save', save: serializeSave(this.save), revision: this.save.revision });
  }

  private changeSettings(change: Partial<SaveData['settings']>): void {
    this.persist({ ...this.save, settings: { ...this.save.settings, ...change } });
    this.applySettings();
  }

  /** Puts a full-screen menu over the world. */
  private showScreen(el: HTMLElement | null, back: (() => void) | null): void {
    /*
     * Opened by pressing the action button: the finger is still down, and when it lifts
     * its click would land on whatever just appeared under it. So hold off touches briefly.
     */
    if (el !== null && this.inWorld) {
      if (this.input.state.actionHeld) {
        this.overlayRoot.style.pointerEvents = 'none';
        window.clearTimeout(this.touchGuard);
        this.touchGuard = window.setTimeout(() => {
          this.overlayRoot.style.pointerEvents = '';
        }, 300);
      }
      this.input.release();
    }
    this.overlayRoot.replaceChildren();
    if (el !== null) {
      this.overlayRoot.append(el);
    }
    this.backAction = back;
    this.hud.el.classList.toggle('hidden', el !== null || !this.inWorld);
  }

  private overlay(el: HTMLElement | null): void {
    const existing = this.overlayRoot.querySelector('.overlay-layer');
    existing?.remove();
    if (el !== null) {
      const layer = h('div', { class: 'overlay-layer' }, el);
      this.overlayRoot.append(layer);
    }
  }

  private goBack(): void {
    if (this.overlayRoot.querySelector('.overlay-layer') !== null) {
      this.overlay(null);
      return;
    }
    if (this.backAction !== null) {
      this.audio.play('tap');
      this.backAction();
    } else if (this.inWorld) {
      this.showPause();
    } else {
      this.host.send({ type: 'exit' });
    }
  }

  private tapped(fn: () => void): () => void {
    return () => {
      this.audio.unlock();
      this.audio.play('tap');
      fn();
    };
  }

  /* ---- Portraits, rendered from the real models at load ---- */

  private bakePortraits(): void {
    const r = this.renderer as Renderer;
    const env = {
      sun: [0.35, 0.7, 0.62] as Vec3,
      skyTop: [0.62, 0.86, 1] as Vec3,
      skyBottom: [0.86, 0.96, 1] as Vec3,
      fog: [0.8, 0.9, 1] as Vec3,
      fogNear: 100,
      fogFar: 200,
      shadowTint: [0.62, 0.68, 0.92] as Vec3,
      lightTint: [1.05, 1.03, 0.96] as Vec3,
    };
    const model = mat4();
    const shot = (make: () => { ch: ReturnType<typeof makeDayo>; kind: HeroId | 'person' | 'bird' }, eye: Vec3, target: Vec3): string => {
      const { ch, kind } = make();
      const a = newActor(kind, ch, 0, 0, 0);
      a.t = 1;
      return r.portrait(160, () => {
        r.begin(eye, target, 0.6, env, 0);
        if (kind === 'bird') {
          poseBird(a, { hurt: 0, flap: 0, alert: 0 });
        } else {
          pose(a);
        }
        const bones = ch.rig.update();
        r.draw(ch.mesh, { model: placement(model, 0, 0, 0), bones });
      });
    };
    const face: Vec3 = [0.5, 1.5, 2.6];
    const faceAt: Vec3 = [0, 1.28, 0];
    this.portraits = {
      dayo: shot(() => ({ ch: makeDayo(r), kind: 'dayo' }), [0.6, 1.7, 3], [0, 1.34, 0]),
      baging: shot(() => ({ ch: makeBaging(r), kind: 'baging' }), [0.45, 1.05, 2.6], [0, 0.72, 0]),
      sukat: shot(() => ({ ch: makeSukat(r), kind: 'sukat' }), [0.45, 1, 2.5], [0, 0.72, 0]),
      awit: shot(() => ({ ch: makeAwit(r), kind: 'awit' }), face, faceAt),
      ranger: shot(() => ({ ch: makeRanger(r), kind: 'person' }), face, faceAt),
      vet: shot(() => ({ ch: makeVet(r), kind: 'person' }), face, faceAt),
      joy: shot(() => ({ ch: makeResident(r, '#ef6c8f', '#3a4a7a'), kind: 'person' }), face, faceAt),
      ernesto: shot(() => ({ ch: makeResident(r, '#f0a24a', '#4a5a3a', '#a06a42'), kind: 'person' }), face, faceAt),
      hornbill: shot(() => ({ ch: makeHornbill(r), kind: 'bird' }), [2.3, 1.05, 1.9], [0, 0.68, 0.18]),
      paz: shot(() => ({ ch: makeOfficer(r), kind: 'person' }), face, faceAt),
      bautista: shot(() => ({ ch: makeSpecialist(r), kind: 'person' }), face, faceAt),
      ramos: shot(() => ({ ch: makeChief(r), kind: 'person' }), face, faceAt),
      driver: shot(() => ({ ch: makeDriver(r, '#e2452f'), kind: 'person' }), face, faceAt),
      ben: shot(() => ({ ch: makeDriver(r, '#ffc32d'), kind: 'person' }), face, faceAt),
      tech: shot(() => ({ ch: makeDriver(r, '#14995c'), kind: 'person' }), face, faceAt),
      staff: shot(() => ({ ch: makeResident(r, '#1e5bb8', '#33405a', '#8d5a3b'), kind: 'person' }), face, faceAt),
    };
  }

  /** Navie as the app draws it, for speech bubbles: the same images, only resized. */
  private navieArt(): void {
    for (const [mood, art] of Object.entries(NAVIE_ART)) {
      this.portraits[navieKey(mood as keyof typeof NAVIE_ART)] = art.uri;
    }
  }

  /* ---- Pictures in the world ---- */

  private textCanvas(text: string, w: number, h: number, bg: string, fg: string, sizeK = 0.56): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d') as CanvasRenderingContext2D;
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.fillStyle = fg;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    let size = Math.round(h * sizeK);
    x.font = `900 ${size}px "Nunito Black", ui-rounded, system-ui, sans-serif`;
    while (x.measureText(text).width > w * 0.92 && size > 8) {
      size -= 2;
      x.font = `900 ${size}px "Nunito Black", ui-rounded, system-ui, sans-serif`;
    }
    x.fillText(text, w / 2, h / 2 + size * 0.06);
    return c;
  }

  private makeTextures(): void {
    const r = this.renderer as Renderer;
    const t = this.game.textures;
    const signs = (): void => {
      const sign = (key: string, text: string, w: number, h: number, bg: string, fg = '#ffffff', k = 0.56): void => {
        const canvas = this.textCanvas(text, w, h, bg, fg, k);
        if (t[key] === undefined) {
          t[key] = r.texture(canvas);
        } else {
          r.setSource(t[key], canvas);
        }
      };
      sign('plazaSign', 'TOLL PLAZA', 1000, 100, '#1e5bb8');
      sign('binBio', 'BIODEGRADABLE', 450, 100, '#3f9b4a');
      sign('binRecycle', 'RECYCLABLE', 450, 100, '#2b6fd6');
      sign('binResidual', 'RESIDUAL', 450, 100, '#6b7488');
      sign('hallSign', 'BARANGAY HALL', 860, 100, '#1e5bb8');
      sign('depotSign', 'MAINTENANCE DEPOT', 933, 100, '#ffc32d', '#17233f');
      sign('officeSign', 'OFFICE', 890, 100, '#1e5bb8');
      sign('yardSign', 'BALINTAWAK SUPPLY YARD', 1000, 100, '#2fae6b');
      sign('yardOffice', 'YARD OFFICE', 890, 100, '#1e5bb8');
      sign('centerSign', 'SmartFlow NLEX Eco Command Center', 980, 120, '#0f2a5c', '#ffffff', 0.5);
      this.paintLiveScreens();
    };
    signs();
    /* Signs are drawn again once the game's font has loaded. */
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    void fonts?.ready.then(() => signs());
    const img = new Image();
    img.onload = (): void => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 390;
      const x = c.getContext('2d') as CanvasRenderingContext2D;
      const g = x.createLinearGradient(0, 0, 0, 390);
      g.addColorStop(0, '#bfe7ff');
      g.addColorStop(1, '#e8f6ff');
      x.fillStyle = g;
      x.fillRect(0, 0, 512, 390);
      const k = Math.min(300 / img.height, 400 / img.width);
      x.drawImage(img, 256 - (img.width * k) / 2, 18, img.width * k, img.height * k);
      x.fillStyle = '#0f2a5c';
      x.fillRect(0, 330, 512, 60);
      x.fillStyle = '#ffffff';
      x.textAlign = 'center';
      x.font = '900 30px "Nunito Black", ui-rounded, system-ui, sans-serif';
      x.fillText('Navie’s Mission Station', 256, 370);
      t.navieScreen = t.navieScreen ?? r.texture(null);
      r.setSource(t.navieScreen, c);
    };
    img.src = NAVIE_ART.hello.uri;
  }

  /** The Operations Board and progress screens in the hub, drawn from the save. */
  private paintLiveScreens(): void {
    const r = this.renderer;
    if (r === null || this.game === undefined) {
      return;
    }
    const W = 640;
    const H = 352;
    const ops = document.createElement('canvas');
    ops.width = W;
    ops.height = H;
    const x = ops.getContext('2d') as CanvasRenderingContext2D;
    x.fillStyle = '#0f2a5c';
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#ffc32d';
    x.font = '900 34px "Nunito Black", ui-rounded, system-ui, sans-serif';
    x.textAlign = 'center';
    x.fillText('NLEX OPERATIONS', W / 2, 52);
    x.strokeStyle = '#9fb7e0';
    x.lineWidth = 10;
    x.beginPath();
    x.moveTo(70, 190);
    x.lineTo(W - 70, 190);
    x.stroke();
    NLEX_STOPS.forEach((stop, i) => {
      const cx = 70 + (i * (W - 140)) / (NLEX_STOPS.length - 1);
      const def = stop.missionId === null ? null : missionById(stop.missionId);
      const done = def !== null && this.save.missions[def.id] !== undefined;
      const open = def !== null && missionOpen(this.save, def.id);
      x.fillStyle = done ? '#2fae6b' : open ? '#ffc32d' : stop.id === 'balintawak' ? '#7fd0ff' : '#5b6f94';
      x.beginPath();
      x.arc(cx, 190, 22, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#ffffff';
      x.font = '800 21px ui-rounded, system-ui, sans-serif';
      x.save();
      x.translate(cx, i % 2 === 0 ? 248 : 140);
      x.fillText(stop.name, 0, 0);
      x.restore();
    });
    x.fillStyle = '#c9d8f2';
    x.font = '700 20px ui-rounded, system-ui, sans-serif';
    x.fillText('Green: done   Yellow: open   Blue: briefing', W / 2, 322);
    const prog = document.createElement('canvas');
    prog.width = W;
    prog.height = H;
    const y = prog.getContext('2d') as CanvasRenderingContext2D;
    const p = progress(this.save, UPGRADES.filter((u) => u.unlockedBy !== undefined).map((u) => u.id));
    y.fillStyle = '#0f3d2c';
    y.fillRect(0, 0, W, H);
    y.fillStyle = '#7fe3b4';
    y.textAlign = 'center';
    y.font = '900 30px "Nunito Black", ui-rounded, system-ui, sans-serif';
    y.fillText('ENVIRONMENTAL PROGRESS', W / 2, 50);
    const tiles: [string, string][] = [
      [`${p.savedKg >= 100 ? p.savedKg.toFixed(0) : p.savedKg.toFixed(1)} kg`, 'CO2 less (simulated)'],
      [`${p.nlexDone}/${p.nlexTotal}`, 'NLEX missions'],
      [String(p.animals), 'animals helped'],
    ];
    tiles.forEach(([v, label], i) => {
      const cx = 110 + i * 210;
      y.fillStyle = '#ffffff';
      y.font = '900 46px "Nunito Black", ui-rounded, system-ui, sans-serif';
      y.fillText(v, cx, 175);
      y.fillStyle = '#bfead6';
      y.font = '700 20px ui-rounded, system-ui, sans-serif';
      y.fillText(label, cx, 215);
    });
    y.fillStyle = '#bfead6';
    y.font = '700 18px ui-rounded, system-ui, sans-serif';
    y.fillText('Separate measures: none converts into another', W / 2, 310);
    const t = this.game.textures;
    if (this.liveTextures.ops === null) {
      this.liveTextures.ops = r.texture(ops);
      this.liveTextures.progress = r.texture(prog);
      t.opsScreen = this.liveTextures.ops;
      t.progressScreen = this.liveTextures.progress as Texture;
    } else {
      r.setSource(this.liveTextures.ops, ops);
      r.setSource(this.liveTextures.progress as Texture, prog);
    }
  }

  /* ---- The frame ---- */

  private frame = (now: number): void => {
    if (this.disposed) {
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
    const raw = now - this.last;
    const dt = Math.min(0.05, Math.max(0, raw / 1000));
    this.last = now;
    this.watchFrameRate(raw);
    this.tick(dt);
  };

  /** Frame times, so a phone that struggles gets the lighter graphics without having to ask. */
  private readonly frameTimes = { sum: 0, count: 0, worst: 0 };
  /** Set by tests and the debug build: leave the graphics as they are. */
  autoGraphics = true;

  watchFrameRate(ms: number): void {
    /* A long gap is the app coming back from the background, not a slow frame. */
    if (ms <= 0 || ms > 500 || document.hidden) {
      return;
    }
    const f = this.frameTimes;
    f.sum += ms;
    f.count += 1;
    f.worst = Math.max(f.worst, ms);
    if (f.count < 120) {
      return;
    }
    const average = f.sum / f.count;
    f.sum = 0;
    f.count = 0;
    f.worst = 0;
    if (average > 38 && this.autoGraphics && this.save.settings.graphics === 'detailed') {
      this.changeSettings({ graphics: 'smooth' });
      if (this.inWorld) {
        this.hud.notice('Switched to smoother graphics. You can change this in Settings.');
      }
      this.host.send({ type: 'log', level: 'info', message: `graphics lowered, average frame ${average.toFixed(1)} ms` });
    }
  }

  /** One step of everything. Frames call this; tests can too. */
  tick(dt: number): void {
    const r = this.renderer as Renderer;
    if (r.lost) {
      return;
    }
    if (this.autoplay) {
      this.autoDrive();
    }
    const paused = this.overlayRoot.childElementCount > 0 && !this.titleOrbit;
    this.game.paused = paused;
    if (this.waits.length > 0 && !paused) {
      for (let i = this.waits.length - 1; i >= 0; i -= 1) {
        this.waits[i].left -= dt;
        if (this.waits[i].left <= 0) {
          this.waits.splice(i, 1)[0].done();
        }
      }
    }
    this.worldTime += dt;
    this.game.showBeacon = this.save.settings.guide || this.worldTime < this.hintShowUntil;
    if (this.autoSolve && this.activePuzzle !== null) {
      const p = this.activePuzzle;
      this.activePuzzle = null;
      window.setTimeout(() => p.solve(), 300);
    }
    this.game.update(dt);
    if (this.titleOrbit) {
      this.orbit += this.save.settings.reduceMotion ? 0 : dt * 0.08;
      const d = 26;
      this.game.cameraTo([Math.sin(this.orbit) * d, 12, Math.cos(this.orbit) * d], [0, 2.5, 0], 2);
    } else if (this.inWorld && !paused) {
      this.script?.tick(dt);
      this.hub?.tick(dt);
      this.hud.tick(dt);
      this.updateHud();
    }
    this.game.draw();
  }

  private updateHud(): void {
    const g = this.game;
    const near = g.nearby();
    let label: string | null = null;
    let suggest = false;
    let progress = 0;
    if (near !== null) {
      if (near.action !== null) {
        label = near.action.label;
        progress = near.action.hold > 0 && g.holding === near.it ? g.heldFor / near.action.hold : 0;
      } else {
        const who = near.it.suggest ?? (Object.keys(near.it.by)[0] as HeroId);
        label = `Switch to ${who.charAt(0).toUpperCase()}${who.slice(1)}`;
        suggest = true;
      }
    }
    this.hud.setAction(g.busy ? null : label, progress, suggest);
    this.hud.setAbility(g.active === 'awit' && !g.busy, g.glideShare);
    this.hud.setActive(g.active);
    const guide = g.guideNow;
    if (guide !== null && g.showBeacon) {
      const h2 = g.heroes[g.active];
      const dx = guide[0] - h2.x;
      const dz = guide[1] - h2.z;
      const d = Math.hypot(dx, dz);
      const angle = g.cameraYaw - Math.atan2(dx, dz);
      this.hud.setGuide(d > 3 ? angle : null, d);
      this.hud.setGo(d > 24 && !g.busy && g.guide !== null && guide[0] === g.guide[0] && guide[1] === g.guide[1]);
    } else {
      this.hud.setGuide(null, 0);
      this.hud.setGo(false);
    }
    if (this.run !== null) {
      const step = currentStep(this.mission, this.run);
      const run = this.run;
      /* A step with several parts says how many are done. */
      const count = step !== null && step.needs.length > 2 ? ` (${step.needs.filter((n) => run.flags.includes(n)).length}/${step.needs.length})` : '';
      this.hud.setObjective(step !== null ? `${OBJECTIVES[step.objective]}${count}` : '');
    } else {
      const open = MISSIONS.some((m) => m.kind === 'nlex' && missionOpen(this.save, m.id) && this.save.missions[m.id] === undefined);
      this.hud.setObjective(open ? 'Talk to Navie for your next mission' : 'SmartFlow NLEX Eco Command Center');
    }
  }

  /** Navie's hint for what to do now, and the guide shown for a while. */
  private hint(): void {
    const g = this.game;
    if (g.busy || this.hud.speaking) {
      return;
    }
    this.audio.play('tap');
    const step = this.run === null ? null : currentStep(this.mission, this.run);
    const text = step === null ? (this.save.sideQuests.length < 4 ? 'Talk to me for missions. The notice board has small jobs around the Command Center too.' : 'Talk to me for missions, any time.') : HINTS[step.objective] ?? 'Follow the arrow. If someone else is needed, the button says who.';
    this.hintShowUntil = this.worldTime + 12;
    g.busy = true;
    void this.hud.say('Navie', navieKey('thinking'), text).then(() => {
      g.busy = false;
      this.hud.setHudHidden(false);
    });
  }

  /** The Go button: a quick fade most of the way to a far objective, so nobody has to trek. */
  private goNear(): void {
    const g = this.game;
    const goal = g.guideNow;
    if (goal === null || g.busy) {
      return;
    }
    const h0 = g.heroes[g.active];
    const d = Math.hypot(goal[0] - h0.x, goal[1] - h0.z);
    const k = Math.max(0, (d - 4.5) / d);
    const x = h0.x + (goal[0] - h0.x) * k;
    const z = h0.z + (goal[1] - h0.z) * k;
    this.audio.play('whoosh');
    void this.fade(() => g.placeTeam(x, z, Math.atan2(goal[0] - x, goal[1] - z)), 0.3);
  }

  /** A tap on "Switch to Sukat" does the switch, so nobody has to hunt for the right hero. */
  private onActionPressed(): void {
    const near = this.game.nearby();
    if (near !== null && near.action === null) {
      this.input.state.actionHeld = false;
      this.game.switchHero(near.it.suggest ?? (Object.keys(near.it.by)[0] as HeroId));
    }
  }

  /* ---- Menus ---- */

  showTitle(): void {
    this.inWorld = false;
    this.titleOrbit = true;
    this.game.busy = true;
    this.audio.setRegion('station');
    const played = Object.keys(this.save.missions).length > 0;
    const canContinue = this.save.active !== null;
    this.showScreen(
      titleScreen({
        canContinue,
        played,
        saveWarning: this.saveFailed,
        onPlay: this.tapped(() => this.showTeam(() => this.enterHub())),
        onContinue: this.tapped(() => this.continueMission()),
        onHub: this.tapped(() => this.enterHub()),
        onAtlas: this.tapped(() => this.showAtlas(() => this.showTitle())),
        onMap: this.tapped(() => this.showMap(() => this.showTitle())),
        onSettings: this.tapped(() => this.showSettings(() => this.showTitle())),
        onExit: this.tapped(() => this.host.send({ type: 'exit' })),
      }),
      null,
    );
  }

  private showTeam(next: () => void): void {
    this.titleOrbit = false;
    this.game.busy = true;
    const render = (): void => {
      this.showScreen(
        teamScreen(
          this.portraits,
          this.save.settings.lead,
          (id) => {
            this.audio.play('switch');
            this.changeSettings({ lead: id });
            render();
          },
          this.tapped(next),
          this.tapped(() => this.showTitle()),
        ),
        () => this.showTitle(),
      );
    };
    render();
  }

  private showBriefing(def: MissionDef, back: () => void): void {
    this.showScreen(missionBriefing(def, NAVIE_ART.hello.uri, this.tapped(() => this.startMission(def)), this.tapped(back)), back);
  }

  private showOpsBoard(back: () => void): void {
    const render = (): void =>
      this.showScreen(
        opsBoardScreen({
          save: this.save,
          navie: NAVIE_ART.hello.uri,
          onMission: (def) => {
            this.audio.play('tap');
            this.showBriefing(def, render);
          },
          onBriefing: this.tapped(() => this.navieBriefing()),
          onBack: this.tapped(back),
        }),
        back,
      );
    render();
  }

  private showProgress(back: () => void): void {
    this.showScreen(progressDashboard({ save: this.save, ecoUpgrades: UPGRADES.filter((u) => u.unlockedBy !== undefined).map((u) => u.id), onBack: this.tapped(back) }), back);
  }

  /** Balintawak, the start of the line: what the Command Center is for. */
  private navieBriefing(): void {
    this.showScreen(null, null);
    if (!this.inWorld) {
      return;
    }
    const g = this.game;
    g.busy = true;
    this.hud.setHudHidden(true);
    const [x, z] = g.zone.spots.navie;
    g.cameraTo([x + Math.sin(2.6) * 6.5, 3.4, z + Math.cos(2.6) * 6.5], [x, 2.9, z], 5);
    void (async () => {
      await this.hud.say('Navie', navieKey('hello'), NLEX_LINES.welcome1);
      await this.hud.say('Navie', navieKey('traffic'), NLEX_LINES.welcome2);
      await this.hud.say('Navie', navieKey('clear'), NLEX_LINES.welcome3);
      g.releaseCamera();
      g.busy = false;
      this.hud.setHudHidden(false);
      if (!this.save.coachSeen.includes('welcome-center')) {
        this.persist({ ...this.save, coachSeen: [...this.save.coachSeen, 'welcome-center'] });
      }
    })();
  }

  private showSettings(back: () => void): void {
    const render = (): void => {
      this.showScreen(
        settingsScreen({
          save: this.save,
          onChange: (c) => {
            this.audio.play('tap');
            this.changeSettings(c);
            render();
          },
          onBack: this.tapped(back),
        }),
        back,
      );
    };
    render();
  }

  private portraitFor = (id: string): string | null => (id === 'sp-009' ? this.portraits.hornbill : null);

  private showAtlas(back: () => void): void {
    const render = (): void => {
      this.showScreen(
        atlasScreen({
          save: this.save,
          chapter: this.atlasChapter,
          portrait: this.portraitFor,
          onChapter: (n) => {
            this.audio.play('tap');
            this.atlasChapter = n;
            render();
          },
          onSpecies: (s) => this.showSpecies(s, render),
          onNotes: this.tapped(() => this.showScreen(notesScreen(this.tapped(render)), render)),
          onBack: this.tapped(back),
        }),
        back,
      );
    };
    render();
  }

  private showSpecies(s: SpeciesRecord, back: () => void): void {
    this.audio.play('tap');
    this.showScreen(
      speciesDetail(s, {
        save: this.save,
        portrait: this.portraitFor(s.id),
        onBack: this.tapped(back),
        onNickname: (id, name) => this.persist({ ...this.save, nicknames: { ...this.save.nicknames, [id]: name } }),
      }),
      back,
    );
  }

  private showMap(back: () => void): void {
    this.showScreen(
      mapScreen({
        save: this.save,
        onChapter1: this.tapped(() => {
          this.atlasChapter = 1;
          this.showAtlas(() => this.showMap(back));
        }),
        onBack: this.tapped(back),
      }),
      back,
    );
  }

  private openAtlasFromWorld(): void {
    this.audio.play('tap');
    this.showAtlas(() => this.showScreen(null, null));
  }

  private showPause(): void {
    if (this.overlayRoot.childElementCount > 0 || !this.inWorld) {
      return;
    }
    this.input.release();
    this.audio.suspend();
    const resume = (): void => {
      this.audio.unlock();
      this.showScreen(null, null);
    };
    const inMission = this.run !== null;
    const el = h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'sheet small' },
        h('h2', { text: 'Paused' }),
        h('p', { class: 'muted', text: inMission ? 'Your mission is saved as you left it.' : 'Eco Command Center' }),
        button('Keep going', resume, { iconName: 'play' }),
        button('Settings', this.tapped(() => this.showSettings(() => this.showPauseAgain())), { class: 'secondary', iconName: 'gear' }),
        button('Back to the title', this.tapped(() => this.leaveWorld()), { class: 'secondary', iconName: 'back' }),
      ),
    );
    this.showScreen(el, resume);
  }

  private showPauseAgain(): void {
    this.showScreen(null, null);
    this.showPause();
  }

  private leaveWorld(): void {
    this.inWorld = false;
    this.script = null;
    this.hub = null;
    this.run = this.save.active;
    this.game.carrying = [];
    this.game.interactions = [];
    this.game.guide = null;
    this.game.loadZone('station', this.save.upgrades);
    this.game.placeTeam(0, 4, 0.8);
    this.showTitle();
  }

  /* ---- A mission ---- */

  private context(): MissionContext {
    return {
      game: this.game,
      hud: this.hud,
      run: () => this.run as MissionRun,
      flag: (name) => this.flag(name),
      openBoard: () => this.openBoard(),
      flutePuzzle: () => this.flutePuzzle(),
      lanePuzzle: (plaza) =>
        new Promise((resolve) => {
          this.game.busy = true;
          const done = (m: Parameters<Parameters<typeof lanePuzzle>[0]['onDone']>[0]): void => {
            this.game.busy = false;
            this.showScreen(null, null);
            resolve(m);
          };
          this.showScreen(
            lanePuzzle({ plaza: plaza ?? BOCAUE_PLAZA, initial: lanesFromFlags((this.run as MissionRun).flags) ?? BOCAUE_PLAZA.jammed, navie: NAVIE_ART.thinking.uri, reduce: this.save.settings.reduceMotion, onDone: done, onHow: (r) => this.overlay(plazaHow(r, () => this.overlay(null))) }),
            () => done(null),
          );
        }),
      energyPlanner: () =>
        new Promise((resolve) => {
          this.game.busy = true;
          const done = (p: Parameters<Parameters<typeof energyPlanner>[0]['onDone']>[0]): void => {
            this.game.busy = false;
            this.showScreen(null, null);
            resolve(p);
          };
          this.showScreen(energyPlanner({ navie: NAVIE_ART.thinking.uri, locked: ['solar'], onDone: done, onHow: (picks) => this.overlay(depotHow(picks, () => this.overlay(null))) }), () => done(null));
        }),
      circuit: (id, kicker, hint, theme = 'power') => this.puzzle((done) => circuitPuzzle({ level: CIRCUITS[id], kicker, theme, navie: NAVIE_ART.thinking.uri, hint, reduce: this.save.settings.reduceMotion, onDone: done })),
      dials: (id, kicker, names, hint) => this.puzzle((done) => dialPuzzle({ level: DIALS[id], kicker, names, navie: NAVIE_ART.thinking.uri, hint, onDone: done })),
      loadVan: (id, hint) => this.puzzle((done) => loadPuzzle({ level: LOADS[id], navie: NAVIE_ART.thinking.uri, hint, onDone: done })),
      collect: (id) => {
        const r = collect(this.save, id);
        if (r.added) {
          this.progressed(r.save);
          const c = COLLECTIBLES.find((x) => x.id === id);
          this.hud.notice(`Guardian patch: ${c?.label ?? 'found'}! ${this.save.collectibles.length} of ${COLLECTIBLES.length}. +5 points`, 3);
        }
        return r.added;
      },
      discover: (id) => {
        const r = discover(this.save, id);
        if (r.added) {
          this.progressed(r.save);
          this.hud.notice(`Field note added: ${DISCOVERIES.find((d) => d.id === id)?.name ?? ''}. +5 points`, 3);
        }
        return r.added;
      },
      hasCollected: (id) => this.save.collectibles.includes(id),
      hasDiscovered: (id) => this.save.discoveries.includes(id),
      hasGear: (id) => this.save.gear.includes(id),
      wait: (s) => new Promise((resolve) => this.waits.push({ left: s, done: resolve })),
      fade: (fn, seconds = 0.6) => this.fade(fn, seconds),
      finish: () => this.finishMission(),
      reduceMotion: () => this.save.settings.reduceMotion,
      upgrades: () => this.save.upgrades,
    };
  }

  /** Opens a puzzle over the world and resolves with whether it was solved. */
  private puzzle(make: (done: (ok: boolean) => void) => PuzzleHandle): Promise<boolean> {
    return new Promise((resolve) => {
      const g = this.game;
      g.busy = true;
      const done = (ok: boolean): void => {
        this.activePuzzle = null;
        g.busy = false;
        this.showScreen(null, null);
        this.audio.play(ok ? 'done' : 'tap');
        resolve(ok);
      };
      const handle = make(done);
      this.activePuzzle = handle;
      this.showScreen(handle.el, () => done(false));
    });
  }

  /** Development: finish the puzzle on screen. */
  solvePuzzle(): boolean {
    const p = this.activePuzzle;
    if (p === null) {
      return false;
    }
    p.solve();
    return true;
  }

  /** Records a flag and saves it, so a resume finds the mission just as it was left. */
  private flag(name: string): void {
    const run = this.run as MissionRun;
    const next = setFlag(this.mission, run, name);
    const moved = next.step !== run.step;
    const changed = next.flags.length !== run.flags.length;
    this.run = next;
    if (moved) {
      this.audio.play('done');
    }
    /* The very end is saved by finishMission, all at once. */
    if (changed && !isFinished(this.mission, next)) {
      this.persist({ ...this.save, active: next });
    }
  }

  private fade(fn: () => void, seconds: number): Promise<void> {
    return new Promise((resolve) => {
      this.fadeEl.classList.add('on');
      window.setTimeout(() => {
        fn();
        this.game.snapCamera();
        window.setTimeout(() => {
          this.fadeEl.classList.remove('on');
          window.setTimeout(resolve, 280);
        }, seconds * 400);
      }, 300);
    });
  }

  private startMission(def: MissionDef): void {
    this.hub = null;
    this.mission = def;
    const runId = `${def.id}-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(16)}`;
    this.run = newRun(def.id, runId);
    this.comparison = null;
    this.persist({ ...this.save, active: this.run });
    this.enterMissionWorld(true);
  }

  private continueMission(): void {
    this.run = this.save.active;
    const def = this.run === null ? null : missionById(this.run.missionId);
    if (this.run === null || def === null) {
      this.showTitle();
      return;
    }
    this.mission = def;
    this.comparison = null;
    this.hub = null;
    this.enterMissionWorld(false);
  }

  private makeScript(def: MissionDef, ctx: MissionContext): MissionScript {
    switch (def.id) {
      case GRIDLOCK_MISSION.id:
        return new GridlockScript(ctx);
      case RIVER_MISSION.id:
        return new RiverScript(ctx);
      case ECO_MISSION.id:
        return new EcoScript(ctx);
      case DELIVERY_MISSION.id:
        return new DeliveryScript(ctx);
      default:
        return new HornbillScript(ctx);
    }
  }

  private enterMissionWorld(fresh: boolean): void {
    this.titleOrbit = false;
    this.inWorld = true;
    this.game.releaseCamera();
    this.game.busy = false;
    this.game.active = this.save.settings.lead as HeroId;
    this.game.carrying = [];
    const script = this.makeScript(this.mission, this.context());
    this.script = script;
    void this.fade(() => {
      this.showScreen(null, null);
      script.enter();
    }, 0.6).then(() => {
      if (fresh) {
        void script.opening();
      }
    });
  }

  private openBoard(): Promise<void> {
    return new Promise((resolve) => {
      this.game.busy = true;
      const close = (): void => {
        this.game.busy = false;
        this.showScreen(null, null);
      };
      this.showScreen(
        transportBoard(
          missionTransport(this.mission, this.run as MissionRun) ?? HORNBILL_MISSION.transport as NonNullable<typeof HORNBILL_MISSION.transport>,
          (this.run as MissionRun).plan,
          (plan, c) => {
            this.audio.play('ok');
            this.dispatch(plan, c).then(resolve).catch(() => resolve());
          },
          (el) => this.overlay(el),
        ),
        () => {
          close();
          resolve();
        },
      );
    });
  }

  private dispatch(plan: Plan, c: Comparison): Promise<void> {
    return new Promise((resolve) => {
      this.comparison = c;
      this.run = { ...(this.run as MissionRun), plan };
      this.showScreen(
        dispatchOverlay(
          c,
          () => {
            this.flag('planChosen');
            void this.fade(() => {
              this.showScreen(null, null);
              this.game.busy = false;
              this.game.releaseCamera();
              this.script?.afterDispatch();
            }, 0.6).then(resolve);
          },
          this.save.settings.reduceMotion,
        ),
        null,
      );
    });
  }

  private flutePuzzle(): Promise<boolean> {
    return new Promise((resolve) => {
      const song = [0, 2, 1];
      let at = 0;
      const notes: HTMLButtonElement[] = [];
      const text = h('div', { class: 'flute-text', text: 'Listen, then play the same three notes.' });
      const finish = (ok: boolean): void => {
        wrap.remove();
        this.game.busy = false;
        resolve(ok);
      };
      const lightUp = (i: number): void => {
        notes[i].classList.add('lit');
        this.audio.play((['note1', 'note2', 'note3'] as const)[i]);
        window.setTimeout(() => notes[i].classList.remove('lit'), 320);
      };
      const replay = (): void => {
        at = 0;
        song.forEach((n, i) => window.setTimeout(() => lightUp(n), 500 * i + 200));
      };
      const row = h('div', { class: 'flute-row' });
      ['1', '2', '3'].forEach((label, i) => {
        const b = h('button', {
          class: `flute-note n${i + 1}`,
          text: label,
          label: `Note ${label}`,
          attrs: { type: 'button' },
          onClick: () => {
            lightUp(i);
            if (song[at] === i) {
              at += 1;
              if (at === song.length) {
                text.textContent = 'That opens it!';
                window.setTimeout(() => finish(true), 500);
              }
            } else {
              text.textContent = 'Not quite. Listen again.';
              this.audio.play('deny');
              window.setTimeout(replay, 500);
            }
          },
        });
        notes.push(b);
        row.append(b);
      });
      const wrap = h('div', { class: 'flute' }, text, row, h('button', { class: 'text-btn', text: 'Leave it for now', attrs: { type: 'button' }, onClick: () => finish(false) }));
      this.game.busy = true;
      this.game.heroes.awit.pose = 'flute';
      this.hud.el.append(wrap);
      wrap.style.pointerEvents = 'auto';
      replay();
    });
  }

  /** Each simulated comparison in a mission, worked out again from the run: deterministic. */
  private outcomeParts(def: MissionDef, run: MissionRun): (SimPart & { lines: string[]; c?: Comparison })[] {
    const parts: (SimPart & { lines: string[]; c?: Comparison })[] = [];
    const h1 = (v: number): string => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
    if (def.id === GRIDLOCK_MISSION.id) {
      const jam = simulatePlaza(BOCAUE_PLAZA, BOCAUE_PLAZA.jammed);
      const mine = simulatePlaza(plazaFor(run.flags), lanesFromFlags(run.flags) ?? BOCAUE_PLAZA.jammed);
      parts.push({
        id: 'plaza',
        label: 'The toll plaza, one hour',
        baselineKg: jam.co2Kg,
        planKg: mine.co2Kg,
        lines: [`Stopped with engines on: ${h1(mine.carHours + mine.truckHours)} hours instead of ${h1(jam.carHours + jam.truckHours)}.`, `Still queuing at the end of the hour: ${mine.leftWaiting} instead of ${jam.leftWaiting}.`, 'Baseline: the plaza as the Wasteworks left it, with the same traffic.'],
      });
    }
    if (def.id === ECO_MISSION.id) {
      const before = facilityDay(DEPOT_BEFORE);
      const after = facilityDay({ repairs: ['sensor', 'leak', 'idling'], upgrades: chosenUpgrades(run) });
      parts.push({
        id: 'depot',
        label: 'The depot, one ordinary day',
        baselineKg: before.co2Kg,
        planKg: after.co2Kg,
        lines: [`Grid electricity: ${h1(after.gridKWh)} kWh instead of ${h1(before.gridKWh)}.`, `Diesel burned idling: ${h1(after.idleL)} L instead of ${h1(before.idleL)}.`, ...(after.solarKWh > 0 ? [`Made on the roof: ${h1(after.solarKWh)} kWh.`] : []), 'Baseline: the depot as the Wasteworks left it.'],
      });
    }
    const problem = missionTransport(def, run);
    if (problem !== null && run.plan !== null) {
      const c = comparePlan(problem, run.plan);
      parts.push({ id: 'transport', label: def.kind === 'wildlife' ? 'The transport' : def.id === ECO_MISSION.id ? 'The delivery run' : def.id === DELIVERY_MISSION.id ? 'The run to the ridge' : 'The collection run', baselineKg: c.baseline.co2Kg, planKg: c.player.co2Kg, lines: c.reasons, c });
    }
    return parts;
  }

  /** The atomic moment: animals, species, habitat, objectives and points are all written together, once. */
  private finishMission(): void {
    const def = this.mission;
    const run = this.run as MissionRun;
    const parts = this.outcomeParts(def, run);
    const baselineKg = parts.reduce((a, p) => a + p.baselineKg, 0);
    const planKg = parts.reduce((a, p) => a + p.planKg, 0);
    const choice = def.id === GRIDLOCK_MISSION.id ? (lanesFromFlags(run.flags) ?? []).join(',') : def.id === ECO_MISSION.id ? chosenUpgrades(run).join(',') : null;
    const { save, report } = completeMission(this.save, def, run, { baselineKg, planKg, savings: savings(baselineKg, planKg), choice, parts: parts.map(({ id, label, baselineKg: b, planKg: p }) => ({ id, label, baselineKg: b, planKg: p })) });
    const awarded = awardAchievements(save);
    this.persist(awarded.save);
    const newTitles = awarded.ids.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.title).filter((t): t is string => t !== undefined);
    this.audio.play('star');
    const transport = parts.find((p) => p.id === 'transport');
    if (def.kind === 'wildlife' && transport?.c !== undefined) {
      const c = transport.c;
      this.comparison = c;
      const individual = def.storyIndividuals[0];
      this.showScreen(
        resultsScreen({
          def,
          c,
          report,
          run,
          individualName: this.save.nicknames[individual.id] ?? individual.defaultNickname,
          portrait: this.portraits.hornbill,
          onHow: this.tapped(() => this.overlay(howCalculated(missionTransport(def, run) ?? HORNBILL_MISSION.transport as NonNullable<typeof HORNBILL_MISSION.transport>, c, () => this.overlay(null)))),
          onNickname: (name) => this.persist({ ...this.save, nicknames: { ...this.save.nicknames, [individual.id]: name || individual.defaultNickname } }),
          onNext: this.tapped(() => this.playNextSeason(() => this.showRecap())),
        }),
        null,
      );
      return;
    }
    this.showScreen(
      nlexResults({
        def,
        report,
        parts,
        navie: NAVIE_ART.clear.uri,
        onHow: (id) => {
          this.audio.play('tap');
          const close = (): void => this.overlay(null);
          if (id === 'plaza') {
            this.overlay(plazaHow(simulatePlaza(plazaFor(run.flags), lanesFromFlags(run.flags) ?? BOCAUE_PLAZA.jammed), close));
          } else if (id === 'depot') {
            this.overlay(depotHow(chosenUpgrades(run), close));
          } else {
            const part = parts.find((p) => p.id === id);
            const problem = missionTransport(def, run);
            if (part?.c !== undefined && problem !== null) {
              this.overlay(howCalculated(problem, part.c, close));
            }
          }
        },
        achievements: newTitles,
        next: def.id === DELIVERY_MISSION.id && this.save.missions[HORNBILL_MISSION.id] === undefined ? 'To Malaya Ridge' : null,
        onNext: this.tapped(() => {
          /* The supplies went to the ridge: the hornbill expedition is next, if it has not been done. */
          if (def.id === DELIVERY_MISSION.id && this.save.missions[HORNBILL_MISSION.id] === undefined && this.save.active === null) {
            this.startMission(HORNBILL_MISSION);
          } else {
            this.enterHub();
          }
        }),
      }),
      null,
    );
  }

  private playNextSeason(after: () => void): void {
    this.inWorld = true;
    /* The next-season scene belongs to the hornbill mission. */
    const script = this.script instanceof HornbillScript ? this.script : new HornbillScript(this.context());
    this.script = script;
    const ctx: MissionContext = this.context();
    void this.fade(() => {
      this.showScreen(null, null);
    }, 0.1).then(async () => {
      this.mission = HORNBILL_MISSION;
      this.run = this.run ?? newRun(HORNBILL_MISSION.id, 'season');
      await nextSeason(ctx, script);
      after();
    });
  }

  private showRecap(): void {
    const render = (): void => {
      this.showScreen(
        recapScreen({
          save: this.save,
          onBadge: (id) => {
            this.audio.play('ok');
            if (!this.save.badges.includes(id)) {
              this.persist({ ...this.save, badges: [...this.save.badges, id] });
            }
            render();
          },
          onHub: this.tapped(() => this.enterHub()),
          onAtlas: this.tapped(() => this.showAtlas(render)),
        }),
        null,
      );
    };
    render();
  }

  /* ---- The hub ---- */

  enterHub(): void {
    this.titleOrbit = false;
    this.inWorld = true;
    /* The old mission's props ask its run what to show: drop them before the run goes. */
    this.game.worldProps = [];
    this.game.interactions = [];
    this.game.guide = null;
    this.run = null;
    this.script = null;
    this.hub = null;
    this.game.releaseCamera();
    const g = this.game;
    g.busy = false;
    void this.fade(() => {
      this.showScreen(null, null);
      const back = (): void => this.showScreen(null, null);
      const hub = new HubScript(this.context(), {
        save: () => this.save,
        sideStep: (flag) => this.sideQuestStep(flag),
        open: (place: HubPlace) => {
          const go: Record<HubPlace, () => void> = {
            navie: () => this.talkToNavie(),
            ops: () => this.showOpsBoard(back),
            progress: () => this.showProgress(back),
            board: () => this.showGallery(back),
            atlas: () => this.showAtlas(back),
            workshop: () => this.showUpgrades(back),
            gallery: () => this.showGallery(back),
            map: () => this.showMap(back),
            feed: () => this.watchFeed(),
            notice: () => this.showNotice(back),
          };
          go[place]();
        },
      });
      this.hub = hub;
      hub.enter();
    }, 0.6).then(() => {
      if (!this.save.coachSeen.includes('welcome-center')) {
        this.navieBriefing();
      }
    });
  }

  /** Navie's menu: missions, a hint, the quiz, and recent achievements. */
  private talkToNavie(): void {
    const back = (): void => this.showScreen(null, null);
    const open = MISSIONS.some((m) => m.kind === 'nlex' && missionOpen(this.save, m.id) && this.save.missions[m.id] === undefined);
    const render = (): void =>
      this.showScreen(
        navieMenu({
          save: this.save,
          navie: NAVIE_ART[open ? 'hello' : 'clear'].uri,
          line: open ? NLEX_LINES.idle : NLEX_LINES.noMission,
          onMissions: this.tapped(() => this.showOpsBoard(render)),
          onSide: this.save.sideQuests.length < 4 ? this.tapped(() => this.showNotice(render)) : null,
          onQuiz: this.tapped(() => this.showQuiz(render)),
          onBriefing: this.tapped(() => this.navieBriefing()),
          onBack: this.tapped(back),
        }),
        back,
      );
    render();
  }

  /** A side quest step: saved, its points once, and a word when the quest is done. */
  private sideQuestStep(flag: string): void {
    const r = sideStep(this.save, flag);
    this.progressed(r.save);
    if (r.completed !== null) {
      this.audio.play('star');
      this.game.celebrate(1.6);
      this.hud.notice(`Side quest done: ${r.completed.title}! +${r.completed.points} points`, 3.4);
    }
  }

  private showNotice(back: () => void): void {
    const render = (): void => this.showScreen(noticeBoard({ save: this.save, onQuiz: this.tapped(() => this.showQuiz(render)), onBack: this.tapped(back) }), back);
    render();
  }

  private showQuiz(back: () => void): void {
    this.showScreen(
      quizScreen({
        navie: NAVIE_ART.thinking.uri,
        onRight: () => this.audio.play('ok'),
        onWrong: () => this.audio.play('deny'),
        onDone: this.tapped(() => {
          this.sideQuestStep('quiz:done');
          back();
        }),
        onBack: this.tapped(back),
      }),
      back,
    );
  }

  /** The Eco Workshop: gear that changes how the team plays, and Command Center improvements. */
  private showUpgrades(back: () => void): void {
    const render = (): void => {
      this.showScreen(
        workshopScreen({
          save: this.save,
          onGear: (id) => {
            const next = buyGear(this.save, id);
            if (next !== null) {
              this.progressed(next);
              this.applyGear();
              this.audio.play('done');
              this.hud.notice(`${GEAR.find((g) => g.id === id)?.title ?? 'Gear'}: ready to use.`);
            }
            render();
          },
          onUpgrade: (id) => {
            const next = buyUpgrade(this.save, id);
            if (next !== null) {
              this.persist(next);
              this.audio.play('done');
              this.hud.notice('Done! You will see it next time you arrive at the Command Center.');
            }
            render();
          },
          onBack: this.tapped(back),
        }),
        back,
      );
    };
    render();
  }

  private showGallery(back: () => void): void {
    this.showScreen(
      achievementGallery({
        save: this.save,
        defs: MISSIONS,
        onReplay: (def) => {
          this.audio.play('tap');
          this.showBriefing(def, () => this.showGallery(back));
        },
        onBack: this.tapped(back),
      }),
      back,
    );
  }

  private watchFeed(): void {
    this.hub = null;
    this.run = null;
    this.script = new HornbillScript(this.context2());
    this.playNextSeason(() => this.enterHub());
  }

  /** A context for scenes outside a mission. */
  private context2(): MissionContext {
    this.run = newRun(HORNBILL_MISSION.id, 'season');
    return this.context();
  }

  /* ---- Development: a player made of code, using the same controls ---- */

  private autoDrive(): void {
    const g = this.game;
    const hud = this.hud;
    if (hud.speaking) {
      this.autoSpeech += 1;
      if (this.autoSpeech >= this.autoSpeechFrames) {
        this.autoSpeech = 0;
        hud.advanceSpeech();
      }
      return;
    }
    if (!this.inWorld || g.busy || this.overlayRoot.childElementCount > 0) {
      return;
    }
    this.autoLook += 1;
    let near = g.nearby();
    /* Like a player with a goal: walk past things that are not where the arrow points. */
    const goal = g.guideNow;
    if (near !== null && goal !== null) {
      const h0 = g.heroes[g.active];
      if (Math.hypot(near.it.x - goal[0], near.it.z - goal[1]) > 1.2 && Math.hypot(h0.x - goal[0], h0.z - goal[1]) > 1.2) {
        near = null;
      }
    }
    if (near !== null) {
      this.input.state.moveX = 0;
      this.input.state.moveY = 0;
      this.input.forceMove(0, 0);
      const able = Object.keys(near.it.by) as HeroId[];
      const second = this.autoAlt && able.length < 4 ? able[able.length - 1] : null;
      if (near.action === null) {
        g.switchHero(second ?? near.it.suggest ?? able[0]);
      } else if (second !== null && second !== g.active) {
        g.switchHero(second);
      } else {
        this.input.state.actionHeld = true;
      }
      return;
    }
    this.input.state.actionHeld = false;
    const guide = g.guideNow;
    if (guide === null) {
      this.input.forceMove(0, 0);
      return;
    }
    const h2 = g.heroes[g.active];
    if (Math.hypot(h2.x - this.autoAt.x, h2.z - this.autoAt.z) < 0.015) {
      this.autoStuck += 1;
    } else {
      this.autoStuck = 0;
    }
    this.autoAt = { x: h2.x, z: h2.z };
    if (this.autoStuck > 6) {
      /* Blocked: sidestep, trying the other side each time. */
      this.autoSide = 40;
      this.autoSideDir = -this.autoSideDir;
      this.autoStuck = 0;
    }
    const dx = guide[0] - h2.x;
    const dz = guide[1] - h2.z;
    let rel = Math.atan2(dx, dz) - g.cameraYaw;
    if (this.autoSide > 0) {
      this.autoSide -= 1;
      rel += 1.5 * this.autoSideDir;
    }
    this.input.forceMove(-Math.sin(rel), -Math.cos(rel));
  }

  /** Dev helper: jump straight to a screen for a screenshot. */
  readonly devIcon = icon;
}
