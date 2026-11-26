export const WORLD_BOUNDS = { minX: -128, maxX: 128, minZ: -128, maxZ: 128 };
export const PLAY_BOUNDS = { minX: -118, maxX: 118, minZ: -118, maxZ: 118 };

export const boundsWidth = (bounds) => bounds.maxX - bounds.minX;
export const boundsDepth = (bounds) => bounds.maxZ - bounds.minZ;
export const isInsideBounds = (bounds, x, z, margin = 0) => x >= bounds.minX + margin && x <= bounds.maxX - margin && z >= bounds.minZ + margin && z <= bounds.maxZ - margin;
