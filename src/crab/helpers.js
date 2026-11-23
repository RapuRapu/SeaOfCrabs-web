import * as THREE from 'three';
import { createHermit } from './hermit.js';
import { RESOURCE_TYPES, stackLimitOf } from './resources.js';
import { BURROW_LAYER, BURROW_ORIGIN } from './burrow.js';
import { RACK_BATCH, RACK_REACH, RACK_INPUTS, rackInputIn } from './rack.js';
import { PROCESS_RECIPES, freeSlots as processFreeSlots, loadStation, collectStation, processView } from './processing.js';
import { SHELLS, CLAWS, NAKED, BINDINGS, REINFORCEMENTS, shellDefenseOf, clawAttackOf } from './gear.js';
import { MAX_LEVEL, experienceForLevel } from './progression.js';
import { CONSUMABLES } from './consumables.js';

export const HELPER_LIMIT = 6;
export const NEST_CAPACITY = 3;
export const HELPER_SIZE = 0.7;
const CARRY_LOAD = 5;
export const SATCHEL_LOAD = 2;
export const SATCHEL_CORD_COST = 2;
const SATCHEL_NEXT_NODE_RANGE = 25;
const NEST_REACH = 1.6;
const STRANDED_BOB_SPEED = 9;
const HELPER_HEALTH = 10;
const WALK_SPEED = 4.2;
export const HELPER_MEAL_SECONDS = 20 * 60;
export const HUNGRY_WORK_FACTOR = 0.5;
const MEAL_RETRY_SECONDS = 15;
const FLEE_SPEED = 6;
const GATHER_SLOWDOWN = 1.6;
const GATHER_REACH = 1.4;
const ENTRANCE_REACH = 1.6;
const DANGER_DISTANCE = 7;
const BITE_DISTANCE = 1.7;
const REST_SECONDS = 4;
const IDLE_RETRY_SECONDS = 8;
const NEST_SLOTS = [[-0.75, 0.25], [-0.15, -0.45], [-0.05, 0.6]];
const HELPER_BASE_ATTACK = 2;
const HELPER_HEALTH_PER_LEVEL = 3;
const HELPER_ATTACK_INTERVAL = 1.2;
const WIN_MARGIN = 1.25;
const FLEE_HEALTH_SHARE = 0.3;
const FIGHT_REACH = 0.9;
const FIGHT_GIVE_UP_DISTANCE = 12;
const HELPER_REGEN_PER_SECOND = 1;
export const HELPER_BAG_SLOTS = 2;
export const ITEM_USE_MODES = ['both', 'self', 'you', 'nobody'];
const ITEM_USE_HEALTH_SHARE = 0.4;
const ITEM_USE_REACH = 6;
const WELL_FED_SECONDS = 90;
const WELL_FED_REGEN_FACTOR = 2;
const FOLLOW_DISTANCE = 2.6;
const FOLLOW_CATCH_UP_DISTANCE = 35;
const FOLLOW_REPATH_SECONDS = 0.5;
const ASSIST_RANGE = 16;

const HELPER_TINTS = [[1, 1, 1], [1, 0.88, 0.8], [0.88, 0.93, 1], [1, 0.84, 0.86], [0.88, 1, 0.86], [1, 0.97, 0.78]];
const STRANDED_STRUGGLE_SPEED = 1.5;
const MAX_RENDER_STEP = 0.1;
const FLAT_GROUND = new THREE.Vector3(0, 1, 0);
const CULL_RADIUS = 2.5;
const CARRY_COLORS = { shellBits: new THREE.Color(1.7, 1.55, 1.3), driftwood: new THREE.Color(0.9, 0.5, 0.18), seaLettuce: new THREE.Color(0.35, 1.5, 0.3), driedKelp: new THREE.Color(1.1, 0.62, 0.18), coral: new THREE.Color(1.8, 0.5, 0.45), seaGlass: new THREE.Color(0.4, 1.2, 1.8), pearls: new THREE.Color(1.9, 1.85, 1.7), scrap: new THREE.Color(0.7, 0.7, 0.75), cloth: new THREE.Color(1.4, 1.2, 0.9), fishBone: new THREE.Color(1.6, 1.6, 1.45), wax: new THREE.Color(1.8, 1.6, 1.1), kelp: new THREE.Color(0.9, 0.8, 0.2), pebbles: new THREE.Color(0.9, 0.9, 0.9), clay: new THREE.Color(1.1, 0.6, 0.4), sand: new THREE.Color(1.8, 1.5, 1.0) };
const DEFAULT_CARRY_COLOR = new THREE.Color(1.2, 1.2, 1.2);

export function helperMaxHealth(helper) {
  return HELPER_HEALTH + ((helper.level || 1) - 1) * HELPER_HEALTH_PER_LEVEL;
}

export function helperStats(helper) {
  const shellItem = helper.gear && helper.gear.shell;
  const clawsItem = helper.gear && helper.gear.claws;
  const shell = shellItem ? SHELLS[shellItem.kind] : null;
  const claws = clawsItem ? CLAWS[clawsItem.kind] : null;
  const binding = clawsItem && clawsItem.binding ? BINDINGS[clawsItem.binding] : null;
  const reinforcement = shellItem && shellItem.reinforcement ? REINFORCEMENTS[shellItem.reinforcement] : null;
  return {
    attack: HELPER_BASE_ATTACK + ((helper.level || 1) - 1) + (claws ? clawAttackOf(claws, clawsItem) : 0),
    defense: shell ? shellDefenseOf(shell, shellItem) : 0,
    attackInterval: HELPER_ATTACK_INTERVAL * ((claws && claws.ability && claws.ability.attackIntervalFactor) || 1) * ((binding && binding.attackIntervalFactor) || 1),
    speedFactor: (shell ? shell.speedFactor : 1) * ((reinforcement && reinforcement.speedFactor) || 1) * (helper.hungry ? HUNGRY_WORK_FACTOR : 1),
  };
}

