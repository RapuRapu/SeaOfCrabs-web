import { createNoise2D, createRandom, smoothstep, lerp } from '../noise.js';
import { CHANNEL, CHANNEL_COURSE, CROSSING_BAR, SIDE_BARS, SANDBAR, BOULDERS, HOLD } from './worldMap.js';
import { PLAY_BOUNDS } from './worldBounds.js';

const channelNoise = createNoise2D(211);
const BANK_WIDENING_PER_HEIGHT = 2.2;
const BEND_SENSITIVITY = 40;
const THALWEG_SHIFT_LIMIT = 0.35;
const BANK_ASYMMETRY = 0.3;
const THALWEG_DEPTH_LIMIT = -6.6;
const THALWEG_HALF_WIDTH_SHARE = 0.32;
const THALWEG_RAMP = 9;
const TIDAL_GROUND_ABOVE_SANDBAR = 1.2;
const ROCK_SEED = 4242;
const ROCK_SPACING = 13;
const ROCK_CHANCE = 0.6;
const ROCKS_SEAWARD_LIMIT_Z = 120;
const CROSSING_CLEARANCE = 10;
const CROSSING_TIDAL_MARGIN = 7;
const SIDE_BAR_TOP = -1.7;
const HOME_EDGE_X = 118;
const CHANNEL_REACH_MIN_X = HOME_EDGE_X;
const CHANNEL_REACH_MAX_X = 330;
const HOME_FADE_WIDTH = 16;

function hermiteCourse(points, z) {
  let index = 0;
  while (index < points.length - 2 && z > points[index + 1].z) index++;
  const slopeAt = (i) => {
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(points.length - 1, i + 1)];
    return (after.x - before.x) / (after.z - before.z);
  };
  const p1 = points[index];
  const p2 = points[index + 1];
  const span = p2.z - p1.z;
  const t = Math.min(1, Math.max(0, (z - p1.z) / span));
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1.x + (t3 - 2 * t2 + t) * span * slopeAt(index) + (-2 * t3 + 3 * t2) * p2.x + (t3 - t2) * span * slopeAt(index + 1);
}

const exactCenterAt = (z) => hermiteCourse(CHANNEL_COURSE, z) + CHANNEL.wander * channelNoise(z * 0.03, 1.7);
const TABLE_MIN_Z = PLAY_BOUNDS.minZ - 80;
const TABLE_MAX_Z = PLAY_BOUNDS.maxZ + 80;
const TABLE_STEP = 0.5;
const tableOf = (evaluate) => Float32Array.from({ length: Math.ceil((TABLE_MAX_Z - TABLE_MIN_Z) / TABLE_STEP) + 1 }, (_, index) => evaluate(TABLE_MIN_Z + index * TABLE_STEP));
const lookup = (table, z) => {
  const position = Math.min(table.length - 1.001, Math.max(0, (z - TABLE_MIN_Z) / TABLE_STEP));
  const index = Math.floor(position);
  return table[index] + (table[index + 1] - table[index]) * (position - index);
};
const centerTable = tableOf(exactCenterAt);
export const channelCenterAt = (z) => lookup(centerTable, z);
const CURVATURE_STENCIL = 24;
const exactCurvatureAt = (z) => (exactCenterAt(z + CURVATURE_STENCIL) - 2 * exactCenterAt(z) + exactCenterAt(z - CURVATURE_STENCIL)) / (CURVATURE_STENCIL * CURVATURE_STENCIL);
const bendTable = tableOf((z) => Math.tanh(exactCurvatureAt(z) * BEND_SENSITIVITY));
const curvatureAt = (z) => Math.atanh(Math.max(-0.999, Math.min(0.999, lookup(bendTable, z)))) / BEND_SENSITIVITY;
const lagoonBulgeAt = (z) => CHANNEL.lagoonExtraHalfWidth * Math.exp(-(((z - CHANNEL.lagoonZ) / CHANNEL.lagoonLength) ** 2));
const exactHalfWidthAt = (z) => (lerp(CHANNEL.inlandHalfWidth, CHANNEL.mouthHalfWidth, smoothstep(CHANNEL.mouthStartZ, CHANNEL.mouthFullZ, z)) + lagoonBulgeAt(z)) * (0.78 + 0.22 * channelNoise(z * 0.025, 0.5));
const halfWidthTable = tableOf(exactHalfWidthAt);
const halfWidthAt = (z) => lookup(halfWidthTable, z);

