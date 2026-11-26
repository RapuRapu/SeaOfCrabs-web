export const SHORE = { slope: 0.055, duneStartZ: -74, duneFullZ: -128, duneHeight: 6.5, duneVariation: 3.5, seaDropStartZ: 82, seaDropEndZ: 126, seaDrop: 7.5 };

export const POOLS = [
  { x: 18, z: 8, radiusX: 34, radiusZ: 26, floor: -3.5, crest: 0.2, seed: 3.1 },
  { x: -56, z: 34, radiusX: 14, radiusZ: 11, floor: -4.1, crest: -0.85, seed: 8.4 },
  { x: 78, z: 44, radiusX: 11, radiusZ: 9, floor: -4.4, crest: -1.3, seed: 12.7 },
  { x: -50, z: 80, radiusX: 12, radiusZ: 9, floor: -5.4, crest: -1.5, seed: 17.2, onReef: true },
  { x: 20, z: 97, radiusX: 10, radiusZ: 7.5, floor: -5.8, crest: -1.4, seed: 21.9, onReef: true },
  { x: 70, z: 68, radiusX: 9, radiusZ: 8, floor: -5.2, crest: -1.6, seed: 26.3, onReef: true },
  { x: -210, z: 12, radiusX: 16, radiusZ: 12, floor: -3.8, crest: -0.4, seed: 31.5 },
  { x: -322, z: 32, radiusX: 13, radiusZ: 10, floor: -4.2, crest: -0.9, seed: 36.1 },
  { x: 300, z: 24, radiusX: 14, radiusZ: 10, floor: -4.0, crest: -0.8, seed: 41.7 },
  { x: 352, z: 44, radiusX: 10, radiusZ: 8, floor: -4.4, crest: -1.2, seed: 47.3 },
  { x: -262, z: 122, radiusX: 11, radiusZ: 9, floor: -5.6, crest: -1.5, seed: 52.9, onReef: true },
  { x: -336, z: 152, radiusX: 10, radiusZ: 8, floor: -5.8, crest: -1.6, seed: 58.4, onReef: true },
];

export const REEF_INNER_EDGE_Z = 54;
export const REEF_OUTER_EDGE_Z = 106;
export const REEF_DROP_LENGTH = 3;
export const REEF_EDGE_RAGGEDNESS = 3.2;
export const REEF_FLAT_HEIGHT = -2.8;
export const REEF_HIGHEST = -1.2;
export const WEST_REEF = { startX: -130, fullX: -210, extraReach: 84 };
export const DEEP_REEF = { startZ: 125, fullZ: 150, extraDepth: 1.2 };

export const CHANNEL = { centerX: 192, wiggle: 10, halfWidth: 20, bankWidth: 18, floor: -8, inlandEndZ: -300 };
export const SANDBAR = { z: 22, halfLength: 7, rampLength: 5, top: -2.0, openBelowTop: 0.4 };

export const BOULDERS = [
  { x: -34, z: -52, radius: 10.5, squash: 0.74, seed: 1 },
  { x: -46, z: -44, radius: 6.2, squash: 0.8, seed: 2 },
  { x: -25, z: -60, radius: 4.4, squash: 0.7, seed: 3 },
  { x: -18, z: 16, radius: 7.5, squash: 0.7, seed: 4 },
  { x: -10, z: 27, radius: 4.6, squash: 0.62, seed: 5 },
  { x: 52, z: -6, radius: 8.6, squash: 0.78, seed: 6 },
  { x: 58, z: 8, radius: 5.2, squash: 0.66, seed: 7 },
  { x: 30, z: 38, radius: 6.4, squash: 0.6, seed: 8 },
  { x: 8, z: -20, radius: 4.8, squash: 0.64, seed: 9 },
  { x: 22, z: 6, radius: 3.6, squash: 0.7, seed: 10 },
  { x: -70, z: 6, radius: 7.8, squash: 0.72, seed: 11 },
  { x: -62, z: 50, radius: 5.4, squash: 0.6, seed: 12 },
  { x: 84, z: 30, radius: 6.8, squash: 0.74, seed: 13 },
  { x: 96, z: -40, radius: 9.4, squash: 0.8, seed: 14 },
  { x: 40, z: 78, radius: 8.8, squash: 0.85, seed: 15 },
  { x: -20, z: 88, radius: 11.5, squash: 0.9, seed: 16 },
  { x: -92, z: 74, radius: 9.2, squash: 0.85, seed: 17 },
  { x: -256, z: -170, radius: 6.6, squash: 0.76, seed: 19 },
  { x: 104, z: 84, radius: 12.5, squash: 0.95, seed: 20 },
  { x: -168, z: -30, radius: 9.6, squash: 0.78, seed: 21 },
  { x: -196, z: 40, radius: 6.2, squash: 0.66, seed: 22 },
  { x: -238, z: -64, radius: 7.4, squash: 0.74, seed: 23 },
  { x: -298, z: 6, radius: 10.8, squash: 0.82, seed: 24 },
  { x: -352, z: -48, radius: 8.2, squash: 0.76, seed: 25 },
  { x: -288, z: 92, radius: 9.6, squash: 0.88, seed: 26 },
  { x: 248, z: -10, radius: 8.8, squash: 0.76, seed: 27 },
  { x: 334, z: 60, radius: 7.2, squash: 0.7, seed: 28 },
  { x: 360, z: -96, radius: 10.4, squash: 0.8, seed: 29 },
  { x: 152, z: 30, radius: 6.8, squash: 0.68, seed: 30 },
  { x: 160, z: 9, radius: 3.2, squash: 0.95, seed: 31 },
  { x: 160, z: 35, radius: 3.2, squash: 0.95, seed: 32 },
  { x: 234, z: 9, radius: 3.2, squash: 0.95, seed: 33 },
  { x: 234, z: 35, radius: 3.2, squash: 0.95, seed: 34 },
];

