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

// Height of the ground under (x, z): sidewalks are raised, the beach lies a little lower.
// lowGround lists squares inside blocks that stay at road level (car parks): { x, z, half }.
// piers run east out over the water: { minZ, maxZ, ramp (x where it leaves the sand), deck (x where it is level), maxX, y }.
export const lowGround = [], piers = [];
export function groundAt(x, z) {
  for (const p of piers) if (z > p.minZ && z < p.maxZ && x > p.ramp) return x < p.deck ? -0.1 + (p.y + 0.1) * (x - p.ramp) / (p.deck - p.ramp) : p.y;
  if (x > SHORE) return x < SHORE + 4.6 ? 0.04 : -0.1;
  if (x < OX - ROAD / 2 || z < OZ - ROAD / 2 || z > OZ + NZ * CELL + ROAD / 2) return -0.1;
  const u = ((x - OX) % CELL + CELL) % CELL, v = ((z - OZ) % CELL + CELL) % CELL;
  if (u < ROAD / 2 || u > CELL - ROAD / 2 || v < ROAD / 2 || v > CELL - ROAD / 2) return 0;
  for (const g of lowGround) if (Math.abs(x - g.x) < g.half && Math.abs(z - g.z) < g.half) return 0.03;
  return 0.14;
}

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
  // The island's edge, except along a pier, which carries on over the water between its rails.
  const pier = piers.find(p => pos.z > p.minZ && pos.z < p.maxZ && pos.x > p.deck);
  const out = pier && pos.x > bounds.maxX - r;
  const x = clamp(pos.x, bounds.minX + r, (pier ? pier.maxX : bounds.maxX) - r);
  const z = out ? clamp(pos.z, pier.minZ + r, pier.maxZ - r) : clamp(pos.z, bounds.minZ + r, bounds.maxZ - r);
  if (x !== pos.x || z !== pos.z) { pos.x = x; pos.z = z; hit = true; }
  return hit;
}
