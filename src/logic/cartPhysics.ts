/**
 * Kinematic model of the picking robot cart: a differential-drive base, so it
 * can turn in place. Heading 0 faces +Z; forward = (sin h, cos h).
 */
import { resolveCircle, type AABB } from './collision';

export interface CartState {
  x: number;
  z: number;
  heading: number;
  speed: number; // m/s, signed
  turnRate: number; // rad/s
}

export interface CartInput {
  throttle: number; // -1..1
  steer: number; // -1..1 (positive = turn left)
  brake: boolean;
}

export const CART = {
  radius: 0.58,
  maxForward: 5.2,
  maxReverse: 2.2,
  accel: 7,
  decel: 9,
  brakeDecel: 16,
  maxTurn: 2.4,
  turnAccel: 12,
};

export function createCart(x: number, z: number, heading: number): CartState {
  return { x, z, heading, speed: 0, turnRate: 0 };
}

function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(v + step, target);
  return Math.max(v - step, target);
}

/** Advances the cart and returns whether it bumped into something this step. */
export function stepCart(s: CartState, input: CartInput, dt: number, colliders: AABB[]): boolean {
  const throttle = Math.max(-1, Math.min(1, input.throttle));
  const steer = Math.max(-1, Math.min(1, input.steer));

  // longitudinal
  const target = throttle >= 0 ? throttle * CART.maxForward : throttle * CART.maxReverse;
  let rate: number;
  if (input.brake) rate = CART.brakeDecel;
  else if (throttle === 0 || (s.speed !== 0 && Math.sign(target) !== Math.sign(s.speed))) rate = CART.decel;
  else rate = CART.accel;
  s.speed = approach(s.speed, input.brake ? 0 : target, rate * dt);

  // turning: a bit slower at full speed for controllability
  const speedFactor = 1 - 0.35 * Math.min(1, Math.abs(s.speed) / CART.maxForward);
  s.turnRate = approach(s.turnRate, steer * CART.maxTurn * speedFactor, CART.turnAccel * dt);
  s.heading += s.turnRate * dt;
  if (s.heading > Math.PI) s.heading -= Math.PI * 2;
  if (s.heading < -Math.PI) s.heading += Math.PI * 2;

  const nx = s.x + Math.sin(s.heading) * s.speed * dt;
  const nz = s.z + Math.cos(s.heading) * s.speed * dt;
  const r = resolveCircle(nx, nz, CART.radius, colliders);
  s.x = r.x;
  s.z = r.z;
  if (r.hit) {
    // lose the velocity component going into the obstacle
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    const into = (fx * r.nx + fz * r.nz) * Math.sign(s.speed);
    if (into < -0.2) s.speed *= 0.35;
  }
  return r.hit;
}
