import * as THREE from 'three';
import { attackOf, defenseOf, levelOf, labelOf, canLoot, takeFrom, giveUpLoot, lootedItems, serializeLooters, restoreLooters } from './looting.js';
import { createPerformanceMonitor } from '../performance.js';
import { QUALITY_LEVELS, chosenQualityName, storeQualityName } from './quality.js';
import { seaUniforms, SEA_COMMON_GLSL, lighting, cutawayUniforms } from './seaside.js';
import { createNoiseTexture, createWaveGradientTexture } from './textures.js';
import { createWorld, TIDE_MIDDLE, TIDE_AMPLITUDE, TIDE_PERIOD_SECONDS, HOME_BEACH_ENEMIES, REEF_ENEMIES, CAMP_ENEMIES, CAMP, isInCamp, HOLD_ENEMIES, HOLD, isInHold, PLAY_HALF_SIZE } from './world.js';
import { createPipeline } from './pipeline.js';
import { createWater } from './water.js';
import { createProps } from './props.js';
import { createReefProps } from './reef.js';
import { createCampProps } from './camp.js';
import { createHoldProps } from './hold.js';
import { createLife } from './life.js';
import { createHermit } from './hermit.js';
import { loadCrabAsset } from './hermitAsset.js';
import { loadCreatureAssets } from './creatureAssets.js';
import { createNavigation } from './navigation.js';
import { createResources, RESOURCE_TYPES } from './resources.js';
import { createHud } from './hud.js';
import { createTracks } from './tracks.js';
import { createRipples } from './ripples.js';
import { CONSUMABLES, QUICK_SLOT_COUNT } from './consumables.js';
import { createGear, SHELLS, CLAWS, QUALITIES, REINFORCEMENTS, qualityFactor, shellDefenseOf, canAfford, BOSS_TROPHIES, MINIBOSS_MATERIALS, BOSS_MATERIAL_DROP, BOSS_ITEM_CHANCE, gearGlowLook, normalizeItem, HAND_LABELS, carryCapacity, shieldArmourOf, crabSizeOf, sizeLabel, GROWTH_PER_MOLT, shellFit, MOLTS_PER_SIZE } from './gear.js';
import { createWorkbenchModel, createWorkbenchPanel } from './workbench.js';
import { createBackpackPanel } from './backpack.js';
import { createStatusPanel } from './statusPanel.js';
import { createProgression, experienceForKill, experienceForLevel, MAX_LEVEL, difficultyOf, GATHER_EXPERIENCE, MOLT_KINDS, MOLT_SECONDS, SOFT_SECONDS, SOFT_DEFENSE_FACTOR } from './progression.js';
import { createMoltPanel } from './moltPanel.js';
import { createEnemies, ENEMY_KINDS } from './enemies.js';
import { createRemains, REMAINS_REACH } from './remains.js';
import { random, randomSource } from './random.js';
import { createAudio } from './audio.js';
import { createBurrow, loadBurrowModels, createEmptyBurrow, BURROW_LAYER, BURROW_ORIGIN, ENTRANCE_REACH, ENTRANCE_BLOCK_RADIUS, STATION_KINDS, STATION_REACH, SHAFT_CELL, SHAFT_ACCESS_ROW_STEP, BURROW_CELL, cellCenter } from './burrow.js';
import { createThumbnails } from './thumbnails.js';
import { createBuildPanel, createStoragePanel, createHelpersPanel, createRackPanel, createProcessPanel, createBoardPanel, createBedPanel } from './burrowPanels.js';
import { PROCESS_RECIPES, isProcessStation, loadStation, collectStation, tickStations, processView } from './processing.js';
import { createRack, RACK_BATCH, RACK_DRY_SECONDS, RACK_REACH, RACK_BLOCK_RADIUS, rackInputIn } from './rack.js';
import { createHelpers, HELPER_LIMIT, helperStats, helperMaxHealth, HELPER_MEAL_SECONDS, SATCHEL_LOAD, SATCHEL_CORD_COST } from './helpers.js';
import { itemName } from './itemInfo.js';
import { createFog } from './fog.js';
import { createMapView } from './mapView.js';

const searchParameters = new URLSearchParams(location.search);
const screenshotPose = searchParameters.has('pose') ? Number(searchParameters.get('pose')) : null;
const isScreenshotMode = screenshotPose !== null;
const qualityName = chosenQualityName(searchParameters);
const quality = QUALITY_LEVELS[qualityName];

const SAVE_KEY = 'seaofcrabs-crab-save';
const SAVE_VERSION = 6;
const CLAW_GROWTH_PER_MOLT = 0.05;
const AUTOSAVE_INTERVAL_SECONDS = 5;
const FIXED_STEP = 1 / 60;
const CAMERA_YAW = 0.3;
const PORTRAIT_LEAD_SHARE = 0.9;
const PLAYER_RING_DANGER_DISTANCE = 6;
const CAMERA_PITCH = 0.74;
const CAMERA_DISTANCE_LIMITS = [13, 85];
const LANDSCAPE_FIELD_OF_VIEW = 28;
const MINIMUM_HORIZONTAL_FIELD_OF_VIEW = 25;
const WALK_SPEED = 7.2;
const WADE_SPEED = 5.2;
const TURN_RATE = 9;
const GATHER_REACH = 2.5;
const PICK_RADIUS_PIXELS = 46;
const DRAG_START_PIXELS = 14;
const CURRENT_TARGET_CORE_SHARE = 0.5;
const SURFACE_CAMERA_DISTANCE = 32;
const BURROW_FRAMED_WIDTH = 11;
const BURROW_FRAMED_DEPTH = 17;
const TRAVEL_REACH_SURFACE = ENTRANCE_REACH + 0.6;
const STARTING_TIDE_TIME = TIDE_PERIOD_SECONDS * 0.56;
const WET_SAND_DRYING_RATE = 0.006;
const HOME_SPOT = { x: 13, z: -21 };
const STARTING_REVEAL_RADIUS = 34;
const STARTING_BEACH_REVEAL_RADIUS = 70;
const WORKSHOP_SPOT = { x: 18, z: -17 };
const FIRST_GOAL = { shellBits: 5, driftwood: 3, seaLettuce: 3 };
const REEF_VIEW_THRESHOLD_Z = 42;
const CAMP_VIEW_MARGIN = 30;
const HOLD_VIEW_MARGIN = 5;
const HOLD_VIEW_HEIGHT = 48;
const HOLD_RIM_SAMPLES = 48;
const HOLD_RIM_POINTS = Array.from({ length: HOLD_RIM_SAMPLES * 2 }, (_, index) => {
  const angle = ((index % HOLD_RIM_SAMPLES) / HOLD_RIM_SAMPLES) * Math.PI * 2;
  return new THREE.Vector3(HOLD.x + Math.cos(angle) * (HOLD.halfLength + HOLD_VIEW_MARGIN), index < HOLD_RIM_SAMPLES ? 0 : HOLD_VIEW_HEIGHT, HOLD.z + Math.sin(angle) * (HOLD.halfWidth + HOLD_VIEW_MARGIN));
});
const viewFrustum = new THREE.Frustum();
const frustumMatrix = new THREE.Matrix4();
const REEF_VIEW_REACH_PER_DISTANCE = 1.6;
const STARTER_SPOTS = { shellBits: { x: 11, z: -26.5 }, driftwood: { x: 17.5, z: -23 }, seaLettuce: { x: 12, z: -14 }, coral: { x: 14, z: 57 }, scrap: { x: -74, z: -34 }, fishBone: { x: 79, z: -55 } };
const FAR_ZOOM_RING_DISTANCES = [46, 66];
const STARTING_HEADING = 2.3;
const BODY_WET_MINIMUM_DEPTH = 0.04;
const BODY_WET_MAXIMUM_HEIGHT_PER_SIZE = 2.0;
const BODY_DRYING_SECONDS = 30;
const PLAYER_ATTACK_REACH = 1.25;
const CAMERA_GROWTH_PER_MOLT = 0.04;
const SHELL_SCALE_PER_SIZE_STEP = GROWTH_PER_MOLT * MOLTS_PER_SIZE;
const SHELL_MIN_FIT_SCALE = 0.55;
const SPEED_GROWTH_PER_MOLT = 0.02;
const PLAYER_ATTACK_INTERVAL = 0.9;
const BOSS_REST_MS = 24 * 3600000;
const COMMON_DROP_CHANCE = 0.35;
let wallClockOffsetMs = 0;
const wallClock = () => Date.now() + wallClockOffsetMs;
const PLAYER_FIRST_STRIKE_SECONDS = 0.3;
const COMBAT_REPATH_SECONDS = 0.4;
const DAMAGE_SPREAD = 0.15;
const HEALTH_REGEN_DELAY_SECONDS = 5;
const HEALTH_REGEN_PER_SECOND = 1;
const BRACE_DAMAGE_FACTOR = 0.7;
const BRACE_MAXIMUM_SPEED = 0.5;
const STING_EVERY_HITS = 4;
const RESPAWN_CALM_SECONDS = 4;
const DEATH_ANIMATION_SECONDS = 1.1;
const KNOCKBACK_DISTANCE = 0.3;
const STRIKING_RANGE_TOLERANCE = 0.45;
const ITEM_LIFT_START_SHARE = 0.55;
const AUDIO_SETTINGS_KEY = 'seaofcrabs-audio';
const STEP_LENGTH = 0.6;
const HEAD_UNDERWATER_DEPTH = 1.9;
const AMBIENCE_UPDATE_SECONDS = 0.3;
const GULL_MOOD_EDGE_Z = -85;
const FISH_PLOP_PER_SECOND = 0.15;
const ENTRANCE_DIG_SECONDS = 2.5;
const WELL_FED_SECONDS = 90;
const WELL_FED_REGEN_FACTOR = 2;
const BURROW_DIG_REACH = 2.4;
const ENTRANCE_CONFIRM_RADIUS = 2.2;
const ENTRANCE_CLEARANCE = 3;
const ENTRANCE_HIGH_TIDE_MARGIN = 0.35;
const DEFAULT_WORKSHOP_CELL = { column: 6, row: 5 };
const LEGACY_HELPER_CELL = { column: 4, row: 6 };
const DEFAULT_STORAGE_CELL = { column: 4, row: 5 };
const BURROW_BACKGROUND = new THREE.Color(0.05, 0.035, 0.025);
const BURROW_FOG_DENSITY = 0.026;
const BURROW_FOG_REFERENCE_DISTANCE = 20;
const BURROW_SUN_INTENSITY = 1.5;
const BURROW_ENVIRONMENT_INTENSITY = 0.34;
const SURFACE_SUN_INTENSITY = 4.2;
const SURFACE_ENVIRONMENT_INTENSITY = 0.55;

const POSES = {
  1: { x: HOME_SPOT.x, z: HOME_SPOT.z, distance: 32, tideShare: 0.56 },
  2: { x: 36, z: 46, distance: 36, tideShare: 0.5, heading: 0.2 },
  3: { x: 12, z: 4, distance: 22, tideShare: 0.75, heading: 0.9 },
  4: { x: 2, z: -24, distance: 40, tideShare: 0.25, heading: 0.2 },
  5: { x: -30, z: -78, distance: 30, tideShare: 0.5, heading: 3.4 },
  6: { x: HOME_SPOT.x, z: HOME_SPOT.z, distance: 13, tideShare: 0.56, heading: 2.6 },
  7: { x: -30, z: 40, distance: 36, tideShare: 0.75, heading: 0.3 },
  8: { x: HOME_SPOT.x, z: HOME_SPOT.z, distance: 32, tideShare: 0.75 },
  9: { x: 10, z: -6, distance: 85, tideShare: 0.6 },
  10: { x: 21, z: -29, distance: 24, tideShare: 0.56, heading: 0.2 },
  11: { x: 12, z: -8, distance: 14, tideShare: 0.56, walkFrom: { x: -1, z: -8 }, walkSeconds: 1.6 },
  12: { x: 13, z: -17, distance: 13, tideShare: 0.56, walkFrom: { x: 4, z: -7 }, walkSeconds: 1.8, heading: 1.3 },
  13: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true },
  14: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Craft', inventory: { shellBits: 12, driftwood: 3, seaLettuce: 5 } },
  15: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, shell: 'snail' },
  16: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, shell: 'turban' },
  17: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, shell: 'cone' },
  18: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, backpack: true, crafted: ['turban', 'cone'] },
  20: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.9, workshop: true, backpack: true, crafted: ['turban', 'cone'] },
  21: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, crafted: ['turban'] },
  19: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Craft', inventory: { shellBits: 12, driftwood: 3, seaLettuce: 5 } },
  22: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, naked: true },
  23: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.9, workshop: true, naked: true, remainsAt: { x: 24, z: -12 } },
  29: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, naked: true, remainsAt: { x: -20, z: -40 } },
  31: { x: 11, z: -24, distance: 11, tideShare: 0.56, heading: 2.6, gather: { type: 'shellBits', share: 0.8 } },
  32: { x: -1, z: -6, distance: 13, tideShare: 0.75, heading: 0.4, enemy: { kind: 'shoreCrab', offsetX: -2.8, offsetZ: 0.6 }, fightSeconds: 1.2, moment: 'strike' },
  33: { x: -1, z: -6, distance: 13, tideShare: 0.75, heading: 0.4, enemy: { kind: 'shoreCrab', offsetX: -2.8, offsetZ: 0.6 }, fightSeconds: 1.2, moment: 'hurt' },
  34: { x: -1, z: -6, distance: 13, tideShare: 0.75, heading: 0.4, enemy: { kind: 'shoreCrab', offsetX: -2.8, offsetZ: 0.6 }, fightSeconds: 1.2, moment: 'enemyHurt' },
  35: { x: 6, z: 2, distance: 14, tideShare: 0.75, heading: 0.6, nearAnemone: true },
  36: { x: 30, z: -40, distance: 13, tideShare: 0.56, heading: 0.5, enemy: { kind: 'sandHopper', offsetX: -2.4, offsetZ: 0.8 }, fightSeconds: 0.6, moment: 'dying' },
  37: { x: 12, z: -14, distance: 11, tideShare: 0.56, heading: 2.6, gather: { type: 'seaLettuce', share: 0.5 } },
  38: { x: 0, z: -104, distance: 34, tideShare: 0.56, heading: 3.2, level: 6, enemy: { kind: 'gull', offsetX: -2, offsetZ: -5.5 }, fightSeconds: 2.2, moment: 'enemyHurt' },
  39: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, outfit: { shell: 'cone', claws: 'shellEdged', quality: 'crude' } },
  40: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, outfit: { shell: 'turban', claws: 'shellEdged', quality: 'fine', reinforcement: 'coralCrust', binding: 'kelp' } },
  41: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, outfit: { shell: 'cone', claws: 'shellEdged', quality: 'masterwork' } },
  42: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Improve', outfit: { shell: 'turban', claws: 'shellEdged', quality: 'fine' }, inventory: { pearls: 2, shellBits: 9 }, expandImprove: true },
  43: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Improve', outfit: { shell: 'turban', claws: 'shellEdged', quality: 'fine' }, inventory: { pearls: 2, shellBits: 9 }, expandImprove: true },
  44: { x: 22, z: -14, distance: 14, tideShare: 0.56, heading: 1.2, naked: true, remainsAt: { x: 24, z: -12 }, remainsQuality: 'masterwork' },
  45: { x: 21, z: -24, distance: 22, tideShare: 0.56, heading: 0.9, burrowAt: { x: 24, z: -21 } },
  46: { x: 15, z: -20, distance: 24, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], dug: [[3, 5], [3, 4], [7, 5]], inBurrow: true },
  47: { x: 15, z: -20, distance: 24, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop'], dug: [[3, 5]], inBurrow: true, placingStation: 'storage' },
  48: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], inBurrow: true, crafted: ['turban', 'cone'], inventory: { shellBits: 7, driftwood: 2, pearls: 1 }, stored: { seaLettuce: 6, shellBits: 12 }, storagePanel: true },
  49: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], dug: [[3, 5], [3, 4]], inBurrow: true },
  50: { x: 21, z: -24, distance: 26, tideShare: 0.56, heading: 0.9, placingEntrance: true, previewEntrance: { x: 25, z: -19 } },
  51: { x: 20, z: -26, distance: 30, tideShare: 0.56, heading: 0.9, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], helpers: ['shellBits', 'driftwood', 'seaLettuce'], simulateSeconds: 5 },
  52: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], helpers: ['shellBits', 'seaLettuce'], inBurrow: true, simulateSeconds: 2, inventory: { seaLettuce: 6 }, helpersPanel: true },
  53: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], helpers: ['shellBits', 'driftwood', 'seaLettuce'], helpersResting: true, inBurrow: true },
  54: { x: 22, z: -24, distance: 24, tideShare: 0.56, heading: 0.9, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], rack: { slots: [0.25, 0.75, null], ready: 1 } },
  55: { x: 22, z: -24, distance: 24, tideShare: 0.56, heading: 0.9, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], rack: { slots: [0.25, 0.75, null], ready: 2 }, inventory: { seaLettuce: 4 }, rackPanel: true },
  56: { x: 22, z: -24, distance: 24, tideShare: 0.56, heading: 0.9, inventory: { driedKelp: 3, seaLettuce: 2 }, wellFed: true, backpack: true },
  57: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Craft', inventory: { shellBits: 10, driedKelp: 4, driftwood: 4 }, scrollPanel: true },
  58: { x: 14, z: 44, distance: 75, tideShare: 0.75, heading: 0 },
  59: { x: 8, z: 72, distance: 28, tideShare: 0.75, heading: 0.5 },
  60: { x: 8, z: 72, distance: 28, tideShare: 0.56, heading: 0.5 },
  61: { x: 12, z: 90, distance: 26, tideShare: 0.75, heading: 1 },
  62: { x: 10, z: 53, distance: 18, tideShare: 0.75, heading: 0.6 },
  63: { x: HOME_SPOT.x, z: HOME_SPOT.z, distance: 32, tideShare: 0.75, workshop: true, crafted: ['snail'] },
  64: { x: -30, z: 98, distance: 30, tideShare: 0.75, heading: 0.3 },
  65: { x: 8, z: 72, distance: 30, tideShare: 0.75, heading: 0.5 },
  66: { x: -1.6, z: 66.6, distance: 20, tideShare: 0.75, heading: -1.2, level: 8, enemy: { kind: 'moray', offsetX: -2.6, offsetZ: 1.8 }, fightSeconds: 0.9 },
  67: { x: 10, z: 80, distance: 22, tideShare: 0.75, heading: 0.4, level: 8, enemy: { kind: 'octopus', offsetX: 2.5, offsetZ: 2.5 }, fightSeconds: 5.2 },
  74: { x: 10, z: 80, distance: 22, tideShare: 0.75, heading: 0.4, level: 8, enemy: { kind: 'octopus', offsetX: 2.5, offsetZ: 2.5 }, fightSeconds: 4.5 },
  75: { workshop: true, reefFound: true, crafted: ['snail', 'coral'], x: -78, z: -40, distance: 60, tideShare: 0.56, heading: 3.6 },
  76: { workshop: true, reefFound: true, crafted: ['snail', 'coral'], x: -84, z: -48, distance: 30, tideShare: 0.56, heading: 3.4 },
  77: { workshop: true, reefFound: true, crafted: ['snail', 'coral'], x: -70, z: -60, distance: 24, tideShare: 0.56, heading: 3.2, level: 10, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'fine' }, enemy: { kind: 'rat', offsetX: -2, offsetZ: -3 }, fightSeconds: 1.2 },
  78: { workshop: true, reefFound: true, crafted: ['snail', 'coral'], x: -95, z: -54, distance: 34, tideShare: 0.56, heading: 3.0, level: 10, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork' }, enemy: { kind: 'shipCat', offsetX: -2, offsetZ: 6.5 }, fightSeconds: 5.4 },
  79: { workshop: true, reefFound: true, crafted: ['snail', 'coral'], x: -95, z: -54, distance: 40, tideShare: 0.56, heading: 3.0, level: 10, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork' }, enemy: { kind: 'shipCat', offsetX: -2, offsetZ: 6.5 }, fightSeconds: 6.5 },
  80: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'fine' } },
  81: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, outfit: { shell: 'whelk', claws: 'coralTipped', quality: 'fine' } },
  82: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Craft', inventory: { shellBits: 14, coral: 12, seaGlass: 9, scrap: 10, cloth: 6, driftwood: 3 }, scrollPanel: true },
  83: { x: -20, z: -30, distance: 30, tideShare: 0.56, workshop: true, reefFound: true, crafted: ['snail', 'coral'] },
  84: { workshop: true, reefFound: true, campFound: true, crafted: ['snail', 'coral'], x: 65, z: -36, distance: 80, tideShare: 0.56, heading: 3.4 },
  85: { workshop: true, reefFound: true, campFound: true, crafted: ['snail', 'coral'], x: 80, z: -63, distance: 30, tideShare: 0.56, heading: 2.2, level: 10, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'fine' } },
  86: { workshop: true, reefFound: true, campFound: true, crafted: ['snail', 'coral'], x: 62, z: -69, distance: 24, tideShare: 0.56, heading: 1.6, level: 10, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'fine' }, enemy: { kind: 'cockroach', offsetX: 3, offsetZ: -2 }, fightSeconds: 1.1 },
  87: { workshop: true, reefFound: true, campFound: true, crafted: ['snail', 'coral'], x: 83, z: -63, distance: 34, tideShare: 0.56, heading: 1.6, level: 10, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork' }, enemy: { kind: 'cook', offsetX: 12, offsetZ: 2 }, fightSeconds: 0.9 },
  88: { workshop: true, reefFound: true, campFound: true, crafted: ['snail', 'coral'], x: 83, z: -63, distance: 40, tideShare: 0.56, heading: 1.6, level: 10, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork' }, enemy: { kind: 'cook', offsetX: 12, offsetZ: 2 }, fightSeconds: 0.9 },
  89: { workshop: true, reefFound: true, campFound: true, crafted: ['snail', 'coral'], x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'fine' } },
  90: { workshop: true, reefFound: true, campFound: true, crafted: ['snail', 'coral'], x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, outfit: { shell: 'whelk', claws: 'coralTipped', quality: 'fine' } },
  91: { x: 40, z: -40, distance: 30, tideShare: 0.56, workshop: true, reefFound: true, campFound: true, crafted: ['snail', 'coral'] },
  93: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork' } },
  94: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork' } },
  95: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork' } },
  96: { workshop: true, reefFound: true, campFound: true, crafted: ['snail', 'coral'], x: -96, z: -76, distance: 30, tideShare: 0.56, heading: 0.2, level: 10, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'fine' }, restingBosses: ['shipCat'] },
  97: { x: 24, z: -27, distance: 40, tideShare: 0.56, heading: 1.75, outfit: { shell: 'coral', claws: 'cleaver', quality: 'masterwork' } },
  98: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, backpack: true, crafted: ['snail'], outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork' }, extraGear: [{ category: 'shell', kind: 'coral', quality: 'masterwork' }, { category: 'shell', kind: 'coral' }, { category: 'claws', kind: 'cleaver', quality: 'masterwork' }, { category: 'claws', kind: 'coralTipped', quality: 'fine' }, { category: 'claws', kind: 'shellEdged' }, { category: 'shell', kind: 'whelk', quality: 'masterwork' }], inventory: { shellBits: 14, driftwood: 6, coral: 5, scrap: 9, pearls: 3, driedKelp: 2, catWhisker: 2 }, selectSlot: 1 },
  99: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.9, workshop: true, backpack: true, crafted: ['snail'], outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork' }, extraGear: [{ category: 'shell', kind: 'coral', quality: 'masterwork' }, { category: 'shell', kind: 'coral' }, { category: 'claws', kind: 'cleaver', quality: 'masterwork' }, { category: 'claws', kind: 'coralTipped', quality: 'fine' }, { category: 'claws', kind: 'shellEdged' }, { category: 'shell', kind: 'whelk', quality: 'masterwork' }], inventory: { shellBits: 14, driftwood: 6, coral: 5, scrap: 9, pearls: 3, driedKelp: 2, catWhisker: 2 }, selectSlot: 3 },
  100: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], inBurrow: true, crafted: ['turban', 'cone'], inventory: { shellBits: 7, driftwood: 2, pearls: 1 }, stored: { seaLettuce: 6, coral: 4 }, extraGear: [{ category: 'shell', kind: 'coral', quality: 'masterwork', stored: true }, { category: 'claws', kind: 'coralTipped', quality: 'masterwork', stored: true }], storagePanel: true },
  101: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop'], inBurrow: true, level: 6, molts: ['crusher'], moltPanel: true },
  102: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop'], inBurrow: true, level: 6, molting: true },
  103: { x: 24, z: -27, distance: 9, tideShare: 0.56, heading: 1.75, molts: ['crusher', 'crusher', 'crusher', 'crusher', 'crusher', 'cutter'], outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork', reinforcement: 'metalPlate' } },
  104: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop'], inBurrow: true, level: 6, molts: ['crusher'] },
  105: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, shell: 'coral' },
  106: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, shell: 'whelk' },
  107: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 4.9, shell: 'coral' },
  108: { workshop: true, reefFound: true, campFound: true, crafted: ['snail', 'coral'], x: 70, z: -60, distance: 70, tideShare: 0.56, heading: 1.6, level: 10, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork' } },
  111: { x: 15, z: -20, distance: 40, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], dug: [...[6, 7, 8, 9, 10, 11, 12, 13, 14].map((column) => [column, 5]), ...[6, 7, 8, 9, 10, 11, 12].map((row) => [14, row]), ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((column) => [column, 12]), [9, 10], [9, 11], [10, 10], [10, 11], [11, 11], [3, 8], [3, 9], [3, 10], [3, 11], [4, 8]], placed: [{ kind: 'helperNest', column: 13, row: 5 }, { kind: 'crabBed', column: 14, row: 9 }, { kind: 'helperNest', column: 9, row: 12 }], playerCell: { column: 10, row: 6 }, inBurrow: true },
  112: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], dug: [...[6, 7, 8, 9, 10, 11, 12, 13, 14].map((column) => [column, 5]), ...[6, 7, 8, 9, 10, 11, 12].map((row) => [14, row]), ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((column) => [column, 12]), [9, 10], [9, 11], [10, 10], [10, 11], [11, 11], [3, 8], [3, 9], [3, 10], [3, 11], [4, 8]], playerCell: { column: 10, row: 6 }, inBurrow: true, placingStation: 'exit' },
  113: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], placed: [{ kind: 'helperNest', column: 4, row: 6 }], helpers: ['shellBits', 'carry'], inBurrow: true, helpersPanel: true },
  114: { x: 31, z: -6, distance: 18, tideShare: 0.56, heading: 1.2 },
  115: { x: 22.6, z: -22.4, distance: 22, tideShare: 0.56, heading: 0.9, burrowAt: { x: 24, z: -21 } },
  116: { x: -1, z: -6, distance: 16, tideShare: 0.75, heading: 0.4, level: 9, enemy: { kind: 'shoreCrab', offsetX: -3.2, offsetZ: 1.2 } },
  117: { x: -20, z: 30, distance: 22, tideShare: 0.56, heading: 0.9, burrowAt: { x: 24, z: -21 }, mapOpen: true },
  118: { x: 15, z: -20, distance: 34, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], dug: [[3, 5], [2, 5], [7, 5], [8, 5], [9, 5]], placed: [{ kind: 'helperNest', column: 4, row: 6 }], helpers: ['shellBits'], extraGear: [{ category: 'shell', kind: 'whelk', quality: 'masterwork' }, { category: 'claws', kind: 'cleaver' }], equipHelperGear: true, inBurrow: true, helpersPanel: true },
  119: { x: 15, z: -20, distance: 7, tideShare: 0.56, heading: 0.9, burrowAt: { x: 24, z: -21 }, stations: ['workshop'], placed: [{ kind: 'helperNest', column: 4, row: 6 }], helpers: ['follow'], extraGear: [{ category: 'shell', kind: 'whelk', quality: 'fine' }, { category: 'claws', kind: 'cleaver' }], equipHelperGear: true },
  121: { x: 15, z: -20, distance: 24, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], dug: [[3, 5], [3, 4], [7, 5]], placed: [{ kind: 'exit', column: 2, row: 4 }], inBurrow: true },
  120: { x: 15, z: -20, distance: 12, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop'], placed: [{ kind: 'helperNest', column: 4, row: 6 }], helpers: [null, null, null], helpersResting: true, inBurrow: true },
  109: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, level: 12, molts: ['crusher', 'cutter', 'crusher'], statusPanel: true },
  110: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, backpack: true, crafted: ['snail'], extraGear: [{ category: 'claws', kind: 'cleaver', quality: 'masterwork', binding: 'wire' }, { category: 'shell', kind: 'whelk', quality: 'masterwork', reinforcement: 'metalPlate' }, { category: 'claws', kind: 'coralTipped' }], inventory: { shellBits: 14, driftwood: 6 }, selectSlot: 1 },
  92: { x: 10, z: -22, distance: 22, tideShare: 0.56, heading: 2.4, workshop: true, reefFound: true, crafted: ['snail', 'coral'] },
  68: { x: 10, z: 74, distance: 18, tideShare: 0.75, heading: 0.4, level: 8, enemy: { kind: 'mantisShrimp', offsetX: 2, offsetZ: 1.6 }, fightSeconds: 1.1 },
  69: { x: -60, z: 91, distance: 28, tideShare: 0.75, heading: 0.2, level: 10, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork' }, enemy: { kind: 'giantLobster', offsetX: -2, offsetZ: 6.5 }, fightSeconds: 3.3 },
  70: { x: -60, z: 91, distance: 32, tideShare: 0.75, heading: 0.2, level: 10, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'masterwork' }, enemy: { kind: 'giantLobster', offsetX: -2, offsetZ: 6.5 }, fightSeconds: 3.3 },
  71: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Craft', inventory: { shellBits: 14, coral: 12, seaGlass: 7, driftwood: 3 }, scrollPanel: true },
  72: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'fine' } },
  73: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, outfit: { shell: 'whelk', claws: 'coralTipped', quality: 'fine' } },
  30: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, naked: true, backpack: true, remainsAt: { x: -20, z: -40 } },
  24: { x: -1, z: -6, distance: 16, tideShare: 0.75, heading: 0.4, enemy: { kind: 'shoreCrab', offsetX: -2.8, offsetZ: 0.6 }, fightSeconds: 3.2 },
  122: { x: 15, z: -20, distance: 18, tideShare: 0.56, heading: 0.9, enemy: { kind: 'rivalHermit', offsetX: 2.6, offsetZ: 1.6 } },
  123: { x: 15, z: -20, distance: 12, tideShare: 0.56, heading: 0.9, enemy: { kind: 'rivalHermit', offsetX: 2.6, offsetZ: 1.6, loot: { shell: 'coral', big: 'coralTipped', small: 'shellShield' } } },
  124: { x: -1, z: -6, distance: 12, tideShare: 0.75, heading: 0.4, level: 9, enemy: { kind: 'shoreCrab', offsetX: -3.2, offsetZ: 1.2, loot: { big: 'coralTipped', small: 'shellEdged' } } },
  125: { x: 10, z: 80, distance: 18, tideShare: 0.75, heading: 0.4, level: 8, revealAround: 60, enemy: { kind: 'octopus', offsetX: 2.5, offsetZ: 2.5, loot: { shell: 'turban' } } },
  126: { x: -60, z: 91, distance: 28, tideShare: 0.75, heading: 0.2, level: 10, outfit: { shell: 'coral', claws: 'coralTipped', quality: 'fine' }, revealAround: 60, enemy: { kind: 'giantLobster', offsetX: -2, offsetZ: 6.5, loot: { big: 'cleaver' } } },
  128: { x: -1, z: -6, distance: 6, tideShare: 0.75, heading: 0.4, level: 9, enemy: { kind: 'shoreCrab', offsetX: -1.8, offsetZ: 0.4, loot: { big: 'coralTipped', small: 'shellEdged' } } },
  127: { x: 15, z: -20, distance: 10, tideShare: 0.56, heading: 0.9, level: 6, enemy: { kind: 'rivalHermit', offsetX: 2.6, offsetZ: 1.6, loot: { shell: 'coral', big: 'coralTipped', small: 'shellShield' } }, fightSeconds: 1.2, moment: 'strike' },
  25: { x: 30, z: -40, distance: 13, tideShare: 0.56, heading: 0.5, enemy: { kind: 'sandHopper', offsetX: 1.4, offsetZ: 2.6 }, fightSeconds: 0 },
  26: { x: 0, z: -104, distance: 40, tideShare: 0.56, heading: 3.2, level: 6, enemy: { kind: 'gull', offsetX: -2, offsetZ: -5.5 }, fightSeconds: 3.4 },
  27: { x: 4, z: -80, distance: 50, tideShare: 0.56, heading: 3.4, gullCircling: true },
  28: { x: 30, z: -40, distance: 30, tideShare: 0.56, heading: 0.5, enemy: { kind: 'sandHopper', offsetX: 1.4, offsetZ: 2.6 }, fightSeconds: 2.5 },
};

