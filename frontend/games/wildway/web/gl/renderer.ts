import { STRIDE, type MeshBuilder } from './builder';
import { mat4, multiply, perspective, lookAt, placement, type Mat4, type Vec3 } from './math';

/**
 * The toon renderer. Plain WebGL 1, so it runs on any phone Expo Go runs on, with no
 * library. Colour lives in the vertices; lighting is a few deliberate bands, not a
 * smooth gradient; contours are an inverted hull pushed out by a constant number of
 * screen pixels, so lines stay readable on a phone at any distance.
 */

export const MAX_BONES = 16;

export interface Mesh {
  vbo: WebGLBuffer | null;
  ibo: WebGLBuffer | null;
  count: number;
  /** Bounding sphere, for culling. */
  center: Vec3;
  radius: number;
  outline: boolean;
  data: Float32Array;
  index: Uint16Array;
}

/** A picture in the world: Navie on a screen, a painted sign. Kept with its source so it survives a lost context. */
export interface Texture {
  tex: WebGLTexture | null;
  source: TexImageSource | null;
  ready: boolean;
  /** Width over height of the source. */
  aspect: number;
}

const IMAGE_VERT = `
attribute vec2 aPos;
uniform mat4 uVP; uniform mat4 uModel; uniform vec2 uSize;
varying vec2 vUv; varying float vD;
void main() {
  vec4 c = uVP * (uModel * vec4(aPos.x * uSize.x, aPos.y * uSize.y, 0.0, 1.0));
  gl_Position = c;
  vUv = vec2(aPos.x + 0.5, 0.5 - aPos.y);
  vD = c.w;
}`;

const IMAGE_FRAG = `
precision mediump float;
uniform sampler2D uTex; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
varying vec2 vUv; varying float vD;
void main() {
  vec4 t = texture2D(uTex, vUv);
  if (t.a < 0.45) { discard; }
  float f = clamp((vD - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(t.rgb, uFog, f * f), 1.0);
}`;

export interface Environment {
  sun: Vec3;
  /** Sky gradient and fog. */
  skyTop: Vec3;
  skyBottom: Vec3;
  fog: Vec3;
  fogNear: number;
  fogFar: number;
  shadowTint: Vec3;
  lightTint: Vec3;
}

const TOON_VERT = (skin: boolean): string => `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute float aBone; attribute float aSway;
uniform mat4 uVP; uniform mat4 uModel; uniform float uTime;
${skin ? `uniform mat4 uBones[${MAX_BONES}];` : ''}
varying vec3 vN; varying vec3 vC; varying vec3 vW;
void main() {
  vec4 p = vec4(aPos, 1.0);
  vec4 n = vec4(aNor, 0.0);
  ${skin ? 'mat4 b = uBones[int(aBone + 0.5)]; p = b * p; n = b * n;' : ''}
  vec4 w = uModel * p;
  if (aSway > 0.0) {
    w.x += sin(uTime * 1.6 + w.x * 0.5 + w.z * 0.3) * aSway * 0.2;
    w.z += cos(uTime * 1.3 + w.x * 0.3) * aSway * 0.14;
  }
  vN = (uModel * n).xyz;
  vC = aCol;
  vW = w.xyz;
  gl_Position = uVP * w;
}`;

const TOON_FRAG = `
precision mediump float;
uniform vec3 uSun; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform vec3 uEye;
uniform vec3 uShadow; uniform vec3 uLight; uniform vec4 uTint;
varying vec3 vN; varying vec3 vC; varying vec3 vW;
uniform vec3 uCutA; uniform vec3 uCutB; uniform float uCutR;
void cutOut(vec3 world) {
  if (uCutR <= 0.0) { return; }
  vec3 ab = uCutB - uCutA;
  float t = clamp(dot(world - uCutA, ab) / max(dot(ab, ab), 0.01), 0.0, 1.0);
  float d = length(world - (uCutA + ab * t));
  float fade = (1.0 - smoothstep(uCutR * 0.6, uCutR, d)) * (1.0 - smoothstep(0.86, 0.98, t));
  if (fade <= 0.0) { return; }
  float a = mod(floor(gl_FragCoord.x), 4.0);
  float b = mod(floor(gl_FragCoord.y), 4.0);
  float th = mod(a * 3.0 + b * 2.0, 4.0) * 0.25 + mod(a + b, 2.0) * 0.125 + 0.06;
  if (fade > th) { discard; }
}
void main() {
  cutOut(vW);
  vec3 n = normalize(vN);
  float d = dot(n, uSun);
  float upper = smoothstep(0.42, 0.46, d);
  float lower = smoothstep(-0.02, 0.02, d);
  vec3 col = vC * mix(uShadow, mix(mix(uShadow, vec3(1.0), 0.62), uLight, upper), lower);
  vec3 v = normalize(uEye - vW);
  float rim = smoothstep(0.62, 0.72, 1.0 - max(dot(n, v), 0.0)) * lower;
  col += rim * 0.07;
  col = mix(col, uTint.rgb, uTint.a);
  float f = clamp((length(uEye - vW) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, uFog, f * f), 1.0);
}`;