const hitDamage = (attack, defense) => Math.max(1, Math.round(attack - defense / 2));

export function expectsToWin(helper, enemy) {
  const stats = helperStats(helper);
  const helperPerSecond = hitDamage(stats.attack, enemy.definition.defense || 0) / stats.attackInterval;
  const enemyPerSecond = hitDamage(enemy.definition.attack, stats.defense) / enemy.definition.attackInterval;
  return (enemy.health / helperPerSecond) * WIN_MARGIN < helper.health / enemyPerSecond;
}

export function createHelpers(scene, { world, navigation, resources, enemies, quality, saved, rack, burrow, boxOf, strandedSpots, getPlayer, isUnderground, onDeposit, onLost, onSound, onLog = () => {}, playerVitals = () => null, healPlayer = () => {}, onHealFloat = () => {}, upkeepActive = () => false, feedHelper = () => false, boardTask = () => null }) {
  const savedState = Array.isArray(saved) ? { list: saved, rescued: [] } : saved || { list: [], rescued: [] };
  const list = savedState.list.map((entry) => {
    const helper = { job: null, nestId: null, carryOrder: null, gear: { shell: null, claws: null }, level: 1, experience: 0, bag: emptyBag(), itemUse: 'both', ...entry, helperId: entry.id, state: 'resting', inside: true, path: [], pathIndex: 0, restTimer: 1 + Math.random() * 2, carrying: entry.carrying || null, load: entry.load || 0, targetId: null };
    helper.health = helperMaxHealth(helper);
    return helper;
  });
  const rescued = new Set(savedState.rescued || []);
  let nextId = list.reduce((highest, helper) => Math.max(highest, helper.id), 0) + 1;
  const crabs = new Map();
  function crabFor(key, tintIndex) {
    if (!crabs.has(key)) {
      const crab = createHermit(scene, quality, NAKED.look, { crabModel: 'helper', scale: HELPER_SIZE, bodyTint: HELPER_TINTS[tintIndex % HELPER_TINTS.length] });
      crabs.set(key, { crab, gearKey: null, inside: null });
    }
    return crabs.get(key);
  }
  let lastRenderTime = null;
  const viewFrustum = new THREE.Frustum();
  const viewMatrix = new THREE.Matrix4();
  const cullSphere = new THREE.Sphere(new THREE.Vector3(), CULL_RADIUS);
  const carryMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), HELPER_LIMIT);
  carryMesh.count = 0;
  carryMesh.frustumCulled = false;
  carryMesh.layers.enable(BURROW_LAYER);
  const carryOutline = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.38, 1), new THREE.MeshBasicMaterial({ color: 0x1a1208, side: THREE.BackSide }), HELPER_LIMIT);
  carryOutline.count = 0;
  carryOutline.frustumCulled = false;
  carryOutline.layers.enable(BURROW_LAYER);
  const strandedRings = new THREE.InstancedMesh(new THREE.RingGeometry(1.1, 1.4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.0), transparent: true, opacity: 0.7, depthWrite: false, fog: false }), strandedSpots.length || 1);
  strandedRings.count = 0;
  strandedRings.frustumCulled = false;
  strandedRings.renderOrder = 5;
  scene.add(carryMesh, carryOutline, strandedRings);
  const transform = new THREE.Object3D();
  const projected = new THREE.Vector3();

  const nodeById = (id) => resources.nodes.find((node) => node.id === id) || null;
  const nestOf = (helper) => burrow.state.stations.find((station) => station.id === helper.nestId) || null;
  const stationById = (id) => burrow.state.stations.find((station) => station.id === id) || null;
  const depositStationOf = (helper) => (helper.tripTargetId && stationById(helper.tripTargetId)) || nestOf(helper);
  const nestSpot = (helper) => {
    const nest = nestOf(helper);
    return nest ? burrow.stationSpot(nest) : null;
  };

  function homePoint(helper) {
    const home = nestSpot(helper);
    const points = burrow.travelPoints();
    if (!home || !points.length) return points[0] || null;
    return points.reduce((best, point) => (Math.hypot(point.below.x - home.x, point.below.z - home.z) < Math.hypot(best.below.x - home.x, best.below.z - home.z) ? point : best));
  }

  function release(helper) {
    const node = helper.targetId && nodeById(helper.targetId);
    if (node && node.reservedBy === helper.id) delete node.reservedBy;
    helper.targetId = null;
  }

  function walkTo(helper, x, z) {
    const space = helper.inside ? burrow.space : navigation;
    const path = space.findPath(helper.x, helper.z, x, z);
    helper.path = path;
    helper.pathIndex = 0;
    return path.length > 0;
  }

  function placeAtNest(helper) {
    const spot = nestSpot(helper);
    if (!spot) return;
    const slot = NEST_SLOTS[nestMates(helper).indexOf(helper) % NEST_SLOTS.length];
    const free = burrow.space.nearestWalkable(spot.x + slot[0] * 1.6, spot.z + slot[1] * 1.6 + 1.2) || spot;
    Object.assign(helper, { x: free.x, z: free.z, inside: true });
  }

  const nestMates = (helper) => list.filter((other) => other.nestId === helper.nestId);

  function stepOutside(helper) {
    const point = homePoint(helper);
    if (!point) return false;
    const start = navigation.nearestWalkable(point.surface.x + 1.6, point.surface.z - 1.2, 6) || point.surface;
    Object.assign(helper, { x: start.x, z: start.z, inside: false, exitPoint: point });
    return true;
  }

  function leaveForRack(helper) {
    const nest = nestOf(helper);
    if (!rack.exists || !nest || !nest.box) return false;
    const input = rackInputIn(nest.box.inventory);
    const canLoad = rack.freeSlots() > 0 && Boolean(input);
    if (!canLoad && rack.state.ready === 0) return false;
    if (!stepOutside(helper)) return false;
    if (!walkTo(helper, rack.state.x, rack.state.z)) {
      placeAtNest(helper);
      return false;
    }
    if (canLoad) {
      nest.box.inventory[input] -= RACK_BATCH;
      helper.carrying = input;
      helper.load = RACK_BATCH;
    }
    helper.state = 'toRack';
    return true;
  }

  function leaveForProcess(helper, station) {
    const nest = nestOf(helper);
    if (!station || !nest || !nest.box) return false;
    const recipe = PROCESS_RECIPES[station.kind];
    const canLoad = processFreeSlots(station) > 0 && (nest.box.inventory[recipe.input] || 0) >= recipe.inputAmount;
    if (!canLoad && processView(station).ready === 0) return false;
    const spot = burrow.stationSpot(station);
    if (!walkTo(helper, spot.x, spot.z)) return false;
    if (canLoad) {
      nest.box.inventory[recipe.input] -= recipe.inputAmount;
      Object.assign(helper, { carrying: recipe.input, load: recipe.inputAmount });
    }
    helper.processStationId = station.id;
    helper.state = 'toProcess';
    return true;
  }

  function startCarry(helper) {
    const order = helper.activeCarry;
    const source = order && boxOf(order.fromId);
    const target = order && boxOf(order.toId);
    if (!source || !target || order.fromId === order.toId) return false;
    const type = order.material || Object.keys(source.inventory).find((key) => source.inventory[key] > 0);
    if (!type || !(source.inventory[type] > 0)) return false;
    const fromStation = burrow.state.stations.find((station) => station.id === order.fromId);
    if (!fromStation) return false;
    const spot = burrow.stationSpot(fromStation);
    if (!walkTo(helper, spot.x, spot.z)) return false;
    helper.carryType = type;
    helper.state = 'toSource';
    return true;
  }

  function placeNearPlayer(helper) {
    const player = getPlayer();
    const underground = isUnderground();
    const space = underground ? burrow.space : navigation;
    const spot = space.nearestWalkable(player.x - 1.4, player.z - 1.2, 6) || { x: player.x, z: player.z };
    Object.assign(helper, { x: spot.x, z: spot.z, inside: underground, path: [], pathIndex: 0, exitPoint: null });
  }

  function startFollowing(helper) {
    if (isUnderground()) {
      helper.inside = true;
      helper.path = [];
      helper.pathIndex = 0;
    } else if (helper.inside) stepOutside(helper);
    helper.state = 'following';
    helper.repathTimer = 0;
  }

  function stopFollowing(helper, fleeing) {
    helper.fightTargetId = null;
    if (helper.inside) returnToNest(helper);
    else headHome(helper, fleeing);
  }

  function updateFollow(helper, deltaTime, time) {
    const player = getPlayer();
    if (!player.alive) {
      stopFollowing(helper, false);
      return;
    }
    if (helper.inside !== isUnderground()) placeNearPlayer(helper);
    const target = player.combatTarget && enemies.alive(player.combatTarget) && Math.hypot(player.combatTarget.x - helper.x, player.combatTarget.z - helper.z) < ASSIST_RANGE ? player.combatTarget : null;
    const threat = helper.inside ? null : threatNear(helper);
    if (threat && threat.distance < DANGER_DISTANCE && inDanger(helper, threat.enemy)) {
      onLog('helperCombat', `${nameOf(helper)} stops following and flees from the ${threat.enemy.definition.label.toLowerCase()}`);
      stopFollowing(helper, true);
      return;
    }
    if (target && !helper.inside) {
      helper.fightTargetId = target.id;
      const distance = Math.hypot(target.x - helper.x, target.z - helper.z);
      const reach = target.definition.radius + FIGHT_REACH;
      helper.heading = Math.atan2(target.x - helper.x, target.z - helper.z);
      if (distance > reach) {
        const stride = Math.min(distance - reach, FLEE_SPEED * helperStats(helper).speedFactor * deltaTime);
        const nextX = helper.x + ((target.x - helper.x) / distance) * stride;
        const nextZ = helper.z + ((target.z - helper.z) / distance) * stride;
        if (world.isWalkable(nextX, nextZ)) Object.assign(helper, { x: nextX, z: nextZ, moving: true });
        return;
      }
      helper.attackTimer = (helper.attackTimer ?? 0) - deltaTime;
      if (helper.attackTimer > 0) return;
      const stats = helperStats(helper);
      helper.attackTimer = stats.attackInterval;
      onSound('shellClonk', helper);
      helper.attackAnimPending = true;
      logHelperHit(helper, target, stats);
      (target.assistingHelperIds ||= new Set()).add(helper.id);
      enemies.damage(target, hitDamage(stats.attack, target.definition.defense || 0), time, helper, { provoke: false });
      return;
    }
    helper.fightTargetId = null;
    const distance = Math.hypot(player.x - helper.x, player.z - helper.z);
    if (!helper.inside && distance > FOLLOW_CATCH_UP_DISTANCE) {
      placeNearPlayer(helper);
      return;
    }
    if (distance <= FOLLOW_DISTANCE) {
      helper.path = [];
      helper.pathIndex = 0;
      return;
    }
    helper.repathTimer = (helper.repathTimer || 0) - deltaTime;
    if (helper.repathTimer <= 0 || helper.pathIndex >= helper.path.length) {
      helper.repathTimer = FOLLOW_REPATH_SECONDS;
      const space = helper.inside ? burrow.space : navigation;
      helper.path = space.findPath(helper.x, helper.z, player.x, player.z);
      helper.pathIndex = 0;
    }
    step(helper, deltaTime, distance > FOLLOW_DISTANCE * 3 ? FLEE_SPEED : WALK_SPEED);
  }

  function leaveNest(helper) {
    if (!helper.job) return;
    if (helper.job === 'follow') {
      startFollowing(helper);
      return;
    }
    const task = helper.job === 'board' ? boardTask(helper) : { job: helper.job, carryOrder: helper.carryOrder };
    helper.tripTargetId = (task && task.deliverToId) || null;
    helper.activeCarry = (task && task.carryOrder) || null;
    const job = task && task.job;
    if (!job) {
      helper.restTimer = IDLE_RETRY_SECONDS;
      return;
    }
    if (job === 'rack') {
      if (!leaveForRack(helper)) helper.restTimer = IDLE_RETRY_SECONDS;
      return;
    }
    if (job.startsWith('tend:')) {
      if (!leaveForProcess(helper, stationById(Number(job.slice(5))))) helper.restTimer = IDLE_RETRY_SECONDS;
      return;
    }
    if (job === 'carry') {
      if (!startCarry(helper)) helper.restTimer = IDLE_RETRY_SECONDS;
      return;
    }
    const point = homePoint(helper);
    if (!point) return;
    const origin = point.surface;
    const candidates = resources.nodes.filter((node) => node.type === job && !node.gathered && !node.reservedBy);
    candidates.sort((first, second) => Math.hypot(first.x - origin.x, first.z - origin.z) - Math.hypot(second.x - origin.x, second.z - origin.z));
    stepOutside(helper);
    for (const node of candidates.slice(0, 4)) {
      if (walkTo(helper, node.x, node.z)) {
        helper.targetId = node.id;
        node.reservedBy = helper.id;
        helper.state = 'outbound';
        return;
      }
    }
    placeAtNest(helper);
    helper.restTimer = IDLE_RETRY_SECONDS;
  }

  function goGatherNext(helper, type) {
    const next = resources.nodes
      .filter((node) => node.type === type && !node.gathered && !node.reservedBy && Math.hypot(node.x - helper.x, node.z - helper.z) < SATCHEL_NEXT_NODE_RANGE)
      .sort((first, second) => Math.hypot(first.x - helper.x, first.z - helper.z) - Math.hypot(second.x - helper.x, second.z - helper.z))[0];
    if (!next || !walkTo(helper, next.x, next.z)) return false;
    helper.targetId = next.id;
    next.reservedBy = helper.id;
    helper.state = 'outbound';
    return true;
  }

  function headHome(helper, fleeing) {
    release(helper);
    helper.state = fleeing ? 'fleeing' : 'returning';
    const target = (helper.exitPoint || homePoint(helper)).surface;
    if (!walkTo(helper, target.x, target.z)) {
      helper.path = [{ x: target.x, z: target.z }];
      helper.pathIndex = 0;
    }
  }

  function arriveHome(helper) {
    helper.exitPoint = null;
    placeAtNest(helper);
    if (helper.carrying) {
      onDeposit(depositStationOf(helper), helper.carrying, helper.load || 1);
      helper.carrying = null;
      helper.load = 0;
    }
    helper.state = 'resting';
    helper.restTimer = REST_SECONDS + Math.random() * 2;
  }

  function step(helper, deltaTime, speed) {
    if (helper.pathIndex >= helper.path.length) return true;
    const waypoint = helper.path[helper.pathIndex];
    const offsetX = waypoint.x - helper.x;
    const offsetZ = waypoint.z - helper.z;
    const distance = Math.hypot(offsetX, offsetZ);
    if (distance < 0.2) {
      helper.pathIndex++;
      return helper.pathIndex >= helper.path.length;
    }
    const stride = Math.min(distance, speed * deltaTime);
    helper.x += (offsetX / distance) * stride;
    helper.z += (offsetZ / distance) * stride;
    helper.heading = Math.atan2(offsetX, offsetZ);
    helper.moving = true;
    return false;
  }

  function threatNear(helper) {
    const player = getPlayer();
    const busyWithPlayer = player.alive ? player.combatTarget : null;
    const followerIgnoresChasers = helper.state === 'following' && player.alive;
    let nearest = null;
    for (const enemy of enemies.list) {
      if (enemy.state === 'dead' || enemy.state === 'dying' || enemy.definition.temperament !== 'aggressive') continue;
      if (enemy === busyWithPlayer) continue;
      if (followerIgnoresChasers && (enemy.state === 'chase' || enemy.state === 'landing')) continue;
      if (enemy.definition.flies && (enemy.altitude || 0) > 2) continue;
      const distance = Math.hypot(enemy.x - helper.x, enemy.z - helper.z);
      if (!nearest || distance < nearest.distance) nearest = { enemy, distance };
    }
    return nearest;
  }

  function knockedOut(helper, enemy) {
    release(helper);
    Object.assign(helper, { job: null, carryOrder: null, carrying: null, load: 0, health: helperMaxHealth(helper), state: 'resting', restTimer: REST_SECONDS, exitPoint: null, fightTargetId: null });
    placeAtNest(helper);
    onLost(helper, enemy);
  }

  function updateInside(helper, deltaTime) {
    if (helper.state === 'toProcess') {
      if (!step(helper, deltaTime, WALK_SPEED)) return;
      const station = stationById(helper.processStationId);
      if (!station) {
        returnToNest(helper);
        return;
      }
      const recipe = PROCESS_RECIPES[station.kind];
      if (helper.carrying === recipe.input && !loadStation(station, { [recipe.input]: helper.load })) {
        const nest = nestOf(helper);
        if (nest && nest.box) nest.box.inventory[recipe.input] = (nest.box.inventory[recipe.input] || 0) + helper.load;
      }
      Object.assign(helper, { carrying: null, load: 0 });
      const collected = collectStation(station);
      onSound('gatherDriftwood', helper);
      if (!collected) {
        returnToNest(helper);
        return;
      }
      Object.assign(helper, { carrying: recipe.output, load: collected });
      const target = depositStationOf(helper);
      const spot = target && burrow.stationSpot(target);
      if (spot && walkTo(helper, spot.x, spot.z)) helper.state = 'toTarget';
      else returnToNest(helper);
      return;
    }
    if (helper.state === 'toSource') {
      if (!step(helper, deltaTime, WALK_SPEED)) return;
      const source = boxOf(helper.activeCarry && helper.activeCarry.fromId);
      const target = boxOf(helper.activeCarry && helper.activeCarry.toId);
      const toStation = target && stationById(helper.activeCarry.toId);
      const available = source ? source.inventory[helper.carryType] || 0 : 0;
      if (!toStation || !available) {
        returnToNest(helper);
        return;
      }
      helper.load = Math.min(CARRY_LOAD, available);
      source.inventory[helper.carryType] -= helper.load;
      helper.carrying = helper.carryType;
      const spot = burrow.stationSpot(toStation);
      walkTo(helper, spot.x, spot.z);
      helper.state = 'toTarget';
    } else if (helper.state === 'toTarget') {
      if (!step(helper, deltaTime, WALK_SPEED)) return;
      const target = boxOf(helper.tripTargetId ?? (helper.activeCarry && helper.activeCarry.toId)) || boxOf(helper.nestId);
      if (target && helper.carrying) target.inventory[helper.carrying] = (target.inventory[helper.carrying] || 0) + helper.load;
      helper.carrying = null;
      helper.load = 0;
      onSound('gatherDriftwood', helper);
      returnToNest(helper);
    } else if (helper.state === 'toNest') {
      if (!step(helper, deltaTime, WALK_SPEED)) return;
      const spot = nestSpot(helper);
      if (!spot || Math.hypot(spot.x - helper.x, spot.z - helper.z) < NEST_REACH + 1.5 || helper.pathIndex >= helper.path.length) {
        helper.state = 'resting';
        helper.restTimer = REST_SECONDS;
      }
    }
  }

  function returnToNest(helper) {
    const spot = nestSpot(helper);
    if (spot && walkTo(helper, spot.x, spot.z + 1.2)) helper.state = 'toNest';
    else {
      placeAtNest(helper);
      helper.state = 'resting';
      helper.restTimer = REST_SECONDS;
    }
  }

  function inDanger(helper, enemy) {
    const nextHit = hitDamage(enemy.definition.attack, helperStats(helper).defense);
    return helper.health <= Math.max(helperMaxHealth(helper) * FLEE_HEALTH_SHARE, nextHit * 1.2);
  }

  function startFight(helper, enemy) {
    release(helper);
    helper.state = 'fighting';
    helper.fightTargetId = enemy.id;
    helper.attackTimer = 0.3;
  }

  function updateFight(helper, deltaTime, time) {
    const enemy = enemies.list.find((candidate) => candidate.id === helper.fightTargetId);
    if (!enemy || !enemies.alive(enemy)) {
      helper.fightTargetId = null;
      headHome(helper, false);
      return;
    }
    const distance = Math.hypot(enemy.x - helper.x, enemy.z - helper.z);
    if (distance > FIGHT_GIVE_UP_DISTANCE) {
      helper.fightTargetId = null;
      headHome(helper, false);
      return;
    }
    if (inDanger(helper, enemy) && !expectsToWin(helper, enemy)) {
      helper.fightTargetId = null;
      headHome(helper, true);
      return;
    }
    const reach = enemy.definition.radius + FIGHT_REACH;
    helper.heading = Math.atan2(enemy.x - helper.x, enemy.z - helper.z);
    if (distance > reach) {
      const stride = Math.min(distance - reach, WALK_SPEED * helperStats(helper).speedFactor * deltaTime);
      const nextX = helper.x + ((enemy.x - helper.x) / distance) * stride;
      const nextZ = helper.z + ((enemy.z - helper.z) / distance) * stride;
      if (world.isWalkable(nextX, nextZ)) Object.assign(helper, { x: nextX, z: nextZ, moving: true });
      return;
    }
    helper.attackTimer -= deltaTime;
    if (helper.attackTimer > 0) return;
    const stats = helperStats(helper);
    helper.attackTimer = stats.attackInterval;
    onSound('shellClonk', helper);
    helper.attackAnimPending = true;
    logHelperHit(helper, enemy, stats);
    const killed = enemies.damage(enemy, hitDamage(stats.attack, enemy.definition.defense || 0), time, helper, { provoke: false });
    if (killed) helper.fightTargetId = null;
  }

  function gainExperience(helper, amount) {
    let levelsGained = 0;
    helper.experience = (helper.experience || 0) + amount;
    while ((helper.level || 1) < MAX_LEVEL && helper.experience >= experienceForLevel(helper.level || 1)) {
      helper.experience -= experienceForLevel(helper.level || 1);
      helper.level = (helper.level || 1) + 1;
      helper.health += HELPER_HEALTH_PER_LEVEL;
      levelsGained++;
    }
    if (helper.level >= MAX_LEVEL) helper.experience = 0;
    return levelsGained;
  }

  function bringHome(helper, type, amount) {
    helper.carrying = type;
    helper.load = amount;
    headHome(helper, false);
  }

  function updateMeals(helper, deltaTime) {
    if (!upkeepActive()) {
      helper.hungry = false;
      helper.mealIn = HELPER_MEAL_SECONDS;
      return;
    }
    helper.mealIn = (helper.mealIn ?? HELPER_MEAL_SECONDS) - deltaTime;
    if (helper.mealIn > 0 || !(helper.state === 'resting' || helper.inside)) return;
    const wasHungry = helper.hungry;
    helper.hungry = !feedHelper(helper);
    helper.mealIn = helper.hungry ? MEAL_RETRY_SECONDS : HELPER_MEAL_SECONDS;
    if (helper.hungry && !wasHungry) onLog('helper', `${nameOf(helper)} is hungry — put dried kelp in the pantry or its nest box`);
  }

  function updateHelper(helper, deltaTime, time) {
    helper.moving = false;
    updateMeals(helper, deltaTime);
    const regenFactor = time < (helper.wellFedUntil || 0) ? WELL_FED_REGEN_FACTOR : 1;
    if (helper.state === 'resting' || helper.inside) helper.health = Math.min(helperMaxHealth(helper), helper.health + HELPER_REGEN_PER_SECOND * regenFactor * deltaTime);
    useItemsIfNeeded(helper, time);
    if (helper.state === 'resting') {
      helper.restTimer -= deltaTime;
      if (helper.carrying) {
        onDeposit(depositStationOf(helper), helper.carrying, helper.load || 1);
        helper.carrying = null;
        helper.load = 0;
      }
      if (helper.restTimer <= 0) leaveNest(helper);
      return;
    }
    if (helper.inside && helper.state === 'following') {
      updateFollow(helper, deltaTime, time);
      return;
    }
    if (helper.inside) {
      updateInside(helper, deltaTime);
      return;
    }
    const threat = threatNear(helper);
    if (threat && threat.distance < BITE_DISTANCE + threat.enemy.definition.radius) {
      helper.biteTimer = (helper.biteTimer || 0) - deltaTime;
      if (helper.biteTimer <= 0) {
        helper.biteTimer = threat.enemy.definition.attackInterval;
        const defense = helperStats(helper).defense;
        const damage = hitDamage(threat.enemy.definition.attack, defense);
        helper.health -= damage;
        helper.hurtAnimPending = true;
        onLog('helperCombat', `${threat.enemy.definition.label} hits ${nameOf(helper)} for ${damage} — attack ${threat.enemy.definition.attack}, shell ${defense} blocks ${Math.min(threat.enemy.definition.attack - 1, defense / 2)} · HP ${Math.max(0, Math.ceil(helper.health))}/${helperMaxHealth(helper)}`);
        onSound('shellClonk', helper);
        if (helper.health <= 0) {
          knockedOut(helper, threat.enemy);
          return;
        }
      }
    }
    if (helper.state === 'following') {
      updateFollow(helper, deltaTime, time);
      helper.y = world.heightAt(helper.x, helper.z);
      return;
    }
    if (helper.state === 'fighting') {
      updateFight(helper, deltaTime, time);
      helper.y = world.heightAt(helper.x, helper.z);
      return;
    }
    if (threat && threat.distance < DANGER_DISTANCE && helper.state !== 'fleeing') {
      if (expectsToWin(helper, threat.enemy)) {
        onLog('helperCombat', `${nameOf(helper)} takes on the ${threat.enemy.definition.label.toLowerCase()}`);
        startFight(helper, threat.enemy);
      } else {
        onLog('helperCombat', `${nameOf(helper)} flees from the ${threat.enemy.definition.label.toLowerCase()}`);
        headHome(helper, true);
      }
    }
    if (helper.state === 'toRack') {
      step(helper, deltaTime, WALK_SPEED);
      if (!rack.exists || Math.hypot(rack.state.x - helper.x, rack.state.z - helper.z) <= RACK_REACH || helper.pathIndex >= helper.path.length) {
        if (rack.exists && RACK_INPUTS.includes(helper.carrying) && rack.load()) {
          helper.carrying = null;
          helper.load = 0;
          onSound('gatherSeaLettuce', helper);
        }
        const collected = !helper.carrying && rack.exists ? rack.collect() : 0;
        if (collected) {
          helper.carrying = 'driedKelp';
          helper.load = collected;
        }
        headHome(helper, false);
      }
    } else if (helper.state === 'outbound') {
      const node = nodeById(helper.targetId);
      if (!node || node.gathered) {
        headHome(helper, false);
        return;
      }
      step(helper, deltaTime, WALK_SPEED);
      if (Math.hypot(node.x - helper.x, node.z - helper.z) <= GATHER_REACH) {
        helper.state = 'gathering';
        helper.progress = 0;
        helper.heading = Math.atan2(node.x - helper.x, node.z - helper.z);
      } else if (helper.pathIndex >= helper.path.length) headHome(helper, false);
    } else if (helper.state === 'gathering') {
      const node = nodeById(helper.targetId);
      if (!node || node.gathered) {
        headHome(helper, false);
        return;
      }
      helper.progress += deltaTime * (helper.hungry ? HUNGRY_WORK_FACTOR : 1);
      if (helper.progress >= RESOURCE_TYPES[node.type].gatherSeconds * GATHER_SLOWDOWN) {
        resources.gather(node);
        helper.load = (helper.carrying === node.type ? helper.load : 0) + 1;
        helper.carrying = node.type;
        onSound(`gather${node.type[0].toUpperCase()}${node.type.slice(1)}`, helper);
        if (!(helper.satchel && helper.load < SATCHEL_LOAD && goGatherNext(helper, node.type))) headHome(helper, false);
      }
    } else if (helper.state === 'returning' || helper.state === 'fleeing') {
      step(helper, deltaTime, helper.state === 'fleeing' ? FLEE_SPEED : WALK_SPEED);
      const target = (helper.exitPoint || homePoint(helper)).surface;
      if (Math.hypot(target.x - helper.x, target.z - helper.z) <= ENTRANCE_REACH + 0.6 || helper.pathIndex >= helper.path.length) arriveHome(helper);
    }
    helper.y = world.heightAt(helper.x, helper.z);
  }

  function update(deltaTime, time = 0) {
    if (!burrow.exists) return;
    for (const helper of list) {
      if (!nestOf(helper)) continue;
      updateHelper(helper, deltaTime, time);
    }
  }

  const strandedVisible = () => strandedSpots.filter((spot) => !rescued.has(spot.id));

  function drawCrab(entry, { x, y, z, heading, speed, inside, gear, deltaTime }) {
    const shellKind = gear && gear.shell ? gear.shell.kind : null;
    const clawKind = gear && gear.claws ? gear.claws.kind : null;
    const gearKey = `${shellKind}|${clawKind}`;
    if (entry.gearKey !== gearKey) {
      entry.crab.setShell(shellKind ? SHELLS[shellKind].look : NAKED.look);
      entry.crab.setClawWeapon(clawKind);
      entry.gearKey = gearKey;
    }
    cullSphere.center.set(x, y, z);
    if (!viewFrustum.intersectsSphere(cullSphere)) {
      entry.crab.root.visible = false;
      return;
    }
    if (entry.inside !== inside) {
      entry.crab.root.traverse((child) => child.layers.set(inside ? BURROW_LAYER : 0));
      entry.inside = inside;
    }
    entry.crab.root.visible = true;
    entry.crab.update(deltaTime, { x, y, z, heading, speed, working: false, groundNormal: FLAT_GROUND });
  }

  function render(time, camera) {
    viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    viewFrustum.setFromProjectionMatrix(viewMatrix);
    const deltaTime = lastRenderTime === null ? 0 : Math.min(MAX_RENDER_STEP, Math.max(0, time - lastRenderTime));
    lastRenderTime = time;
    const drawn = new Set();
    let carryCount = 0;
    for (const [index, helper] of list.entries()) {
      const key = `helper-${helper.id}`;
      const entry = crabFor(key, helper.id);
      drawn.add(key);
      if (helper.attackAnimPending) entry.crab.playAttack(Math.random() < 0.5 ? 'big' : 'small');
      if (helper.hurtAnimPending) entry.crab.playHurt(0.6, 0);
      helper.attackAnimPending = false;
      helper.hurtAnimPending = false;
      const speed = helper.moving ? (helper.state === 'fleeing' ? FLEE_SPEED : WALK_SPEED) * helperStats(helper).speedFactor : 0;
      const restingHeading = index * 2.1 + Math.sin(time * 0.3 + index) * 0.3;
      const heading = helper.inside && helper.state === 'resting' ? restingHeading : helper.heading || 0;
      drawCrab(entry, { x: helper.x, y: helper.inside ? BURROW_ORIGIN.y : helper.y, z: helper.z, heading, speed, inside: helper.inside, gear: helper.gear, deltaTime });
      if (helper.carrying) {
        transform.position.set(helper.x, (helper.inside ? BURROW_ORIGIN.y : helper.y) + 1.45, helper.z);
        transform.rotation.set(0, 0, 0);
        transform.scale.setScalar(1);
        transform.updateMatrix();
        carryMesh.setMatrixAt(carryCount, transform.matrix);
        carryOutline.setMatrixAt(carryCount, transform.matrix);
        carryMesh.setColorAt(carryCount++, CARRY_COLORS[helper.carrying] || DEFAULT_CARRY_COLOR);
      }
    }
    for (const [index, spot] of strandedVisible().entries()) {
      const key = `stranded-${spot.id}`;
      const entry = crabFor(key, index + 1);
      drawn.add(key);
      const wiggle = Math.sin(time * STRANDED_BOB_SPEED + index * 1.7);
      drawCrab(entry, { x: spot.x, y: world.heightAt(spot.x, spot.z), z: spot.z, heading: spot.heading + wiggle * 0.25, speed: STRANDED_STRUGGLE_SPEED, inside: false, gear: null, deltaTime });
      const pulse = 1 + 0.12 * Math.sin(time * 3 + index);
      transform.position.set(spot.x, world.heightAt(spot.x, spot.z) + 0.1, spot.z);
      transform.rotation.set(0, 0, 0);
      transform.scale.setScalar(pulse);
      transform.updateMatrix();
      strandedRings.setMatrixAt(index, transform.matrix);
    }
    for (const [key, entry] of crabs) if (!drawn.has(key)) entry.crab.root.visible = false;
    strandedRings.count = strandedVisible().length;
    strandedRings.instanceMatrix.needsUpdate = true;
    carryMesh.count = carryCount;
    carryOutline.count = carryCount;
    for (const mesh of [carryMesh, carryOutline]) mesh.instanceMatrix.needsUpdate = true;
    if (carryMesh.instanceColor) carryMesh.instanceColor.needsUpdate = true;
  }

  function strandedUnder(clientX, clientY, camera, radiusPixels) {
    let best = null;
    for (const spot of strandedVisible()) {
      projected.set(spot.x, world.heightAt(spot.x, spot.z) + 0.4, spot.z).project(camera);
      if (projected.z > 1) continue;
      const distance = Math.hypot((projected.x * 0.5 + 0.5) * innerWidth - clientX, (-projected.y * 0.5 + 0.5) * innerHeight - clientY);
      if (distance < radiusPixels && (!best || distance < best.distance)) best = { spot, distance };
    }
    return best ? best.spot : null;
  }

  function freeNest() {
    return burrow.state.stations.find((station) => station.kind === 'helperNest' && list.filter((helper) => helper.nestId === station.id).length < NEST_CAPACITY) || null;
  }

  function rescue(spot) {
    if (rescued.has(spot.id) || list.length >= HELPER_LIMIT) return null;
    const nest = freeNest();
    if (!nest) return null;
    rescued.add(spot.id);
    const id = nextId++;
    const helper = { id, helperId: id, spotId: spot.id, nestId: nest.id, job: null, carryOrder: null, gear: { shell: null, claws: null }, level: 1, experience: 0, bag: emptyBag(), itemUse: 'both', state: 'resting', inside: true, x: 0, z: 0, y: 0, heading: 0, path: [], pathIndex: 0, restTimer: 1.5, carrying: null, load: 0, health: HELPER_HEALTH, targetId: null };
    list.push(helper);
    placeAtNest(helper);
    return helper;
  }

  function adopt(nest) {
    for (const helper of list) {
      if (nestOf(helper)) continue;
      helper.nestId = nest.id;
      placeAtNest(helper);
    }
  }

  function emptyBag() {
    return Array(HELPER_BAG_SLOTS).fill(null);
  }

  const helperById = (id) => list.find((helper) => helper.id === id) || null;

  function giveItem(id, type, amount) {
    const helper = helperById(id);
    if (!helper || !CONSUMABLES[type]) return 0;
    helper.bag ||= emptyBag();
    let slotIndex = helper.bag.findIndex((slot) => slot && slot.type === type);
    if (slotIndex < 0) {
      slotIndex = helper.bag.findIndex((slot) => !slot);
      if (slotIndex < 0) return 0;
      helper.bag[slotIndex] = { type, count: 0 };
    }
    const slot = helper.bag[slotIndex];
    const moved = Math.max(0, Math.min(amount, stackLimitOf(type) - slot.count));
    slot.count += moved;
    if (!slot.count) helper.bag[slotIndex] = null;
    return moved;
  }

  function takeItem(id, slotIndex) {
    const helper = helperById(id);
    const slot = helper && helper.bag && helper.bag[slotIndex];
    if (!slot) return null;
    helper.bag[slotIndex] = null;
    return slot;
  }

  function setItemUse(id, mode) {
    const helper = helperById(id);
    if (!helper || !ITEM_USE_MODES.includes(mode)) return false;
    helper.itemUse = mode;
    return true;
  }

  function bagSlotFor(helper, predicate, time) {
    return (helper.bag || []).findIndex((slot) => slot && slot.count > 0 && predicate(CONSUMABLES[slot.type]) && time >= ((helper.itemReadyAt || {})[slot.type] || 0));
  }

  function consumeFromBag(helper, slotIndex, time) {
    const slot = helper.bag[slotIndex];
    slot.count -= 1;
    (helper.itemReadyAt ||= {})[slot.type] = time + CONSUMABLES[slot.type].cooldownSeconds;
    if (!slot.count) helper.bag[slotIndex] = null;
    return slot.type;
  }

  function useItemsIfNeeded(helper, time) {
    const mode = helper.itemUse || 'both';
    if (mode === 'nobody' || !helper.bag || !helper.bag.some(Boolean)) return null;
    const maxHealth = helperMaxHealth(helper);
    const selfShare = helper.health / maxHealth;
    const vitals = playerVitals();
    const playerInReach = vitals && vitals.alive && vitals.inside === helper.inside && Math.hypot(vitals.x - helper.x, vitals.z - helper.z) <= ITEM_USE_REACH;
    const playerShare = playerInReach ? vitals.health / vitals.maxHealth : 1;
    const wantsSelf = (mode === 'self' || mode === 'both') && selfShare < ITEM_USE_HEALTH_SHARE;
    const wantsPlayer = (mode === 'you' || mode === 'both') && playerInReach && playerShare < ITEM_USE_HEALTH_SHARE;
    if (!wantsSelf && !wantsPlayer) return null;
    const target = wantsSelf && (!wantsPlayer || selfShare <= playerShare) ? 'self' : 'player';
    const healIndex = bagSlotFor(helper, (definition) => definition.healShare, time);
    if (healIndex >= 0) {
      const type = consumeFromBag(helper, healIndex, time);
      const share = CONSUMABLES[type].healShare;
      const label = RESOURCE_TYPES[type].label.toLowerCase();
      if (target === 'self') {
        const healed = Math.min(maxHealth - helper.health, Math.round(maxHealth * share));
        helper.health += healed;
        onHealFloat(helper, healed);
        onLog('helperCombat', `${nameOf(helper)} uses a ${label} on itself +${healed} · HP ${Math.ceil(helper.health)}/${maxHealth}`);
      } else {
        const healed = healPlayer(Math.round(vitals.maxHealth * share));
        onLog('helperCombat', `${nameOf(helper)} uses a ${label} on you +${healed} · HP ${Math.ceil(vitals.health + healed)}/${vitals.maxHealth}`);
      }
      onSound('craft', helper);
      return { type, target };
    }
    if (target !== 'self' || time < (helper.wellFedUntil || 0)) return null;
    const kelpIndex = bagSlotFor(helper, (definition) => !definition.healShare, time);
    if (kelpIndex < 0) return null;
    const type = consumeFromBag(helper, kelpIndex, time);
    helper.wellFedUntil = time + WELL_FED_SECONDS;
    onLog('helperCombat', `${nameOf(helper)} eats ${RESOURCE_TYPES[type].label.toLowerCase()} — heals twice as fast for 90 s`);
    return { type, target };
  }

  const nameOf = (helper) => `Helper ${list.indexOf(helper) + 1}`;

  function logHelperHit(helper, enemy, stats) {
    const defense = enemy.definition.defense || 0;
    onLog('helperCombat', `${nameOf(helper)} hits ${enemy.definition.label} for ${hitDamage(stats.attack, defense)} — attack ${stats.attack}, its armour ${defense} blocks ${Math.min(stats.attack - 1, defense / 2)}`);
  }

  const follower = () => list.find((helper) => helper.job === 'follow') || null;

  function setJob(id, job, carryOrder = null) {
    const helper = list.find((candidate) => candidate.id === id);
    if (!helper) return false;
    const currentFollower = follower();
    if (job === 'follow' && currentFollower && currentFollower !== helper) return false;
    if (helper.job === 'follow' && job !== 'follow' && helper.state === 'following') stopFollowing(helper, false);
    helper.job = job || null;
    helper.carryOrder = job === 'carry' ? carryOrder : null;
    if (!helper.inside && (helper.state === 'outbound' || helper.state === 'gathering')) headHome(helper, false);
    if (helper.inside && helper.state !== 'resting') returnToNest(helper);
    if (helper.state === 'resting') helper.restTimer = Math.min(helper.restTimer, 1);
    return true;
  }

  const serialize = () => ({ list: list.map(({ id, spotId, nestId, job, carryOrder, carrying, load, gear, level, experience, bag, itemUse, mealIn, hungry, satchel }) => ({ id, spotId, nestId, job, carryOrder, carrying, load, gear, level, experience, bag, itemUse, mealIn, hungry, satchel })), rescued: [...rescued] });

  for (const helper of list) placeAtNest(helper);

  return { list, nameOf, follower, giveItem, takeItem, setItemUse, useItemsIfNeeded, update, render, rescue, adopt, freeNest, setJob, serialize, strandedUnder, strandedVisible, gainExperience, bringHome, isRescued: (spotId) => rescued.has(spotId), markRescued: (spotId) => rescued.add(spotId), maxHealth: HELPER_HEALTH, meshes: [carryMesh] };
}