function createEmptySave() {
  return { version: SAVE_VERSION, x: HOME_SPOT.x, z: HOME_SPOT.z, heading: STARTING_HEADING, worldTime: STARTING_TIDE_TIME, inventory: {}, nodes: null, goalAnnounced: false, hasMoved: false, wetness: 0, wetHeight: 0, gear: null, workshopBuilt: false, craftedOnce: false, progression: null, remains: [], looters: [], burrow: null, storage: { inventory: {}, shells: [], claws: [] }, underground: false, helpers: [], rack: null, wellFedSeconds: 0, reefFound: false, reefGearCrafted: false, campFound: false, campGearCrafted: false, holdFound: false, bossDefeatedAt: {} };
}

function migrateSave(stored) {
  const gearItemCount = stored.gear ? stored.gear.shells.length + stored.gear.claws.length : 0;
  const migrated = { ...createEmptySave(), ...stored, version: SAVE_VERSION };
  if (stored.version < 3) migrated.craftedOnce = gearItemCount > 2;
  if (stored.workshopBuilt && !stored.burrow) {
    migrated.burrow = { ...createEmptyBurrow(), entrance: { ...WORKSHOP_SPOT }, stations: [{ kind: 'workshop', ...DEFAULT_WORKSHOP_CELL }] };
  }
  return migrated;
}

function loadSave() {
  if (isScreenshotMode) return createEmptySave();
  try {
    const stored = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (stored && stored.version === SAVE_VERSION) return { ...createEmptySave(), ...stored };
    if (stored && stored.version >= 1 && stored.version < SAVE_VERSION) return migrateSave(stored);
  } catch {
    /* unreadable or blocked storage: start a new game */
  }
  return createEmptySave();
}

const save = loadSave();

function loadAudioSettings() {
  try {
    return { music: 0.55, effects: 0.8, ...JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY)) };
  } catch {
    return { music: 0.55, effects: 0.8 };
  }
}

const audioSettings = loadAudioSettings();
const audio = isScreenshotMode ? null : createAudio();
let audioUnlocked = false;
let ambienceTimer = 0;

function unlockAudio() {
  if (!audio || audioUnlocked) return;
  audioUnlocked = true;
  audio.unlock();
  audio.setVolumes(audioSettings);
  audio.startAmbience();
  audio.startMusic();
}

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: isScreenshotMode });
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);
const canvas = renderer.domElement;

seaUniforms.uNoise.value = createNoiseTexture();
const world = createWorld(quality);
seaUniforms.uRetained.value = world.retained.texture;

const scene = new THREE.Scene();
scene.background = lighting.hazeColor;
scene.fog = new THREE.FogExp2(lighting.hazeColor, lighting.hazeDensity);

function buildSkyEnvironment() {
  const skyScene = new THREE.Scene();
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: seaUniforms,
    side: THREE.BackSide,
    vertexShader: /* glsl */ `varying vec3 vDirection; void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `${SEA_COMMON_GLSL}
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        vec3 color = skyColor(direction);
        vec3 groundBounce = vec3(0.42, 0.34, 0.24);
        color = mix(color, groundBounce, 1.0 - smoothstep(-0.25, 0.02, direction.y));
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial));
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(skyScene, 0.03).texture;
  generator.dispose();
  return environment;
}
scene.environment = buildSkyEnvironment();
scene.environmentIntensity = 0.55;

const sun = new THREE.DirectionalLight(lighting.sunColor, 4.2);
sun.castShadow = true;
sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
sun.shadow.bias = -0.00004;
sun.shadow.normalBias = 0.012;
sun.shadow.camera.near = 60;
sun.shadow.camera.far = 330;
sun.layers.enable(BURROW_LAYER);
scene.add(sun, sun.target);

scene.add(world.terrainMesh);
createProps(scene, world, quality);
const reefProps = createReefProps(scene, world, quality);
const campProps = createCampProps(scene, world, quality);
const holdProps = createHoldProps(scene, world, quality);
const life = createLife(scene, world, quality);

const pipeline = createPipeline(renderer, quality);
const fog = createFog({ halfSize: PLAY_HALF_SIZE, saved: save.fog });
pipeline.attachFog(fog.uniforms);
const water = createWater(createWaveGradientTexture(), pipeline.overlayUniforms, quality.rippleCapacity);
pipeline.overlayScene.add(water.mesh);

const navigation = createNavigation(world);
const gear = createGear(save.gear);
const progression = createProgression(save.progression);
await loadBurrowModels().catch((error) => console.warn('burrow models failed, using procedural burrow', error));
if (searchParameters.get('asset') !== 'procedural') await Promise.all([loadCrabAsset().catch((error) => console.warn('crab asset failed, using procedural crab', error)), loadCreatureAssets().catch((error) => console.warn('creature assets failed, using procedural enemies', error))]);
const hermit = createHermit(scene, quality, gear.wornLook());
const showHermitUnderground = () => hermit.root.traverse((child) => child.layers.enable(BURROW_LAYER));
showHermitUnderground();

function applyWornLook() {
  hermit.setShell(gear.wornLook());
  hermit.setGearGlow(gearGlowLook(gear.wornShell()), gearGlowLook(gear.wornClaws()));
  hermit.setClawGrowth(1 + CLAW_GROWTH_PER_MOLT * progression.moltCount('crusher'), 1 + CLAW_GROWTH_PER_MOLT * progression.moltCount('cutter'));
  hermit.setBodyScale(bodyGrowth());
  const fit = shellFit(gear.wornShell() ? SHELLS[gear.wornShell().kind] : null, crabSize());
  hermit.setShellFitScale(Math.max(SHELL_MIN_FIT_SCALE, 1 + SHELL_SCALE_PER_SIZE_STEP * fit.steps));
  hermit.setClawWeapon(gear.wornClaws().kind, gear.wornSmall() ? gear.wornSmall().kind : null);
  hermit.setClawTint(CLAWS[gear.wornClaws().kind].tint || null);
  showHermitUnderground();
  hermit.setClawTines(Boolean(CLAWS[gear.wornClaws().kind].tines));
}
applyWornLook();
const resources = createResources(scene, { scene: pipeline.overlayScene, uniforms: pipeline.overlayUniforms }, world, quality, save.nodes, STARTER_SPOTS);
const hud = createHud(qualityName);
const mapView = createMapView(hud.root, { world, fog, halfSize: PLAY_HALF_SIZE, waterLevel: TIDE_MIDDLE + TIDE_AMPLITUDE, cameraYaw: CAMERA_YAW, onClose: () => mapView.close() });
const tracks = createTracks(scene, world);
const ripples = createRipples(water.uniforms);
const workshop = createWorkbenchModel(scene, world, quality, WORKSHOP_SPOT, hud.root);
const burrow = createBurrow(scene, world, quality, hud.root, save.burrow);
burrow.attachStations(workshop);
if (burrow.hasStation('workshop')) workshop.build();
const storage = save.storage;
if (!save.discovered) save.discovered = legacyDiscoveries(save);

function legacyDiscoveries(oldSave) {
  const found = [];
  if (oldSave.burrow) found.push('driftwood', 'seaLettuce');
  if (oldSave.reefFound) found.push('coral', 'seaGlass', 'pearls');
  if (oldSave.campFound) found.push('scrap', 'cloth');
  if (oldSave.holdFound) found.push('fishBone', 'wax');
  return found;
}
for (const item of [...storage.shells, ...storage.claws]) normalizeItem(item);
let underground = Boolean(save.underground && burrow.exists);
const surfaceSpace = {
  heightAt: (x, z) => world.heightAt(x, z),
  isWalkable: (x, z) => world.isWalkable(x, z),
  waterLevelAt: (x, z, seaLevel) => world.waterLevelAt(x, z, seaLevel),
  findPath: (fromX, fromZ, toX, toZ) => navigation.findPath(fromX, fromZ, toX, toZ),
  nearestWalkable: (x, z) => navigation.nearestWalkable(x, z, 10),
};
const space = () => (underground ? burrow.space : surfaceSpace);
const surfaceProbe = { x: 0, z: 0, alive: false };
const placement = { entrance: false, station: null, moving: null, rack: false };
const isPlacing = () => placement.entrance || Boolean(placement.station) || Boolean(placement.moving) || placement.rack;
const remains = createRemains(scene, world, quality, hud.root, save.remains);
const enemies = createEnemies({
  scene,
  world,
  navigation,
  quality,
  spawnTable: [...HOME_BEACH_ENEMIES, ...REEF_ENEMIES, ...CAMP_ENEMIES, ...HOLD_ENEMIES].map((entry) => ({ ...entry, avoid: HOME_SPOT })),
  labelParent: hud.root,
  bossAwake: (kind) => bossRestRemainingMs(kind) <= 0,
  bossReturnText: (kind) => {
    const hours = Math.ceil(bossRestRemainingMs(kind) / 3600000);
    return `${ENEMY_KINDS[kind].label} returns in ${hours} h`;
  },
  onAttackPlayer: hitPlayer,
  onKilled: enemyKilled,
  onAlert: (enemy, symbol = '!') => {
    floatAt(enemy.x, enemy.y + enemy.altitude + enemy.definition.barHeight, enemy.z, symbol, 'alert');
    soundAt('alert', enemy.x, enemy.z);
  },
  onSound: (name, enemy) => soundAt(name, enemy.x, enemy.z),
  onWarn: (enemy, text) => {
    if (text) hud.log('combat', `${enemy.definition.label}: ${text}`);
    soundAt('alert', enemy.x, enemy.z, 0.6);
  },
  onInk: (enemy, seconds, factor) => {
    player.inkedUntil = simulationTime + seconds;
    player.inkSpeedFactor = factor;
    player.lastCombatTime = simulationTime;
    hud.log('combat', `${enemy.definition.label} inks you — slowed ${Math.round((1 - factor) * 100)} % for ${seconds} s`);
    floatAt(player.x, player.y + 2.4, player.z, `Slowed ${Math.round((1 - factor) * 100)}%`, 'taken');
  },
  onDodge: (enemy) => {
    hud.log('combat', `You dodged the ${enemy.definition.label.toLowerCase()}`);
    floatAt(player.x, player.y + 2.4, player.z, 'Dodged!', 'experience');
    soundAt('hitThud', enemy.x, enemy.z, 0.7);
  },
});
restoreLooters(enemies.list, save.looters);
const buildPanel = createBuildPanel(hud.root, {
  inventory: () => save.inventory,
  hasStation: (kind) => (STATION_KINDS[kind].surface ? rack.exists : burrow.hasStation(kind)),
  buildProblem: stationBuildProblem,
  onFill: () => startFillMode(),
  onChoose: chooseStation,
  onClose: () => buildPanel.close(),
});
const thumbnails = createThumbnails(quality);
const storagePanel = createStoragePanel(hud.root, {
  gear,
  thumbnails,
  inventory: () => save.inventory,
  storage,
  onChange: () => {
    soundAt('gatherDriftwood', player.x, player.z, 0.6);
    applyWornLook();
    storagePanel.render();
    refreshHud(null);
    persist();
  },
  onSalvage: (refund, label) => {
    soundAt('craft');
    hud.log('loot', `${label} salvaged — +${materialsText(refund)}`);
  },
  onMove: (station) => startMovingStructure(station || 'storage'),
  onDismantle: (station) => dismantleStructure(station || 'storage'),
  onClose: () => storagePanel.close(),
});
const rack = createRack(scene, world, quality, hud.root, save.rack);
let rackBlockedCells = rack.exists ? world.blockCircle(rack.state.x, rack.state.z, RACK_BLOCK_RADIUS) : [];
const rackPanel = createRackPanel(hud.root, {
  rack,
  inventory: () => save.inventory,
  batch: RACK_BATCH,
  drySeconds: RACK_DRY_SECONDS,
  onLoad: () => {
    const input = rackInputIn(save.inventory);
    if (!input || !rack.load()) return;
    save.inventory[input] -= RACK_BATCH;
    soundAt('gatherSeaLettuce');
    rackPanel.render();
    persist();
  },
  onCollect: () => {
    const taken = rack.collect();
    if (!taken) return;
    save.inventory.driedKelp = (save.inventory.driedKelp || 0) + taken;
    soundAt('gatherDriftwood');
    hud.log('loot', `+${taken} Dried kelp`);
    refreshHud('driedKelp');
    rackPanel.render();
    persist();
  },
  onMove: () => startMovingStructure('dryingRack'),
  onDismantle: () => dismantleStructure('dryingRack'),
  onClose: () => rackPanel.close(),
});
let processRefreshTimer = 0;
const hiddenCrabMarker = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.45, 0.25), transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }));
hiddenCrabMarker.renderOrder = 12;
hiddenCrabMarker.visible = false;
hiddenCrabMarker.layers.enable(BURROW_LAYER);
scene.add(hiddenCrabMarker);
const crabViewTarget = new THREE.Vector3();
let hiddenCrabCheckTimer = 0;
const HIDDEN_CRAB_CHECK_SECONDS = 0.15;

