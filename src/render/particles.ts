/** Sparkle bursts (Points) and confetti (instanced quads). */
import * as THREE from 'three';
import { glowTexture } from './textures';

const MAX_SPARKS = 400;
const MAX_CONFETTI = 260;

export class Particles {
  readonly group = new THREE.Group();
  private sparkPos = new Float32Array(MAX_SPARKS * 3);
  private sparkCol = new Float32Array(MAX_SPARKS * 3);
  private sparkVel = new Float32Array(MAX_SPARKS * 3);
  private sparkLife = new Float32Array(MAX_SPARKS);
  private sparkGeo = new THREE.BufferGeometry();
  private sparkNext = 0;
  private confetti: THREE.InstancedMesh;
  private cPos: THREE.Vector3[] = [];
  private cVel: THREE.Vector3[] = [];
  private cRot: THREE.Euler[] = [];
  private cSpin: THREE.Vector3[] = [];
  private cLife = new Float32Array(MAX_CONFETTI);
  private dummy = new THREE.Object3D();

  constructor() {
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    const pts = new THREE.Points(
      this.sparkGeo,
      new THREE.PointsMaterial({ size: 0.07, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    pts.frustumCulled = false;
    this.group.add(pts);
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.03), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), MAX_CONFETTI);
    this.confetti.frustumCulled = false;
    const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#facc15'];
    for (let i = 0; i < MAX_CONFETTI; i++) {
      this.confetti.setColorAt(i, new THREE.Color(colors[i % colors.length]));
      this.cPos.push(new THREE.Vector3());
      this.cVel.push(new THREE.Vector3());
      this.cRot.push(new THREE.Euler());
      this.cSpin.push(new THREE.Vector3());
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    }
    this.group.add(this.confetti);
  }

  sparkle(at: THREE.Vector3, color: THREE.ColorRepresentation = '#fff3a0', count = 26, speed = 1.6) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.sparkNext;
      this.sparkNext = (this.sparkNext + 1) % MAX_SPARKS;
      this.sparkPos.set([at.x, at.y, at.z], i * 3);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      this.sparkVel.set([dir.x, dir.y, dir.z], i * 3);
      const tint = c.clone().lerp(new THREE.Color('#ffffff'), Math.random() * 0.5);
      this.sparkCol.set([tint.r, tint.g, tint.b], i * 3);
      this.sparkLife[i] = 0.5 + Math.random() * 0.5;
    }
  }

  confettiBurst(at: THREE.Vector3, count = MAX_CONFETTI) {
    for (let i = 0; i < Math.min(count, MAX_CONFETTI); i++) {
      this.cPos[i].copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.3, (Math.random() - 0.5) * 0.6));
      this.cVel[i].set((Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 5);
      this.cRot[i].set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.cSpin[i].set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      this.cLife[i] = 4 + Math.random() * 2;
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt;
      const j = i * 3;
      this.sparkVel[j + 1] -= 3.5 * dt;
      this.sparkPos[j] += this.sparkVel[j] * dt;
      this.sparkPos[j + 1] += this.sparkVel[j + 1] * dt;
      this.sparkPos[j + 2] += this.sparkVel[j + 2] * dt;
      if (this.sparkLife[i] <= 0) {
        this.sparkPos[j + 1] = -100;
      } else {
        const f = Math.min(1, this.sparkLife[i] * 2.5);
        this.sparkCol[j] *= 0.995;
        this.sparkCol[j + 1] *= 0.995;
        this.sparkCol[j + 2] *= f > 0.99 ? 1 : 0.97;
      }
    }
    (this.sparkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.sparkGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    let any = false;
    for (let i = 0; i < MAX_CONFETTI; i++) {
      if (this.cLife[i] <= 0) continue;
      any = true;
      this.cLife[i] -= dt;
      const v = this.cVel[i];
      v.y -= 6 * dt;
      v.multiplyScalar(1 - dt * 1.6);
      if (v.y < -1.2) v.y = -1.2;
      this.cPos[i].addScaledVector(v, dt);
      if (this.cPos[i].y < 0.01) {
        this.cPos[i].y = 0.01;
        v.set(0, 0, 0);
      }
      this.cRot[i].x += this.cSpin[i].x * dt;
      this.cRot[i].y += this.cSpin[i].y * dt;
      this.dummy.position.copy(this.cPos[i]);
      this.dummy.rotation.copy(this.cRot[i]);
      this.dummy.scale.setScalar(this.cLife[i] > 0 ? Math.min(1, this.cLife[i]) : 0);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    }
    if (any) this.confetti.instanceMatrix.needsUpdate = true;
  }
}
