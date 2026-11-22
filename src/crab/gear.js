export const SHELLS = {
  snail: {
    label: 'Snail shell',
    role: 'Starter',
    defense: 2,
    speedFactor: 1,
    attackFactor: 1,
    ability: null,
    cost: { shellBits: 3 },
    look: { model: 'snail', turns: 2.7, spireShare: 0.86, whorlRadius: 0.5, tubeRadius: 0.6, height: 1.25, bandFrequency: 26, light: [0.98, 0.94, 0.86], band: [0.86, 0.3, 0.1], inside: [0.36, 0.22, 0.2] },
  },
  turban: {
    label: 'Turban shell',
    role: 'Tank',
    defense: 7,
    speedFactor: 0.88,
    attackFactor: 1,
    ability: { id: 'brace', label: 'Brace', description: '−30% damage taken while standing still' },
    cost: { shellBits: 10, seaLettuce: 4 },
    look: { model: 'turban', turns: 2.1, spireShare: 0.9, whorlRadius: 0.66, tubeRadius: 0.72, height: 0.78, bandFrequency: 24, light: [0.74, 0.68, 0.5], band: [0.3, 0.36, 0.2], inside: [0.88, 0.86, 0.8] },
  },
  cone: {
    label: 'Cone shell',
    role: 'Striker',
    defense: 3,
    speedFactor: 1.05,
    attackFactor: 1.25,
    ability: { id: 'sting', label: 'Sting', description: 'every 4th hit deals double damage' },
    cost: { shellBits: 8, driftwood: 4 },
    look: { model: 'cone', turns: 3.4, spireShare: 0.92, whorlRadius: 0.24, tubeRadius: 0.5, height: 1.9, bandFrequency: 40, light: [0.96, 0.84, 0.6], band: [0.42, 0.2, 0.08], inside: [0.94, 0.72, 0.62] },
  },
  coral: {
    label: 'Coral shell',
    tier: 2,
    role: 'Reef tank',
    defense: 12,
    speedFactor: 0.85,
    attackFactor: 1,
    ability: { id: 'brace', label: 'Brace+ · Spikes', description: '−40% damage taken while standing still; attackers take 3 damage', damageFactor: 0.6, thorns: 3 },
    cost: { coral: 6, seaGlass: 2, shellBits: 6 },
    look: { model: 'coral', turns: 2.3, spireShare: 0.88, whorlRadius: 0.62, tubeRadius: 0.82, height: 0.95, bandFrequency: 30, knobs: 34, light: [0.96, 0.42, 0.4], band: [0.62, 0.12, 0.2], inside: [0.98, 0.88, 0.82] },
  },
  whelk: {
    label: 'Spiral whelk',
    tier: 2,
    role: 'Reef striker',
    defense: 5,
    speedFactor: 1.1,
    attackFactor: 1.35,
    ability: { id: 'sting', label: 'Sting+', description: 'every 3rd hit deals double damage', everyHits: 3 },
    cost: { seaGlass: 4, coral: 3, shellBits: 6 },
    look: { model: 'whelk', turns: 4.2, spireShare: 0.94, whorlRadius: 0.32, tubeRadius: 0.56, height: 1.75, bandFrequency: 52, light: [0.86, 0.9, 0.94], band: [0.2, 0.42, 0.62], inside: [0.96, 0.82, 0.72] },
  },
};

export const NAKED = {
  label: 'No shell',
  defense: 0,
  speedFactor: 1,
  attackFactor: 1,
  ability: null,
  look: { soft: true, tubeRadius: 0.34, light: [0.96, 0.72, 0.62], band: [0.66, 0.36, 0.34] },
};

export const CLAWS = {
  bare: { label: 'Bare claws', attackBonus: 0, weight: 0, cost: null },
  shellEdged: { label: 'Shell-edged claws', attackBonus: 4, weight: 2, cost: { shellBits: 6, driftwood: 4 } },
  coralTipped: { label: 'Coral-tipped claws', tier: 2, attackBonus: 8, weight: 3, cost: { coral: 5, seaGlass: 2, driftwood: 2 }, tint: [1.7, 1.25, 1.6] },
  cleaver: { label: 'Cleaver claws', tier: 5, trophy: 'cook', attackBonus: 24, weight: 6, cost: { apronScrap: 2, scrap: 6, fishBone: 4 }, tint: [1.25, 1.3, 1.4] },
  shellShield: { label: 'Clam shield', shield: true, attackBonus: 0, armour: 3, blockChance: 0.1, weight: 2, cost: { shellBits: 6, driftwood: 3 } },
  lobsterShield: { label: 'Lobster shield', shield: true, tier: 3, attackBonus: 0, armour: 8, blockChance: 0.15, weight: 5, cost: { lobsterPlate: 2, scrap: 3 } },
};