function updateHiddenCrabMarker(deltaTime) {
  if (hiddenCrabMarker.visible) hiddenCrabMarker.position.set(player.x, player.y + 0.12, player.z);
  hiddenCrabCheckTimer -= deltaTime;
  if (hiddenCrabCheckTimer > 0) return;
  hiddenCrabCheckTimer = HIDDEN_CRAB_CHECK_SECONDS;
  crabViewTarget.set(player.x, player.y + 0.35, player.z);
  const hidden = underground && burrow.wallBlocksView(camera.position, crabViewTarget);
  hiddenCrabMarker.visible = hidden;
  if (hidden) hiddenCrabMarker.position.set(player.x, player.y + 0.12, player.z);
}
const boardPanel = createBoardPanel(hud.root, {
  orders: () => boardView(),
  materialOptions: () => {
    const known = noteDiscoveries();
    return Object.entries(RESOURCE_TYPES).filter(([type]) => known.has(type) || ALWAYS_KNOWN_MATERIALS.has(type) || (save.inventory[type] || 0) > 0 || type === 'driedKelp' || type === 'cord' || type === 'shellLime').map(([type, definition]) => ({ value: type, label: `${definition.icon} ${definition.label}` }));
  },
  boxOptions: () => burrow.state.stations.filter((station) => boxOf(station.id)).map((station) => ({ value: station.id, label: stationName(station) })),
  amounts: () => BOARD_AMOUNTS,
  onAdd: (material, toId, amount) => {
    if (addBoardOrder(material, toId, amount)) boardPanel.render();
  },
  onMove: (id, offset) => {
    if (moveBoardOrder(id, offset)) boardPanel.render();
  },
  onRemove: (id) => {
    if (removeBoardOrder(id)) boardPanel.render();
  },
  onMoveStructure: () => startMovingStructure(burrow.stationOf('burrowHeart')),
  onDismantleStructure: () => dismantleStructure(burrow.stationOf('burrowHeart')),
  onClose: () => boardPanel.close(),
});
const bedPanel = createBedPanel(hud.root, {
  onSleep: (station) => {
    bedPanel.close();
    startSleeping(station);
  },
  onMove: (station) => startMovingStructure(station),
  onDismantle: (station) => dismantleStructure(station),
  onClose: () => bedPanel.close(),
});
const processPanel = createProcessPanel(hud.root, {
  view: processView,
  inventory: () => save.inventory,
  labelOf: (station) => STATION_KINDS[station.kind].label,
  onLoad: (station) => {
    if (!loadStation(station, save.inventory)) return;
    soundAt('gatherSeaLettuce');
    processPanel.render();
    persist();
  },
  onCollect: (station) => {
    const taken = collectStation(station);
    if (!taken) return;
    const output = PROCESS_RECIPES[station.kind].output;
    save.inventory[output] = (save.inventory[output] || 0) + taken;
    soundAt('gatherDriftwood');
    hud.log('loot', `+${taken} ${RESOURCE_TYPES[output].label}`);
    refreshHud(output);
    processPanel.render();
    persist();
  },
  onMove: (station) => startMovingStructure(station),
  onDismantle: (station) => dismantleStructure(station),
  onClose: () => processPanel.close(),
});
const STRANDED_FREE_SPOTS = [
  { id: 'beachPool', x: 34, z: -4 },
  { id: 'beachDriftwood', x: -16, z: -30 },
  { id: 'beachDunes', x: 48, z: -38 },
];
const STRANDED_GUARD_KINDS = ['gull', 'giantLobster', 'shipCat'];
const STRANDED_PICK_RADIUS_PIXELS = 60;
const RESCUE_REACH = 2.6;
const GUARDED_SPOT_OFFSET = { x: 7, z: 5.8 };

function strandedHelperSpots() {
  const spots = [];
  for (const spot of STRANDED_FREE_SPOTS) {
    const free = navigation.nearestWalkable(spot.x, spot.z, 14) || spot;
    spots.push({ id: spot.id, x: free.x, z: free.z, heading: spots.length * 2.2, guardKind: null });
  }
  for (const guardKind of STRANDED_GUARD_KINDS) {
    const guard = enemies.list.find((enemy) => enemy.kind === guardKind);
    const home = guard && (guard.home || { x: guard.x, z: guard.z });
    if (!home) continue;
    const free = navigation.nearestWalkable(home.x + GUARDED_SPOT_OFFSET.x, home.z + GUARDED_SPOT_OFFSET.z, 10);
    if (free) spots.push({ id: `guarded-${guardKind}`, x: free.x, z: free.z, heading: spots.length * 2.2, guardKind });
  }
  return spots;
}

function boxOf(stationId) {
  const station = burrow.state.stations.find((candidate) => candidate.id === stationId);
  if (!station) return null;
  if (station.kind === 'storage') return storage;
  return station.box || null;
}

const helpers = createHelpers(scene, {
  world,
  navigation,
  resources,
  enemies,
  quality,
  saved: save.helpers,
  rack,
  burrow,
  boxOf,
  upkeepActive: () => burrow.hasStation('burrowHeart'),
  boardTask: (helper) => boardTaskFor(helper),
  feedHelper: (helper) => {
    const pantries = burrow.state.stations.filter((station) => station.kind === 'pantry').map((station) => station.box);
    const nest = burrow.state.stations.find((station) => station.id === helper.nestId);
    const source = [...pantries, nest && nest.box].find((box) => box && (box.inventory.driedKelp || 0) > 0);
    if (!source) return false;
    source.inventory.driedKelp -= 1;
    return true;
  },
  strandedSpots: strandedHelperSpots(),
  getPlayer: () => player,
  isUnderground: () => underground,
  onDeposit: (nest, type, amount) => {
    const box = (nest && nest.box) || storage;
    box.inventory[type] = (box.inventory[type] || 0) + amount;
    if (storagePanel.isOpen) storagePanel.render();
  },
  onLost: (helper, enemy) => {
    hud.log('helperCombat', `The ${enemy.definition.label.toLowerCase()} knocked out ${helpers.nameOf(helper)} — it woke up in its nest without a job`);
    if (helpersPanel.isOpen) helpersPanel.render();
    persist();
  },
  onSound: (name, helper) => {
    if (helper.inside === underground) soundAt(name, helper.x, helper.z, 0.45);
  },
  onLog: (kind, text) => hud.log(kind, text),
  playerVitals: () => (player.alive ? { alive: true, inside: underground, x: player.x, z: player.z, health: progression.state.health, maxHealth: progression.maxHealth() } : null),
  healPlayer: (amount) => {
    const healed = Math.max(0, Math.min(amount, progression.maxHealth() - progression.state.health));
    progression.state.health += healed;
    floatAt(player.x, player.y + 2.2, player.z, `+${healed} ❤`, 'experience');
    return healed;
  },
  onHealFloat: (helper, amount) => {
    if (helper.inside === underground) floatAt(helper.x, (helper.inside ? BURROW_ORIGIN.y : helper.y) + 1.6, helper.z, `+${amount} ❤`, 'experience');
  },
});
const helpersPanel = createHelpersPanel(hud.root, {
  helpers,
  limit: HELPER_LIMIT,
  jobOptions: helperJobOptions,
  boxOptions: () => burrow.state.stations.filter((station) => station.kind === 'storage' || station.kind === 'helperNest' || station.kind === 'pantry').map((station) => ({ id: station.id, label: stationName(station) })),
  satchelInfo: (helper) => (helper.satchel ? `Satchel · carries ${SATCHEL_LOAD} per trip` : burrow.hasStation('burrowHeart') ? { cost: SATCHEL_CORD_COST, have: save.inventory.cord || 0 } : null),
  onSatchel: (id) => giveSatchel(id),
  onJob: (id, job, carryOrder) => {
    helpers.setJob(id, job, carryOrder);
    persist();
  },
  gearOptions: (helper, category) => {
    const owned = category === 'shell' ? gear.state.shells : gear.state.claws;
    const current = helper.gear && helper.gear[category];
    const candidates = owned.filter((item) => !gear.isWorn(item.id) && (category === 'shell' || (CLAWS[item.kind].cost && !CLAWS[item.kind].shield)));
    return [...(current ? [current] : []), ...candidates].map((item) => ({ value: item.id, label: itemName(category, item) }));
  },
  helperInfo: (helper) => {
    const stats = helperStats(helper);
    const level = helper.level || 1;
    const food = !burrow.hasStation('burrowHeart') ? null : helper.hungry ? 'Hungry — works at half speed' : `Fed · next meal in ${Math.max(1, Math.ceil((helper.mealIn ?? HELPER_MEAL_SECONDS) / 60))} min`;
    return { level, maxHealth: helperMaxHealth(helper), attack: stats.attack, defense: stats.defense, experience: Math.floor(helper.experience || 0), toNext: level >= MAX_LEVEL ? 0 : experienceForLevel(level), food, hungry: Boolean(helper.hungry) };
  },
  foodSummary: () => {
    if (!burrow.hasStation('burrowHeart')) return null;
    const pantryKelp = burrow.state.stations.filter((station) => station.kind === 'pantry').reduce((sum, station) => sum + (station.box.inventory.driedKelp || 0), 0);
    return `Food: ${pantryKelp} dried kelp in the pantry · each helper eats 1 every ${HELPER_MEAL_SECONDS / 60} min`;
  },
  onEquip: (id, category, itemId) => {
    equipHelper(id, category, itemId);
    persist();
  },
  giveOptions: () => Object.keys(CONSUMABLES).filter((type) => save.inventory[type] > 0).map((type) => ({ type, icon: RESOURCE_TYPES[type].icon, label: RESOURCE_TYPES[type].label, count: save.inventory[type] })),
  onGiveItem: (id, type, amount) => {
    const moved = helpers.giveItem(id, type, Math.min(amount, save.inventory[type] || 0));
    save.inventory[type] -= moved;
    if (!moved) hud.log('notice', 'That helper has no room for it');
    refreshHud(null);
    persist();
  },
  onTakeItem: (id, slotIndex) => {
    const slot = helpers.takeItem(id, slotIndex);
    if (slot) save.inventory[slot.type] = (save.inventory[slot.type] || 0) + slot.count;
    refreshHud(null);
    persist();
  },
  onItemUse: (id, mode) => {
    helpers.setItemUse(id, mode);
    persist();
  },
  onClose: () => helpersPanel.close(),
});

function equipHelper(id, category, itemId) {
  const helper = helpers.list.find((candidate) => candidate.id === id);
  if (!helper) return false;
  const owned = category === 'shell' ? gear.state.shells : gear.state.claws;
  const previous = helper.gear[category];
  if (previous && previous.id === itemId) return true;
  let next = null;
  if (itemId) {
    const index = owned.findIndex((item) => item.id === itemId);
    if (index < 0 || gear.isWorn(owned[index].id)) return false;
    next = owned.splice(index, 1)[0];
  }
  if (previous) owned.push(previous);
  helper.gear[category] = next;
  helper.health = Math.min(helper.health, helperMaxHealth(helper));
  return true;
}

function helperJobOptions(helper) {
  const known = noteDiscoveries();
  const gatherable = Object.entries(RESOURCE_TYPES).filter(([type, definition]) => definition.count > 0 && (known.has(type) || ALWAYS_KNOWN_MATERIALS.has(type))).map(([type, definition]) => ({ value: type, label: `Gather ${definition.label.toLowerCase()}` }));
  const follower = helpers.follower();
  const follow = !follower || follower === helper ? [{ value: 'follow', label: 'Follow and help you' }] : [];
  const board = burrow.hasStation('burrowHeart') ? [{ value: 'board', label: 'Board · take job board orders' }] : [];
  const tend = burrow.state.stations.filter(isProcessStation).map((station) => ({ value: `tend:${station.id}`, label: `Tend station: ${stationName(station).toLowerCase()}` }));
  return [{ value: '', label: 'No job · rest in the nest' }, ...board, ...follow, ...gatherable, { value: 'rack', label: 'Tend station: drying rack' }, ...tend, { value: 'carry', label: 'Carry between boxes' }];
}

const BOARD_HELPERS_PER_ORDER = 2;
const BOARD_AMOUNTS = [5, 10, 20, 30, 50];
const DEFAULT_PANTRY_ORDER = 10;

function boardOrders() {
  save.board ||= { orders: [], nextId: 1 };
  return save.board.orders;
}

function boxCount(stationId, material) {
  const box = boxOf(stationId);
  return box ? box.inventory[material] || 0 : 0;
}

function orderMethod(order) {
  const known = noteDiscoveries();
  const definition = RESOURCE_TYPES[order.material];
  if (definition && definition.count > 0 && (known.has(order.material) || ALWAYS_KNOWN_MATERIALS.has(order.material))) return { job: order.material, deliverToId: order.toId };
  if (order.material === 'driedKelp' && rack.exists) return { job: 'rack', deliverToId: order.toId };
  const processStation = burrow.state.stations.find((station) => isProcessStation(station) && PROCESS_RECIPES[station.kind].output === order.material);
  if (processStation) return { job: `tend:${processStation.id}`, deliverToId: order.toId };
  const source = burrow.state.stations.find((station) => station.id !== order.toId && boxOf(station.id) && boxCount(station.id, order.material) > 0);
  if (source) return { job: 'carry', carryOrder: { fromId: source.id, toId: order.toId, material: order.material } };
  return null;
}

function boardTaskFor(helper) {
  helper.boardOrderId = null;
  for (const order of boardOrders()) {
    if (!boxOf(order.toId) || boxCount(order.toId, order.material) >= order.amount) continue;
    const busy = helpers.list.filter((other) => other !== helper && other.job === 'board' && other.boardOrderId === order.id && other.state !== 'resting').length;
    if (busy >= BOARD_HELPERS_PER_ORDER) continue;
    const method = orderMethod(order);
    if (!method) continue;
    helper.boardOrderId = order.id;
    return method;
  }
  return null;
}

function addBoardOrder(material, toId, amount) {
  if (!RESOURCE_TYPES[material] || !boxOf(toId)) return false;
  const orders = boardOrders();
  orders.push({ id: save.board.nextId++, material, toId, amount });
  persist();
  return true;
}

function moveBoardOrder(id, offset) {
  const orders = boardOrders();
  const index = orders.findIndex((order) => order.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= orders.length) return false;
  [orders[index], orders[target]] = [orders[target], orders[index]];
  persist();
  return true;
}

function removeBoardOrder(id) {
  const orders = boardOrders();
  const index = orders.findIndex((order) => order.id === id);
  if (index < 0) return false;
  orders.splice(index, 1);
  persist();
  return true;
}

function boardView() {
  return boardOrders().map((order) => {
    const station = burrow.state.stations.find((candidate) => candidate.id === order.toId);
    const method = orderMethod(order);
    const have = boxCount(order.toId, order.material);
    const workers = helpers.list.filter((helper) => helper.job === 'board' && helper.boardOrderId === order.id && helper.state !== 'resting').length;
    const status = !station ? 'Box gone' : have >= order.amount ? 'Done' : !method ? 'No way to get it yet' : `${workers} working`;
    return { id: order.id, text: `${RESOURCE_TYPES[order.material].icon} ${have}/${order.amount} ${RESOURCE_TYPES[order.material].label.toLowerCase()} in ${station ? stationName(station) : '—'}`, status };
  });
}

function giveSatchel(helperId) {
  const helper = helpers.list.find((candidate) => candidate.id === helperId);
  if (!helper || helper.satchel || (save.inventory.cord || 0) < SATCHEL_CORD_COST) return false;
  save.inventory.cord -= SATCHEL_CORD_COST;
  helper.satchel = true;
  hud.log('helper', `${helpers.nameOf(helper)} got a satchel — carries ${SATCHEL_LOAD} per trip`);
  if (helpersPanel.isOpen) helpersPanel.render();
  persist();
  return true;
}

function stationName(station) {
  const sameKind = burrow.state.stations.filter((candidate) => candidate.kind === station.kind);
  const number = sameKind.length > 1 ? ` ${sameKind.indexOf(station) + 1}` : '';
  return `${STATION_KINDS[station.kind].label}${number}`;
}

const guardOf = (spot) => (spot.guardKind && enemies.list.find((enemy) => enemy.kind === spot.guardKind && enemies.alive(enemy))) || null;

function rescueHelperAt(spot) {
  const guard = guardOf(spot);
  if (guard) {
    hud.log('notice', `The ${guard.definition.label.toLowerCase()} guards this helper — defeat it first`);
    return null;
  }
  if (!burrow.exists || !helpers.freeNest()) {
    hud.log('notice', 'Build a helper nest in your burrow first — then come back for this crab');
    return null;
  }
  const helper = helpers.rescue(spot);
  if (!helper) return null;
  soundAt('recoverRemains');
  if (burrow.hasStation('burrowHeart')) helpers.setJob(helper.id, 'board');
  hud.log('helper', burrow.hasStation('burrowHeart') ? 'A helper crab joined your nest — it takes orders from the job board' : 'A helper crab joined your nest — give it a job from Helpers');
  refreshHud(null);
  persist();
  return helper;
}

function walkToStranded(spot) {
  if (Math.hypot(spot.x - player.x, spot.z - player.z) <= RESCUE_REACH) {
    stopWalking();
    return rescueHelperAt(spot);
  }
  const stand = navigation.nearestWalkable(spot.x - 1.4, spot.z - 1.2, 6) || spot;
  if (!setDestination(stand.x, stand.z)) return false;
  player.walkGoal = { strandedSpot: spot };
  return true;
}

function adoptHomelessHelpers() {
  if (!burrow.exists || !helpers.list.some((helper) => !burrow.state.stations.some((station) => station.id === helper.nestId))) return;
  let nest = burrow.state.stations.find((station) => station.kind === 'helperNest');
  if (!nest) {
    const cells = burrow.freeCells().sort((first, second) => Math.hypot(first.column - LEGACY_HELPER_CELL.column, first.row - LEGACY_HELPER_CELL.row) - Math.hypot(second.column - LEGACY_HELPER_CELL.column, second.row - LEGACY_HELPER_CELL.row));
    if (!cells.length) return;
    nest = burrow.addStation('helperNest', cells[0].column, cells[0].row, workshop);
  }
  helpers.adopt(nest);
  for (const [index, spot] of STRANDED_FREE_SPOTS.entries()) if (index < helpers.list.length) helpers.markRescued(spot.id);
  save.burrow = burrow.serialize();
}

const workbenchPanel = createWorkbenchPanel(hud.root, {
  gear,
  inventory: () => save.inventory,
  onCraft: craftItem,
  onCraftSupply: craftSupply,
  onUpgradeTools: upgradeTools,
  onRefine: refineItem,
  onModify: modifyItem,
  isDiscovered: isRecipeDiscovered,
  onMove: () => startMovingStructure('workshop'),
  onDismantle: () => dismantleStructure('workshop'),
  onClose: () => workbenchPanel.close(),
});
const moltPanel = createMoltPanel(hud.root, {
  progression,
  onMolt: startMolt,
  onClose: () => moltPanel.close(),
});
const backpack = createBackpackPanel(hud.root, {
  gear,
  inventory: () => save.inventory,
  thumbnails,
  onWear: wearItem,
  onUnequip: unequipItem,
  moltCount: () => progression.state.molts.length,
  onUse: useConsumable,
  onAssignQuickSlot: assignQuickSlot,
  quickSlots: () => quickSlots(),
  onSalvage: salvageItem,
  onClose: () => {
    backpack.close();
    hud.setBagDot(false);
    persist();
  },
});

function openBackpack() {
  workbenchPanel.close();
  backpack.open();
}

const statusPanel = createStatusPanel(hud.root, {
  progression,
  combatStats: () => playerStats(),
  onClose: () => statusPanel.close(),
});

function anyPanelOpen() {
  return mapView.isOpen || statusPanel.isOpen || workbenchPanel.isOpen || moltPanel.isOpen || backpack.isOpen || buildPanel.isOpen || storagePanel.isOpen || helpersPanel.isOpen || rackPanel.isOpen || processPanel.isOpen || boardPanel.isOpen || bedPanel.isOpen;
}

function closePanels() {
  mapView.close();
  statusPanel.close();
  workbenchPanel.close();
  if (backpack.isOpen) backpack.close();
  buildPanel.close();
  storagePanel.close();
  helpersPanel.close();
  rackPanel.close();
  processPanel.close();
  boardPanel.close();
  bedPanel.close();
}

const destinationMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.55, 0.78, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.5), transparent: true, opacity: 0.8, depthWrite: false, fog: false }),
);
destinationMarker.visible = false;
scene.add(destinationMarker);

const playerRing = new THREE.Mesh(
  new THREE.RingGeometry(1.5, 1.85, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 2.6), transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }),
);
playerRing.renderOrder = 5;
scene.add(playerRing);
for (const marker of [destinationMarker, playerRing]) marker.layers.enable(BURROW_LAYER);


const camera = new THREE.PerspectiveCamera(LANDSCAPE_FIELD_OF_VIEW, 1, 1.5, 1600);
const cameraFocus = new THREE.Vector3();
const playerFocusPoint = new THREE.Vector3();
const cameraDistances = { surface: save.cameraDistances?.surface ?? SURFACE_CAMERA_DISTANCE, burrow: save.cameraDistances?.burrow ?? null };
let cameraDistance = cameraDistances.surface;

function framedBurrowCameraDistance() {
  const aspect = innerWidth / innerHeight;
  const verticalHalfTangent = Math.max(Math.tan(THREE.MathUtils.degToRad(LANDSCAPE_FIELD_OF_VIEW / 2)), Math.tan(THREE.MathUtils.degToRad(MINIMUM_HORIZONTAL_FIELD_OF_VIEW / 2)) / aspect);
  const forWidth = BURROW_FRAMED_WIDTH / (2 * verticalHalfTangent * aspect);
  const forDepth = (BURROW_FRAMED_DEPTH * Math.sin(CAMERA_PITCH)) / (2 * verticalHalfTangent);
  return THREE.MathUtils.clamp(Math.max(forWidth, forDepth), ...CAMERA_DISTANCE_LIMITS);
}

function cameraDistanceFor(isUnderground) {
  return isUnderground ? cameraDistances.burrow ?? framedBurrowCameraDistance() : cameraDistances.surface;
}

const player = { restedUntil: save.restedSeconds || 0, sleeping: null, wellFedUntil: save.wellFedSeconds || 0, softUntil: save.softSeconds || 0, moltTimer: save.moltSeconds || 0, moltKind: save.moltKind || null, x: save.x, z: save.z, y: 0, heading: save.heading, speed: 0, path: [], pathIndex: 0, gatherTarget: null, gatherProgress: 0, headingToWorkshop: false, groundNormal: new THREE.Vector3(0, 1, 0), size: 1, waterDepth: 0, wetness: save.wetness, wetHeight: save.wetHeight, alive: true, dyingTimer: 0, heldNode: null, combatTarget: null, attackTimer: 0, combatRepathTimer: 0, hitCount: 0, lastCombatTime: -100 };
const startPoint = (underground ? burrow.space.nearestWalkable(player.x, player.z) : navigation.nearestWalkable(player.x, player.z, 40)) || HOME_SPOT;
player.x = startPoint.x;
player.z = startPoint.z;

const tideState = { seaLevel: TIDE_MIDDLE, wetLevel: TIDE_MIDDLE + TIDE_AMPLITUDE, rising: false };
let simulationTime = 0;
let autosaveTimer = 0;
let paused = false;
const heldKeys = new Set();

function seaLevelAt(worldTime) {
  return TIDE_MIDDLE + TIDE_AMPLITUDE * Math.sin((worldTime / TIDE_PERIOD_SECONDS) * Math.PI * 2);
}

function updateTide(deltaTime) {
  const previousLevel = seaLevelAt(save.worldTime - deltaTime);
  const level = seaLevelAt(save.worldTime);
  const wasRising = tideState.rising;
  tideState.rising = level > previousLevel;
  const swash = 0.07 * Math.sin(simulationTime * 0.8) + 0.035 * Math.sin(simulationTime * 1.9 + 1);
  tideState.seaLevel = level + swash;
  tideState.wetLevel = Math.max(level + 0.42, tideState.wetLevel - WET_SAND_DRYING_RATE * deltaTime);
  seaUniforms.uSeaLevel.value = tideState.seaLevel;
  seaUniforms.uWetLevel.value = tideState.wetLevel;
  if (wasRising && !tideState.rising && deltaTime > 0) {
    const returned = resources.washAshore(player);
    if (returned > 0) hud.log('loot', 'The tide left new things on the beach');
  }
}