export const DRIFT_LOGS = [
  { x: 28, z: -58, length: 44, radius: 3.1, heading: 0.32, seed: 5 },
  { x: -66, z: -22, length: 28, radius: 2.2, heading: -0.9, seed: 9 },
  { x: -260, z: -40, length: 36, radius: 2.8, heading: 0.5, seed: 13 },
  { x: 318, z: -22, length: 30, radius: 2.4, heading: -0.4, seed: 17 },
];

export const LEGACY_RELOCATIONS = [
  { name: 'camp', from: { x: -88, z: -62 }, radius: 52, dx: -172, dz: -108 },
  { name: 'hold', from: { x: 74, z: -66 }, radius: 50, dx: 216, dz: 6 },
  { name: 'lobster', from: { x: -62, z: 96 }, radius: 22, dx: -188, dz: 64 },
];
const relocation = (name) => LEGACY_RELOCATIONS.find((entry) => entry.name === name);
const moved = (name) => (point) => ({ ...point, x: point.x + relocation(name).dx, z: point.z + relocation(name).dz });

export function relocateLegacyPoint(x, z) {
  const entry = LEGACY_RELOCATIONS.find((candidate) => Math.hypot(x - candidate.from.x, z - candidate.from.z) < candidate.radius);
  return entry ? { x: x + entry.dx, z: z + entry.dz } : { x, z };
}

export const LOBSTER_LAIR = moved('lobster')({ x: -62, z: 96, territoryRadius: 13 });
export const REEF_PROP_KEEP_CLEAR = [{ x: 14, z: 57, radius: 5 }, { x: LOBSTER_LAIR.x, z: LOBSTER_LAIR.z, radius: 9 }];
export const CAMP = moved('camp')({ x: -88, z: -62, radius: 36, backEdgeOffset: -29 });
export const CAT_LAIR = moved('camp')({ x: -97, z: -63, territoryRadius: 17 });

export const CAMP_PROPS = [
  { kind: 'campfire', x: -101, z: -46, radius: 8 },
  { kind: 'barrel', x: -68, z: -76, radius: 6, height: 18 },
  { kind: 'barrelLying', x: -60, z: -52, radius: 5.5, length: 17, heading: 0.5 },
  { kind: 'crate', x: -112, z: -72, size: 13, heading: 0.25 },
  { kind: 'bottle', x: -79, z: -40, length: 7, radius: 1.6, heading: 1.1 },
  { kind: 'bottle', x: -66, z: -86, length: 7, radius: 1.6, heading: -0.4 },
  { kind: 'cutlass', x: -67, z: -37, height: 17, heading: 0.3 },
  { kind: 'boot', x: -113, z: -45, length: 14, heading: 0.9 },
  { kind: 'hat', x: -90, z: -35, radius: 7.5, heading: 0.6 },
  { kind: 'tent', x: -99, z: -93, width: 42, height: 22, heading: 0 },
  { kind: 'chest', x: -103, z: -70, width: 12, depth: 8, height: 7, heading: -0.35 },
  { kind: 'rope', x: -55, z: -66, radius: 5 },
].map(moved('camp'));

export const HOLD = moved('hold')({ x: 74, z: -66, halfLength: 42, halfWidth: 28, entranceAngle: Math.PI * 0.6, entranceHalfAngle: 0.22 });
export const COOK_SPOT = moved('hold')({ x: 101, z: -60, territoryRadius: 20 });

export const HOLD_PROPS = [
  { kind: 'crate', x: 47, z: -78, size: 9, heading: 0.4 },
  { kind: 'crate', x: 60, z: -86, size: 7, heading: -0.2 },
  { kind: 'sack', x: 44, z: -57, radius: 3.6, heading: 0.3 },
  { kind: 'sack', x: 53, z: -48, radius: 3.2, heading: 1.2 },
  { kind: 'sack', x: 80, z: -84, radius: 3.4, heading: 2.0 },
  { kind: 'barrel', x: 92, z: -86, radius: 4.2, height: 12 },
  { kind: 'lantern', x: 71, z: -66, height: 16 },
  { kind: 'hearth', x: 107, z: -75, radius: 5 },
  { kind: 'choppingBlock', x: 89, z: -46, radius: 3.4 },
  { kind: 'fishBones', x: 59, z: -63, length: 8, heading: 0.8 },
  { kind: 'onions', x: 66, z: -80, radius: 2.2 },
].map(moved('hold'));

export const GULL_PERCHES = [{ x: 0, z: -100 }, { x: -236, z: -112 }];
export const CAMP_FLAT = { innerShare: 0.9, outerShare: 1.35 };
