// City layout constants and the shared collision list.
// The city is a grid of NX x NZ blocks separated by roads; +x is east (the ocean), +z is south.

// Two cities share the engine: Vice City (The Sopranos) and Los Angeles (Heat). The page's ?city= picks one.
export const CITY = new URLSearchParams(location.search).get('city') === 'la' ? 'la' : 'vice';
export const NX = 16, NZ = 13, BLOCK = 60, ROAD = 16, CELL = BLOCK + ROAD, LANE = 3.6;
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
// piers (and the bridge) run out over the water: { minZ, maxZ, ramp (x where it leaves the land), deck (x where it is level), maxX (its far end), y, dir (1 east, -1 west) }.
// interiors are rooms built far out over the water; a player inside one is kept inside it. Each lists its `lights`.
export const lowGround = [], piers = [], interiors = [];
// Floors inside the rooms that are not at the usual level: an upper storey, a flight of stairs. Each is a rectangle
// { minX, maxX, minZ, maxZ, y } or, for stairs, { ..., y0, y1, from, to } rising along z from `from` to `to`.
export const floors = [];
// Lawns, patios and paths laid a little above the sidewalk, by block: { x, z, hx, hz, y }. Feet stand on the highest one under them.
export const raised = new Map();
export function raise(x, z, w, d, y, kind = 'pave') {
  const key = Math.floor((x - OX) / CELL) + ',' + Math.floor((z - OZ) / CELL);
  if (!raised.has(key)) raised.set(key, []);
  raised.get(key).push({ x, z, hx: w / 2, hz: d / 2, y, kind });
}
// What is underfoot at (x, z), for the sound of a step: 'sand' | 'wood' | 'road' | 'grass' | 'pave'.
export function surfaceAt(x, z) {
  for (const p of piers) { const s = p.dir || 1; if (z > p.minZ && z < p.maxZ && (x - p.ramp) * s > 0) return p.dir ? 'road' : 'wood'; } // the bridge is a road; the pier is boards
  if (x > SHORE + 4.6 || x < OX - ROAD / 2 || z < OZ - ROAD / 2 || z > OZ + NZ * CELL + ROAD / 2) return 'sand';
  const u = ((x - OX) % CELL + CELL) % CELL, v = ((z - OZ) % CELL + CELL) % CELL;
  if (u < ROAD / 2 || u > CELL - ROAD / 2 || v < ROAD / 2 || v > CELL - ROAD / 2) return 'road';
  let y = 0.14, kind = 'pave';
  const beds = raised.get(Math.floor((x - OX) / CELL) + ',' + Math.floor((z - OZ) / CELL));
  if (beds) for (const b of beds) if (b.y > y && Math.abs(x - b.x) < b.hx && Math.abs(z - b.z) < b.hz) { y = b.y; kind = b.kind; }
  return kind;
}
export const roomAt = (x, z, margin = 1) => interiors.find(q => x > q.minX - margin && x < q.maxX + margin && z > q.minZ - margin && z < q.maxZ + margin);
export function groundAt(x, z) {
  if (x > 2500) { // the rooms, out over the water: level, except where a house has an upstairs
    let y = -0.1;
    for (const f of floors) if (x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ) y = Math.max(y, f.y !== undefined ? f.y : f.y0 + (f.y1 - f.y0) * Math.max(0, Math.min(1, (z - f.from) / (f.to - f.from))));
    return y;
  }
  for (const p of piers) { // a pier or a bridge: up a ramp, then level; `dir` -1 runs west instead of east
    const s = p.dir || 1;
    if (z > p.minZ && z < p.maxZ && (x - p.ramp) * s > 0) return (x - p.deck) * s < 0 ? -0.1 + (p.y + 0.1) * (x - p.ramp) / (p.deck - p.ramp) : p.y;
  }
  if (x > SHORE) return x < SHORE + 4.6 ? 0.04 : -0.1;
  if (x < OX - ROAD / 2 || z < OZ - ROAD / 2 || z > OZ + NZ * CELL + ROAD / 2) return -0.1;
  const u = ((x - OX) % CELL + CELL) % CELL, v = ((z - OZ) % CELL + CELL) % CELL;
  if (u < ROAD / 2 || u > CELL - ROAD / 2 || v < ROAD / 2 || v > CELL - ROAD / 2) return 0;
  for (const g of lowGround) if (Math.abs(x - g.x) < g.half && Math.abs(z - g.z) < g.half) return 0.03;
  let y = 0.14;
  const beds = raised.get(Math.floor((x - OX) / CELL) + ',' + Math.floor((z - OZ) / CELL));
  if (beds) for (const b of beds) if (b.y > y && Math.abs(x - b.x) < b.hx && Math.abs(z - b.z) < b.hz) y = b.y;
  return y;
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
  // Inside a room, the walls are the limit.
  const room = roomAt(pos.x, pos.z);
  if (room) {
    const x = clamp(pos.x, room.minX + r, room.maxX - r), z = clamp(pos.z, room.minZ + r, room.maxZ - r);
    if (x !== pos.x || z !== pos.z) { pos.x = x; pos.z = z; hit = true; }
    return hit;
  }
  // The island's edge, except along a pier, which carries on over the water between its rails.
  const pier = piers.find(p => pos.z > p.minZ && pos.z < p.maxZ && (pos.x - p.ramp) * (p.dir || 1) > 0); // from the foot of its ramp: the bridge's ramp crosses the island's edge before it is level, and a car on it was stopped there as if by a wall
  const west = pier && pier.dir === -1;
  const out = pier && (west ? pos.x < bounds.minX + r : pos.x > bounds.maxX - r);
  const x = clamp(pos.x, (west ? pier.maxX : bounds.minX) + r, (pier && !west ? pier.maxX : bounds.maxX) - r);
  const z = out ? clamp(pos.z, pier.minZ + r, pier.maxZ - r) : clamp(pos.z, bounds.minZ + r, bounds.maxZ - r);
  if (x !== pos.x || z !== pos.z) { pos.x = x; pos.z = z; hit = true; }
  return hit;
}
