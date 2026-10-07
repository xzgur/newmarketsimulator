/**
 * First-person shopper pushing a cart. The cart is rigidly attached in front
 * of the player, so collisions are resolved for two circles: the body and the
 * cart basket. Yaw 0 faces +Z; forward = (sin yaw, cos yaw).
 */
import { resolveCircle, type AABB } from './collision';

export interface PlayerState {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  /** Distance travelled (drives head bob + wheel spin). */
  stride: number;
}

export interface MoveInput {
  forward: number; // -1..1
  strafe: number; // -1..1 (positive = right)
  turn: number; // keyboard turn, rad/s scale -1..1 (positive = left)
  sprint: boolean;
}

export const PLAYER = {
  bodyRadius: 0.3,
  cartRadius: 0.42,
  cartOffset: 0.95,
  walk: 3.3,
  sprint: 5.4,
  reverse: 1.8,
  accel: 10,
  friction: 9,
  keyTurn: 2.2,
  eyeHeight: 1.62,
  minPitch: -1.25,
  maxPitch: 0.9,
};

export function createPlayer(x: number, z: number, yaw: number): PlayerState {
  return { x, z, yaw, pitch: -0.12, vx: 0, vz: 0, stride: 0 };
}

export function look(p: PlayerState, dYaw: number, dPitch: number) {
  p.yaw = wrapAngle(p.yaw + dYaw);
  p.pitch = Math.max(PLAYER.minPitch, Math.min(PLAYER.maxPitch, p.pitch + dPitch));
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Circles that block the player (customers etc.). */
export interface DynamicBlocker {
  x: number;
  z: number;
  r: number;
}

export function cartCenter(p: PlayerState): { x: number; z: number } {
  return { x: p.x + Math.sin(p.yaw) * PLAYER.cartOffset, z: p.z + Math.cos(p.yaw) * PLAYER.cartOffset };
}

function resolveDynamic(x: number, z: number, r: number, blockers: DynamicBlocker[]) {
  let hit = false;
  for (const b of blockers) {
    const dx = x - b.x;
    const dz = z - b.z;
    const d = Math.hypot(dx, dz);
    const min = r + b.r;
    if (d < min && d > 1e-5) {
      x += (dx / d) * (min - d);
      z += (dz / d) * (min - d);
      hit = true;
    }
  }
  return { x, z, hit };
}

/** Advances the player; returns true if the cart or body bumped into something. */
export function stepPlayer(p: PlayerState, input: MoveInput, dt: number, colliders: AABB[], blockers: DynamicBlocker[] = []): boolean {
  p.yaw = wrapAngle(p.yaw + input.turn * PLAYER.keyTurn * dt);
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  // right vector (screen right when looking along forward)
  const rx = -fz;
  const rz = fx;
  const fwd = Math.max(-1, Math.min(1, input.forward));
  const str = Math.max(-1, Math.min(1, input.strafe));
  const top = fwd < 0 ? PLAYER.reverse : input.sprint ? PLAYER.sprint : PLAYER.walk;
  let tx = fx * fwd + rx * str * 0.7;
  let tz = fz * fwd + rz * str * 0.7;
  const len = Math.hypot(tx, tz);
  if (len > 1) {
    tx /= len;
    tz /= len;
  }
  tx *= top;
  tz *= top;
  const rate = len > 0.01 ? PLAYER.accel : PLAYER.friction;
  const k = 1 - Math.exp(-rate * dt);
  p.vx += (tx - p.vx) * k;
  p.vz += (tz - p.vz) * k;

  const ox = p.x;
  const oz = p.z;
  p.x += p.vx * dt;
  p.z += p.vz * dt;

  let hit = false;
  for (let i = 0; i < 2; i++) {
    // cart basket first: its push moves the whole player
    const c = cartCenter(p);
    const rc = resolveCircle(c.x, c.z, PLAYER.cartRadius, colliders);
    const dc = resolveDynamic(rc.x, rc.z, PLAYER.cartRadius, blockers);
    if (rc.hit || dc.hit) {
      p.x += dc.x - c.x;
      p.z += dc.z - c.z;
      hit = true;
    }
    const rb = resolveCircle(p.x, p.z, PLAYER.bodyRadius, colliders);
    const db = resolveDynamic(rb.x, rb.z, PLAYER.bodyRadius, blockers);
    if (rb.hit || db.hit) hit = true;
    p.x = db.x;
    p.z = db.z;
  }
  if (hit && dt > 0) {
    // velocity follows what actually happened, so we slide along obstacles
    p.vx = (p.x - ox) / dt;
    p.vz = (p.z - oz) / dt;
  }
  p.stride += Math.hypot(p.x - ox, p.z - oz);
  return hit;
}

export function speedOf(p: PlayerState): number {
  return Math.hypot(p.vx, p.vz);
}