function tideLabel() {
  const share = (seaLevelAt(save.worldTime) - TIDE_MIDDLE) / TIDE_AMPLITUDE;
  if (share > 0.92) return 'High tide';
  if (share < -0.92) return 'Low tide';
  return tideState.rising ? 'Rising' : 'Falling';
}

let startingOver = false;

function persist() {
  if (isScreenshotMode || startingOver) return;
  noteDiscoveries();
  Object.assign(save, { fog: fog.serialize(), x: player.x, z: player.z, heading: player.heading, nodes: resources.serialize(), wetness: player.wetness, wetHeight: player.wetHeight, gear: gear.serialize(), progression: progression.serialize(), remains: remains.serialize(), looters: serializeLooters(enemies.list), burrow: burrow.serialize(), storage, underground, cameraDistances: { ...cameraDistances, [underground ? 'burrow' : 'surface']: cameraDistance }, helpers: helpers.serialize(), rack: rack.serialize(), wellFedSeconds: Math.max(0, (player.wellFedUntil || 0) - simulationTime), restedSeconds: Math.max(0, (player.restedUntil || 0) - simulationTime), softSeconds: Math.max(0, (player.softUntil || 0) - simulationTime), moltSeconds: Math.max(0, player.moltTimer || 0), moltKind: player.moltKind || null });
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable: progress lasts for this visit only */
  }
}

function goalReached() {
  return Object.entries(FIRST_GOAL).every(([type, wanted]) => (save.inventory[type] || 0) >= wanted);
}

function hasCraftedGear() {
  return save.craftedOnce;
}

const DEFAULT_QUICK_SLOTS = [null, null];

function quickSlots() {
  if (!Array.isArray(save.quickSlots)) save.quickSlots = DEFAULT_QUICK_SLOTS.slice(0, QUICK_SLOT_COUNT);
  return save.quickSlots;
}

function quickSlotViews() {
  return quickSlots().map((type) => {
    if (!type) return null;
    const readyAt = (player.consumableReadyAt || {})[type] || 0;
    const cooldownShare = Math.max(0, Math.min(1, (readyAt - simulationTime) / CONSUMABLES[type].cooldownSeconds));
    return { icon: RESOURCE_TYPES[type].icon, label: RESOURCE_TYPES[type].label, count: save.inventory[type] || 0, cooldownShare };
  });
}

function assignQuickSlot(index, type) {
  const slots = quickSlots();
  for (let other = 0; other < slots.length; other++) if (slots[other] === type) slots[other] = null;
  slots[index] = type;
  hud.log('notice', `${RESOURCE_TYPES[type].label} set to quick slot ${index + 1}`);
  refreshHud(null);
  if (backpack.isOpen) backpack.render();
  persist();
}

function useConsumable(type) {
  const consumable = CONSUMABLES[type];
  if (!consumable || !(save.inventory[type] > 0) || !player.alive) return false;
  player.consumableReadyAt ||= {};
  if (simulationTime < (player.consumableReadyAt[type] || 0)) {
    hud.log('notice', `${RESOURCE_TYPES[type].label} is not ready yet`);
    return false;
  }
  if (consumable.healShare) {
    const maxHealth = progression.maxHealth();
    if (progression.state.health >= maxHealth) {
      hud.log('notice', 'Already at full HP');
      return false;
    }
    const healed = Math.min(maxHealth - progression.state.health, Math.round(maxHealth * consumable.healShare));
    save.inventory[type] -= 1;
    progression.state.health += healed;
    floatAt(player.x, player.y + 2.2, player.z, `+${healed} ❤`, 'experience');
    soundAt('gatherSeaLettuce');
    hud.log('combat', `${RESOURCE_TYPES[type].label} heals you +${healed} · ${healthText()}`);
    persist();
  } else if (type === 'driedKelp' && !eatKelp()) return false;
  player.consumableReadyAt[type] = simulationTime + consumable.cooldownSeconds;
  refreshHud(null);
  if (backpack.isOpen) backpack.render();
  return true;
}

function craftSupply(type) {
  const recipe = CONSUMABLES[type].recipe;
  if (!recipe || !canAfford(recipe, save.inventory)) return false;
  for (const [material, amount] of Object.entries(recipe)) save.inventory[material] -= amount;
  save.inventory[type] = (save.inventory[type] || 0) + 1;
  soundAt('craft');
  hud.log('build', `Made a ${RESOURCE_TYPES[type].label.toLowerCase()}`);
  refreshHud(type);
  workbenchPanel.render();
  persist();
  return true;
}

function refreshHud(bumpedType) {
  if (bumpedType) hud.bumpBag();
  hud.setQuickSlots(quickSlotViews());
  hud.setBuildButton(underground || !burrow.exists, { surface: !underground });
  hud.setMoltButton(underground && !isMolting() ? progression.moltsAvailable() : 0);
}

const travelBlockedCells = new Map();
const travelPointKey = (point) => (point.station ? point.station.id : 'main');

function blockEntrance() {
  for (const point of burrow.travelPoints()) {
    const key = travelPointKey(point);
    if (!travelBlockedCells.has(key)) travelBlockedCells.set(key, world.blockCircle(point.surface.x, point.surface.z, ENTRANCE_BLOCK_RADIUS));
  }
  if (!underground && !world.isWalkable(player.x, player.z)) {
    const free = navigation.nearestWalkable(player.x, player.z, 10);
    if (free) Object.assign(player, { x: free.x, z: free.z });
  }
}

function entranceSpotProblem(x, z) {
  if (!world.isWalkable(x, z)) return 'blocked';
  if (world.heightAt(x, z) < TIDE_MIDDLE + TIDE_AMPLITUDE + ENTRANCE_HIGH_TIDE_MARGIN || world.retained.levelAt(x, z) > world.heightAt(x, z) - 0.05) return 'wet';
  for (let step = 0; step < 12; step++) {
    const angle = (step / 12) * Math.PI * 2;
    if (!world.isWalkable(x + Math.cos(angle) * ENTRANCE_CLEARANCE, z + Math.sin(angle) * ENTRANCE_CLEARANCE)) return 'blocked';
  }
  return null;
}

const spotFeedback = new THREE.Mesh(
  new THREE.RingGeometry(1.0, 1.35, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.5, 0.4), transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, fog: false }),
);
spotFeedback.renderOrder = 6;
spotFeedback.visible = false;
scene.add(spotFeedback);
let spotFeedbackUntil = 0;

function showSpotFeedback(x, z, valid, lasting = false) {
  spotFeedback.position.set(x, world.heightAt(x, z) + 0.15, z);
  spotFeedback.material.color.set(valid ? new THREE.Color(0.6, 2.4, 0.8) : new THREE.Color(2.4, 0.5, 0.4));
  spotFeedback.visible = true;
  spotFeedbackUntil = lasting ? Infinity : simulationTime + 1.2;
}

function startEntrancePlacement() {
  if (burrow.exists || player.dyingTimer > 0) return;
  closePanels();
  stopWalking();
  placement.entrance = true;
  hud.setMode('Tap dry sand above the tide line', cancelPlacement);
  refreshHud(null);
}

function cancelPlacement() {
  if (placement.relocatingExit) {
    burrow.restoreExit(placement.relocatingExit, workshop);
    placement.relocatingExit = null;
    save.burrow = burrow.serialize();
    blockEntrance();
    hud.log('build', 'Exit left where it was');
    persist();
  }
  placement.entrance = false;
  placement.preview = null;
  spotFeedbackUntil = 0;
  placement.station = null;
  placement.moving = null;
  placement.rack = false;
  burrow.showPlacementCells(false);
  placement.exitSpots = null;
  placement.exitRejected = null;
  placement.filling = false;
  hud.setMode(null);
  refreshHud(null);
}

function digEntranceAt(x, z) {
  burrow.setEntrance(x, z, world.heightAt(x, z));
  blockEntrance();
  save.burrow = burrow.serialize();
  soundAt('craft');
  hud.log('build', 'Burrow dug — walk to it, then tap Enter burrow');
  refreshHud(null);
  persist();
}

function previewEntranceSpot(x, z) {
  const preview = placement.preview;
  if (preview && preview.valid && Math.hypot(preview.x - x, preview.z - z) < ENTRANCE_CONFIRM_RADIUS) return chooseEntranceSpot(preview.x, preview.z);
  const problem = entranceSpotProblem(x, z);
  placement.preview = { x, z, valid: !problem };
  showSpotFeedback(x, z, !problem, true);
  if (problem) hud.setMode(problem === 'wet' ? 'Too wet here — try higher up the beach' : 'No room here — pick open sand', cancelPlacement);
  else hud.setMode('Tap the green ring again to dig here', cancelPlacement);
  return false;
}

function chooseEntranceSpot(x, z) {
  const problem = entranceSpotProblem(x, z);
  showSpotFeedback(x, z, !problem);
  if (problem) {
    hud.log('notice', problem === 'wet' ? 'Too wet — pick sand above the high-tide line' : 'No room — pick open sand away from rocks');
    return false;
  }
  placement.entrance = false;
  placement.preview = null;
  spotFeedbackUntil = simulationTime + 1.2;
  hud.setMode(null);
  if (!setDestination(x, z)) return false;
  destinationMarker.visible = true;
  player.digTarget = { kind: 'entrance', x, z, progress: 0 };
  refreshHud(null);
  return true;
}

function buildStation(kind, column, row, { free = false } = {}) {
  const definition = STATION_KINDS[kind];
  if (!definition || (!definition.multiple && burrow.hasStation(kind)) || (!free && !canAfford(definition.cost, save.inventory)) || (!free && stationBuildProblem(kind))) return false;
  const exitSpot = kind === 'exit' ? burrow.exitWallSpots().find((spot) => spot.column === column && spot.row === row) : null;
  if (kind === 'exit' && (!exitSpot || exitCellProblem(column, row))) return false;
  if (kind !== 'exit' && !burrow.freeCells().some((cell) => cell.column === column && cell.row === row)) return false;
  if (!free) for (const [type, amount] of Object.entries(definition.cost)) save.inventory[type] -= amount;
  const station = exitSpot ? burrow.addExit(exitSpot, workshop) : burrow.addStation(kind, column, row, workshop);
  if (kind === 'workshop') workshop.build();
  if (kind === 'exit') {
    blockEntrance();
    fog.reveal(station.surface.x, station.surface.z, 8);
  }
  save.burrow = burrow.serialize();
  const spot = burrow.stationSpot({ column, row });
  if (underground && !burrow.space.isWalkable(player.x, player.z)) {
    const free = burrow.space.nearestWalkable(spot.x, spot.z);
    if (free) Object.assign(player, { x: free.x, z: free.z });
  }
  if (kind === 'burrowHeart') for (const helper of helpers.list) if (!helper.job) helpers.setJob(helper.id, 'board');
  if (kind === 'pantry' && !boardOrders().length) addBoardOrder('driedKelp', station.id, DEFAULT_PANTRY_ORDER);
  soundAt('craft');
  hud.log('build', { workshop: 'Workshop built — tap it to craft', burrowHeart: 'Burrow heart built — tap it for the job board', exit: free ? 'Exit moved' : 'Exit dug — walk to it to go up', crabBed: 'Crab bed built — tap it to sleep' }[kind] || `${definition.label} built — tap it to open`);
  refreshHud(null);
  persist();
  return true;
}

function buildRackStation() {
  const definition = STATION_KINDS.dryingRack;
  if (rack.exists || !burrow.exists || !canAfford(definition.cost, save.inventory)) return false;
  const doorway = nearestDoorway(player.x, player.z);
  const built = doorway && rack.build(doorway);
  if (!built) {
    hud.log('notice', 'No room beside the entrance for a drying rack');
    return false;
  }
  for (const [type, amount] of Object.entries(definition.cost)) save.inventory[type] -= amount;
  rackBlockedCells = world.blockCircle(built.x, built.z, RACK_BLOCK_RADIUS);
  soundAt('craft');
  hud.log('build', 'Drying rack built beside your burrow entrance');
  refreshHud(null);
  persist();
  return true;
}

function eatKelp() {
  if (!(save.inventory.driedKelp > 0)) return false;
  save.inventory.driedKelp -= 1;
  player.wellFedUntil = simulationTime + WELL_FED_SECONDS;
  soundAt('gatherSeaLettuce');
  hud.log('progress', 'Well fed — HP comes back twice as fast for 90 s');
  persist();
  return true;
}

function isWellFed() {
  return simulationTime < (player.wellFedUntil || 0);
}

function walkToRack() {
  if (!rack.exists || underground) return false;
  const { x, z } = rack.state;
  if (Math.hypot(x - player.x, z - player.z) <= RACK_REACH + 0.4) {
    stopWalking();
    rackPanel.open();
    return true;
  }
  const stand = navigation.nearestWalkable(x - 1.8, z - 1.2, 6);
  if (!stand || !setDestination(stand.x, stand.z)) return false;
  player.walkGoal = 'rack';
  return true;
}

const NEST_LIMIT_BY_STAGE = { 1: 1, 2: 2 };
const SAND_PER_DUG_CELL = 2;
const burrowStage = () => (burrow.hasStation('burrowHeart') ? 2 : 1);

function stationBuildProblem(kind) {
  const definition = STATION_KINDS[kind];
  if (definition.requires && !burrow.hasStation(definition.requires)) return `Needs ${STATION_KINDS[definition.requires].label}`;
  if (kind === 'helperNest') {
    const nests = burrow.state.stations.filter((station) => station.kind === 'helperNest').length;
    const limit = NEST_LIMIT_BY_STAGE[burrowStage()];
    if (nests >= limit) return burrowStage() === 1 ? 'One nest until the Burrow heart' : `Nest limit ${limit}`;
  }
  return null;
}

function chooseStation(kind) {
  if (stationBuildProblem(kind)) return;
  buildPanel.close();
  if (STATION_KINDS[kind].surface) {
    buildRackStation();
    return;
  }
  placement.station = kind;
  if (kind === 'exit') {
    showExitPlacementSpots();
    hud.setMode(placement.exitSpots.length ? 'Tap a glowing spot by a tunnel wall' : 'No green spot yet — tap a red one to see why, or dig toward explored dry sand', cancelPlacement);
    return;
  }
  burrow.showPlacementCells(true);
  hud.setMode(`Tap a glowing spot to place the ${STATION_KINDS[kind].label.toLowerCase()}`, cancelPlacement);
}

const BOSS_EXIT_CLEARANCE = 24;
const EXIT_PICK_PIXELS = 44;
const exitMarkerProbe = new THREE.Vector3();
const EXIT_SPACING = 7;

const EXIT_PROBLEM_TEXT = {
  tight: 'Too little solid sand around this wall — an exit needs untouched sand on both sides and behind',
  outside: 'Too close to the edge of the world',
  unexplored: 'The sand above is unexplored — walk there first',
  boss: 'Too close to a boss lair',
  crowded: 'Too close to another entrance or exit',
  wet: 'The sand above is too wet — it floods at high tide',
  blocked: 'Rocks or structures above — no room for an opening',
};

function showExitPlacementSpots() {
  const spots = burrow.exitWallSpots({ includeTight: true }).map((spot) => ({ ...spot, problem: spot.tight ? 'tight' : exitCellProblem(spot.column, spot.row) }));
  placement.exitSpots = spots.filter((spot) => !spot.problem);
  placement.exitRejected = spots.filter((spot) => spot.problem);
  burrow.showExitSpots(placement.exitSpots, placement.exitRejected);
}

function exitCellProblem(column, row) {
  const surface = burrow.surfacePointOf(column, row);
  if (!surface || Math.abs(surface.x) > PLAY_HALF_SIZE - 4 || Math.abs(surface.z) > PLAY_HALF_SIZE - 4) return 'outside';
  if (!fog.isRevealed(surface.x, surface.z)) return 'unexplored';
  if (isInHold(surface.x, surface.z)) return 'boss';
  for (const enemy of enemies.list) {
    if (!enemy.definition.boss && !MINIBOSS_MATERIALS[enemy.kind]) continue;
    const home = enemy.home || enemy;
    if (Math.hypot(home.x - surface.x, home.z - surface.z) < BOSS_EXIT_CLEARANCE) return 'boss';
  }
  for (const point of burrow.travelPoints()) if (Math.hypot(point.surface.x - surface.x, point.surface.z - surface.z) < EXIT_SPACING) return 'crowded';
  return entranceSpotProblem(surface.x, surface.z);
}



function buildWorkshop() {
  if (!burrow.exists) {
    digEntranceAt(WORKSHOP_SPOT.x, WORKSHOP_SPOT.z);
  }
  if (burrow.hasStation('workshop') || !goalReached()) return false;
  const cell = burrow.freeCells().find((candidate) => candidate.column === DEFAULT_WORKSHOP_CELL.column && candidate.row === DEFAULT_WORKSHOP_CELL.row) || burrow.freeCells()[0];
  return buildStation('workshop', cell.column, cell.row);
}

function noticeHold() {
  if (save.holdFound || underground || !isInHold(player.x, player.z)) return;
  save.holdFound = true;
  hud.log('discovery', 'The shipwreck\'s galley! Something big is cooking in here');
  refreshHud(null);
  persist();
}

function noticeCamp() {
  if (save.campFound || underground || !isInCamp(player.x, player.z)) return;
  save.campFound = true;
  hud.log('discovery', 'A pirate camp! Giants sleep here — mind the rats and the cat');
  refreshHud(null);
  persist();
}

function noticeReef() {
  if (save.reefFound || underground || !world.isOnReef(player.x, player.z)) return;
  save.reefFound = true;
  hud.log('discovery', 'You found the reef — coral and sea glass wash up here');
  refreshHud(null);
  persist();
}

function workshopSpot() {
  const station = burrow.stationOf('workshop');
  return station && underground ? burrow.stationSpot(station) : null;
}

function setUnderground(value) {
  if (value !== underground) {
    cameraDistances[underground ? 'burrow' : 'surface'] = cameraDistance;
    cameraDistance = cameraDistanceFor(value);
  }
  underground = value;
  save.underground = value;
  camera.layers.set(value ? BURROW_LAYER : 0);
  scene.background = value ? BURROW_BACKGROUND : lighting.hazeColor;
  scene.fog.color.copy(value ? BURROW_BACKGROUND : lighting.hazeColor);
  scene.fog.density = value ? BURROW_FOG_DENSITY : lighting.hazeDensity;
  sun.intensity = value ? BURROW_SUN_INTENSITY : SURFACE_SUN_INTENSITY;
  scene.environmentIntensity = value ? BURROW_ENVIRONMENT_INTENSITY : SURFACE_ENVIRONMENT_INTENSITY;
  hud.root.classList.toggle('underground', value);
  if (!value) burrow.showPlacementCells(false);
}

function mainTravelPoint() {
  return burrow.travelPoints()[0];
}

function nearestTravelPoint() {
  let best = null;
  for (const point of burrow.travelPoints()) {
    const spot = underground ? point.below : point.surface;
    const distance = Math.hypot(spot.x - player.x, spot.z - player.z);
    if (!best || distance < best.distance) best = { point, distance };
  }
  return best;
}

function enterBurrow(point = mainTravelPoint()) {
  if (!burrow.exists) return false;
  closePanels();
  stopWalking();
  player.gatherTarget = null;
  player.combatTarget = null;
  setUnderground(true);
  const arrival = point.station ? burrow.space.nearestWalkable(point.below.x, point.below.z - 1.6) : burrow.space.nearestWalkable(burrow.shaftCenter.x, burrow.shaftCenter.z + 3.2 * SHAFT_ACCESS_ROW_STEP);
  Object.assign(player, { x: arrival.x, z: arrival.z, y: BURROW_ORIGIN.y, speed: 0, heading: 0 });
  hud.fade();
  updateCamera(0, true);
  refreshHud(null);
  persist();
  return true;
}

function exitBurrow(point = mainTravelPoint()) {
  if (!underground) return false;
  closePanels();
  cancelPlacement();
  stopWalking();
  setUnderground(false);
  fog.reveal(point.surface.x, point.surface.z);
  const { x, z } = point.surface;
  const outside = navigation.nearestWalkable(x - 2.2, z - 1.6, 10) || HOME_SPOT;
  Object.assign(player, { x: outside.x, z: outside.z, y: world.heightAt(outside.x, outside.z), speed: 0, heading: Math.PI + 0.4 });
  hud.fade();
  updateCamera(0, true);
  refreshHud(null);
  persist();
  return true;
}

function walkToEntrance({ enter = false, point = mainTravelPoint() } = {}) {
  if (!burrow.exists || underground) return false;
  const { x, z } = point.surface;
  if (Math.hypot(x - player.x, z - player.z) <= ENTRANCE_REACH + 0.3) {
    if (enter) return enterBurrow(point);
    stopWalking();
    hud.bumpTravel();
    return true;
  }
  const awayX = player.x - x;
  const awayZ = player.z - z;
  const awayLength = Math.hypot(awayX, awayZ) || 1;
  const stand = navigation.nearestWalkable(x + (awayX / awayLength) * (ENTRANCE_BLOCK_RADIUS + 0.8), z + (awayZ / awayLength) * (ENTRANCE_BLOCK_RADIUS + 0.8), 6);
  if (!stand || !setDestination(stand.x, stand.z)) return false;
  player.walkGoal = enter ? 'enterBurrow' : 'entrance';
  return true;
}

const travelProjection = new THREE.Vector3();

function travelOption() {
  if (!burrow.exists || isPlacing() || player.dyingTimer > 0 || isMolting()) return null;
  if (player.pathIndex < player.path.length || player.digTarget) return null;
  const nearest = nearestTravelPoint();
  if (!nearest) return null;
  if (underground) return nearest.distance <= (nearest.point.station ? STATION_REACH : ENTRANCE_REACH) ? 'exit' : null;
  return nearest.distance <= TRAVEL_REACH_SURFACE ? 'enter' : null;
}

function travel() {
  const option = travelOption();
  if (option === 'enter') return enterBurrow(nearestTravelPoint().point);
  if (option === 'exit') return exitBurrow(nearestTravelPoint().point);
  return false;
}

function travelActions() {
  const nearest = travelOption() && nearestTravelPoint();
  if (!nearest) return null;
  return { move: Boolean(nearest.point.station), remove: true };
}

function removeTravelPoint(point) {
  if (burrow.travelPoints().length <= 1) {
    hud.log('notice', point.station ? 'This exit is your only way in and out — dig another exit first' : 'This is your only way in and out — dig an exit first');
    return false;
  }
  world.unblockCells(travelBlockedCells.get(travelPointKey(point)) || []);
  travelBlockedCells.delete(travelPointKey(point));
  if (point.station) {
    if (player.walkGoal === point.station) stopWalking();
    burrow.removeExit(point.station);
    const refund = { ...STATION_KINDS.exit.cost };
    for (const [type, amount] of Object.entries(refund)) save.inventory[type] = (save.inventory[type] || 0) + amount;
    hud.log('build', `Exit filled in — +${materialsText(refund)}`);
  } else {
    burrow.closeEntrance();
    hud.log('build', 'Main entrance filled in — your exits still lead home');
  }
  if (underground && !burrow.space.isWalkable(player.x, player.z)) {
    const free = burrow.space.nearestWalkable(player.x, player.z);
    if (free) Object.assign(player, { x: free.x, z: free.z });
  }
  save.burrow = burrow.serialize();
  soundAt('craft');
  refreshHud(null);
  persist();
  return true;
}