export const HANDS = ['big', 'small'];
export const HAND_LABELS = { big: 'Big claw', small: 'Small claw' };
export const SMALL_CLAW_DAMAGE_SHARE = 0.6;
const BASE_CARRY = { big: 6, small: 3 };

export function carryCapacity(hand, moltCount) {
  return BASE_CARRY[hand] + (hand === 'big' ? moltCount : Math.floor(moltCount / 2));
}

export function shieldArmourOf(definition, item) {
  return Math.round((definition.armour || 0) * qualityFactor(item));
}

export const BOSS_TROPHIES = {
  cook: { material: 'apronScrap', category: 'claws', kind: 'cleaver' },
};
export const MINIBOSS_MATERIALS = { gull: 'gullFeather', giantLobster: 'lobsterPlate', shipCat: 'catWhisker' };
export const BOSS_MATERIAL_DROP = 2;
export const BOSS_ITEM_CHANCE = 0.1;

export const BASE_ATTACK = 4;

export const QUALITIES = {
  crude: { label: 'Crude', factor: 0.85 },
  fine: { label: 'Fine', factor: 1 },
  masterwork: { label: 'Masterwork', factor: 1.25 },
};
const QUALITY_ORDER = ['crude', 'fine', 'masterwork'];

export const TOOL_TIERS = [
  null,
  { label: 'Shell hammer', cost: null },
  { label: 'Coral file', cost: { coral: 4, seaGlass: 2, pearls: 1 } },
  { label: 'Scrap pliers', cost: { scrap: 4, cloth: 2, pearls: 2 } },
  { label: 'Bone awl', cost: { fishBone: 4, wax: 2, pearls: 2 } },
  { label: "Cook's whetstone", cost: { apronScrap: 2, scrap: 4, pearls: 3 } },
];
export const MAX_TOOL_TIER = TOOL_TIERS.length - 1;

export const BINDINGS = {
  kelp: { label: 'Kelp binding', cost: { driedKelp: 2 }, description: 'every hit heals 1 HP', healOnHit: 1 },
  thread: { label: 'Thread binding', cost: { cloth: 2 }, description: 'attacks 10% faster', attackIntervalFactor: 0.9 },
  wire: { label: 'Wire binding', cost: { scrap: 2, cloth: 1 }, description: '+20% claw attack', attackShare: 0.2 },
  whisker: { label: 'Whisker binding', cost: { catWhisker: 2 }, description: 'attacks 20% faster', attackIntervalFactor: 0.8 },
};

export const REINFORCEMENTS = {
  coralCrust: { label: 'Coral crust', cost: { coral: 3, shellBits: 2 }, description: '+20% armour', defenseShare: 0.2 },
  metalPlate: { label: 'Metal plate', cost: { scrap: 3, cloth: 1 }, description: '+35% armour, −5% speed', defenseShare: 0.35, speedFactor: 0.95 },
  boneSpikes: { label: 'Bone spikes', cost: { fishBone: 3 }, description: 'attackers take 3 damage', thorns: 3 },
  featherLining: { label: 'Feather lining', cost: { gullFeather: 2 }, description: '+8% speed', speedFactor: 1.08 },
  lobsterArmor: { label: 'Lobster plate', cost: { lobsterPlate: 2 }, description: '+30% armour, attackers take 3 damage', defenseShare: 0.3, thorns: 3 },
};

export const MASTERWORK_SHEEN = { glow: 1.0, color: [1, 0.68, 0.18], pulse: false };
const NO_GLOW = { glow: 0, color: [1, 1, 1], pulse: false };

export function itemTierOf(definition) {
  return definition.tier || 1;
}

export function qualityForTools(definition, toolTier) {
  const tier = itemTierOf(definition);
  if (toolTier > tier || toolTier === MAX_TOOL_TIER) return 'masterwork';
  return toolTier === tier ? 'fine' : 'crude';
}

