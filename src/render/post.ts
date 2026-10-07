/**
 * Post-processing for the cel-shaded look:
 *   ToonScenePass (scene → ink outlines from depth, optional pixelation)
 *   → Bloom (only for really bright emissives) → tone mapping
 *   → colour grade / vignette / screen flash → SMAA (skipped in pixel mode)
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { Quality } from '../settings';

export type { Quality };

const OutlineShader = {
  uniforms: {
    tColor: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    texel: { value: new THREE.Vector2() },
    projInv: { value: new THREE.Matrix4() },
    ink: { value: new THREE.Color('#1b1730') },
    strength: { value: 1 },
    thickness: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform vec2 texel;
    uniform mat4 projInv;
    uniform vec3 ink;
    uniform float strength;
    uniform float thickness;
    varying vec2 vUv;

    float viewZ(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      vec4 v = projInv * clip;
      return v.z / v.w;
    }

    void main() {
      vec4 col = texture2D(tColor, vUv);
      float d0 = texture2D(tDepth, vUv).x;
      if (d0 >= 0.99999) { gl_FragColor = col; return; }
      float z0 = viewZ(vUv);
      // lines thin out with distance: full width up close, one texel far away
      float far = smoothstep(4.0, 12.0, -z0);
      vec2 o = texel * max(1.0, floor(mix(thickness, 1.0, far) + 0.5));
      float zl = viewZ(vUv - vec2(o.x, 0.0));
      float zr = viewZ(vUv + vec2(o.x, 0.0));
      float zd = viewZ(vUv - vec2(0.0, o.y));
      float zu = viewZ(vUv + vec2(0.0, o.y));
      // 1/z is affine in screen space for planes: its laplacian finds creases, its gradient silhouettes
      float w0 = 1.0 / z0;
      float wl = 1.0 / zl, wr = 1.0 / zr, wd = 1.0 / zd, wu = 1.0 / zu;
      float sil = max(max(abs(wl - w0), abs(wr - w0)), max(abs(wd - w0), abs(wu - w0))) / abs(w0);
      float crease = (abs(wl + wr - 2.0 * w0) + abs(wd + wu - 2.0 * w0)) / abs(w0);
      float dist = -z0;
      float silEdge = smoothstep(0.035, 0.07, sil);
      float creaseEdge = smoothstep(0.004, 0.012, crease) * (1.0 - smoothstep(6.0, 18.0, dist));
      float e = max(silEdge, creaseEdge * 0.85);
      // and fade: distant shelves keep a hint of ink instead of a black mesh of lines
      e *= mix(1.0, 0.45, smoothstep(8.0, 30.0, dist)) * (1.0 - smoothstep(30.0, 70.0, dist));
      vec3 line = mix(col.rgb * 0.18, ink, 0.65);
      gl_FragColor = vec4(mix(col.rgb, line, e * strength), col.a);
    }
  `,
};

/** Renders the scene into its own target (with depth) and outputs the outlined image. */
class ToonScenePass extends Pass {
  private rt: THREE.WebGLRenderTarget;
  private quad: FullScreenQuad;
  private material: THREE.ShaderMaterial;
  pixel = 1;
  outlines = true;
  private w = 1;
  private h = 1;

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    super();
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
    this.material = new THREE.ShaderMaterial({ ...OutlineShader, uniforms: THREE.UniformsUtils.clone(OutlineShader.uniforms), depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.material);
    this.needsSwap = true;
  }

  setSize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const p = Math.max(1, this.pixel);
    const rw = Math.max(1, Math.floor(w / p));
    const rh = Math.max(1, Math.floor(h / p));
    this.rt.setSize(rw, rh);
    const filter = p > 1 ? THREE.NearestFilter : THREE.LinearFilter;
    this.rt.texture.minFilter = filter;
    this.rt.texture.magFilter = filter;
    this.rt.texture.needsUpdate = true;
    this.material.uniforms.texel.value.set(1 / rw, 1 / rh);
    // keep lines about 1px at 720p, a bit thicker on big screens (always 1 texel in pixel mode)
    this.material.uniforms.thickness.value = p > 1 ? 1 : Math.max(1, Math.round(h / 760));
  }

  setPixel(p: number) {
    this.pixel = p;
    this.setSize(this.w, this.h);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    const u = this.material.uniforms;
    u.tColor.value = this.rt.texture;
    u.tDepth.value = this.rt.depthTexture;
    u.projInv.value.copy(this.camera.projectionMatrixInverse);
    u.strength.value = this.outlines ? 1 : 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.rt.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.3 },
    uSaturation: { value: 1.15 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uContrast: { value: 1.05 },
    uFlash: { value: new THREE.Vector4(0, 0, 0, 0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette, uSaturation, uContrast;
    uniform vec3 uTint;
    uniform vec4 uFlash;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * uTint;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d) * (1.0 + uVignette));
      col *= mix(1.0, v, uVignette * 1.4);
      float edge = smoothstep(0.2, 0.75, length(d) * 1.4);
      col = mix(col, uFlash.rgb, uFlash.a * (0.25 + 0.75 * edge));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }
  `,
};

export class Post {
  readonly composer: EffectComposer;
  private scenePass: ToonScenePass;
  readonly bloom: UnrealBloomPass | null = null;
  readonly grade: ShaderPass;
  private smaa: SMAAPass;
  private flash = new THREE.Vector4(0, 0, 0, 0);

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    readonly quality: Quality,
    pixel = 1,
  ) {
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, rt);
    this.scenePass = new ToonScenePass(scene, camera);
    this.scenePass.pixel = pixel;
    this.composer.addPass(this.scenePass);
    if (quality !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.45, 2.2);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.smaa = new SMAAPass();
    this.smaa.enabled = pixel <= 1 && quality !== 'low';
    this.composer.addPass(this.smaa);
  }

  setPixel(p: number) {
    this.scenePass.setPixel(p);
    this.smaa.enabled = p <= 1 && this.quality !== 'low';
  }

  setGrade(opts: { vignette?: number; saturation?: number; contrast?: number; tint?: THREE.ColorRepresentation; bloom?: number; bloomThreshold?: number }) {
    const u = this.grade.uniforms;
    if (opts.vignette !== undefined) u.uVignette.value = opts.vignette;
    if (opts.saturation !== undefined) u.uSaturation.value = opts.saturation;
    if (opts.contrast !== undefined) u.uContrast.value = opts.contrast;
    if (opts.tint !== undefined) (u.uTint.value as THREE.Color).set(opts.tint);
    if (this.bloom) {
      if (opts.bloom !== undefined) this.bloom.strength = opts.bloom;
      if (opts.bloomThreshold !== undefined) this.bloom.threshold = opts.bloomThreshold;
    }
  }

  pulse(color: THREE.ColorRepresentation, strength = 0.35) {
    const c = new THREE.Color(color);
    this.flash.set(c.r, c.g, c.b, strength);
  }

  setSize(w: number, h: number) {
    // the composer forwards (w, h) × pixel ratio to every pass, including the toon pass
    this.composer.setSize(w, h);
  }

  render(dt: number) {
    this.flash.w = Math.max(0, this.flash.w - dt * 1.4);
    (this.grade.uniforms.uFlash.value as THREE.Vector4).copy(this.flash);
    this.composer.render(dt);
  }

  dispose() {
    this.scenePass.dispose();
    this.composer.dispose();
  }
}