function startMovingExit(station) {
  if (!station) return false;
  const point = burrow.travelPoints().find((candidate) => candidate.station === station);
  if (!underground && point) enterBurrow(point);
  closePanels();
  stopWalking();
  world.unblockCells(travelBlockedCells.get(station.id) || []);
  travelBlockedCells.delete(station.id);
  const { label, ...kept } = station;
  burrow.removeExit(station);
  placement.relocatingExit = structuredClone(kept);
  placement.station = 'exit';
  showExitPlacementSpots();
  hud.setMode('Tap a glowing spot to move the exit', cancelPlacement);
  return true;
}

function handleTravelAction(kind) {
  const nearest = travelOption() && nearestTravelPoint();
  if (!nearest) return false;
  if (kind === 'remove') return removeTravelPoint(nearest.point);
  if (kind === 'move') return startMovingExit(nearest.point.station);
  return false;
}

function walkToShaft(point = mainTravelPoint()) {
  if (!underground) return false;
  if (Math.hypot(point.below.x - player.x, point.below.z - player.z) <= ENTRANCE_REACH) {
    stopWalking();
    hud.bumpTravel();
    return true;
  }
  return setDestination(point.below.x, point.below.z);
}

function walkToStation(station) {
  const spot = burrow.stationSpot(station);
  if (Math.hypot(spot.x - player.x, spot.z - player.z) <= STATION_REACH) {
    openStation(station);
    return true;
  }
  if (!setDestination(spot.x, spot.z)) return false;
  player.walkGoal = station;
  return true;
}

function openStation(station) {
  stopWalking();
  const spot = burrow.stationSpot(station);
  turnToward(Math.atan2(spot.x - player.x, spot.z - player.z), 1);
  if (station.kind === 'workshop') workbenchPanel.open();
  else if (station.kind === 'exit') hud.bumpTravel();
  else if (station.kind === 'crabBed') bedPanel.open(station);
  else if (station.kind === 'helperNest' || station.kind === 'pantry') storagePanel.open(station.box, { station, title: stationName(station) });
  else if (isProcessStation(station)) processPanel.open(station);
  else if (station.kind === 'burrowHeart') boardPanel.open();
  else storagePanel.open(storage, { station, title: 'Storage' });
}

const FILL_PROBLEM_TEXT = {
  structure: 'A structure stands there',
  shaft: 'The way out has to stay open',
  exitAccess: 'This tunnel leads to an exit',
  occupied: 'Someone is standing there',
  cutsOff: 'That would cut off a structure',
  notBesideSand: 'Fill tunnels next to the sand walls',
};
const FILL_REFRESH_SECONDS = 0.3;

function startFillMode() {
  closePanels();
  stopWalking();
  placement.filling = true;
  placement.fillSelection = null;
  refreshFillCells();
  hud.setMode('Tap a glowing tunnel, tap it again to fill', cancelPlacement);
}

function refreshFillCells() {
  if (!placement.filling) return;
  const cells = burrow.fillableCells(occupiedBurrowCells());
  const selected = placement.fillSelection;
  if (selected && !cells.some((cell) => cell.column === selected.column && cell.row === selected.row)) placement.fillSelection = null;
  burrow.showFillCells(cells, placement.fillSelection);
}

function handleFillTap(clientX, clientY) {
  const point = burrow.pointOnFloor(clientX, clientY, camera, raycaster);
  const selected = placement.fillSelection;
  if (point && point.inside && !point.wall && selected && selected.column === point.column && selected.row === point.row) {
    placement.fillSelection = null;
    startFillCell(point.column, point.row);
    refreshFillCells();
    return;
  }
  if (point && point.inside && !point.wall && !burrow.fillProblem(point.column, point.row, occupiedBurrowCells())) {
    placement.fillSelection = { column: point.column, row: point.row };
    refreshFillCells();
    return;
  }
  placement.fillSelection = null;
  refreshFillCells();
  const ground = underground ? point : groundPointUnder(clientX, clientY);
  if (ground) setDestination(ground.x, ground.z);
}

function occupiedBurrowCells() {
  const cells = [burrow.cellOf(player.x, player.z)];
  for (const helper of helpers.list) if (helper.inside) cells.push(burrow.cellOf(helper.x, helper.z));
  return cells;
}

function startFillCell(column, row) {
  const problem = burrow.fillProblem(column, row, occupiedBurrowCells());
  if (problem) {
    hud.log('notice', FILL_PROBLEM_TEXT[problem] || 'Cannot fill there');
    return false;
  }
  const target = cellCenter(column, row);
  const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([stepColumn, stepRow]) => ({ column: column + stepColumn, row: row + stepRow })).filter((cell) => burrow.isDug(cell.column, cell.row));
  neighbours.sort((first, second) => {
    const firstCenter = cellCenter(first.column, first.row);
    const secondCenter = cellCenter(second.column, second.row);
    return Math.hypot(firstCenter.x - player.x, firstCenter.z - player.z) - Math.hypot(secondCenter.x - player.x, secondCenter.z - player.z);
  });
  const stand = neighbours[0] && cellCenter(neighbours[0].column, neighbours[0].row);
  if (!stand || !setDestination(stand.x, stand.z)) return false;
  destinationMarker.visible = false;
  player.digTarget = { kind: 'fill', column, row, x: target.x, z: target.z, progress: 0 };
  return true;
}

function startDigCell(column, row) {
  if (!burrow.canDig(column, row)) return false;
  const center = cellCenter(column, row);
  if (!setDestination(center.x, center.z)) return false;
  destinationMarker.visible = false;
  player.digTarget = { kind: 'cell', column, row, x: center.x, z: center.z, progress: 0 };
  return true;
}

function craftItem(category, kind) {
  const item = gear.craft(category, kind, save.inventory);
  if (!item) return null;
  const label = (category === 'shell' ? SHELLS : CLAWS)[kind].label;
  save.craftedOnce = true;
  const craftedTier = (category === 'shell' ? SHELLS : CLAWS)[kind].tier;
  if (craftedTier === 2) save.reefGearCrafted = true;
  if (craftedTier === 3) save.campGearCrafted = true;
  soundAt('craft');
  hud.log('progress', `New ${label.toLowerCase()}! Open the backpack to wear it`);
  hud.setBagDot(true);
  refreshHud(null);
  workbenchPanel.render();
  persist();
  return item;
}

function gearChanged(message) {
  if (message) hud.log('progress', message);
  applyWornLook();
  refreshHud(null);
  persist();
}

const CAMP_TOOL_TIER = 3;

function upgradeTools() {
  const tools = gear.upgradeTools(save.inventory);
  if (!tools) return null;
  if (gear.state.toolTier >= CAMP_TOOL_TIER) save.campGearCrafted = true;
  soundAt('craft');
  gearChanged(`New tools: ${tools.label}`);
  return tools;
}

function refineItem(id) {
  const found = gear.refine(id, save.inventory);
  if (!found) return null;
  soundAt('craft');
  gearChanged(`${found.definition.label} refined`);
  return found;
}

function modifyItem(id, modification) {
  const found = gear.modify(id, modification, save.inventory);
  if (!found) return null;
  soundAt('craft');
  gearChanged();
  return found;
}

function isMolting() {
  return (player.moltTimer || 0) > 0;
}

function isSoft() {
  return simulationTime < (player.softUntil || 0);
}

function startMolt(kind) {
  if (!underground || isMolting() || !progression.moltsAvailable() || !MOLT_KINDS[kind]) return false;
  stopWalking();
  player.combatTarget = null;
  player.gatherTarget = null;
  player.moltKind = kind;
  player.moltTimer = MOLT_SECONDS;
  moltPanel.close();
  hud.log('progress', `Molting… ${MOLT_SECONDS} s`);
  refreshHud(null);
  persist();
  return true;
}

function finishMolt() {
  const kind = player.moltKind;
  player.moltTimer = 0;
  player.moltKind = null;
  const sizeBefore = crabSize();
  if (!progression.molt(kind)) return;
  player.softUntil = simulationTime + SOFT_SECONDS;
  soundAt('levelUp');
  applyWornLook();
  hud.log('progress', `${MOLT_KINDS[kind].icon} New skin! ${MOLT_KINDS[kind].label} claw grew, body ${Math.round(bodyGrowth() * 100)}% · soft for ${SOFT_SECONDS / 60} min`);
  if (crabSize() > sizeBefore) {
    hud.log('progress', `You grew to size ${sizeLabel(crabSize())}`);
    const fit = playerStats().shellFit;
    if (fit.steps < 0) hud.log('notice', `Your ${SHELLS[gear.wornShell().kind].label.toLowerCase()} is too small now — find a size ${sizeLabel(crabSize())} shell`);
  }
  refreshHud(null);
  persist();
}

function salvageItem(id) {
  const found = gear.findItem(id);
  const refund = gear.salvage(id, save.inventory);
  if (!refund) return null;
  soundAt('craft');
  hud.log('loot', `${found.definition.label} salvaged — +${materialsText(refund)}`);
  backpack.render();
  refreshHud(null);
  persist();
  return refund;
}

function materialsText(materials) {
  return Object.entries(materials).map(([type, amount]) => `${amount} ${RESOURCE_TYPES[type].icon}`).join(' ');
}

const ALWAYS_KNOWN_MATERIALS = new Set(['shellBits']);

function noteDiscoveries() {
  const known = new Set(save.discovered || []);
  for (const pile of [save.inventory, storage.inventory]) {
    for (const [type, amount] of Object.entries(pile)) if (amount > 0) known.add(type);
  }
  save.discovered = [...known];
  return known;
}

function isRecipeDiscovered(category, kind, definition) {
  const owned = category === 'shell' ? [...gear.state.shells, ...storage.shells] : [...gear.state.claws, ...storage.claws];
  if (owned.some((item) => item.kind === kind)) return true;
  const known = noteDiscoveries();
  const keyMaterials = Object.keys(definition.cost).filter((type) => !ALWAYS_KNOWN_MATERIALS.has(type));
  return !keyMaterials.length || keyMaterials.some((type) => known.has(type));
}

const RACK_MOVE_RADIUS = 12;
const RACK_ENTRANCE_CLEARANCE = 3;

function closeStructurePanels() {
  for (const panel of [workbenchPanel, storagePanel, rackPanel, processPanel, boardPanel, bedPanel]) if (panel.isOpen) panel.close();
}

function startMovingStructure(target) {
  const kind = typeof target === 'string' ? target : target.kind;
  closeStructurePanels();
  stopWalking();
  const label = STATION_KINDS[kind].label.toLowerCase();
  if (kind === 'dryingRack') {
    placement.rack = true;
    hud.setMode(`Tap open sand near your burrow entrance to move the ${label}`, cancelPlacement);
    return;
  }
  placement.moving = typeof target === 'string' ? burrow.stationOf(kind) : target;
  burrow.showPlacementCells(true);
  hud.setMode(`Tap a glowing spot to move the ${label}`, cancelPlacement);
}

function moveStationTo(column, row) {
  const station = placement.moving;
  if (!station || !burrow.freeCells().some((cell) => cell.column === column && cell.row === row)) return false;
  burrow.moveStation(station, column, row, workshop);
  save.burrow = burrow.serialize();
  if (underground && !burrow.space.isWalkable(player.x, player.z)) {
    const free = burrow.space.nearestWalkable(player.x, player.z);
    if (free) Object.assign(player, { x: free.x, z: free.z });
  }
  soundAt('craft');
  hud.log('build', `${STATION_KINDS[station.kind].label} moved`);
  persist();
  return true;
}

function nearestDoorway(x, z) {
  return burrow.travelPoints().map((point) => point.surface).reduce((best, surface) => (!best || Math.hypot(surface.x - x, surface.z - z) < Math.hypot(best.x - x, best.z - z) ? surface : best), null);
}

function rackSpotProblem(x, z) {
  const doorways = burrow.travelPoints().map((point) => point.surface);
  if (!doorways.some((doorway) => Math.hypot(x - doorway.x, z - doorway.z) <= RACK_MOVE_RADIUS)) return 'far';
  if (doorways.some((doorway) => Math.hypot(x - doorway.x, z - doorway.z) < RACK_ENTRANCE_CLEARANCE)) return 'blocked';
  if (world.heightAt(x, z) < TIDE_MIDDLE + TIDE_AMPLITUDE || world.retained.levelAt(x, z) > world.heightAt(x, z) - 0.05) return 'wet';
  for (let around = -1; around < 8; around++) {
    const reach = around < 0 ? 0 : 1.8;
    if (!world.isWalkable(x + Math.cos(around) * reach, z + Math.sin(around) * reach)) return 'blocked';
  }
  return null;
}

function moveRackTo(x, z) {
  world.unblockCells(rackBlockedCells);
  const problem = rackSpotProblem(x, z);
  showSpotFeedback(x, z, !problem);
  if (problem) {
    rackBlockedCells = world.blockCircle(rack.state.x, rack.state.z, RACK_BLOCK_RADIUS);
    hud.log('notice', { far: 'Keep the rack near a burrow entrance or exit', wet: 'Too wet here — the kelp would never dry', blocked: 'No room here — pick open sand' }[problem]);
    return false;
  }
  rack.moveTo(x, z);
  rackBlockedCells = world.blockCircle(x, z, RACK_BLOCK_RADIUS);
  if (!world.isWalkable(player.x, player.z)) {
    const free = navigation.nearestWalkable(player.x, player.z, 6);
    if (free) Object.assign(player, { x: free.x, z: free.z });
  }
  soundAt('craft');
  hud.log('build', 'Drying rack moved');
  persist();
  return true;
}

function boxIsEmpty(box) {
  return !box.shells.length && !box.claws.length && !Object.values(box.inventory).some((amount) => amount > 0);
}

function dismantleStructure(target) {
  const kind = typeof target === 'string' ? target : target.kind;
  const targetStation = typeof target === 'string' ? (kind === 'dryingRack' ? null : burrow.stationOf(kind)) : target;
  const definition = STATION_KINDS[kind];
  if (kind === 'storage' && !boxIsEmpty(storage)) {
    hud.log('notice', 'Empty the storage first');
    return false;
  }
  if (kind === 'helperNest' && helpers.list.some((helper) => helper.nestId === targetStation.id)) {
    hud.log('notice', 'Helpers live in this nest — it has to stay');
    return false;
  }
  if (kind === 'helperNest' && !boxIsEmpty(targetStation.box)) {
    hud.log('notice', 'Empty the nest box first');
    return false;
  }
  const refund = { ...definition.cost };
  if (kind === 'dryingRack') {
    if (!rack.exists) return false;
    if (player.walkGoal === 'rack') stopWalking();
    const hanging = rack.state.slots.filter((slot) => slot !== null).length * RACK_BATCH;
    if (hanging) refund.seaLettuce = (refund.seaLettuce || 0) + hanging;
    if (rack.state.ready) refund.driedKelp = rack.state.ready;
    world.unblockCells(rackBlockedCells);
    rackBlockedCells = [];
    rack.remove();
  } else {
    const station = targetStation;
    if (!station) return false;
    if (player.walkGoal === station) stopWalking();
    if (isProcessStation(station)) {
      const { recipe, working, ready } = processView(station);
      if (working.length) refund[recipe.input] = (refund[recipe.input] || 0) + working.length * recipe.inputAmount;
      if (ready) refund[recipe.output] = (refund[recipe.output] || 0) + ready;
    }
    burrow.removeStation(station);
    if (kind === 'workshop') workshop.remove();
    save.burrow = burrow.serialize();
  }
  closeStructurePanels();
  for (const [type, amount] of Object.entries(refund)) save.inventory[type] = (save.inventory[type] || 0) + amount;
  soundAt('craft');
  hud.log('build', `${definition.label} dismantled — +${materialsText(refund)}`);
  refreshHud(null);
  persist();
  return true;
}

function wearItem(id, hand = 'big') {
  const problem = gear.state.claws.some((item) => item.id === id) && gear.wearProblem(id, hand, progression.state.molts.length);
  if (problem) {
    hud.log('notice', problem);
    return false;
  }
  if (!gear.wear(id, hand, progression.state.molts.length)) return false;
  applyWornLook();
  backpack.render();
  persist();
  return true;
}

function unequipItem(category) {
  if (!gear.unequip(category)) return false;
  applyWornLook();
  backpack.render();
  persist();
  return true;
}

function walkToWorkshop() {
  const station = burrow.stationOf('workshop');
  if (!station) return false;
  if (!underground) return walkToEntrance({ enter: true });
  return walkToStation(station);
}

function setDestination(x, z, gatherTarget = null) {
  const path = space().findPath(player.x, player.z, x, z);
  if (!path.length) return false;
  player.path = path;
  player.pathIndex = 0;
  player.gatherTarget = gatherTarget;
  player.gatherProgress = 0;
  player.headingToWorkshop = false;
  player.walkGoal = null;
  clearDigTarget();
  player.combatTarget = null;
  const end = path[path.length - 1];
  destinationMarker.position.set(end.x, space().heightAt(end.x, end.z) + 0.12, end.z);
  destinationMarker.visible = !gatherTarget;
  if (!save.hasMoved) {
    save.hasMoved = true;
  }
  return true;
}

function clearDigTarget() {
  const dig = player.digTarget;
  if (dig && dig.kind === 'cell' && dig.progress > 0) burrow.setDigProgress(-1, 0);
  if (dig && dig.kind === 'fill') burrow.setFillProgress(-1, 0);
  player.digTarget = null;
}

function stopWalking() {
  player.headingToWorkshop = false;
  player.walkGoal = null;
  clearDigTarget();
  player.path = [];
  player.pathIndex = 0;
  destinationMarker.visible = false;
}

function soundAt(name, x = player.x, z = player.z, volume = 1) {
  if (!audioUnlocked) return;
  audio.play(name, { distance: Math.hypot(x - player.x, z - player.z), volume });
}

function updateAudio(deltaTime) {
  if (!audioUnlocked) return;
  player.stepDistance = (player.stepDistance || 0) + player.speed * deltaTime;
  if (player.stepDistance >= STEP_LENGTH) {
    player.stepDistance = 0;
    const surface = player.waterDepth > HEAD_UNDERWATER_DEPTH ? null : player.waterDepth > 0.04 ? 'stepSplash' : player.y < tideState.wetLevel ? 'stepWetSand' : 'stepSand';
    if (surface) soundAt(surface, player.x, player.z, 0.8);
    const inPool = !underground && world.retained.levelAt(player.x, player.z) > player.y;
    if (inPool && random() < FISH_PLOP_PER_SECOND * 3) soundAt('fishPlop', player.x + 3, player.z + 2, 0.7);
  }
  ambienceTimer -= deltaTime;
  if (ambienceTimer > 0) return;
  ambienceTimer = AMBIENCE_UPDATE_SECONDS;
  const heightAboveSea = player.y - tideState.seaLevel;
  audio.setAmbience({
    waveIntensity: underground ? 0.06 : Math.max(0.15, 1 - THREE.MathUtils.smoothstep(heightAboveSea, 0.5, 9)),
    wind: underground ? 0 : THREE.MathUtils.smoothstep(-player.z, 65, 95),
    underwater: player.waterDepth > HEAD_UNDERWATER_DEPTH,
  });
  const fighting = !underground && enemies.list.some((enemy) => enemy.state === 'chase' || enemy.state === 'landing');
  audio.setMusicMood(fighting ? 'combat' : !underground && player.z < GULL_MOOD_EDGE_Z ? 'gull' : 'calm');
}

function moltTotal() {
  return progression.state.molts.length;
}

function crabSize() {
  return crabSizeOf(moltTotal());
}

function bodyGrowth() {
  return 1 + GROWTH_PER_MOLT * moltTotal();
}

function playerStats() {
  const stats = gear.stats(progression.attackBonus(), { ...progression.combatModifiers(), defenseFactor: isSoft() ? SOFT_DEFENSE_FACTOR : 1, crabSize: crabSize() });
  stats.speedFactor *= 1 + SPEED_GROWTH_PER_MOLT * moltTotal();
  return stats;
}

function rollDamageDetailed(attack, defense) {
  const spread = 1 - DAMAGE_SPREAD + 2 * DAMAGE_SPREAD * random();
  const blocked = Math.min(attack - 1, defense / 2);
  return { damage: Math.max(1, Math.round(Math.max(1, attack - defense / 2) * spread)), blocked, spread };
}

const rollDamage = (attack, defense) => rollDamageDetailed(attack, defense).damage;
const roundedText = (value) => String(Math.round(value * 10) / 10);
const rollText = (spread) => `roll ${Math.round(spread * 100)} %`;

const HANDS_HOLDING_SHIELD = () => ['big', 'small'].map((hand) => gear.heldIn(hand)).filter((item) => item && CLAWS[item.kind].shield);

function shieldParts() {
  return HANDS_HOLDING_SHIELD().map((item) => `${CLAWS[item.kind].label.toLowerCase()} +${shieldArmourOf(CLAWS[item.kind], item)}`);
}

function armourParts() {
  const item = gear.wornShell();
  if (!item) return [isSoft() ? 'no shell, soft skin' : 'no shell', ...shieldParts()].join(', ');
  const definition = gear.wornShellDefinition();
  const qualityDefense = Math.round(definition.defense * qualityFactor(item));
  const parts = [`${QUALITIES[item.quality || 'fine'].label} ${definition.label.toLowerCase()} ${qualityDefense}`];
  const reinforcementBonus = shellDefenseOf(definition, item) - qualityDefense;
  if (reinforcementBonus) parts.push(`${REINFORCEMENTS[item.reinforcement].label.toLowerCase()} +${reinforcementBonus}`);
  parts.push(...shieldParts());
  if (isSoft()) parts.push(`soft skin ×${SOFT_DEFENSE_FACTOR}`);
  return parts.join(', ');
}

const healthText = () => `HP ${Math.max(0, Math.ceil(progression.state.health))}/${progression.maxHealth()}`;

function floatAt(x, y, z, text, kind) {
  projected.set(x, y, z).project(camera);
  if (projected.z > 1) return;
  hud.floatText((projected.x * 0.5 + 0.5) * innerWidth, (-projected.y * 0.5 + 0.5) * innerHeight, text, kind);
}

function engage(enemy) {
  if (!enemies.alive(enemy)) return false;
  stopWalking();
  player.gatherTarget = null;
  player.combatTarget = enemy;
  player.attackTimer = PLAYER_FIRST_STRIKE_SECONDS;
  player.combatRepathTimer = 0;
  if (!save.hasMoved) {
    save.hasMoved = true;
  }
  return true;
}