export const isBetterQuality = (candidate, current) => QUALITY_ORDER.indexOf(candidate) > QUALITY_ORDER.indexOf(current);
export const qualityFactor = (item) => QUALITIES[item.quality || 'fine'].factor;

function shareBonus(baseValue, share) {
  return share ? Math.max(1, Math.round(baseValue * share)) : 0;
}

export function shellDefenseOf(definition, item) {
  const reinforcement = item.reinforcement ? REINFORCEMENTS[item.reinforcement] : null;
  return Math.round(definition.defense * qualityFactor(item)) + shareBonus(definition.defense, reinforcement && reinforcement.defenseShare);
}

export function clawAttackOf(definition, item) {
  const binding = item.binding ? BINDINGS[item.binding] : null;
  return Math.round(definition.attackBonus * qualityFactor(item)) + (definition.attackBonus ? shareBonus(definition.attackBonus, binding && binding.attackShare) : 0);
}

export function refineCost(definition) {
  const cost = Object.fromEntries(Object.entries(definition.cost || {}).map(([type, amount]) => [type, Math.ceil(amount / 2)]));
  cost.pearls = (cost.pearls || 0) + 1;
  return cost;
}

export function gearGlowLook(item) {
  return item && item.quality === 'masterwork' ? MASTERWORK_SHEEN : NO_GLOW;
}

const RETIRED_KINDS = { tinCan: 'coral', skull: 'coral', lobster: 'coral', bottle: 'whelk', thimble: 'whelk', fishhook: 'coralTipped', fork: 'coralTipped', whisker: 'coralTipped', quill: 'shellEdged', kelpWrapped: 'shellEdged' };

export function normalizeItem(item) {
  if (RETIRED_KINDS[item.kind]) item.kind = RETIRED_KINDS[item.kind];
  if (!item.quality) item.quality = (item.enchant || 0) >= 4 ? 'masterwork' : 'fine';
  delete item.enchant;
  return item;
}

const SALVAGE_ONLY = { cleaver: ['scrap'] };

export function salvageReturn(kind, definition) {
  if (!definition || !definition.cost) return null;
  const kept = SALVAGE_ONLY[kind] || Object.keys(definition.cost);
  return Object.fromEntries(kept.map((type) => [type, Math.max(1, Math.floor(definition.cost[type] / 2))]));
}

export function canAfford(cost, inventory) {
  return Object.entries(cost).every(([type, amount]) => (inventory[type] || 0) >= amount);
}

function createEmptyGear() {
  return {
    nextId: 3,
    shells: [{ id: 1, kind: 'snail', quality: 'fine' }],
    claws: [{ id: 2, kind: 'bare', quality: 'fine' }],
    wornShellId: 1,
    wornClawsId: 2,
    wornSmallId: null,
    toolTier: 1,
  };
}

