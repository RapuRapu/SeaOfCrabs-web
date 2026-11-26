export const PLAY_BOUNDS = { minX: -384, maxX: 384, minZ: -256, maxZ: 256 };
const WORLD_MARGIN = 10;
export const WORLD_BOUNDS = { minX: PLAY_BOUNDS.minX - WORLD_MARGIN, maxX: PLAY_BOUNDS.maxX + WORLD_MARGIN, minZ: PLAY_BOUNDS.minZ - WORLD_MARGIN, maxZ: PLAY_BOUNDS.maxZ + WORLD_MARGIN };

export const boundsWidth = (bounds) => bounds.maxX - bounds.minX;
export const boundsDepth = (bounds) => bounds.maxZ - bounds.minZ;
export const isInsideBounds = (bounds, x, z, margin = 0) => x >= bounds.minX + margin && x <= bounds.maxX - margin && z >= bounds.minZ + margin && z <= bounds.maxZ - margin;