function strike(enemy) {
  const stats = playerStats();
  player.hitCount++;
  const isSting = stats.ability && stats.ability.id === 'sting' && player.hitCount % (stats.ability.everyHits || STING_EVERY_HITS) === 0;
  const pierces = Boolean(stats.ability && stats.ability.pierce);
  const hand = stats.strikingHands[player.hitCount % stats.strikingHands.length];
  const roll = rollDamageDetailed(stats.handAttack[hand], pierces ? 0 : defenseOf(enemy));
  const damage = roll.damage * (isSting ? 2 : 1);
  const armourText = pierces ? 'armour pierced' : `its armour ${defenseOf(enemy)} blocks ${roundedText(roll.blocked)}`;
  hud.log('combat', `You hit ${enemy.definition.label} for ${damage} — ${stats.strikingHands.length > 1 ? `${HAND_LABELS[hand].toLowerCase()}, ` : ''}attack ${stats.handAttack[hand]}, ${armourText}, ${rollText(roll.spread)}${isSting ? ', sting ×2' : ''}`);
  player.lastCombatTime = simulationTime;
  floatAt(enemy.x, enemy.y + enemy.altitude + enemy.definition.barHeight * 0.7, enemy.z, isSting ? `${damage}!` : String(damage), isSting ? 'sting' : 'dealt');
  hermit.playAttack(isSting ? 'both' : hand);
  soundAt('clawSnap', enemy.x, enemy.z);
  soundAt(isSting ? 'stingHit' : 'hitThud', enemy.x, enemy.z);
  enemies.damage(enemy, damage, simulationTime, player);
  progression.practiceClaws();
  if (stats.healOnHit && progression.state.health < progression.maxHealth()) {
    progression.state.health = Math.min(progression.maxHealth(), progression.state.health + stats.healOnHit);
    hud.log('combat', `Your claws heal you +${stats.healOnHit} · ${healthText()}`);
    floatAt(player.x, player.y + 2.2, player.z, `+${stats.healOnHit} ❤`, 'experience');
  }
}

function hitPlayer(enemy) {
  if (player.dyingTimer > 0) return;
  const stats = playerStats();
  if (stats.blockChance && Math.random() < stats.blockChance) {
    const shield = HANDS_HOLDING_SHIELD().map((item) => CLAWS[item.kind].label.toLowerCase()).join(' and ');
    hud.log('combat', `Your ${shield} blocks ${enemy.definition.label} — ${Math.round(stats.blockChance * 100)}% block chance`);
    floatAt(player.x, player.y + 2.4, player.z, 'Blocked', 'experience');
    soundAt('hitThud', player.x, player.z);
    player.lastCombatTime = simulationTime;
    return;
  }
  const roll = rollDamageDetailed(attackOf(enemy), stats.defense);
  let damage = roll.damage;
  const modifiers = [];
  if (stats.ability && stats.ability.dreadFactor) {
    damage = Math.max(1, Math.round(damage * stats.ability.dreadFactor));
    modifiers.push(`dread ×${stats.ability.dreadFactor}`);
  }
  const braced = stats.ability && stats.ability.id === 'brace' && player.speed < BRACE_MAXIMUM_SPEED;
  if (braced) {
    const braceFactor = stats.ability.damageFactor || BRACE_DAMAGE_FACTOR;
    damage = Math.max(1, Math.round(damage * braceFactor));
    modifiers.push(`brace ×${braceFactor}`);
  }
  if (stats.thorns && enemies.alive(enemy)) {
    floatAt(enemy.x, enemy.y + enemy.definition.barHeight * 0.7, enemy.z, `${stats.thorns}`, 'sting');
    hud.log('combat', `Your spikes hit ${enemy.definition.label} for ${stats.thorns}`);
    enemies.damage(enemy, stats.thorns, simulationTime);
  }
  progression.state.health -= damage;
  player.lastHitBy = enemy;
  hud.log('combat', `${enemy.definition.label} hits you for ${damage} — attack ${attackOf(enemy)}, your armour ${stats.defense} blocks ${roundedText(roll.blocked)} [${armourParts()}], ${rollText(roll.spread)}${modifiers.length ? `, ${modifiers.join(', ')}` : ''} · ${healthText()}`);
  player.lastCombatTime = simulationTime;
  floatAt(player.x, player.y + 2.4, player.z, `−${damage}`, 'taken');
  hud.flashHurt();
  const awayX = player.x - enemy.x;
  const awayZ = player.z - enemy.z;
  const awayLength = Math.hypot(awayX, awayZ) || 1;
  const strength = THREE.MathUtils.clamp(damage / (progression.maxHealth() * 0.2), 0.4, 1.6);
  tryStep(player.x + (awayX / awayLength) * KNOCKBACK_DISTANCE * strength, player.z + (awayZ / awayLength) * KNOCKBACK_DISTANCE * strength);
  const sideways = Math.sign(Math.sin(Math.atan2(-awayX, -awayZ) - player.heading)) || 1;
  hermit.playHurt(strength, sideways);
  soundAt('shellClonk');
  const idle = !player.combatTarget && !player.gatherTarget && player.pathIndex >= player.path.length && !keyboardDirection();
  if (idle) engage(enemy);
  if (progression.state.health <= 0) die();
}


function bossRestRemainingMs(kind) {
  const defeatedAt = save.bossDefeatedAt && save.bossDefeatedAt[kind];
  return defeatedAt ? defeatedAt + BOSS_REST_MS - wallClock() : 0;
}

function regionAt(x, z) {
  if (isInHold(x, z)) return 'hold';
  if (isInCamp(x, z)) return 'camp';
  if (world.isOnReef(x, z)) return 'reef';
  return 'beach';
}

function giveMaterial(type, amount, enemy) {
  save.inventory[type] = (save.inventory[type] || 0) + amount;
  hud.log('loot', `+${amount} ${RESOURCE_TYPES[type].label}`);
  floatAt(enemy.x, enemy.y + enemy.altitude + enemy.definition.barHeight * 0.55, enemy.z, `+${amount} ${RESOURCE_TYPES[type].label}`, 'experience');
  refreshHud(type);
}

function dropLoot(enemy) {
  const trophy = BOSS_TROPHIES[enemy.kind];
  if (trophy) {
    save.bossDefeatedAt = { ...(save.bossDefeatedAt || {}), [enemy.kind]: wallClock() };
    giveMaterial(trophy.material, BOSS_MATERIAL_DROP, enemy);
    const pearls = enemy.definition.pearlCount || 0;
    const message = [`${BOSS_MATERIAL_DROP} ${RESOURCE_TYPES[trophy.material].label.toLowerCase()}s`];
    if (pearls) message.push(`· ${pearls} pearls`);
    if (random() < BOSS_ITEM_CHANCE) {
      gear.grant(trophy.category, trophy.kind);
      hud.setBagDot(true);
      const itemLabel = (trophy.category === 'shell' ? SHELLS : CLAWS)[trophy.kind].label;
      message.push(`and ${itemLabel}!`);
      soundAt('craft');
    }
    const opening = enemy.definition.flees ? `${enemy.definition.label} lost his nerve and fled! Dropped` : `${enemy.definition.label} dropped`;
    hud.log('loot', `${opening} ${message.join(' ')} · back in 24 h`);
    return;
  }
  const minibossMaterial = MINIBOSS_MATERIALS[enemy.kind];
  if (minibossMaterial) {
    giveMaterial(minibossMaterial, BOSS_MATERIAL_DROP, enemy);
    const pearls = enemy.definition.pearlCount || 0;
    hud.log('loot', `${enemy.definition.label} dropped ${BOSS_MATERIAL_DROP} ${RESOURCE_TYPES[minibossMaterial].label.toLowerCase()}s${pearls ? ` · ${pearls} pearls` : ''} · back in 15 min`);
    return;
  }
  const drops = enemy.definition.drops || [];
  if (drops.length && random() < COMMON_DROP_CHANCE) giveMaterial(drops[Math.floor(random() * drops.length)], 1, enemy);
}

function rewardHelperKill(helper, enemy) {
  const experience = experienceForKill(enemy.definition.experience, levelOf(enemy), helper.level || 1);
  const levelsGained = helpers.gainExperience(helper, experience);
  hud.log('helperCombat', `${helpers.nameOf(helper)} defeated the ${enemy.definition.label.toLowerCase()} (+${experience} XP)`);
  floatAt(enemy.x, enemy.y + enemy.altitude + enemy.definition.barHeight, enemy.z, `Helper +${experience} XP`, 'experience');
  const minibossMaterial = MINIBOSS_MATERIALS[enemy.kind];
  const trophy = BOSS_TROPHIES[enemy.kind];
  const drops = enemy.definition.drops || [];
  if (trophy) {
    save.bossDefeatedAt = { ...(save.bossDefeatedAt || {}), [enemy.kind]: wallClock() };
    helpers.bringHome(helper, trophy.material, BOSS_MATERIAL_DROP);
  } else if (minibossMaterial) helpers.bringHome(helper, minibossMaterial, BOSS_MATERIAL_DROP);
  else if (drops.length) helpers.bringHome(helper, drops[Math.floor(random() * drops.length)], 1);
  if (levelsGained) hud.log('helper', `${helpers.nameOf(helper)} reached level ${helper.level}!`);
  if (helpersPanel.isOpen) helpersPanel.render();
  persist();
}

function rewardAssistingHelpers(enemy, attacker) {
  const assistingIds = enemy.assistingHelperIds;
  enemy.assistingHelperIds = null;
  if (!assistingIds) return;
  for (const helper of helpers.list) {
    if (helper === attacker || !assistingIds.has(helper.id)) continue;
    const helperExperience = experienceForKill(enemy.definition.experience, levelOf(enemy), helper.level || 1);
    hud.log('helperCombat', `${helpers.nameOf(helper)} helped defeat the ${enemy.definition.label.toLowerCase()} (+${helperExperience} XP)`);
    if (helpers.gainExperience(helper, helperExperience)) hud.log('helper', `${helpers.nameOf(helper)} reached level ${helper.level}!`);
  }
}

function enemyKilled(enemy, attacker = null) {
  dropStolenGear(enemy);
  if (player.combatTarget === enemy) player.combatTarget = null;
  rewardAssistingHelpers(enemy, attacker);
  if (attacker && attacker.helperId && attacker.job === 'follow') {
    const helperExperience = experienceForKill(enemy.definition.experience, levelOf(enemy), attacker.level || 1);
    hud.log('helperCombat', `${helpers.nameOf(attacker)} landed the final blow (+${helperExperience} XP)`);
    if (helpers.gainExperience(attacker, helperExperience)) hud.log('helper', `${helpers.nameOf(attacker)} reached level ${attacker.level}!`);
  } else if (attacker && attacker.helperId) {
    rewardHelperKill(attacker, enemy);
    return;
  }
  const experience = experienceForKill(enemy.definition.experience, levelOf(enemy), progression.state.level);
  const levelsGained = progression.gainExperience(experience);
  hud.log('combat', `${enemy.definition.label} defeated (+${experience} XP)`);
  floatAt(enemy.x, enemy.y + enemy.altitude + enemy.definition.barHeight, enemy.z, `+${experience} XP`, 'experience');
  if (enemy.definition.pearlChance && random() < enemy.definition.pearlChance) {
    const pearls = enemy.definition.pearlCount || 1;
    save.inventory.pearls = (save.inventory.pearls || 0) + pearls;
    if (!BOSS_TROPHIES[enemy.kind] && !MINIBOSS_MATERIALS[enemy.kind]) hud.log('loot', pearls > 1 ? `The ${enemy.definition.label.toLowerCase()} dropped ${pearls} pearls!` : `The ${enemy.definition.label.toLowerCase()} dropped a pearl!`);
    refreshHud('pearls');
  }
  dropLoot(enemy);
  if (levelsGained) announceLevel();
  persist();
}

function announceLevel() {
  soundAt('levelUp');
  const moltReady = progression.moltsAvailable() ? ' · you can molt in your burrow' : '';
  hud.log('progress', `Level ${progression.state.level}! Max HP +8 · attack +1${moltReady}`);
}

function wakeSpot() {
  if (burrow.exists) return burrow.space.nearestWalkable(burrow.shaftCenter.x, burrow.shaftCenter.z + 2.2 * SHAFT_ACCESS_ROW_STEP);
  return navigation.nearestWalkable(HOME_SPOT.x, HOME_SPOT.z, 10) || HOME_SPOT;
}

function die() {
  if (isPlacing()) cancelPlacement();
  stopWalking();
  player.gatherTarget = null;
  player.combatTarget = null;
  player.dyingTimer = DEATH_ANIMATION_SECONDS;
  hermit.playDeath();
  soundAt('death');
  enemies.calmAll(RESPAWN_CALM_SECONDS + DEATH_ANIMATION_SECONDS, simulationTime);
  workbenchPanel.close();
  if (backpack.isOpen) backpack.close();
  hud.showDeath();
}

function stealWornGear(dropped) {
  const looter = player.lastHitBy;
  player.lastHitBy = null;
  if (!looter || !enemies.alive(looter) || !canLoot(looter.kind)) return;
  const taken = takeFrom(looter, dropped);
  if (!taken.length) return;
  const names = taken.map((item) => itemName(SHELLS[item.kind] ? 'shell' : 'claws', item)).join(' and ');
  hud.log('combat', `${looter.definition.label} took your ${names}`);
}

function dropStolenGear(enemy) {
  if (!lootedItems(enemy).length) return;
  const returned = giveUpLoot(enemy);
  remains.add({ x: enemy.x, z: enemy.z, inventory: {}, gear: returned });
  const names = [...returned.shells, ...returned.claws].map((item) => itemName(SHELLS[item.kind] ? 'shell' : 'claws', item)).join(' and ');
  hud.log('loot', `${enemy.definition.label} dropped your ${names}`);
}

function finishDeath() {
  const dropped = gear.dropAll();
  stealWornGear(dropped);
  progression.loseSkillOnDeath();
  player.softUntil = 0;
  const carried = Object.fromEntries(Object.entries(save.inventory).filter(([, amount]) => amount > 0));
  if (dropped.shells.length || dropped.claws.length || Object.keys(carried).length) remains.add({ x: player.x, z: player.z, inventory: carried, gear: dropped });
  save.inventory = {};
  applyWornLook();
  hermit.resetPose();
  progression.state.health = progression.maxHealth();
  player.lastCombatTime = -100;
  const spot = wakeSpot();
  setUnderground(burrow.exists);
  Object.assign(player, { x: spot.x, z: spot.z, y: space().heightAt(spot.x, spot.z), speed: 0 });
  updateCamera(0, true);
  hud.log('combat', 'You were defeated — your things wait in your remains');
  refreshHud(null);
  persist();
}

function recoverRemains(entry) {
  for (const [type, amount] of Object.entries(entry.inventory)) save.inventory[type] = (save.inventory[type] || 0) + amount;
  gear.restore(entry.gear);
  applyWornLook();
  remains.remove(entry);
  soundAt('recoverRemains');
  hud.log('loot', 'You recovered your things');
  refreshHud('remains');
  persist();
}

function tryStep(nextX, nextZ) {
  if (space().isWalkable(nextX, nextZ)) {
    player.x = nextX;
    player.z = nextZ;
    return true;
  }
  if (space().isWalkable(nextX, player.z)) {
    player.x = nextX;
    return true;
  }
  if (space().isWalkable(player.x, nextZ)) {
    player.z = nextZ;
    return true;
  }
  return false;
}

function keyboardDirection() {
  const right = (heldKeys.has('d') || heldKeys.has('arrowright') ? 1 : 0) - (heldKeys.has('a') || heldKeys.has('arrowleft') ? 1 : 0);
  const forward = (heldKeys.has('w') || heldKeys.has('arrowup') ? 1 : 0) - (heldKeys.has('s') || heldKeys.has('arrowdown') ? 1 : 0);
  if (!right && !forward) return null;
  const forwardX = -Math.sin(CAMERA_YAW);
  const forwardZ = Math.cos(CAMERA_YAW);
  const x = forwardX * forward - forwardZ * right;
  const z = forwardZ * forward + forwardX * right;
  const length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}

function turnToward(targetHeading, deltaTime) {
  let difference = targetHeading - player.heading;
  difference = Math.atan2(Math.sin(difference), Math.cos(difference));
  player.heading += difference * Math.min(1, TURN_RATE * deltaTime);
}

function updatePlayer(deltaTime) {
  if (isMolting()) {
    player.moltTimer -= deltaTime;
    player.speed = 0;
    if (player.moltTimer <= 0) finishMolt();
    hermit.update(deltaTime, { x: player.x, y: player.y, z: player.z, heading: player.heading, speed: 0, working: false, withdrawn: true, groundNormal: player.groundNormal });
    return;
  }
  if (player.dyingTimer > 0) {
    player.dyingTimer -= deltaTime;
    player.speed = 0;
    if (player.dyingTimer <= 0) finishDeath();
    hermit.update(deltaTime, { x: player.x, y: player.y, z: player.z, heading: player.heading, speed: 0, working: false, groundNormal: player.groundNormal });
    return;
  }
  const waterDepth = space().waterLevelAt(player.x, player.z, tideState.seaLevel) - player.y;
  const inkSlow = simulationTime < (player.inkedUntil || 0) ? player.inkSpeedFactor : 1;
  const topSpeed = (waterDepth > 0.7 ? WADE_SPEED : WALK_SPEED) * playerStats().speedFactor * inkSlow * (isRested() ? RESTED_SPEED_FACTOR : 1);
  let targetSpeed = 0;
  const steering = keyboardDirection();
  const combatTarget = player.combatTarget && enemies.alive(player.combatTarget) ? player.combatTarget : null;
  if (!combatTarget) player.combatTarget = null;
  let inStrikingRange = false;
  if (combatTarget && !steering) {
    const reach = PLAYER_ATTACK_REACH * bodyGrowth() + Math.max(combatTarget.definition.radius, combatTarget.definition.bodyReach || 0) + (player.wasInStrikingRange ? STRIKING_RANGE_TOLERANCE : 0);
    const distance = Math.hypot(combatTarget.x - player.x, combatTarget.z - player.z);
    if (distance <= reach) {
      inStrikingRange = true;
      player.path = [];
      player.pathIndex = 0;
    } else {
      player.combatRepathTimer -= deltaTime;
      if (player.combatRepathTimer <= 0 || player.pathIndex >= player.path.length) {
        player.combatRepathTimer = COMBAT_REPATH_SECONDS;
        player.path = space().findPath(player.x, player.z, combatTarget.x, combatTarget.z);
        player.pathIndex = 0;
      }
    }
  }
  if (steering) {
    stopWalking();
    player.gatherTarget = null;
    player.combatTarget = null;
    turnToward(Math.atan2(steering.x, steering.z), deltaTime);
    targetSpeed = topSpeed;
    if (!tryStep(player.x + steering.x * player.speed * deltaTime, player.z + steering.z * player.speed * deltaTime)) targetSpeed = 0;
    if (!save.hasMoved) {
      save.hasMoved = true;
    }
  } else if (player.pathIndex < player.path.length) {
    const waypoint = player.path[player.pathIndex];
    const offsetX = waypoint.x - player.x;
    const offsetZ = waypoint.z - player.z;
    const distance = Math.hypot(offsetX, offsetZ);
    const isLast = player.pathIndex === player.path.length - 1;
    const arrivalDistance = isLast && player.gatherTarget ? RESOURCE_TYPES[player.gatherTarget.type].standOff : 0.25;
    if (distance <= arrivalDistance) {
      player.pathIndex++;
      if (player.pathIndex >= player.path.length) destinationMarker.visible = false;
    } else {
      turnToward(Math.atan2(offsetX, offsetZ), deltaTime);
      targetSpeed = topSpeed * (isLast ? Math.min(1, 0.35 + distance / 2.5) : 1);
      const stride = Math.min(distance, player.speed * deltaTime);
      player.x += (offsetX / distance) * stride;
      player.z += (offsetZ / distance) * stride;
    }
  }
  player.speed += (targetSpeed - player.speed) * Math.min(1, deltaTime * 10);
  const ground = space();
  player.y = ground.heightAt(player.x, player.z);
  player.waterDepth = ground.waterLevelAt(player.x, player.z, tideState.seaLevel) - player.y;
  const sampleReach = 0.5;
  player.groundNormal.set(ground.heightAt(player.x - sampleReach, player.z) - ground.heightAt(player.x + sampleReach, player.z), 2 * sampleReach, ground.heightAt(player.x, player.z - sampleReach) - ground.heightAt(player.x, player.z + sampleReach)).normalize();

  const arrived = player.pathIndex >= player.path.length;
  if (player.walkGoal && arrived) {
    const goal = player.walkGoal;
    player.walkGoal = null;
    if (goal === 'enterBurrow' && !underground && travelOption() === 'enter') enterBurrow(nearestTravelPoint().point);
    else if (goal === 'rack' && !underground && Math.hypot(rack.state.x - player.x, rack.state.z - player.z) <= RACK_REACH + 0.8) {
      stopWalking();
      rackPanel.open();
    } else if (goal && goal.strandedSpot && !underground) {
      if (Math.hypot(goal.strandedSpot.x - player.x, goal.strandedSpot.z - player.z) <= RESCUE_REACH + 1) rescueHelperAt(goal.strandedSpot);
    } else if (typeof goal === 'object' && underground) {
      const spot = burrow.stationSpot(goal);
      if (Math.hypot(spot.x - player.x, spot.z - player.z) <= STATION_REACH) openStation(goal);
    }
  }
  let digging = false;
  if (player.digTarget) {
    const dig = player.digTarget;
    const reach = dig.kind === 'entrance' ? 0.8 : dig.kind === 'fill' ? BURROW_CELL * 1.15 : BURROW_DIG_REACH;
    const distance = Math.hypot(dig.x - player.x, dig.z - player.z);
    if (distance <= reach || (arrived && distance <= reach + 1.4)) {
      player.path = [];
      player.pathIndex = 0;
      digging = true;
      turnToward(Math.atan2(dig.x - player.x, dig.z - player.z), deltaTime);
      dig.progress += deltaTime;
      const total = dig.kind === 'entrance' ? ENTRANCE_DIG_SECONDS : burrow.digSeconds;
      if (dig.kind === 'cell') burrow.setDigProgress(burrow.cellIndex(dig.column, dig.row), Math.min(1, dig.progress / total));
      if (dig.kind === 'fill') burrow.setFillProgress(burrow.cellIndex(dig.column, dig.row), Math.min(1, dig.progress / total));
      player.digSoundTimer = (player.digSoundTimer || 0) - deltaTime;
      if (player.digSoundTimer <= 0) {
        player.digSoundTimer = 0.45;
        soundAt('gatherSeaLettuce', player.x, player.z, 0.8);
      }
      if (dig.progress >= total) {
        player.digTarget = null;
        if (dig.kind === 'entrance') digEntranceAt(dig.x, dig.z);
        else if (dig.kind === 'fill') {
          if (burrow.fillProblem(dig.column, dig.row, occupiedBurrowCells())) {
            burrow.setFillProgress(-1, 0);
            hud.log('notice', 'Could not fill — something is in the way');
          } else {
            burrow.finishFill(dig.column, dig.row);
            save.burrow = burrow.serialize();
            persist();
            refreshFillCells();
          }
        } else {
          if (!save.burrowDug) {
            save.burrowDug = true;
          }
          burrow.finishDig(dig.column, dig.row);
          save.inventory.sand = (save.inventory.sand || 0) + SAND_PER_DUG_CELL;
          hud.log('loot', `+${SAND_PER_DUG_CELL} Sand from digging`);
          refreshHud('sand');
          save.burrow = burrow.serialize();
          persist();
        }
      }
    } else if (arrived) {
      clearDigTarget();
    }
  }

  player.wasInStrikingRange = inStrikingRange;
  const target = player.gatherTarget;
  let working = false;
  let gatherType = null;
  let gatherShare = 0;
  if (player.heldNode && player.heldNode !== target) {
    if (!player.heldNode.gathered) resources.release(player.heldNode);
    player.heldNode = null;
  }
  if (inStrikingRange) {
    working = true;
    turnToward(Math.atan2(combatTarget.x - player.x, combatTarget.z - player.z), deltaTime);
    player.attackTimer -= deltaTime;
    if (player.attackTimer <= 0) {
      player.attackTimer = PLAYER_ATTACK_INTERVAL * playerStats().attackIntervalFactor;
      strike(combatTarget);
    }
  } else if (combatTarget) {
    player.attackTimer = Math.max(player.attackTimer, PLAYER_FIRST_STRIKE_SECONDS);
  }
  const nearbyRemains = remains.list.find((entry) => Math.hypot(entry.x - player.x, entry.z - player.z) <= REMAINS_REACH);
  if (nearbyRemains) recoverRemains(nearbyRemains);
  if (target && !target.gathered && player.pathIndex >= player.path.length) {
    const distance = Math.hypot(target.x - player.x, target.z - player.z);
    if (distance <= GATHER_REACH) {
      working = true;
      gatherType = target.type;
      turnToward(Math.atan2(target.x - player.x, target.z - player.z), deltaTime);
      player.gatherProgress += deltaTime;
      gatherShare = Math.min(1, player.gatherProgress / RESOURCE_TYPES[target.type].gatherSeconds);
      const lift = THREE.MathUtils.smoothstep(gatherShare, ITEM_LIFT_START_SHARE, 1);
      if (lift > 0) {
        const claw = hermit.clawPosition(target.type === 'shellBits' ? 'small' : 'big', projected);
        player.heldNode = target;
        resources.hold(target, THREE.MathUtils.lerp(target.x, claw.x, lift), THREE.MathUtils.lerp(target.y, claw.y, lift), THREE.MathUtils.lerp(target.z, claw.z, lift), 1 - 0.65 * lift);
      }
      if (player.gatherProgress >= RESOURCE_TYPES[target.type].gatherSeconds) {
        resources.gather(target);
        soundAt(`gather${target.type[0].toUpperCase()}${target.type.slice(1)}`);
        save.inventory[target.type] = (save.inventory[target.type] || 0) + 1;
        hud.log('loot', `+1 ${RESOURCE_TYPES[target.type].label} (+${GATHER_EXPERIENCE} XP)`);
        floatAt(target.x, target.y + 1.4, target.z, `+${GATHER_EXPERIENCE} XP`, 'experience');
        if (progression.gainExperience(GATHER_EXPERIENCE)) announceLevel();
        refreshHud(target.type);
        player.gatherTarget = null;
        if (goalReached() && !save.goalAnnounced) {
          save.goalAnnounced = true;
          hud.log('progress', burrow.exists ? 'Enough for a workshop — build it in your burrow' : 'Enough for a workshop — dig a burrow first');
        }
        persist();
      }
    } else {
      resources.release(target);
      player.gatherTarget = null;
    }
  }
  if (digging) {
    working = true;
    gatherType = 'seaLettuce';
    gatherShare = (player.digTarget ? player.digTarget.progress : 0) % 1;
  }
  hermit.update(deltaTime, { x: player.x, y: player.y, z: player.z, heading: player.heading, speed: player.speed, working, gatherType, gatherProgress: gatherShare, groundNormal: player.groundNormal });
}