export function createGear(saved) {
  const state = saved ? structuredClone(saved) : createEmptyGear();
  state.toolTier = state.toolTier || 1;
  if (state.wornSmallId === undefined) state.wornSmallId = null;
  for (const item of [...state.shells, ...state.claws]) normalizeItem(item);

  const wornShell = () => state.shells.find((item) => item.id === state.wornShellId);
  const wornClaws = () => state.claws.find((item) => item.id === state.wornClawsId);
  const wornSmall = () => (state.wornSmallId ? state.claws.find((item) => item.id === state.wornSmallId) || null : null);
  const bareItem = () => state.claws.find((item) => !CLAWS[item.kind].cost);
  const isWorn = (id) => id === state.wornShellId || id === state.wornClawsId || id === state.wornSmallId;
  const heldIn = (hand) => {
    const item = hand === 'big' ? wornClaws() : wornSmall();
    return item && CLAWS[item.kind].cost ? item : null;
  };

  function wearProblem(id, hand, moltCount = 0) {
    const item = state.claws.find((candidate) => candidate.id === id);
    if (!item) return 'missing';
    const weight = CLAWS[item.kind].weight || 0;
    const capacity = carryCapacity(hand, moltCount);
    return weight > capacity ? `Too heavy for ${HAND_LABELS[hand].toLowerCase()} (${weight}/${capacity})` : null;
  }

  function wearInHand(id, hand, moltCount = 0) {
    if (wearProblem(id, hand, moltCount)) return false;
    if (hand === 'big') {
      if (state.wornSmallId === id) state.wornSmallId = null;
      state.wornClawsId = id;
    } else {
      if (state.wornClawsId === id) state.wornClawsId = bareItem().id;
      state.wornSmallId = CLAWS[state.claws.find((item) => item.id === id).kind].cost ? id : null;
    }
    return true;
  }

  function craft(category, kind, inventory) {
    const definition = (category === 'shell' ? SHELLS : CLAWS)[kind];
    if (!definition || !definition.cost || !canAfford(definition.cost, inventory)) return null;
    for (const [type, amount] of Object.entries(definition.cost)) inventory[type] -= amount;
    const item = { id: state.nextId++, kind, quality: qualityForTools(definition, state.toolTier), isNew: true };
    (category === 'shell' ? state.shells : state.claws).push(item);
    return item;
  }

  function grant(category, kind, quality = 'fine') {
    const item = { id: state.nextId++, kind, quality, isNew: true };
    (category === 'shell' ? state.shells : state.claws).push(item);
    return item;
  }

  function wear(id, hand = 'big', moltCount = Infinity) {
    if (state.shells.some((item) => item.id === id)) state.wornShellId = id;
    else if (state.claws.some((item) => item.id === id)) return wearInHand(id, hand, moltCount);
    else return false;
    return true;
  }

  function unequip(category) {
    if (category === 'shell') {
      if (!state.wornShellId) return false;
      state.wornShellId = null;
      return true;
    }
    if (category === 'small') {
      if (!state.wornSmallId) return false;
      state.wornSmallId = null;
      return true;
    }
    const bare = bareItem();
    if (!bare || state.wornClawsId === bare.id) return false;
    state.wornClawsId = bare.id;
    return true;
  }

  function findItem(id) {
    const shell = state.shells.find((item) => item.id === id);
    if (shell) return { category: 'shell', item: shell, definition: SHELLS[shell.kind] };
    const claws = state.claws.find((item) => item.id === id);
    if (claws) return { category: 'claws', item: claws, definition: CLAWS[claws.kind] };
    return null;
  }

  function salvage(id, inventory) {
    const found = findItem(id);
    if (!found || isWorn(id)) return null;
    const refund = salvageReturn(found.item.kind, found.definition);
    if (!refund) return null;
    const list = found.category === 'shell' ? state.shells : state.claws;
    list.splice(list.indexOf(found.item), 1);
    for (const [type, amount] of Object.entries(refund)) inventory[type] = (inventory[type] || 0) + amount;
    return refund;
  }

  function improvableItems() {
    return [...state.shells, ...state.claws].map((item) => findItem(item.id)).filter(({ definition }) => definition.cost);
  }

  function pay(cost, inventory) {
    if (!cost || !canAfford(cost, inventory)) return false;
    for (const [type, amount] of Object.entries(cost)) inventory[type] -= amount;
    return true;
  }

  function upgradeTools(inventory) {
    const next = TOOL_TIERS[state.toolTier + 1];
    if (!next || !pay(next.cost, inventory)) return null;
    state.toolTier++;
    return next;
  }

  function refineTarget(id) {
    const found = findItem(id);
    if (!found || !found.definition.cost) return null;
    const target = qualityForTools(found.definition, state.toolTier);
    return isBetterQuality(target, found.item.quality) ? target : null;
  }

  function refine(id, inventory) {
    const target = refineTarget(id);
    const found = findItem(id);
    if (!target || !pay(refineCost(found.definition), inventory)) return null;
    found.item.quality = target;
    return found;
  }

  function modify(id, modification, inventory) {
    const found = findItem(id);
    if (!found || !found.definition.cost) return null;
    const options = found.category === 'shell' ? REINFORCEMENTS : BINDINGS;
    const field = found.category === 'shell' ? 'reinforcement' : 'binding';
    if (!options[modification] || found.item[field] === modification || !pay(options[modification].cost, inventory)) return null;
    found.item[field] = modification;
    return found;
  }

  const wornShellDefinition = () => (wornShell() ? SHELLS[wornShell().kind] : NAKED);
  const wornLook = () => wornShellDefinition().look;

  function stats(levelAttackBonus = 0, { attackMultiplier = 1, attackIntervalFactor = 1, defenseFactor = 1 } = {}) {
    const shellItem = wornShell();
    const shell = wornShellDefinition();
    const handItems = HANDS.map(heldIn).filter(Boolean);
    const bindings = handItems.map((item) => (item.binding ? BINDINGS[item.binding] : null)).filter(Boolean);
    const shields = handItems.filter((item) => CLAWS[item.kind].shield);
    const baseAttack = (BASE_ATTACK + levelAttackBonus) * shell.attackFactor * attackMultiplier;
    const handAttack = (hand) => {
      const item = heldIn(hand);
      const weaponBonus = item && !CLAWS[item.kind].shield ? clawAttackOf(CLAWS[item.kind], item) : 0;
      return Math.round((baseAttack + weaponBonus * shell.attackFactor * attackMultiplier) * (hand === 'small' && weaponBonus ? SMALL_CLAW_DAMAGE_SHARE : 1));
    };
    const weaponHands = HANDS.filter((hand) => heldIn(hand) && !CLAWS[heldIn(hand).kind].shield);
    const strikingHands = weaponHands.length ? weaponHands : HANDS.filter((hand) => !heldIn(hand));
    const shieldArmour = shields.reduce((sum, item) => sum + shieldArmourOf(CLAWS[item.kind], item), 0);
    const blockChance = 1 - shields.reduce((keep, item) => keep * (1 - CLAWS[item.kind].blockChance), 1);
    const reinforcement = shellItem && shellItem.reinforcement ? REINFORCEMENTS[shellItem.reinforcement] : null;
    const thorns = ((shell.ability && shell.ability.thorns) || 0) + ((reinforcement && reinforcement.thorns) || 0);
    return {
      defense: Math.round(((shellItem ? shellDefenseOf(shell, shellItem) : shell.defense) + shieldArmour) * defenseFactor),
      shieldArmour,
      blockChance,
      speedFactor: shell.speedFactor * ((reinforcement && reinforcement.speedFactor) || 1),
      attack: handAttack(strikingHands[0]),
      handAttack: Object.fromEntries(HANDS.map((hand) => [hand, handAttack(hand)])),
      strikingHands,
      ability: shell.ability,
      thorns,
      healOnHit: bindings.reduce((sum, binding) => sum + (binding.healOnHit || 0), 0),
      attackIntervalFactor: bindings.reduce((factor, binding) => factor * (binding.attackIntervalFactor || 1), 1) * attackIntervalFactor,
    };
  }

  function dropAll() {
    const dropped = {
      shells: state.shells,
      claws: state.claws.filter((item) => CLAWS[item.kind].cost),
      wornShellId: state.wornShellId,
      wornClawsId: state.wornClawsId,
      wornSmallId: state.wornSmallId,
    };
    state.shells = [];
    state.claws = state.claws.filter((item) => !CLAWS[item.kind].cost);
    state.wornShellId = null;
    state.wornClawsId = state.claws[0].id;
    state.wornSmallId = null;
    return dropped;
  }

  function restore(dropped) {
    for (const item of [...dropped.shells, ...dropped.claws]) normalizeItem(item);
    state.shells.push(...dropped.shells);
    state.claws.push(...dropped.claws);
    if (!wornShell() && dropped.shells.some((item) => item.id === dropped.wornShellId)) state.wornShellId = dropped.wornShellId;
    if (!CLAWS[wornClaws().kind].cost && dropped.claws.some((item) => item.id === dropped.wornClawsId)) state.wornClawsId = dropped.wornClawsId;
    if (!state.wornSmallId && dropped.wornSmallId && dropped.claws.some((item) => item.id === dropped.wornSmallId)) state.wornSmallId = dropped.wornSmallId;
  }

  function hasNewItems() {
    return [...state.shells, ...state.claws].some((item) => item.isNew);
  }

  function markAllSeen() {
    for (const item of [...state.shells, ...state.claws]) delete item.isNew;
  }

  return {
    state,
    hasNewItems,
    markAllSeen,
    craft,
    grant,
    wear,
    unequip,
    findItem,
    salvage,
    improvableItems,
    upgradeTools,
    refineTarget,
    refine,
    modify,
    stats,
    dropAll,
    restore,
    wornLook,
    wornShellDefinition,
    wornShell,
    wornClaws,
    wornSmall,
    heldIn,
    isWorn,
    wearProblem,
    serialize: () => structuredClone(state),
  };
}
