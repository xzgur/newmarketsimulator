/** Post-processing chain: AO → bloom → tone mapping → colour grade/vignette → SMAA. */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

export type Quality = 'low' | 'medium' | 'high';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.35 },
    uSaturation: { value: 1.12 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uContrast: { value: 1.05 },
    uTime: { value: 0 },
    uGrain: { value: 0.025 },
    uFlash: { value: new THREE.Vector4(0, 0, 0, 0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette, uSaturation, uContrast, uTime, uGrain;
    uniform vec3 uTint;
    uniform vec4 uFlash;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * uTint;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d) * (1.0 + uVignette));
      col *= mix(1.0, v, uVignette * 1.6);
      col += (rand(vUv * 731.0 + uTime) - 0.5) * uGrain;
      // screen flash (red for mistakes, green for success), stronger at the edges
      float edge = smoothstep(0.2, 0.75, length(d) * 1.4);
      col = mix(col, uFlash.rgb, uFlash.a * (0.25 + 0.75 * edge));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }
  `,
};

export class Post {
  readonly composer: EffectComposer | null;
  private gtao: GTAOPass | null = null;
  readonly bloom: UnrealBloomPass | null = null;
  readonly grade: ShaderPass | null = null;
  private flash = new THREE.Vector4(0, 0, 0, 0);

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    readonly quality: Quality,
  ) {
    if (quality === 'low') {
      this.composer = null;
      return;
    }
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    if (quality === 'high') {
      this.gtao = new GTAOPass(scene, camera, size.x, size.y);
      this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
      this.gtao.blendIntensity = 0.85;
      composer.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.5, 2.2);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    composer.addPass(this.grade);
    composer.addPass(new SMAAPass());
    this.composer = composer;
  }

  setGrade(opts: { vignette?: number; saturation?: number; contrast?: number; tint?: THREE.ColorRepresentation; grain?: number; bloom?: number; bloomThreshold?: number }) {
    if (this.grade) {
      const u = this.grade.uniforms;
      if (opts.vignette !== undefined) u.uVignette.value = opts.vignette;
      if (opts.saturation !== undefined) u.uSaturation.value = opts.saturation;
      if (opts.contrast !== undefined) u.uContrast.value = opts.contrast;
      if (opts.tint !== undefined) (u.uTint.value as THREE.Color).set(opts.tint);
      if (opts.grain !== undefined) u.uGrain.value = opts.grain;
    }
    if (this.bloom) {
      if (opts.bloom !== undefined) this.bloom.strength = opts.bloom;
      if (opts.bloomThreshold !== undefined) this.bloom.threshold = opts.bloomThreshold;
    }
  }

  /** Brief full-screen colour flash. */
  pulse(color: THREE.ColorRepresentation, strength = 0.35) {
    const c = new THREE.Color(color);
    this.flash.set(c.r, c.g, c.b, strength);
  }

  setSize(w: number, h: number) {
    this.composer?.setSize(w, h);
    this.gtao?.setSize(w, h);
  }

  render(dt: number) {
    this.flash.w = Math.max(0, this.flash.w - dt * 1.4);
    if (this.composer) {
      const u = this.grade!.uniforms;
      u.uTime.value = (u.uTime.value + dt) % 100;
      (u.uFlash.value as THREE.Vector4).copy(this.flash);
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
