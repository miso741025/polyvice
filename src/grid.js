// City layout constants and the shared collision list.
// The city is a grid of NX x NZ blocks separated by roads; +x is east (the ocean), +z is south.

export const NX = 8, NZ = 7, BLOCK = 60, ROAD = 16, CELL = BLOCK + ROAD, LANE = 3.6;
export const OX = -NX * CELL / 2, OZ = -NZ * CELL / 2;

export const nodeX = k => OX + k * CELL; // centre line of north-south road k (0..NX)
export const nodeZ = k => OZ + k * CELL; // centre line of east-west road k (0..NZ)
export const blockCenter = (i, j) => ({ x: OX + i * CELL + CELL / 2, z: OZ + j * CELL + CELL / 2 });

export const SHORE = OX + NX * CELL + ROAD / 2; // east kerb of Ocean Drive, where the sand starts
export const bounds = {
  minX: OX - ROAD / 2 - 20, maxX: SHORE + 60,
  minZ: OZ - ROAD / 2 - 20, maxZ: OZ + NZ * CELL + ROAD / 2 + 20,
};

// Axis-aligned boxes: { minX, maxX, minZ, maxZ, h, thin? }
export const colliders = [];

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
export const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Push a circle (pos.x, pos.z, radius r) out of every collider and back inside the island.
// Returns true if anything was touched.
export function pushOut(pos, r) {
  let hit = false;
  for (const c of colliders) {
    const cx = clamp(pos.x, c.minX, c.maxX), cz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = cx + dx / d * r; pos.z = cz + dz / d * r;
    } else {
      const l = pos.x - c.minX, ri = c.maxX - pos.x, t = pos.z - c.minZ, b = c.maxZ - pos.z;
      const m = Math.min(l, ri, t, b);
      if (m === l) pos.x = c.minX - r; else if (m === ri) pos.x = c.maxX + r;
      else if (m === t) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
    }
  }
  const x = clamp(pos.x, bounds.minX + r, bounds.maxX - r), z = clamp(pos.z, bounds.minZ + r, bounds.maxZ - r);
  if (x !== pos.x || z !== pos.z) { pos.x = x; pos.z = z; hit = true; }
  return hit;
}
