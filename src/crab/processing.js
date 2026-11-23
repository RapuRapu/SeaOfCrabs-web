export const PROCESS_RECIPES = {
  ropeWalk: { input: 'kelp', inputAmount: 3, output: 'cord', seconds: 40, slots: 2 },
  grinder: { input: 'shellBits', inputAmount: 4, output: 'shellLime', seconds: 30, slots: 2 },
};

export const isProcessStation = (station) => Boolean(station && PROCESS_RECIPES[station.kind]);

function processOf(station) {
  station.process ||= { slots: [], ready: 0 };
  return station.process;
}

export function freeSlots(station) {
  return PROCESS_RECIPES[station.kind].slots - processOf(station).slots.length;
}

export function loadStation(station, inventory) {
  const recipe = PROCESS_RECIPES[station.kind];
  if (freeSlots(station) <= 0 || (inventory[recipe.input] || 0) < recipe.inputAmount) return false;
  inventory[recipe.input] -= recipe.inputAmount;
  processOf(station).slots.push(recipe.seconds);
  return true;
}

export function collectStation(station) {
  const process = processOf(station);
  const amount = process.ready;
  process.ready = 0;
  return amount;
}

export function tickStations(stations, deltaTime) {
  for (const station of stations) {
    if (!isProcessStation(station)) continue;
    const process = processOf(station);
    if (!process.slots.length) continue;
    process.slots = process.slots.map((secondsLeft) => secondsLeft - deltaTime);
    const finished = process.slots.filter((secondsLeft) => secondsLeft <= 0).length;
    if (!finished) continue;
    process.slots = process.slots.filter((secondsLeft) => secondsLeft > 0);
    process.ready += finished;
  }
}

export function processView(station) {
  const recipe = PROCESS_RECIPES[station.kind];
  const process = processOf(station);
  return { recipe, working: process.slots.map((secondsLeft) => Math.max(0, Math.ceil(secondsLeft))), ready: process.ready, free: freeSlots(station) };
}
