export const SHORE = { slope: 0.055, duneStartZ: -74, duneFullZ: -128, duneHeight: 6.5, duneVariation: 3.5, seaDropStartZ: 82, seaDropEndZ: 126, seaDrop: 7.5 };

export const POOLS = [
  { x: 18, z: 8, radiusX: 34, radiusZ: 26, floor: -3.5, crest: 0.2, seed: 3.1 },
  { x: -56, z: 34, radiusX: 14, radiusZ: 11, floor: -4.1, crest: -0.85, seed: 8.4 },
  { x: 78, z: 44, radiusX: 11, radiusZ: 9, floor: -4.4, crest: -1.3, seed: 12.7 },
  { x: -50, z: 80, radiusX: 12, radiusZ: 9, floor: -5.4, crest: -1.5, seed: 17.2, onReef: true },
  { x: 20, z: 97, radiusX: 10, radiusZ: 7.5, floor: -5.8, crest: -1.4, seed: 21.9, onReef: true },
  { x: 70, z: 68, radiusX: 9, radiusZ: 8, floor: -5.2, crest: -1.6, seed: 26.3, onReef: true },
];

export const REEF_INNER_EDGE_Z = 54;
export const REEF_OUTER_EDGE_Z = 106;
export const REEF_DROP_LENGTH = 3;
export const REEF_EDGE_RAGGEDNESS = 3.2;
export const REEF_FLAT_HEIGHT = -2.8;
export const REEF_HIGHEST = -1.2;

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
  { x: -84, z: -62, radius: 6.6, squash: 0.76, seed: 19 },
  { x: 104, z: 84, radius: 12.5, squash: 0.95, seed: 20 },
];

export const DRIFT_LOGS = [
  { x: 28, z: -58, length: 44, radius: 3.1, heading: 0.32, seed: 5 },
  { x: -66, z: -22, length: 28, radius: 2.2, heading: -0.9, seed: 9 },
];

export const LOBSTER_LAIR = { x: -62, z: 96, territoryRadius: 13 };
export const REEF_PROP_KEEP_CLEAR = [{ x: 14, z: 57, radius: 5 }, { x: LOBSTER_LAIR.x, z: LOBSTER_LAIR.z, radius: 9 }];
export const CAMP = { x: -88, z: -62, radius: 36 };
export const CAT_LAIR = { x: -97, z: -63, territoryRadius: 17 };

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
];

export const HOLD = { x: 74, z: -66, halfLength: 42, halfWidth: 28, entranceAngle: Math.PI * 0.6, entranceHalfAngle: 0.22 };
export const COOK_SPOT = { x: 101, z: -60, territoryRadius: 20 };

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
];