function frameAt(x, z) {
  const halfWidth = halfWidthAt(z);
  const bend = lookup(bendTable, z);
  const thalwegOffset = -bend * THALWEG_SHIFT_LIMIT * halfWidth;
  const across = x - channelCenterAt(z) + 3 * channelNoise(x * 0.09, z * 0.09);
  const fromThalweg = across - thalwegOffset;
  const innerness = bend * Math.tanh(fromThalweg / Math.max(1, halfWidth * 0.3));
  return { halfWidth, bend, thalwegOffset, across, fromThalweg, sideStretch: 1 + BANK_ASYMMETRY * innerness };
}

function distanceToPolyline(points, x, z) {
  let best = { distance: Infinity, along: 0 };
  let walked = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const t = Math.min(1, Math.max(0, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / (length * length)));
    const distance = Math.hypot(x - a.x - t * (b.x - a.x), z - a.z - t * (b.z - a.z));
    if (distance < best.distance) best = { distance, along: walked + t * length };
    walked += length;
  }
  return best;
}

let smoothCrossingPath = null;
const crossingPath = () => smoothCrossingPath || (smoothCrossingPath = smoothPath(CROSSING_BAR.path, 6));

function smoothPath(points, subdivisions) {
  const smooth = [];
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let step = 0; step < subdivisions; step++) {
      const t = step / subdivisions;
      const blend = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      smooth.push({ x: blend(p0.x, p1.x, p2.x, p3.x), z: blend(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  smooth.push(points[points.length - 1]);
  return smooth;
}

function crossingBarShareAt(x, z) {
  const { distance, along } = distanceToPolyline(crossingPath(), x, z);
  const halfWidth = CROSSING_BAR.halfWidth * (0.7 + 0.45 * channelNoise(along * 0.05, 7.7)) + 1.5 * channelNoise(x * 0.15, z * 0.15);
  return { share: 1 - smoothstep(halfWidth, halfWidth + CROSSING_BAR.rampLength, distance), along };
}

let resolvedSideBars = null;
const sideBars = () => resolvedSideBars || (resolvedSideBars = SIDE_BARS.map((bar) => ({ ...bar, side: Math.sign(curvatureAt(bar.z)) || 1 })));


function sideBarShareAt(x, z) {
  let share = 0;
  for (const bar of sideBars()) {
    const alongDistance = Math.abs(z - bar.z) / bar.halfLength + 0.25 * channelNoise(x * 0.04, z * 0.04 + 11);
    if (alongDistance > 1.3) continue;
    const frame = frameAt(x, bar.z);
    const anchorX = channelCenterAt(bar.z) + bar.side * frame.halfWidth * bar.anchorShare;
    const taper = 1 - smoothstep(0, 1.25, alongDistance);
    const reach = bar.reach * frame.halfWidth * taper * (0.75 + 0.4 * channelNoise(x * 0.05, z * 0.05));
    const acrossDistance = Math.abs(x - anchorX);
    share = Math.max(share, (1 - smoothstep(reach, reach + bar.rampLength, acrossDistance)) * taper);
  }
  return share;
}

export const sandbarCenterZAt = (x) => {
  let nearest = crossingPath()[0];
  for (const point of crossingPath()) if (Math.abs(point.x - x) < Math.abs(nearest.x - x)) nearest = point;
  return nearest.z;
};

export function channelInfluenceAt(x, z) {
  if (z < CHANNEL.inlandEndZ || x < CHANNEL_REACH_MIN_X || x > CHANNEL_REACH_MAX_X) return 0;
  const frame = frameAt(x, z);
  const edge = frame.halfWidth * frame.sideStretch + CHANNEL.bankWidth * 1.6;
  return 1 - smoothstep(edge * 0.75, edge * 1.25, Math.abs(frame.fromThalweg));
}

export function shapeChannel(x, z, height) {
  if (z < CHANNEL.inlandEndZ || x < CHANNEL_REACH_MIN_X || x > CHANNEL_REACH_MAX_X) return height;
  const frame = frameAt(x, z);
  const bankWidth = (CHANNEL.bankWidth + BANK_WIDENING_PER_HEIGHT * Math.max(0, height)) * (1 + 0.4 * channelNoise(z * 0.03, frame.across > 0 ? 5.1 : 8.4));
  const edge = frame.halfWidth * frame.sideStretch + bankWidth;
  const fromThalweg = Math.abs(frame.fromThalweg);
  let shaped = height;
  if (fromThalweg < edge) {
    const bowl = smoothstep(0.12, 1, fromThalweg / edge);
    shaped = lerp(Math.min(height, CHANNEL.floor + 0.6 * channelNoise(x * 0.08, z * 0.08)), height, bowl * bowl * (3 - 2 * bowl));
  }
  const sideBar = sideBarShareAt(x, z);
  if (sideBar > 0) shaped = Math.max(shaped, lerp(shaped, SIDE_BAR_TOP + 0.45 * channelNoise(x * 0.11, z * 0.13), sideBar));
  const crossing = crossingBarShareAt(x, z);
  if (crossing.share > 0) {
    const saddle = CROSSING_BAR.saddleDepth * (0.5 + 0.5 * Math.sin(crossing.along * CROSSING_BAR.saddleFrequency));
    shaped = Math.max(shaped, lerp(shaped, SANDBAR.top - saddle + 0.3 * channelNoise(x * 0.12, z * 0.2), crossing.share));
  }
  const thalwegCore = frame.halfWidth * THALWEG_HALF_WIDTH_SHARE + 2;
  const thalwegShare = (1 - smoothstep(thalwegCore, thalwegCore + THALWEG_RAMP, fromThalweg)) * (1 - crossing.share);
  if (thalwegShare > 0) shaped = lerp(shaped, Math.min(shaped, THALWEG_DEPTH_LIMIT - 0.4 * Math.abs(channelNoise(x * 0.1, z * 0.1))), thalwegShare);
  return lerp(height, shaped, smoothstep(HOME_EDGE_X, HOME_EDGE_X + HOME_FADE_WIDTH, x));
}

export function isTidalGround(x, z, height) {
  return height < SANDBAR.top + TIDAL_GROUND_ABOVE_SANDBAR && isNearCrossing(x, z, CROSSING_TIDAL_MARGIN);
}

export function isOnChannelThalweg(x, z) {
  if (z < CHANNEL.inlandEndZ) return false;
  const frame = frameAt(x, z);
  return Math.abs(frame.fromThalweg) < frame.halfWidth * THALWEG_HALF_WIDTH_SHARE;
}

export function thalwegPointAt(z) {
  const frame = frameAt(channelCenterAt(z), z);
  return { x: channelCenterAt(z) + frame.thalwegOffset, z };
}

export function isNearCrossing(x, z, margin = CROSSING_CLEARANCE) {
  return distanceToPolyline(crossingPath(), x, z).distance < CROSSING_BAR.halfWidth + margin;
}

export function channelRocks() {
  const random = createRandom(ROCK_SEED);
  const rocks = [];
  for (let z = PLAY_BOUNDS.minZ + 6; z < ROCKS_SEAWARD_LIMIT_Z; z += ROCK_SPACING) {
    for (const side of [-1, 1]) {
      if (random() > ROCK_CHANCE) continue;
      const rockZ = z + (random() - 0.5) * ROCK_SPACING;
      const offset = halfWidthAt(rockZ) * (1 + BANK_ASYMMETRY * side * Math.tanh(curvatureAt(rockZ) * BEND_SENSITIVITY)) + 2 + random() * CHANNEL.bankWidth * 0.7;
      const x = channelCenterAt(rockZ) + side * offset;
      const radius = 1.8 + random() * random() * 5;
      if (isNearCrossing(x, rockZ, radius + 6)) continue;
      if (Math.hypot(x - HOLD.x, rockZ - HOLD.z) < HOLD.halfLength + radius + 6) continue;
      if ([...BOULDERS, ...rocks].some((other) => Math.hypot(other.x - x, other.z - rockZ) < other.radius + radius + 2)) continue;
      rocks.push({ x, z: rockZ, radius, squash: 0.6 + random() * 0.3, seed: 100 + rocks.length });
    }
  }
  return rocks;
}
