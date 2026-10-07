/**
 * First-person arms. Both hands grip the cart handle; the right hand lifts
 * the held product into view. Everything lives in the player rig's local
 * space (rig = position + yaw; the camera child adds pitch).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { toonify } from './toon';

// cartoon "glove" hands: cream skin, chunky yellow cuff with a dark band
const skin = new THREE.MeshStandardMaterial({ color: '#FFE3BF', roughness: 0.7 });
const sleeve = new THREE.MeshStandardMaterial({ color: '#5B4FCF', roughness: 0.8 });
const cuff = new THREE.MeshStandardMaterial({ color: '#FFE45C', roughness: 0.6 });
const band = new THREE.MeshStandardMaterial({ color: '#3B3A46', roughness: 0.6 });

function makeHand(): THREE.Group {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.095, 0.05, 0.1, 3, 0.022), skin);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0135, 0.04, 4, 8).rotateX(Math.PI / 2), skin);
    f.position.set(-0.034 + i * 0.0225, -0.014, 0.066);
    f.rotation.x = 0.95;
    g.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.035, 4, 8).rotateX(Math.PI / 2), skin);
  thumb.position.set(-0.05, 0.0, 0.03);
  thumb.rotation.set(0.4, -0.6, 0);
  g.add(thumb);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

interface Arm {
  upper: THREE.Mesh;
  cuff: THREE.Mesh;
  hand: THREE.Group;
}

export class Hands {
  readonly group = new THREE.Group();
  private left: Arm;
  private right: Arm;
  /** 0 = on the handle, 1 = holding an item up. */
  private reach = 0;
  reachTarget = 0;
  readonly holdAnchor = new THREE.Object3D();
  private time = 0;

  constructor() {
    this.left = this.makeArm();
    this.right = this.makeArm();
    this.group.add(this.holdAnchor);
  }

  private makeArm(): Arm {
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 1, 4, 10), sleeve);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.058, 0.09, 16), cuff);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.022, 16), band);
    ring.position.y = 0.05;
    c.add(ring);
    const hand = makeHand();
    upper.castShadow = true;
    this.group.add(upper, c, hand);
    toonify(this.group);
    return { upper, cuff: c, hand };
  }

  private placeArm(arm: Arm, shoulder: THREE.Vector3, wrist: THREE.Vector3, handQuat: THREE.Quaternion) {
    const dir = wrist.clone().sub(shoulder);
    const len = dir.length();
    const mid = shoulder.clone().addScaledVector(dir, 0.5);
    arm.upper.position.copy(mid);
    arm.upper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    arm.upper.scale.set(1, Math.max(0.1, len - 0.09), 1);
    arm.cuff.position.copy(shoulder.clone().addScaledVector(dir, (len - 0.06) / len));
    arm.cuff.quaternion.copy(arm.upper.quaternion);
    arm.hand.position.copy(wrist.clone().addScaledVector(dir.clone().normalize(), 0.05));
    arm.hand.quaternion.copy(handQuat);
  }

  /**
   * @param camera   the FP camera (child of the rig)
   * @param handleZ  z of the cart handle in rig space
   * @param bob      head-bob offset
   */
  update(dt: number, camera: THREE.Camera, handleZ: number, handleY: number, bob: number) {
    this.time += dt;
    this.reach += (this.reachTarget - this.reach) * Math.min(1, dt * 10);
    const eye = camera.position;
    const yawOnly = new THREE.Quaternion();
    const gripQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, 0));
    // left hand always on the handle
    const shL = new THREE.Vector3(-0.21, eye.y - 0.32 + bob * 0.5, eye.z - 0.05);
    const wrL = new THREE.Vector3(-0.17, handleY + 0.035, handleZ - 0.02);
    this.placeArm(this.left, shL, wrL, gripQ.clone().multiply(yawOnly));
    // right hand: blend between handle grip and the hold point in front of the camera
    camera.updateMatrix();
    const hold = new THREE.Vector3(0.2, -0.2, -0.48).applyMatrix4(camera.matrix);
    const shR = new THREE.Vector3(0.21, eye.y - 0.32 + bob * 0.5, eye.z - 0.05);
    const wrR = new THREE.Vector3(0.17, handleY + 0.035, handleZ - 0.02).lerp(hold, this.reach);
    const holdQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(camera.rotation.x - 0.5, -0.35, 0.25));
    const qR = gripQ.clone().slerp(holdQ, this.reach);
    this.placeArm(this.right, shR, wrR, qR);
    // anchor for the held product: just above the right palm
    this.holdAnchor.position.copy(this.right.hand.position).add(new THREE.Vector3(-0.02, 0.07, 0.02).applyQuaternion(qR));
    this.holdAnchor.quaternion.copy(camera.quaternion);
  }
}