const OUTLINE_VERT = (skin: boolean): string => `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute float aBone; attribute float aSway;
uniform mat4 uVP; uniform mat4 uModel; uniform float uTime; uniform vec2 uPixel; uniform float uWidth;
${skin ? `uniform mat4 uBones[${MAX_BONES}];` : ''}
varying vec3 vC; varying float vD; varying vec3 vW;
void main() {
  vec4 p = vec4(aPos, 1.0);
  vec4 n = vec4(aNor, 0.0);
  ${skin ? 'mat4 b = uBones[int(aBone + 0.5)]; p = b * p; n = b * n;' : ''}
  vec4 w = uModel * p;
  if (aSway > 0.0) {
    w.x += sin(uTime * 1.6 + w.x * 0.5 + w.z * 0.3) * aSway * 0.2;
    w.z += cos(uTime * 1.3 + w.x * 0.3) * aSway * 0.14;
  }
  vec3 wn = normalize((uModel * n).xyz);
  vec4 c = uVP * w;
  vec4 cn = uVP * vec4(w.xyz + wn * 0.25, 1.0);
  vec2 dir = cn.xy / cn.w - c.xy / c.w;
  float l = length(dir);
  if (l > 0.00001) { dir /= l; }
  c.xy += dir * uWidth * uPixel * c.w * clamp(16.0 / c.w, 0.3, 1.0);
  c.z += 0.0004 * c.w;
  gl_Position = c;
  vC = aCol;
  vD = c.w;
  vW = w.xyz;
}`;

const OUTLINE_FRAG = `
precision mediump float;
uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
varying vec3 vC; varying float vD; varying vec3 vW;
uniform vec3 uCutA; uniform vec3 uCutB; uniform float uCutR;
void cutOut(vec3 world) {
  if (uCutR <= 0.0) { return; }
  vec3 ab = uCutB - uCutA;
  float t = clamp(dot(world - uCutA, ab) / max(dot(ab, ab), 0.01), 0.0, 1.0);
  float d = length(world - (uCutA + ab * t));
  float fade = (1.0 - smoothstep(uCutR * 0.6, uCutR, d)) * (1.0 - smoothstep(0.86, 0.98, t));
  if (fade <= 0.0) { return; }
  float a = mod(floor(gl_FragCoord.x), 4.0);
  float b = mod(floor(gl_FragCoord.y), 4.0);
  float th = mod(a * 3.0 + b * 2.0, 4.0) * 0.25 + mod(a + b, 2.0) * 0.125 + 0.06;
  if (fade > th) { discard; }
}
void main() {
  cutOut(vW);
  vec3 col = vC * 0.2 + vec3(0.02, 0.03, 0.08);
  float f = clamp((vD - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, uFog, f * f), 1.0);
}`;