function updateBodyWetness(deltaTime) {
  if (player.waterDepth > BODY_WET_MINIMUM_DEPTH) {
    player.wetness = 1;
    player.wetHeight = Math.max(player.wetHeight, Math.min(player.waterDepth, BODY_WET_MAXIMUM_HEIGHT_PER_SIZE * player.size));
  } else {
    player.wetness = Math.max(0, player.wetness - deltaTime / BODY_DRYING_SECONDS);
    if (player.wetness === 0) player.wetHeight = 0;
  }
  hermit.wetnessUniforms.uBodyWetness.value = player.wetness;
  hermit.wetnessUniforms.uBodyWetTop.value = player.y + player.wetHeight;
}

function updateHealth(deltaTime) {
  if (player.sleeping) {
    progression.state.health = Math.min(progression.maxHealth(), progression.state.health + (progression.maxHealth() / SLEEP_FULL_HEAL_SECONDS) * deltaTime);
    player.sleptSeconds = (player.sleptSeconds || 0) + deltaTime;
    if (progression.state.health >= progression.maxHealth() && player.sleptSeconds >= SLEEP_MIN_SECONDS_FOR_REST) wakeUp(true);
    return;
  }
  const fed = isWellFed();
  const regenFactor = (fed ? WELL_FED_REGEN_FACTOR : 1) * (isRested() ? RESTED_REGEN_FACTOR : 1);
  if (fed || simulationTime - player.lastCombatTime > HEALTH_REGEN_DELAY_SECONDS) progression.state.health = Math.min(progression.maxHealth(), progression.state.health + HEALTH_REGEN_PER_SECOND * regenFactor * deltaTime);
}

const SLEEP_FULL_HEAL_SECONDS = 10;
const SLEEP_MIN_SECONDS_FOR_REST = 6;
const RESTED_SECONDS = 900;
const RESTED_REGEN_FACTOR = 2;
const RESTED_SPEED_FACTOR = 1.1;
const isRested = () => simulationTime < (player.restedUntil || 0);

function startSleeping(station) {
  if (player.combatTarget || isMolting()) return false;
  stopWalking();
  player.sleeping = station;
  player.sleptSeconds = 0;
  hud.setMode('Sleeping — HP comes back fast', () => wakeUp(false));
  soundAt('recoverRemains', player.x, player.z, 0.4);
  return true;
}

function wakeUp(rested) {
  if (!player.sleeping) return;
  player.sleeping = null;
  hud.setMode(null);
  if (rested) {
    player.restedUntil = simulationTime + RESTED_SECONDS;
    hud.log('progress', 'You wake up rested — faster healing and +10% speed for 15 min');
  }
  persist();
}

function simulate(deltaTime) {
  simulationTime += deltaTime;
  save.worldTime += deltaTime;
  seaUniforms.uTime.value = simulationTime;
  updateTide(deltaTime);
  updatePlayer(deltaTime);
  if (!underground) fog.follow(player.x, player.z);
  if (underground) Object.assign(surfaceProbe, { x: burrow.state.entrance.x, z: burrow.state.entrance.z });
  enemies.update(deltaTime, simulationTime, underground ? surfaceProbe : player);
  rack.update(deltaTime);
  updateHiddenCrabMarker(deltaTime);
  tickStations(burrow.state.stations, deltaTime);
  processRefreshTimer -= deltaTime;
  if (processPanel.isOpen && processRefreshTimer <= 0) {
    processRefreshTimer = 1;
    processPanel.render();
  }
  helpers.update(deltaTime, simulationTime);
  updateHealth(deltaTime);
  updateBodyWetness(deltaTime);
  noticeReef();
  noticeCamp();
  noticeHold();
  seaUniforms.uCrabPosition.value.set(player.x, player.y, player.z);
  updateAudio(deltaTime);
  if (!underground) {
    tracks.update(deltaTime, simulationTime, player, tideState.seaLevel);
    ripples.update(deltaTime, simulationTime, player);
  }
  autosaveTimer += deltaTime;
  if (autosaveTimer >= AUTOSAVE_INTERVAL_SECONDS) {
    autosaveTimer = 0;
    persist();
  }
}

const UNDERGROUND_PORTRAIT_ZOOM = 0.78;

function portraitLead() {
  const extraHalfTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) - Math.tan(THREE.MathUtils.degToRad(LANDSCAPE_FIELD_OF_VIEW / 2));
  return Math.max(0, extraHalfTangent) * cameraDistance * PORTRAIT_LEAD_SHARE;
}

function updateCamera(deltaTime, snap) {
  const follow = snap ? 1 : Math.min(1, deltaTime * 5);
  const lead = underground ? 0 : portraitLead();
  cameraFocus.x += (player.x - Math.sin(CAMERA_YAW) * lead - cameraFocus.x) * follow;
  cameraFocus.z += (player.z + Math.cos(CAMERA_YAW) * lead - cameraFocus.z) * follow;
  cameraFocus.y += (player.y + 0.6 - cameraFocus.y) * follow;
  const portraitZoom = underground && camera.aspect < 1 ? UNDERGROUND_PORTRAIT_ZOOM : 1;
  const viewDistance = cameraDistance * (1 + CAMERA_GROWTH_PER_MOLT * moltTotal()) * portraitZoom;
  const horizontal = Math.cos(CAMERA_PITCH) * viewDistance;
  camera.position.set(cameraFocus.x + Math.sin(CAMERA_YAW) * horizontal, cameraFocus.y + Math.sin(CAMERA_PITCH) * viewDistance, cameraFocus.z - Math.cos(CAMERA_YAW) * horizontal);
  const minimumHeight = space().heightAt(camera.position.x, camera.position.z) + 2;
  if (camera.position.y < minimumHeight) camera.position.y = minimumHeight;
  camera.lookAt(cameraFocus);
  camera.updateMatrixWorld();
  const reefInView = !underground && cameraFocus.z + cameraDistance * REEF_VIEW_REACH_PER_DISTANCE > REEF_VIEW_THRESHOLD_Z;
  cutawayUniforms.uCutCamera.value.copy(camera.position);
  cutawayUniforms.uCutPlayer.value.set(player.x, underground ? -1000 : player.y + 1, player.z);
  reefProps.setVisible(reefInView);
  enemies.setReefVisible(reefInView);
  const campInView = !underground && Math.hypot(cameraFocus.x - CAMP.x, cameraFocus.z - CAMP.z) < CAMP.radius + CAMP_VIEW_MARGIN + cameraDistance;
  campProps.setVisible(campInView);
  resources.setCampVisible(campInView);
  viewFrustum.setFromProjectionMatrix(frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const holdInView = !underground && (isInHold(cameraFocus.x, cameraFocus.z) || HOLD_RIM_POINTS.some((point) => viewFrustum.containsPoint(point)));
  enemies.setCampVisible(campInView || holdInView);
  holdProps.setVisible(holdInView);
  resources.setHoldVisible(holdInView);
  enemies.setHoldVisible(holdInView);
  resources.setReefVisible(reefInView);

  const shadowReach = THREE.MathUtils.clamp(cameraDistance * 1.7, 42, 120);
  const shadowTexel = (shadowReach * 2) / quality.shadowMapSize;
  const anchorX = Math.round(cameraFocus.x / (shadowTexel * 8)) * shadowTexel * 8;
  const anchorZ = Math.round((cameraFocus.z + shadowReach * 0.25) / (shadowTexel * 8)) * shadowTexel * 8;
  sun.target.position.set(anchorX, 0, anchorZ);
  sun.position.copy(sun.target.position).addScaledVector(lighting.sunDirection, 200);
  const shadowCamera = sun.shadow.camera;
  if (shadowCamera.right !== shadowReach) {
    shadowCamera.left = -shadowReach;
    shadowCamera.right = shadowReach;
    shadowCamera.top = shadowReach;
    shadowCamera.bottom = -shadowReach;
    shadowCamera.updateProjectionMatrix();
  }
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  const verticalForMinimumWidth = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(MINIMUM_HORIZONTAL_FIELD_OF_VIEW / 2)) / camera.aspect));
  camera.fov = Math.max(LANDSCAPE_FIELD_OF_VIEW, verticalForMinimumWidth);
  camera.updateProjectionMatrix();
  pipeline.resize();
}

function precompileShaders() {
  const hidden = [];
  scene.traverse((object) => {
    if (!object.visible) {
      hidden.push(object);
      object.visible = true;
    }
  });
  const cameraLayers = camera.layers.mask;
  camera.layers.enableAll();
  try {
    renderer.compile(scene, camera);
  } finally {
    camera.layers.mask = cameraLayers;
    for (const object of hidden) object.visible = false;
  }
}

const pixelRatioControl = {
  info: renderer.info,
  domElement: canvas,
  setPixelRatio(pixelRatio) {
    renderer.setPixelRatio(Math.min(pixelRatio, quality.maxPixelRatio));
    pipeline.resize();
  },
};
let rendersFrames = !searchParameters.has('norender');
const fixedPixelRatio = searchParameters.has('dpr') ? Number(searchParameters.get('dpr')) : isScreenshotMode ? Math.min(devicePixelRatio, 2) : null;
const performanceMonitor = createPerformanceMonitor(pixelRatioControl, { fixedPixelRatio });
const SHOW_PERFORMANCE_KEY = 'seaofcrabs-show-performance';
function readShowPerformance() {
  try {
    return localStorage.getItem(SHOW_PERFORMANCE_KEY) === '1';
  } catch {
    return false;
  }
}
function setShowPerformance(visible) {
  performanceMonitor.setVisible(visible);
  hud.setPerformanceToggle(visible);
  try {
    localStorage.setItem(SHOW_PERFORMANCE_KEY, visible ? '1' : '0');
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
}
setShowPerformance(readShowPerformance());
hud.onPerformanceToggle(setShowPerformance);
addEventListener('resize', resize);
resize();

function renderScene() {
  renderer.info.reset();
  renderer.getDrawingBufferSize(drawingBufferSize);
  resources.update(simulationTime, Math.min(drawingBufferSize.x, drawingBufferSize.y) * 2.4);
  destinationMarker.scale.setScalar(1 + 0.12 * Math.sin(simulationTime * 5));
  workshop.update(simulationTime, underground && !hasCraftedGear() && !anyPanelOpen() && !isPlacing(), camera, underground);
  burrow.update(simulationTime, camera, underground);
  if (Object.values(player.consumableReadyAt || {}).some((readyAt) => readyAt > simulationTime - 0.1)) hud.setQuickSlots(quickSlotViews());
  if (placement.filling && simulationTime - (placement.fillRefreshedAt || 0) > FILL_REFRESH_SECONDS) {
    placement.fillRefreshedAt = simulationTime;
    refreshFillCells();
  }
  helpers.render(simulationTime, camera);
  rack.render(simulationTime, camera, !underground);
  campProps.update(simulationTime);
  holdProps.update(simulationTime);
  const buffs = [isMolting() ? `Molting · ${Math.ceil(player.moltTimer)} s` : null, isSoft() ? `Soft skin · 🛡 −50% · ${Math.ceil(player.softUntil - simulationTime)} s` : null, isWellFed() ? `Well fed · ${Math.ceil(player.wellFedUntil - simulationTime)} s` : null, simulationTime < (player.inkedUntil || 0) ? `Inked · ${Math.ceil(player.inkedUntil - simulationTime)} s` : null, isRested() ? `Rested · ${Math.ceil((player.restedUntil - simulationTime) / 60)} min` : null].filter(Boolean);
  hud.setBuff(buffs.length ? buffs.join('  ') : null);
  if (rackPanel.isOpen && !rackPanel.isPressed && Math.floor(simulationTime) !== Math.floor(simulationTime - 1 / 60)) rackPanel.render();
  if (helpersPanel.isOpen && Math.floor(simulationTime * 2) !== Math.floor((simulationTime - 1 / 60) * 2)) helpersPanel.refresh();
  const travelShown = travelOption();
  hud.setTravel(travelShown, travelShown ? travelActions() : null);
  if (travelShown) {
    const anchor = burrow.travelLabelPoint(nearestTravelPoint().point, underground);
    travelProjection.set(anchor.x, anchor.y, anchor.z).project(camera);
    hud.placeTravel((travelProjection.x * 0.5 + 0.5) * innerWidth, (-travelProjection.y * 0.5 + 0.5) * innerHeight);
  }
  spotFeedback.visible = spotFeedback.visible && simulationTime < spotFeedbackUntil && !underground;
  spotFeedback.scale.setScalar(1 + 0.08 * Math.sin(simulationTime * 5));
  enemies.render(simulationTime, camera, player.combatTarget ? player.combatTarget.id : null, { x: player.x, z: player.z, level: progression.state.level, isRevealed: fog.isRevealed });
  remains.update(simulationTime, camera);
  hud.setVitals(progression.state.level, progression.state.health, progression.maxHealth(), progression.state.experience, progression.experienceToNext());
  const farZoomShare = THREE.MathUtils.smoothstep(cameraDistance, ...FAR_ZOOM_RING_DISTANCES);
  playerRing.position.set(player.x, player.y + 0.15, player.z);
  playerRing.scale.setScalar(1 + farZoomShare * 0.9);
  const dangerShare = enemies.list.some((enemy) => enemy.zone || (enemy.state === 'chase' && enemy.health > 0 && Math.hypot(enemy.x - player.x, enemy.z - player.z) < PLAYER_RING_DANGER_DISTANCE)) ? 0.8 : 0;
  playerRing.material.opacity = Math.max(farZoomShare * 0.75, dangerShare);
  playerRing.visible = false;
  fog.upload();
  pipeline.setFogEnabled(!underground);
  if (underground) scene.fog.density = BURROW_FOG_DENSITY * Math.min(1, BURROW_FOG_REFERENCE_DISTANCE / cameraDistance);
  if (rendersFrames) pipeline.render(scene, camera, { focusDistance: camera.position.distanceTo(playerFocusPoint.set(player.x, player.y + 0.6, player.z)), time: simulationTime });
  hud.setTide(tideLabel(), (seaLevelAt(save.worldTime) - TIDE_MIDDLE) / TIDE_AMPLITUDE / 2 + 0.5);
}

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const projected = new THREE.Vector3();
const drawingBufferSize = new THREE.Vector2();

function groundPointUnder(clientX, clientY) {
  pointerNdc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const { origin, direction } = raycaster.ray;
  let previousDistance = 0;
  for (let distance = 2; distance < 400; distance += 0.8) {
    const x = origin.x + direction.x * distance;
    const z = origin.z + direction.z * distance;
    if (origin.y + direction.y * distance <= world.heightAt(x, z)) {
      let near = previousDistance;
      let far = distance;
      for (let refine = 0; refine < 8; refine++) {
        const middle = (near + far) / 2;
        if (origin.y + direction.y * middle <= world.heightAt(origin.x + direction.x * middle, origin.z + direction.z * middle)) far = middle;
        else near = middle;
      }
      return { x: origin.x + direction.x * far, z: origin.z + direction.z * far };
    }
    previousDistance = distance;
  }
  return null;
}

function resourceUnder(clientX, clientY) {
  let best = null;
  for (const node of resources.nodes) {
    if (node.gathered) continue;
    projected.set(node.x, node.y + 0.4, node.z).project(camera);
    if (projected.z > 1) continue;
    const distance = Math.hypot((projected.x * 0.5 + 0.5) * innerWidth - clientX, (-projected.y * 0.5 + 0.5) * innerHeight - clientY);
    if (distance < PICK_RADIUS_PIXELS && (!best || distance < best.distance)) best = { node, distance };
  }
  return best ? best.node : null;
}

function handleBurrowTap(clientX, clientY, isNewTouch) {
  if (placement.moving) {
    if (!isNewTouch) return;
    const point = burrow.pointOnFloor(clientX, clientY, camera, raycaster);
    if (point && moveStationTo(point.column, point.row)) cancelPlacement();
    else if (point) hud.log('notice', 'Pick one of the glowing spots');
    return;
  }
  if (placement.filling) {
    if (isNewTouch) handleFillTap(clientX, clientY);
    return;
  }
  if (placement.station === 'exit') {
    if (!isNewTouch) return;
    const floor = burrow.pointOnFloor(clientX, clientY, camera, raycaster);
    const spot = [...placement.exitSpots, ...(placement.exitRejected || [])].reduce((best, candidate) => {
      exitMarkerProbe.set(candidate.marker.x, BURROW_ORIGIN.y + 0.18, candidate.marker.z).project(camera);
      const distance = Math.hypot((exitMarkerProbe.x * 0.5 + 0.5) * innerWidth - clientX, (-exitMarkerProbe.y * 0.5 + 0.5) * innerHeight - clientY);
      return distance < EXIT_PICK_PIXELS && (!best || distance < best.distance) ? { candidate, distance } : best;
    }, null);
    if (spot && spot.candidate.problem) hud.log('notice', EXIT_PROBLEM_TEXT[spot.candidate.problem] || 'An exit cannot open here');
    else if (spot && buildStation('exit', spot.candidate.column, spot.candidate.row, { free: Boolean(placement.relocatingExit) })) {
      placement.relocatingExit = null;
      cancelPlacement();
    }
    else if (!spot && floor) hud.log('notice', 'Pick one of the glowing green spots — red ones explain why they cannot be used');
    return;
  }
  if (placement.station) {
    if (!isNewTouch) return;
    const point = burrow.pointOnFloor(clientX, clientY, camera, raycaster);
    const free = point && burrow.freeCells().find((cell) => cell.column === point.column && cell.row === point.row);
    if (free && buildStation(placement.station, free.column, free.row)) cancelPlacement();
    else if (point) hud.log('notice', 'Pick one of the glowing spots');
    return;
  }
  if (isNewTouch) {
    const station = burrow.stationUnder(clientX, clientY, camera);
    if (station) {
      walkToStation(station);
      return;
    }
    const shaftPoint = burrow.shaftUnder(clientX, clientY, camera);
    if (shaftPoint) {
      walkToShaft(shaftPoint);
      return;
    }
  }
  const point = burrow.pointOnFloor(clientX, clientY, camera, raycaster);
  if (!point) return;
  if (point.wall) {
    if (!isNewTouch) return;
    if (!startDigCell(point.column, point.row)) hud.log('notice', 'Dig next to an open part of your burrow');
    return;
  }
  setDestination(point.x, point.z);
}

function handleTap(clientX, clientY, isNewTouch) {
  if (player.sleeping) {
    if (isNewTouch) wakeUp(false);
    return;
  }
  if (paused || anyPanelOpen() || player.dyingTimer > 0 || isMolting()) return;
  if (underground) {
    handleBurrowTap(clientX, clientY, isNewTouch);
    return;
  }
  if (placement.entrance) {
    if (!isNewTouch) return;
    const spot = groundPointUnder(clientX, clientY);
    if (spot) previewEntranceSpot(spot.x, spot.z);
    return;
  }
  if (placement.rack) {
    if (!isNewTouch) return;
    const spot = groundPointUnder(clientX, clientY);
    if (spot && moveRackTo(spot.x, spot.z)) cancelPlacement();
    return;
  }
  if (isNewTouch && rack.under(clientX, clientY, camera)) {
    walkToRack();
    return;
  }
  const entrancePoint = isNewTouch ? burrow.entranceUnder(clientX, clientY, camera) : null;
  if (entrancePoint) {
    walkToEntrance({ point: entrancePoint });
    return;
  }
  const strandedSpot = isNewTouch ? helpers.strandedUnder(clientX, clientY, camera, STRANDED_PICK_RADIUS_PIXELS) : null;
  if (strandedSpot && fog.isRevealed(strandedSpot.x, strandedSpot.z) && !guardOf(strandedSpot)) {
    walkToStranded(strandedSpot);
    return;
  }
  const pickedEnemy = isNewTouch ? enemies.pick(clientX, clientY, camera) : null;
  const tapsAroundCurrentTarget = pickedEnemy && pickedEnemy === player.combatTarget && enemies.pickShare(pickedEnemy, clientX, clientY, camera) > CURRENT_TARGET_CORE_SHARE;
  const enemy = pickedEnemy && !tapsAroundCurrentTarget && fog.isRevealed(pickedEnemy.x, pickedEnemy.z) ? pickedEnemy : null;
  if (enemy) {
    engage(enemy);
    return;
  }
  const remainsEntry = isNewTouch ? remains.pick(clientX, clientY, camera) : null;
  if (remainsEntry) {
    setDestination(remainsEntry.x, remainsEntry.z);
    return;
  }
  const node = isNewTouch ? resourceUnder(clientX, clientY) : null;
  if (node) {
    setDestination(node.x, node.z, node);
    return;
  }
  const point = groundPointUnder(clientX, clientY);
  if (point && !setDestination(point.x, point.z) && isNewTouch) hud.log('notice', "Can't find a way there");
}

const activePointers = new Map();
const gesture = { pointerId: null, startX: 0, startY: 0, dragging: false, pinched: false };
let pinchStartSpan = 0;
let pinchStartDistance = 0;
let lastSteerTime = 0;

function pinchSpan() {
  const [first, second] = [...activePointers.values()];
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function canSteer() {
  return !player.gatherTarget && !player.headingToWorkshop && !player.combatTarget && !player.walkGoal && !player.digTarget && !isPlacing();
}

addEventListener('pointerdown', unlockAudio, { capture: true });
addEventListener('keydown', unlockAudio, { capture: true });
canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 1) {
    Object.assign(gesture, { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false, pinched: false });
  } else if (activePointers.size === 2) {
    if (gesture.dragging) stopWalking();
    gesture.pinched = true;
    pinchStartSpan = pinchSpan();
    pinchStartDistance = cameraDistance;
  }
});
canvas.addEventListener('pointermove', (event) => {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2) {
    cameraDistance = THREE.MathUtils.clamp((pinchStartDistance * pinchStartSpan) / Math.max(20, pinchSpan()), ...CAMERA_DISTANCE_LIMITS);
    return;
  }
  if (gesture.pinched || event.pointerId !== gesture.pointerId || isPlacing()) return;
  if (!gesture.dragging) {
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < DRAG_START_PIXELS) return;
    gesture.dragging = true;
    lastSteerTime = performance.now();
    handleTap(event.clientX, event.clientY, false);
  } else if (performance.now() - lastSteerTime > 120 && canSteer()) {
    lastSteerTime = performance.now();
    handleTap(event.clientX, event.clientY, false);
  }
});
function endPointer(event) {
  if (!activePointers.delete(event.pointerId)) return;
  const isTap = event.type === 'pointerup' && event.pointerId === gesture.pointerId && !gesture.pinched && !gesture.dragging && activePointers.size === 0;
  if (event.pointerId === gesture.pointerId) gesture.pointerId = null;
  if (isTap) handleTap(event.clientX, event.clientY, true);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  cameraDistance = THREE.MathUtils.clamp(cameraDistance * Math.exp(event.deltaY * 0.0012), ...CAMERA_DISTANCE_LIMITS);
}, { passive: false });
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closePanels();
    if (isPlacing()) cancelPlacement();
    hud.setBagDot(gear.hasNewItems());
  }
  heldKeys.add(event.key.toLowerCase());
});
addEventListener('keyup', (event) => heldKeys.delete(event.key.toLowerCase()));
addEventListener('blur', () => heldKeys.clear());

