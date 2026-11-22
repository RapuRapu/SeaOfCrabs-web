import { SHELLS, CLAWS, QUALITIES, BINDINGS, REINFORCEMENTS, shellDefenseOf, clawAttackOf, shieldArmourOf, qualityFactor } from './gear.js';

export const definitionOf = (category, kind) => (category === 'shell' ? SHELLS : CLAWS)[kind];

const percentText = (value) => `${Math.round(value * 100)}%`;

export function itemTier(definition) {
  return definition.tier || 1;
}

export function tierClass(definition) {
  return `tier-${itemTier(definition)}${definition.trophy ? ' tier-trophy' : ''}`;
}

export function tierBadge(definition) {
  return `T${itemTier(definition)}`;
}

export function tierLine(category, definition) {
  const role = category === 'shell' ? definition.role : `${definition.shield ? 'Shield' : 'Claw weapon'} · weight ${definition.weight || 0}`;
  return `${definition.trophy ? 'Boss trophy · ' : ''}Tier ${itemTier(definition)} · ${role}`;
}

export function itemName(category, item) {
  const definition = definitionOf(category, item.kind);
  const baseName = item.quality && item.quality !== 'fine' ? `${QUALITIES[item.quality].label} ${definition.label.toLowerCase()}` : definition.label;
  const modification = modificationOf(category, item);
  return modification ? `${baseName} + ${modification.label.toLowerCase()}` : baseName;
}

export function shellDefense(definition, item = {}) {
  return shellDefenseOf(definition, item);
}

export function clawAttack(definition, item = {}) {
  return clawAttackOf(definition, item);
}

export function modificationOf(category, item) {
  return category === 'shell' ? item.reinforcement && REINFORCEMENTS[item.reinforcement] : item.binding && BINDINGS[item.binding];
}

export function itemStatsText(category, item) {
  const definition = definitionOf(category, item.kind);
  if (category === 'shell') return `🛡 ${shellDefense(definition, item)} · 🏃 ${percentText(definition.speedFactor * ((modificationOf(category, item) || {}).speedFactor || 1))} · 🗡️ ×${definition.attackFactor.toFixed(2)}`;
  if (definition.shield) return `🛡 +${shieldArmourOf(definition, item)} · block ${percentText(definition.blockChance)} · weight ${definition.weight}`;
  return `🗡️ +${clawAttack(definition, item)} · weight ${definition.weight || 0}`;
}

export function itemStatsBreakdown(category, item) {
  const definition = definitionOf(category, item.kind);
  const base = category === 'shell' ? definition.defense : definition.attackBonus;
  const icon = category === 'shell' ? '🛡' : '🗡️';
  const total = category === 'shell' ? shellDefense(definition, item) : clawAttack(definition, item);
  if (!base || total === base) return null;
  const qualityPart = Math.round(base * qualityFactor(item)) - base;
  const parts = [`${icon} ${base}`];
  if (qualityPart) parts.push(`${qualityPart > 0 ? '+' : '−'} ${Math.abs(qualityPart)} ${QUALITIES[item.quality].label.toLowerCase()}`);
  const modificationPart = total - base - qualityPart;
  if (modificationPart) parts.push(`+ ${modificationPart} ${modificationOf(category, item).label.toLowerCase()}`);
  return parts.join(' ');
}

export function itemAbilityText(definition, category, item) {
  const lines = [];
  if (definition.ability) lines.push(`${definition.ability.label} — ${definition.ability.description}`);
  if (definition.healOnHit) lines.push(`Mend — every hit heals ${definition.healOnHit} HP`);
  const modification = item && modificationOf(category, item);
  if (modification) lines.push(`${modification.label} — ${modification.description}`);
  return lines;
}

export function qualityBadge(item) {
  return item.quality === 'masterwork' ? '★' : item.quality === 'crude' ? '▾' : '';
}

export function masterworkGlowCss(item) {
  return item.quality === 'masterwork' ? 'rgba(255, 214, 140, 0.75)' : null;
}
