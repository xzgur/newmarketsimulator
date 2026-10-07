/** Minimal 2D (XZ plane) collision helpers. */

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CircleResolve {
  x: number;
  z: number;
  hit: boolean;
  /** Normal of the last contact (unit length), when hit. */
  nx: number;
  nz: number;
}

/**
 * Pushes a circle out of every box it overlaps. Runs a few iterations so that
 * corners between two boxes resolve cleanly.
 */
export function resolveCircle(x: number, z: number, r: number, boxes: AABB[]): CircleResolve {
  let hit = false;
  let nx = 0;
  let nz = 0;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const b of boxes) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      let dx = x - cx;
      let dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-6) {
        // centre is inside the box: push out along the smallest penetration axis
        const pushes = [
          { v: x - b.minX, dx: -1, dz: 0 },
          { v: b.maxX - x, dx: 1, dz: 0 },
          { v: z - b.minZ, dx: 0, dz: -1 },
          { v: b.maxZ - z, dx: 0, dz: 1 },
        ].sort((a, c) => a.v - c.v);
        const p = pushes[0];
        dx = p.dx;
        dz = p.dz;
        x += dx * (p.v + r);
        z += dz * (p.v + r);
        d = 1;
      } else {
        dx /= d;
        dz /= d;
        x += dx * (r - d);
        z += dz * (r - d);
      }
      nx = dx;
      nz = dz;
      hit = true;
      moved = true;
    }
    if (!moved) break;
  }
  return { x, z, hit, nx, nz };
}

export function circleIntersectsBox(x: number, z: number, r: number, b: AABB): boolean {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}