function setPaused(value) {
  if (paused === value) return;
  paused = value;
  hud.setPaused(paused);
  if (paused) persist();
  if (audioUnlocked) {
    if (paused) audio.context.suspend();
    else audio.context.resume();
  }
}
hud.onPause(setPaused);
hud.setVolumes(audioSettings);
hud.onVolume((key, value) => {
  audioSettings[key] = value;
  if (audioUnlocked) audio.setVolumes(audioSettings);
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(audioSettings));
  } catch {
    /* storage unavailable: setting lasts for this visit */
  }
});
hud.onTravel(travel);
hud.onTravelAction(handleTravelAction);
hud.onQuickSlot((index) => {
  const type = quickSlots()[index];
  if (!type) hud.log('notice', 'Open the backpack and tap an item to put it in a quick slot');
  else if (!(save.inventory[type] > 0)) hud.log('notice', `No ${RESOURCE_TYPES[type].label.toLowerCase()} left`);
  else useConsumable(type);
});
hud.onBuild(() => {
  if (anyPanelOpen()) return;
  if (underground) buildPanel.open();
  else if (!burrow.exists && !isPlacing()) startEntrancePlacement();
});
hud.onMolt(() => {
  if (underground && !anyPanelOpen() && !isMolting()) moltPanel.open();
});
hud.onHelpers(() => {
  if (underground && !anyPanelOpen()) helpersPanel.open();
});
hud.onBag(openBackpack);
hud.onMap(() => {
  if (!anyPanelOpen()) openMap();
});

function surfacePointAbovePlayer() {
  const shaft = cellCenter(SHAFT_CELL.column, SHAFT_CELL.row);
  const column = SHAFT_CELL.column + (player.x - shaft.x) / BURROW_CELL;
  const row = SHAFT_CELL.row + (player.z - shaft.z) / BURROW_CELL;
  return burrow.surfacePointOf(column, row) || burrow.state.entrance;
}

function openMap() {
  mapView.open({
    player: underground ? surfacePointAbovePlayer() : { x: player.x, z: player.z },
    playerHeading: player.heading,
    bosses: enemies.list.filter((enemy) => enemy.definition.boss || enemy.kind === 'gull').map((enemy) => ({ x: enemy.home.x, z: enemy.home.z })),
    entrances: burrow.exists ? burrow.travelPoints().map((point) => point.surface) : [],
    remains: remains.list.map((entry) => ({ x: entry.x, z: entry.z })).filter((point) => fog.isRevealed(point.x, point.z)),
    looters: enemies.list.filter((enemy) => lootedItems(enemy).length && enemies.alive(enemy)).map((enemy) => ({ x: enemy.x, z: enemy.z })),
    rack: rack.exists ? { x: rack.state.x, z: rack.state.z } : null,
  });
}

hud.onStatus(() => {
  if (!anyPanelOpen()) statusPanel.open();
});
hud.setBagDot(gear.hasNewItems());
function startOver() {
  startingOver = true;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing stored */
  }
  location.reload();
}
hud.onReset(startOver);
hud.onQuality((name) => {
  if (name === qualityName) return;
  persist();
  storeQualityName(name);
  location.reload();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !isScreenshotMode) setPaused(true);
});
addEventListener('pagehide', persist);

if (burrow.exists) blockEntrance();
if (!save.fog) revealStartingFog();
adoptHomelessHelpers();

function revealStartingFog() {
  const regionsVisited = new Set(['beach']);
  if (save.reefFound) regionsVisited.add('reef');
  if (save.campFound) regionsVisited.add('camp');
  if (save.holdFound) regionsVisited.add('hold');
  const returningPlayer = save.hasMoved || burrow.exists;
  if (returningPlayer) fog.revealWhere((x, z) => regionsVisited.has(regionAt(x, z)) && Math.hypot(x - HOME_SPOT.x, z - HOME_SPOT.z) < (regionAt(x, z) === 'beach' ? STARTING_BEACH_REVEAL_RADIUS : Infinity));
  fog.reveal(HOME_SPOT.x, HOME_SPOT.z, STARTING_REVEAL_RADIUS);
  if (burrow.exists) fog.reveal(burrow.state.entrance.x, burrow.state.entrance.z, STARTING_REVEAL_RADIUS);
}
setUnderground(underground);
cameraDistance = cameraDistanceFor(underground);
refreshHud(null);
tideState.wetLevel = TIDE_MIDDLE + TIDE_AMPLITUDE * 0.9;

let previousFrameTime = performance.now();

if (isScreenshotMode) {
  const pose = POSES[screenshotPose] || POSES[1];
  hud.setVisible(searchParameters.has('hud'));
  performanceMonitor.setVisible(false);
  const spot = navigation.nearestWalkable(pose.x, pose.z, 40);
  Object.assign(player, { x: spot.x, z: spot.z, heading: pose.walkFrom ? STARTING_HEADING : pose.heading ?? STARTING_HEADING });
  cameraDistance = pose.distance;
  save.worldTime = TIDE_PERIOD_SECONDS * (searchParameters.has('tide') ? Number(searchParameters.get('tide')) : pose.tideShare);
  if (pose.workshop) {
    if (!burrow.exists) digEntranceAt(WORKSHOP_SPOT.x, WORKSHOP_SPOT.z);
    Object.assign(save.inventory, FIRST_GOAL);
    buildWorkshop();
  }
  if (pose.inventory) Object.assign(save.inventory, pose.inventory);
  if (pose.reefFound) save.reefFound = true;
  if (pose.campFound) save.campFound = true;
  for (const kind of pose.restingBosses || []) {
    save.bossDefeatedAt = { ...(save.bossDefeatedAt || {}), [kind]: wallClock() - 5 * 3600000 };
    for (const enemy of enemies.list) if (enemy.kind === kind) enemy.state = 'dead';
  }
  for (const kind of pose.crafted || []) {
    Object.assign(save.inventory, SHELLS[kind].cost);
    craftItem('shell', kind);
  }
  if (pose.shell) hermit.setShell(SHELLS[pose.shell].look);
  if (pose.level) progression.setLevel(pose.level);
  if (pose.naked) {
    gear.dropAll();
    applyWornLook();
  }
  if (pose.molts) {
    progression.state.molts = [...pose.molts];
    applyWornLook();
  }
  if (pose.outfit) {
    for (const [category, kind] of [['shell', pose.outfit.shell], ['claws', pose.outfit.claws]]) {
      for (const [type, amount] of Object.entries((category === 'shell' ? SHELLS : CLAWS)[kind].cost)) save.inventory[type] = (save.inventory[type] || 0) + amount;
      const item = gear.craft(category, kind, save.inventory);
      item.quality = pose.outfit.quality;
      if (category === 'shell' && pose.outfit.reinforcement) item.reinforcement = pose.outfit.reinforcement;
      if (category === 'claws' && pose.outfit.binding) item.binding = pose.outfit.binding;
      gear.wear(item.id);
    }
    gear.markAllSeen();
    applyWornLook();
  }
  if (pose.remainsAt) remains.add({ x: pose.remainsAt.x, z: pose.remainsAt.z, inventory: { shellBits: 4 }, gear: { shells: [{ id: 90, kind: 'cone', quality: pose.remainsQuality || 'fine' }], claws: [], wornShellId: 90, wornClawsId: null } });
  if (pose.burrowAt) digEntranceAt(pose.burrowAt.x, pose.burrowAt.z);
  for (const [column, row] of pose.dug || []) burrow.finishDig(column, row);
  for (const placed of pose.placed || []) {
    Object.assign(save.inventory, STATION_KINDS[placed.kind].cost);
    buildStation(placed.kind, placed.column, placed.row);
  }
  if (pose.playerCell) {
    const spot = cellCenter(pose.playerCell.column, pose.playerCell.row);
    player.poseBurrowSpot = spot;
  }
  for (const kind of pose.stations || []) {
    Object.assign(save.inventory, STATION_KINDS[kind].cost);
    const cell = kind === 'workshop' ? DEFAULT_WORKSHOP_CELL : DEFAULT_STORAGE_CELL;
    buildStation(kind, cell.column, cell.row);
  }
  if (pose.stored) Object.assign(storage.inventory, pose.stored);
  for (const extra of pose.extraGear || []) {
    const item = gear.grant(extra.category, extra.kind);
    item.quality = extra.quality || 'fine';
    if (extra.binding) item.binding = extra.binding;
    if (extra.reinforcement) item.reinforcement = extra.reinforcement;
    if (extra.stored) {
      const list = extra.category === 'shell' ? gear.state.shells : gear.state.claws;
      list.splice(list.indexOf(item), 1);
      (extra.category === 'shell' ? storage.shells : storage.claws).push(item);
    }
  }
  if (pose.rack) {
    Object.assign(save.inventory, STATION_KINDS.dryingRack.cost);
    buildRackStation();
    rack.state.slots = [...pose.rack.slots];
    rack.state.ready = pose.rack.ready;
  }
  if (pose.wellFed) player.wellFedUntil = simulationTime + 64;
  if (pose.helpers && !helpers.freeNest()) {
    const cell = burrow.freeCells().find((candidate) => candidate.column === LEGACY_HELPER_CELL.column && candidate.row === LEGACY_HELPER_CELL.row) || burrow.freeCells()[0];
    Object.assign(save.inventory, STATION_KINDS.helperNest.cost);
    buildStation('helperNest', cell.column, cell.row);
  }
  for (const [index, job] of (pose.helpers || []).entries()) {
    const helper = helpers.rescue(helpers.strandedVisible()[0] || { id: `pose-${index}` });
    if (helper) helpers.setJob(helper.id, job);
  }
  if (pose.helpersResting) for (const helper of helpers.list) helper.restTimer = 600;
  for (let step = 0; step < (pose.simulateSeconds || 0) / FIXED_STEP; step++) simulate(FIXED_STEP);
  if (pose.inBurrow) {
    enterBurrow();
    if (player.poseBurrowSpot) Object.assign(player, { x: player.poseBurrowSpot.x, z: player.poseBurrowSpot.z });
    cameraDistance = pose.distance;
    player.heading = pose.heading ?? 0;
    for (let step = 0; step < 20; step++) simulate(FIXED_STEP);
  }
  if (pose.placingStation) {
    Object.assign(save.inventory, STATION_KINDS[pose.placingStation].cost);
    chooseStation(pose.placingStation);
    const firstSpot = placement.exitSpots && placement.exitSpots[0];
    if (firstSpot) {
      const stand = cellCenter(firstSpot.accessColumn * 2 - firstSpot.column, firstSpot.accessRow * 2 - firstSpot.row);
      Object.assign(player, { x: stand.x, z: stand.z });
    }
  }
  if (pose.placingEntrance) startEntrancePlacement();
  if (pose.previewEntrance) previewEntranceSpot(pose.previewEntrance.x, pose.previewEntrance.z);
  if (pose.storagePanel) storagePanel.open();
  if (pose.helpersPanel) helpersPanel.open();
  if (pose.rackPanel) rackPanel.open();
  refreshHud(null);
  if (pose.panel) workbenchPanel.open(pose.panel);
  if (pose.scrollPanel) for (const body of hud.root.querySelectorAll('.workbench.visible .workbench-body')) body.scrollTop = body.scrollHeight;
  if (pose.expandImprove) hud.root.querySelector('.workbench [data-expand]')?.click();
  if (pose.moltPanel) moltPanel.open();
  if (pose.molting) startMolt('crusher');
  if (pose.backpack) openBackpack();
  if (pose.statusPanel) statusPanel.open();
  if (pose.mapOpen) openMap();
  if (pose.equipHelperGear && helpers.list[0]) {
    const shell = gear.state.shells.find((item) => item.kind === 'whelk');
    const claws = gear.state.claws.find((item) => item.kind === 'cleaver');
    if (shell) equipHelper(helpers.list[0].id, 'shell', shell.id);
    if (claws) equipHelper(helpers.list[0].id, 'claws', claws.id);
    if (helpersPanel.isOpen) helpersPanel.render();
  }
  const poseSlot = pose.selectSlot && hud.root.querySelector(`.backpack .slot-grid [data-slot-key]:nth-child(${pose.selectSlot})`);
  if (poseSlot) backpack.select(poseSlot.dataset.slotKey);
  if (pose.walkFrom) {
    const walkStart = navigation.nearestWalkable(pose.walkFrom.x, pose.walkFrom.z, 40);
    Object.assign(player, { x: walkStart.x, z: walkStart.z });
    for (let step = 0; step < 30; step++) simulate(FIXED_STEP);
    setDestination(spot.x, spot.z);
    for (let step = 0; step < pose.walkSeconds / FIXED_STEP; step++) simulate(FIXED_STEP);
    destinationMarker.visible = false;
    if (pose.heading !== undefined) {
      stopWalking();
      player.heading = pose.heading;
      for (let step = 0; step < 20; step++) simulate(FIXED_STEP);
    }
  } else if (pose.enemy) {
    const enemySpot = navigation.nearestWalkable(spot.x + pose.enemy.offsetX, spot.z + pose.enemy.offsetZ, 10);
    const enemy = enemies.spawn(pose.enemy.kind, enemySpot.x, enemySpot.z);
    if (pose.revealAround) fog.reveal(spot.x, spot.z, pose.revealAround);
    if (pose.enemy.loot) enemy.loot = Object.fromEntries(Object.entries(pose.enemy.loot).map(([slot, kind], index) => [slot, { id: 900 + index, kind, quality: 'fine' }]));
    for (const other of enemies.list.filter((candidate) => candidate !== enemy)) Object.assign(other, { state: 'dead', respawnTimer: 999 });
    enemy.heading = Math.atan2(spot.x - enemySpot.x, spot.z - enemySpot.z);
    if (enemy.definition.flies) {
      enemy.altitude = 0;
      enemy.state = 'chase';
      enemy.anchor = { x: enemy.x, z: enemy.z };
      enemy.attackTimer = enemy.definition.windup;
    }
    if (pose.fightSeconds) engage(enemy);
    for (let step = 0; step < Math.max(30, pose.fightSeconds / FIXED_STEP); step++) simulate(FIXED_STEP);
    const momentSteps = { strike: 12, hurt: 6, enemyHurt: 5, dying: 40 }[pose.moment] || 0;
    if (pose.moment === 'strike') hermit.playAttack('big');
    if (pose.moment === 'hurt') hitPlayer(enemy);
    if (pose.moment === 'enemyHurt') enemies.damage(enemy, 1, simulationTime, player);
    if (pose.moment === 'dying') {
      progression.state.health = 1;
      hitPlayer(enemy);
    }
    for (let step = 0; step < momentSteps; step++) simulate(FIXED_STEP);
  } else if (pose.nearAnemone) {
    const anemone = life.anemoneSpots.filter((candidate) => world.retained.levelAt(candidate.x, candidate.z) > -0.5).sort((first, second) => Math.hypot(first.x - spot.x, first.z - spot.z) - Math.hypot(second.x - spot.x, second.z - spot.z))[0];
    const beside = navigation.nearestWalkable(anemone.x - 1.6, anemone.z - 0.4, 6);
    Object.assign(player, { x: beside.x, z: beside.z, heading: 1.3 });
    for (let step = 0; step < 30; step++) simulate(FIXED_STEP);
  } else if (pose.gather) {
    const node = resources.nodes.filter((candidate) => candidate.type === pose.gather.type && !candidate.gathered).sort((first, second) => Math.hypot(first.x - spot.x, first.z - spot.z) - Math.hypot(second.x - spot.x, second.z - spot.z))[0];
    const stand = navigation.nearestWalkable(node.x - 3.5, node.z - 1.5, 6);
    Object.assign(player, { x: stand.x, z: stand.z });
    setDestination(node.x, node.z, node);
    for (let step = 0; step < 600 && !(player.gatherTarget && player.gatherProgress / RESOURCE_TYPES[node.type].gatherSeconds >= pose.gather.share); step++) simulate(FIXED_STEP);
  } else {
    for (let step = 0; step < (pose.gullCircling ? 240 : 90); step++) simulate(FIXED_STEP);
    const gull = pose.gullCircling && enemies.list.find((enemy) => enemy.kind === 'gull');
    if (gull) {
      const watchSpot = navigation.nearestWalkable(gull.x + 6, gull.z + 7, 20);
      Object.assign(player, { x: watchSpot.x, z: watchSpot.z });
      simulate(FIXED_STEP);
    }
  }
  updateCamera(0, true);
  renderScene();
  renderScene();
  window.__frameReady = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
} else {
  updateCamera(0, true);
  precompileShaders();
  renderer.setAnimationLoop((now) => {
    if (!performanceMonitor.shouldRender(now)) return;
    const deltaTime = Math.max(0, Math.min(0.05, (now - previousFrameTime) / 1000));
    previousFrameTime = now;
    if (!paused) simulate(deltaTime);
    updateCamera(deltaTime, false);
    renderScene();
    performanceMonitor.recordFrame(now);
  });
}

window.__debug = {
  hud, setShowPerformance, openStation, addBoardOrder, moveBoardOrder, removeBoardOrder, boardView, giveSatchel, boardOrders, processPanel, boardPanel, surfacePointAbovePlayer, simulate, simulationTime: () => simulationTime, player, world, resources, navigation, save, tideState, camera, renderer, scene, pipeline, performanceMonitor, quality, qualityName,
  tracks, ripples, hermit, gear, hitPlayer, strike, workshop, workbenchPanel, salvageItem, startMovingStructure, dismantleStructure, removeTravelPoint, startMovingExit, handleTravelAction, travelActions, moveStationTo, moveRackTo, isRecipeDiscovered, placement, cancelPlacement, backpack, openBackpack, buildWorkshop, craftItem, wearItem, unequipItem, walkToWorkshop, setDestination, setPaused, handleTap, renderScene, updateCamera, seaLevelAt,
  audio, isAudioUnlocked: () => audioUnlocked, progression, statusPanel, difficultyOf, experienceForKill, enemies, remains, engage, die, recoverRemains, playerStats, randomSource, upgradeTools, refineItem, modifyItem, startMolt, finishMolt, isMolting, isSoft, moltPanel, rack, rackPanel, buildRackStation, eatKelp, useConsumable, craftSupply, assignQuickSlot, quickSlots, isWellFed, walkToRack, helpers, helpersPanel, equipHelper, openMap, startFillMode, startFillCell, startSleeping, wakeUp, isRested, mapView, fog, exitCellProblem, chooseStation, nearestTravelPoint, rescueHelperAt, walkToStranded, burrow, storage, storagePanel, buildPanel, enterBurrow, exitBurrow, travel, travelOption, walkToShaft, cameraDistanceFor, getCameraDistance: () => cameraDistance, digEntranceAt, chooseEntranceSpot, startEntrancePlacement, buildStation, stationBuildProblem, burrowStage, rackSpotProblem, startDigCell, previewEntranceSpot, walkToEntrance, walkToStation, isUnderground: () => underground, entranceSpotProblem, wakeSpot, persist, startOver,
  setCameraDistance: (distance) => { cameraDistance = distance; },
  setRendering: (enabled) => { rendersFrames = enabled; },
  isPaused: () => paused,
  advanceWallClock: (milliseconds) => { wallClockOffsetMs += milliseconds; },
  bossRestRemainingMs, dropLoot, regionAt,
  looting: { attackOf, defenseOf, levelOf, labelOf, canLoot },
  equipBuild(shellKind, clawKind, invested) {
    gear.state.shells = shellKind ? [{ id: 500, kind: shellKind, quality: invested ? 'masterwork' : 'fine', reinforcement: invested ? 'metalPlate' : undefined }] : [];
    gear.state.claws = [{ id: 2, kind: 'bare', quality: 'fine' }, { id: 501, kind: clawKind, quality: invested ? 'masterwork' : 'fine', binding: invested && clawKind !== 'bare' ? 'wire' : undefined }];
    gear.state.wornShellId = shellKind ? 500 : null;
    gear.state.wornClawsId = clawKind === 'bare' ? 2 : 501;
    gear.state.wornSmallId = null;
    progression.state.molts = Array(progression.moltsEarned()).fill('crusher');
    progression.state.clawSkill = EXPECTED_CLAW_SKILL_PER_LEVEL * progression.state.level;
    player.softUntil = 0;
    applyWornLook();
  },
};
const EXPECTED_CLAW_SKILL_PER_LEVEL = 1.4;
