import { SHELLS, CLAWS, shellDefenseOf, clawAttackOf, shieldArmourOf } from './gear.js';

export const LOOTER_SLOTS = {
  shoreCrab: ['big', 'small'],
  giantLobster: ['big', 'small'],
  octopus: ['shell'],
  rivalHermit: ['shell', 'big', 'small'],
};
export const LOOT_STAT_SHARE = 0.5;
export const LOOTER_MARK = '★';
const ENEMY_ATTACK_PER_LEVEL = 3;
const ENEMY_DEFENSE_PER_LEVEL = 1.2;

const WORN_ID_OF_SLOT = { shell: 'wornShellId', big: 'wornClawsId', small: 'wornSmallId' };

export const canLoot = (kind) => Boolean(LOOTER_SLOTS[kind]);
export const isLooter = (enemy) => Boolean(enemy.loot && Object.values(enemy.loot).some(Boolean));
export const lootedItems = (enemy) => (enemy.loot ? Object.values(enemy.loot).filter(Boolean) : []);

function itemAttack(item) {
  const definition = CLAWS[item.kind];
  return definition.shield ? 0 : clawAttackOf(definition, item);
}

function itemDefense(item, slot) {
  if (slot === 'shell') return shellDefenseOf(SHELLS[item.kind], item);
  const definition = CLAWS[item.kind];
  return definition.shield ? shieldArmourOf(definition, item) : 0;
}

function itemValue(item, slot) {
  return (slot === 'shell' ? 0 : itemAttack(item)) + itemDefense(item, slot) / 2;
}

export function lootBonus(enemy) {
  if (!enemy.loot) return { attack: 0, defense: 0 };
  let attack = 0;
  let defense = 0;
  for (const [slot, item] of Object.entries(enemy.loot)) {
    if (!item) continue;
    if (slot !== 'shell') attack += itemAttack(item);
    defense += itemDefense(item, slot);
  }
  return { attack: Math.round(attack * LOOT_STAT_SHARE), defense: Math.round(defense * LOOT_STAT_SHARE) };
}

export const attackOf = (enemy) => enemy.definition.attack + lootBonus(enemy).attack;
export const defenseOf = (enemy) => (enemy.definition.defense || 0) + lootBonus(enemy).defense;

export function levelOf(enemy) {
  const bonus = lootBonus(enemy);
  return enemy.definition.level + Math.round((bonus.attack / ENEMY_ATTACK_PER_LEVEL + bonus.defense / ENEMY_DEFENSE_PER_LEVEL) / 2);
}

export const labelOf = (enemy) => (isLooter(enemy) ? `${enemy.definition.label} ${LOOTER_MARK}` : enemy.definition.label);

function removeFrom(dropped, slot, item) {
  const list = slot === 'shell' ? dropped.shells : dropped.claws;
  list.splice(list.indexOf(item), 1);
  dropped[WORN_ID_OF_SLOT[slot]] = null;
}

export function takeFrom(enemy, dropped) {
  const slots = LOOTER_SLOTS[enemy.kind];
  if (!slots) return [];
  enemy.loot = enemy.loot || {};
  const taken = [];
  for (const slot of slots) {
    const wornId = dropped[WORN_ID_OF_SLOT[slot]];
    const list = slot === 'shell' ? dropped.shells : dropped.claws;
    const item = wornId ? list.find((candidate) => candidate.id === wornId) : null;
    if (!item) continue;
    const current = enemy.loot[slot];
    if (current && itemValue(current, slot) >= itemValue(item, slot)) continue;
    removeFrom(dropped, slot, item);
    if (current) list.push(current);
    enemy.loot[slot] = item;
    taken.push(item);
  }
  return taken;
}

export function giveUpLoot(enemy) {
  const loot = enemy.loot || {};
  enemy.loot = null;
  const shells = loot.shell ? [loot.shell] : [];
  const claws = [loot.big, loot.small].filter(Boolean);
  return { shells, claws, wornShellId: loot.shell ? loot.shell.id : null, wornClawsId: loot.big ? loot.big.id : null, wornSmallId: loot.small ? loot.small.id : null };
}

export const lootKeyOf = (enemy) => `${enemy.kind}:${enemy.slot}`;

export function serializeLooters(enemies) {
  return enemies.filter(isLooter).map((enemy) => ({ key: lootKeyOf(enemy), loot: enemy.loot }));
}

export function restoreLooters(enemies, saved) {
  for (const entry of saved || []) {
    const enemy = enemies.find((candidate) => lootKeyOf(candidate) === entry.key);
    if (enemy && canLoot(enemy.kind)) enemy.loot = entry.loot;
  }
}