const SKY_VERT = `
attribute vec2 aPos; varying float vY;
void main() { vY = aPos.y * 0.5 + 0.5; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
const SKY_FRAG = `
precision mediump float;
uniform vec3 uTop; uniform vec3 uBottom; varying float vY;
void main() {
  float k = vY * vY;
  gl_FragColor = vec4(mix(uBottom, uTop, k), 1.0);
}`;

const WATER_VERT = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute float aBone; attribute float aSway;
uniform mat4 uVP; uniform mat4 uModel;
varying vec3 vW; varying vec3 vC;
void main() { vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vC = aCol; gl_Position = uVP * w; }`;
const WATER_FRAG = `
precision mediump float;
uniform float uTime; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform vec3 uEye;
uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform float uFlow;
varying vec3 vW; varying vec3 vC;
void main() {
  vec2 p = vW.xz;
  float t = uTime * uFlow;
  float w = sin(p.x * 0.55 + t * 1.1) + sin(p.y * 1.25 - t * 0.8) + sin((p.x + p.y) * 0.38 + t * 0.55);
  vec3 col = mix(uDeep, uShallow, smoothstep(0.1, 0.16, w * 0.33 + vC.r * 0.9));
  float glint = smoothstep(1.55, 1.68, sin(p.x * 1.4 - t * 2.0) + sin(p.y * 2.3 + t * 1.3) + sin(p.x * 0.6 + p.y * 0.9));
  col = mix(col, uFoam, glint * 0.8);
  col = mix(col, uFoam, smoothstep(0.8, 0.86, vC.r + sin(p.x * 1.6 + t) * 0.05));
  float f = clamp((length(uEye - vW) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, uFog, f * f), 1.0);
}`;

const BLOB_VERT = `
attribute vec2 aPos; uniform mat4 uVP; uniform vec4 uAt; varying vec2 vP;
void main() { vP = aPos; gl_Position = uVP * vec4(uAt.x + aPos.x * uAt.w, uAt.y, uAt.z + aPos.y * uAt.w, 1.0); }`;
const BLOB_FRAG = `
precision mediump float;
uniform vec4 uColor; varying vec2 vP;
void main() {
  float d = dot(vP, vP);
  if (d > 1.0) { discard; }
  gl_FragColor = vec4(uColor.rgb, uColor.a * smoothstep(1.0, 0.55, d));
}`;

interface Program {
  p: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
  a: Record<string, number>;
}

export class Renderer {
  readonly gl: WebGLRenderingContext;
  width = 1;
  height = 1;
  dpr = 1;
  outlinePx = 2.2;
  lost = false;
  drawCalls = 0;
  triangles = 0;
  private time = 0;
  private readonly vp: Mat4 = mat4();
  private readonly view: Mat4 = mat4();
  private readonly proj: Mat4 = mat4();
  private readonly model: Mat4 = mat4();
  private eye: Vec3 = [0, 0, 0];
  private env!: Environment;
  private programs!: Record<string, Program>;
  private current: Program | null = null;
  private quad: WebGLBuffer | null = null;
  private readonly meshes: Mesh[] = [];
  private readonly restoreHandlers: (() => void)[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' }) as WebGLRenderingContext | null;
    if (gl === null) {
      throw new Error('WebGL is not available');
    }
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.setup();
      for (const mesh of this.meshes) {
        this.upload(mesh);
      }
      this.restoreHandlers.forEach((fn) => fn());
    });
    this.setup();
  }

  onRestore(fn: () => void): void {
    this.restoreHandlers.push(fn);
  }

  private program(vs: string, fs: string, uniforms: string[], attributes: string[]): Program {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type) as WebGLShader;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        throw new Error(`Shader: ${gl.getShaderInfoLog(s)}`);
      }
      return s;
    };
    const p = gl.createProgram() as WebGLProgram;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniforms) {
      u[name] = gl.getUniformLocation(p, name);
    }
    const a: Record<string, number> = {};
    for (const name of attributes) {
      a[name] = gl.getAttribLocation(p, name);
    }
    return { p, u, a };
  }

  /** Geometry held on the graphics chip, for the performance note. */
  bufferBytes = 0;
  private imageQuad: WebGLBuffer | null = null;
  private readonly textures: Texture[] = [];

  /** A picture to draw in the world. Give it a source now, or later with setSource. */
  texture(source: TexImageSource | null = null): Texture {
    const t: Texture = { tex: null, source: null, ready: false, aspect: 1 };
    this.textures.push(t);
    if (source !== null) {
      this.setSource(t, source);
    }
    return t;
  }

  setSource(t: Texture, source: TexImageSource): void {
    t.source = source;
    const w = (source as { width: number }).width;
    const h = (source as { height: number }).height;
    t.aspect = h > 0 ? w / h : 1;
    this.uploadTexture(t);
  }

  private uploadTexture(t: Texture): void {
    const gl = this.gl;
    if (this.lost || t.source === null) {
      return;
    }
    if (t.tex === null) {
      t.tex = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.source);
    /* Any size of picture: no mipmaps, clamped edges, as WebGL 1 needs. */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    t.ready = true;
  }

  /** A flat picture, centred on the model's origin and facing its +z, w by h in world units. */
  image(t: Texture, model: Mat4, w: number, h: number): void {
    if (!t.ready || t.tex === null) {
      return;
    }
    const gl = this.gl;
    const p = this.programs.image;
    const env = this.env;
    this.use(p);
    gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, model);
    gl.uniform2f(p.u.uSize, w, h);
    gl.uniform3fv(p.u.uFog, env.fog);
    gl.uniform1f(p.u.uFogNear, env.fogNear);
    gl.uniform1f(p.u.uFogFar, env.fogFar);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(p.u.uTex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.imageQuad);
    gl.enableVertexAttribArray(p.a.aPos);
    gl.vertexAttribPointer(p.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.CULL_FACE);
    this.drawCalls += 1;
  }
  private cutA: Vec3 = [0, 0, 0];
  private cutB: Vec3 = [0, 0, 1];
  private cutR = 0;

  /** Anything drawn with `cut` is stippled away around this segment, so scenery never hides the hero. */
  setCut(a: Vec3, b: Vec3, radius: number): void {
    this.cutA = a;
    this.cutB = b;
    this.cutR = radius;
  }

  private setup(): void {
    const gl = this.gl;
    const attrs = ['aPos', 'aNor', 'aCol', 'aBone', 'aSway'];
    const toonU = ['uVP', 'uModel', 'uTime', 'uBones', 'uSun', 'uFog', 'uFogNear', 'uFogFar', 'uEye', 'uShadow', 'uLight', 'uTint', 'uCutA', 'uCutB', 'uCutR'];
    const lineU = ['uVP', 'uModel', 'uTime', 'uBones', 'uPixel', 'uWidth', 'uFog', 'uFogNear', 'uFogFar', 'uCutA', 'uCutB', 'uCutR'];
    this.programs = {
      toon: this.program(TOON_VERT(false), TOON_FRAG, toonU, attrs),
      toonSkin: this.program(TOON_VERT(true), TOON_FRAG, toonU, attrs),
      line: this.program(OUTLINE_VERT(false), OUTLINE_FRAG, lineU, attrs),
      lineSkin: this.program(OUTLINE_VERT(true), OUTLINE_FRAG, lineU, attrs),
      sky: this.program(SKY_VERT, SKY_FRAG, ['uTop', 'uBottom'], ['aPos']),
      water: this.program(WATER_VERT, WATER_FRAG, ['uVP', 'uModel', 'uTime', 'uFog', 'uFogNear', 'uFogFar', 'uEye', 'uDeep', 'uShallow', 'uFoam', 'uFlow'], attrs),
      blob: this.program(BLOB_VERT, BLOB_FRAG, ['uVP', 'uAt', 'uColor'], ['aPos']),
      image: this.program(IMAGE_VERT, IMAGE_FRAG, ['uVP', 'uModel', 'uSize', 'uTex', 'uFog', 'uFogNear', 'uFogFar'], ['aPos']),
    };
    this.imageQuad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.imageQuad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), gl.STATIC_DRAW);
    /* After a lost context, every picture is uploaded again from its source. */
    for (const t of this.textures) {
      t.tex = null;
      if (t.source !== null) {
        this.uploadTexture(t);
      }
    }
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    this.current = null;
  }

  /** Turns finished shapes into something the GPU can draw. */
  mesh(b: MeshBuilder, outline = true): Mesh {
    const data = new Float32Array(b.verts);
    const index = new Uint16Array(b.indices);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < data.length; i += STRIDE) {
      minX = Math.min(minX, data[i]);
      maxX = Math.max(maxX, data[i]);
      minY = Math.min(minY, data[i + 1]);
      maxY = Math.max(maxY, data[i + 1]);
      minZ = Math.min(minZ, data[i + 2]);
      maxZ = Math.max(maxZ, data[i + 2]);
    }
    const mesh: Mesh = {
      vbo: null,
      ibo: null,
      count: index.length,
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
      radius: Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2,
      outline,
      data,
      index,
    };
    this.upload(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  private upload(mesh: Mesh): void {
    const gl = this.gl;
    this.bufferBytes += mesh.data.byteLength + mesh.index.byteLength;
    mesh.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW);
    mesh.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.index, gl.STATIC_DRAW);
  }

  /** Frees a zone's meshes when another zone is loaded. */
  release(meshes: Mesh[]): void {
    const gl = this.gl;
    for (const mesh of meshes) {
      this.bufferBytes -= mesh.data.byteLength + mesh.index.byteLength;
      gl.deleteBuffer(mesh.vbo);
      gl.deleteBuffer(mesh.ibo);
      const i = this.meshes.indexOf(mesh);
      if (i >= 0) {
        this.meshes.splice(i, 1);
      }
    }
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.gl.viewport(0, 0, w, h);
  }

  /** Starts a frame looking from `eye` at `target`. */
  begin(eye: Vec3, target: Vec3, fovY: number, env: Environment, time: number): void {
    const gl = this.gl;
    this.env = env;
    /* Water runs in a fragment shader, where low precision would turn a big clock number jumpy. */
    this.time = time % 62.83185;
    this.eye = eye;
    this.drawCalls = 0;
    this.triangles = 0;
    lookAt(this.view, eye, target);
    perspective(this.proj, fovY, this.width / this.height, 0.3, 320);
    multiply(this.vp, this.proj, this.view);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    const sky = this.programs.sky;
    this.use(sky);
    gl.uniform3fv(sky.u.uTop, env.skyTop);
    gl.uniform3fv(sky.u.uBottom, env.skyBottom);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(sky.a.aPos);
    gl.vertexAttribPointer(sky.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  /** Is this sphere anywhere near what the camera can see? */
  visible(center: Vec3, radius: number): boolean {
    const m = this.vp;
    const x = m[0] * center[0] + m[4] * center[1] + m[8] * center[2] + m[12];
    const y = m[1] * center[0] + m[5] * center[1] + m[9] * center[2] + m[13];
    const w = m[3] * center[0] + m[7] * center[1] + m[11] * center[2] + m[15];
    /*
     * A sphere's half-width in clip space is its radius times the projection's scale on
     * that axis: on a tall phone the horizontal scale is about 5, so an unscaled margin
     * dropped whole chunks that were partly in view.
     */
    const sx = Math.abs(this.proj[0]);
    const sy = Math.abs(this.proj[5]);
    return w > -radius && Math.abs(x) < w + radius * (1 + sx) && Math.abs(y) < w + radius * (1 + sy) && w < this.env.fogFar + radius;
  }

  private use(p: Program): void {
    if (this.current !== p) {
      this.gl.useProgram(p.p);
      this.current = p;
    }
  }

  private bindMesh(mesh: Mesh, p: Program): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    const size = STRIDE * 4;
    const set = (name: string, n: number, offset: number): void => {
      const a = p.a[name];
      if (a >= 0) {
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, n, gl.FLOAT, false, size, offset);
      }
    };
    set('aPos', 3, 0);
    set('aNor', 3, 12);
    set('aCol', 3, 24);
    set('aBone', 1, 36);
    set('aSway', 1, 40);
  }

  /** Draws a mesh with its contour. `bones` makes it follow a skeleton; `tint` washes it with a colour. */
  draw(mesh: Mesh, opts: { model?: Mat4; bones?: Float32Array; tint?: [number, number, number, number]; noOutline?: boolean; cut?: boolean } = {}): void {
    const gl = this.gl;
    const env = this.env;
    const skinned = opts.bones !== undefined;
    const model = opts.model ?? placement(this.model, 0, 0, 0);
    const p = skinned ? this.programs.toonSkin : this.programs.toon;
    this.use(p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, model);
    gl.uniform1f(p.u.uTime, this.time);
    gl.uniform3fv(p.u.uSun, env.sun);
    gl.uniform3fv(p.u.uFog, env.fog);
    gl.uniform1f(p.u.uFogNear, env.fogNear);
    gl.uniform1f(p.u.uFogFar, env.fogFar);
    gl.uniform3fv(p.u.uEye, this.eye);
    gl.uniform3fv(p.u.uShadow, env.shadowTint);
    gl.uniform3fv(p.u.uLight, env.lightTint);
    gl.uniform4fv(p.u.uTint, opts.tint ?? [0, 0, 0, 0]);
    gl.uniform3fv(p.u.uCutA, this.cutA);
    gl.uniform3fv(p.u.uCutB, this.cutB);
    gl.uniform1f(p.u.uCutR, opts.cut === true ? this.cutR : 0);
    if (skinned) {
      gl.uniformMatrix4fv(p.u.uBones, false, opts.bones as Float32Array);
    }
    this.bindMesh(mesh, p);
    gl.cullFace(gl.BACK);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    this.drawCalls += 1;
    this.triangles += mesh.count / 3;
    if (mesh.outline && opts.noOutline !== true && this.outlinePx > 0) {
      const l = skinned ? this.programs.lineSkin : this.programs.line;
      this.use(l);
      gl.uniformMatrix4fv(l.u.uVP, false, this.vp);
      gl.uniformMatrix4fv(l.u.uModel, false, model);
      gl.uniform1f(l.u.uTime, this.time);
      gl.uniform2f(l.u.uPixel, 2 / this.width, 2 / this.height);
      gl.uniform1f(l.u.uWidth, this.outlinePx * this.dpr);
      gl.uniform3fv(l.u.uCutA, this.cutA);
      gl.uniform3fv(l.u.uCutB, this.cutB);
      gl.uniform1f(l.u.uCutR, opts.cut === true ? this.cutR : 0);
      gl.uniform3fv(l.u.uFog, env.fog);
      gl.uniform1f(l.u.uFogNear, env.fogNear);
      gl.uniform1f(l.u.uFogFar, env.fogFar);
      if (skinned) {
        gl.uniformMatrix4fv(l.u.uBones, false, opts.bones as Float32Array);
      }
      this.bindMesh(mesh, l);
      gl.cullFace(gl.FRONT);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      gl.cullFace(gl.BACK);
      this.drawCalls += 1;
    }
  }

  water(mesh: Mesh, deep: Vec3, shallow: Vec3, foam: Vec3, flow = 1): void {
    const gl = this.gl;
    const env = this.env;
    const p = this.programs.water;
    this.use(p);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniformMatrix4fv(p.u.uModel, false, placement(this.model, 0, 0, 0));
    gl.uniform1f(p.u.uTime, this.time);
    gl.uniform3fv(p.u.uFog, env.fog);
    gl.uniform1f(p.u.uFogNear, env.fogNear);
    gl.uniform1f(p.u.uFogFar, env.fogFar);
    gl.uniform3fv(p.u.uEye, this.eye);
    gl.uniform3fv(p.u.uDeep, deep);
    gl.uniform3fv(p.u.uShallow, shallow);
    gl.uniform3fv(p.u.uFoam, foam);
    gl.uniform1f(p.u.uFlow, flow);
    this.bindMesh(mesh, p);
    gl.cullFace(gl.BACK);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    this.drawCalls += 1;
  }

  /** A soft round shadow or glow on the ground. */
  blob(x: number, y: number, z: number, r: number, color: [number, number, number, number]): void {
    const gl = this.gl;
    const p = this.programs.blob;
    this.use(p);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
    gl.uniform4f(p.u.uAt, x, y, z, r);
    gl.uniform4fv(p.u.uColor, color);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(p.a.aPos);
    gl.vertexAttribPointer(p.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    this.drawCalls += 1;
  }

  /** Where a world point lands on screen, in CSS pixels; null if behind the camera. */
  project(p: Vec3): { x: number; y: number } | null {
    const m = this.vp;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0.01) {
      return null;
    }
    return { x: ((x / w + 1) / 2) * (this.width / this.dpr), y: ((1 - y / w) / 2) * (this.height / this.dpr) };
  }

  /** Bakes a little picture of something, for portraits. Runs at load, before the game starts drawing. */
  portrait(size: number, draw: () => void): string {
    const prevW = this.canvas.width;
    const prevH = this.canvas.height;
    const prevDpr = this.dpr;
    this.resize(size, size, 1);
    draw();
    const url = this.canvas.toDataURL('image/png');
    this.canvas.width = prevW;
    this.canvas.height = prevH;
    this.width = prevW;
    this.height = prevH;
    this.dpr = prevDpr;
    this.gl.viewport(0, 0, prevW, prevH);
    return url;
  }
}
