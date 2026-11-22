import { CLAWS, salvageReturn } from './gear.js';
import { RESOURCE_TYPES, stackLimitOf } from './resources.js';
import { element } from './workbench.js';
import { definitionOf, modificationOf, itemName, itemStatsText, itemStatsBreakdown, itemAbilityText, tierClass, tierBadge, tierLine, itemTier, qualityBadge, masterworkGlowCss } from './itemInfo.js';

const QUALITY_RANK = ['crude', 'fine', 'masterwork'];

const DOUBLE_TAP_MILLISECONDS = 360;
const TAP_SLOP_PIXELS = 10;

export function materialEntries(inventory) {
  const entries = [];
  for (const type of Object.keys(RESOURCE_TYPES)) {
    const limit = stackLimitOf(type);
    for (let remaining = inventory[type] || 0, stack = 0; remaining > 0; remaining -= limit, stack++) {
      entries.push({ key: stack ? `material:${type}:${stack}` : `material:${type}`, kind: 'material', type, count: Math.min(limit, remaining) });
    }
  }
  return entries;
}

export function gearEntries(shells, claws) {
  const entries = [
    ...shells.map((item) => ({ key: `item:${item.id}`, kind: 'gear', category: 'shell', item })),
    ...claws.filter((item) => CLAWS[item.kind].cost).map((item) => ({ key: `item:${item.id}`, kind: 'gear', category: 'claws', item })),
  ];
  return entries.sort((first, second) => itemTier(definitionOf(second.category, second.item.kind)) - itemTier(definitionOf(first.category, first.item.kind)) || QUALITY_RANK.indexOf(second.item.quality) - QUALITY_RANK.indexOf(first.item.quality));
}

export function entryTitle(entry) {
  if (entry.kind === 'material') return `${RESOURCE_TYPES[entry.type].icon} ${RESOURCE_TYPES[entry.type].label}`;
  return itemName(entry.category, entry.item);
}

export function renderSlot(parent, entry, thumbnails, { selected = false, zone = '' } = {}) {
  const definition = entry.kind === 'gear' ? definitionOf(entry.category, entry.item.kind) : null;
  const slot = element('div', `slot-cell ${definition ? tierClass(definition) : 'material-cell'}${selected ? ' selected' : ''}`, parent);
  slot.dataset.slotKey = entry.key;
  if (zone) slot.dataset.zone = zone;
  if (entry.kind === 'material') {
    slot.dataset.material = entry.type;
    element('div', 'slot-emoji', slot, RESOURCE_TYPES[entry.type].icon);
    element('div', 'slot-count', slot, `×${entry.count}`);
    slot.title = RESOURCE_TYPES[entry.type].label;
    return slot;
  }
  slot.dataset.slotItem = String(entry.item.id);
  const image = thumbnails.itemImage(entry.category, entry.item.kind);
  if (image) element('img', 'slot-image', slot).src = image;
  else element('div', 'slot-emoji', slot, entry.category === 'shell' ? '🐚' : '🦀');
  element('div', 'slot-tier', slot, tierBadge(definition));
  element('div', 'slot-category', slot, entry.category === 'claws' && !CLAWS[entry.item.kind].shield ? '🗡️' : '🛡️');
  if (modificationOf(entry.category, entry.item)) element('div', 'slot-modification', slot, '+');
  const badge = qualityBadge(entry.item);
  if (badge) element('div', `slot-quality quality-${entry.item.quality}`, slot, badge);
  const glow = masterworkGlowCss(entry.item);
  if (glow) slot.style.boxShadow = `0 0 10px 2px ${glow}`;
  if (entry.item.isNew) element('div', 'new-badge slot-new', slot, 'NEW');
  slot.title = itemName(entry.category, entry.item);
  return slot;
}

export function renderItemPopup(parent, entry, actions, compareWith, onDismiss) {
  if (!entry) return null;
  const backdrop = element('div', 'item-popup', parent);
  backdrop.addEventListener('pointerdown', (event) => {
    if (event.target === backdrop) {
      event.stopPropagation();
      onDismiss();
    }
  });
  const card = element('div', 'item-popup-card', backdrop);
  const closeButton = element('button', 'workbench-close item-popup-close', card, '✕');
  closeButton.setAttribute('aria-label', 'Close item');
  closeButton.addEventListener('click', onDismiss);
  return renderDetails(card, entry, actions, undefined, compareWith);
}

export function renderDetails(parent, entry, actions, hint = 'Tap an item to see it. Double-tap gear to wear it.', compareWith = null) {
  const details = element('div', 'item-details', parent);
  if (!entry) {
    element('div', 'details-hint', details, hint);
    return details;
  }
  const text = element('div', 'item-text', details);
  element('div', 'item-name', text, entryTitle(entry));
  if (entry.kind === 'material') {
    element('div', 'item-stats', text, `×${entry.count}`);
  } else {
    const definition = definitionOf(entry.category, entry.item.kind);
    element('div', `item-tier ${tierClass(definition)}`, text, tierLine(entry.category, definition));
    const stats = element('div', 'item-stats', text, itemStatsText(entry.category, entry.item));
    const delta = compareWith ? compareWith(entry) : null;
    if (delta) element('span', delta > 0 ? 'stat-delta better' : 'stat-delta worse', stats, ` ${delta > 0 ? '▲' : '▼'}${Math.abs(delta)} vs worn`);
    const breakdown = itemStatsBreakdown(entry.category, entry.item);
    if (breakdown) element('div', 'item-owned', text, breakdown);
    for (const line of itemAbilityText(definition, entry.category, entry.item)) element('div', 'item-ability', text, line);
  }
  const buttons = element('div', 'details-actions', details);
  for (const action of actions) {
    const button = element('button', `item-action${action.secondary ? ' take' : ''}`, buttons, action.label);
    for (const [name, value] of Object.entries(action.data || {})) button.dataset[name] = value;
    if (action.confirm) confirmOnSecondTap(button, action.label, action.confirm, action.run, `${action.confirm}:${JSON.stringify(action.data || {})}`);
    else button.addEventListener('click', action.run);
  }
  return details;
}

export function attachSlotGestures(container, { entryFor, onSelect, onActivate, deferSelect = false }) {
  let press = null;
  let lastTap = { key: null, time: 0 };
  let pendingSelect = 0;

  container.addEventListener('pointerdown', (event) => {
    const slot = event.target.closest('[data-slot-key]');
    if (!slot || !container.contains(slot)) return;
    press = { key: slot.dataset.slotKey, zone: slot.dataset.zone || '', x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  });

  container.addEventListener('pointermove', (event) => {
    if (press && event.pointerId === press.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_SLOP_PIXELS) press = null;
  });

  container.addEventListener('pointerup', (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const finished = press;
    press = null;
    const entry = entryFor(finished.key, finished.zone);
    if (!entry) return;
    if (lastTap.key === finished.key && event.timeStamp - lastTap.time < DOUBLE_TAP_MILLISECONDS) {
      clearTimeout(pendingSelect);
      lastTap = { key: null, time: 0 };
      onActivate(entry, finished.zone);
      return;
    }
    lastTap = { key: finished.key, time: event.timeStamp };
    clearTimeout(pendingSelect);
    if (!deferSelect) onSelect(entry, finished.zone);
    else pendingSelect = setTimeout(() => onSelect(entryFor(finished.key, finished.zone) || entry, finished.zone), DOUBLE_TAP_MILLISECONDS);
  });

  container.addEventListener('pointercancel', () => {
    press = null;
  });
}

const CONFIRM_SECONDS = 3;
const armedUntilByKey = new Map();

export function confirmOnSecondTap(button, label, confirmLabel, run, key = confirmLabel) {
  const showArmed = (armed) => {
    button.textContent = armed ? confirmLabel : label;
    button.classList.toggle('armed', armed);
  };
  const isArmed = () => performance.now() < (armedUntilByKey.get(key) || 0);
  if (isArmed()) {
    showArmed(true);
    setTimeout(() => showArmed(isArmed()), armedUntilByKey.get(key) - performance.now() + 50);
  }
  button.addEventListener('click', () => {
    if (isArmed()) {
      armedUntilByKey.delete(key);
      showArmed(false);
      run();
      return;
    }
    armedUntilByKey.set(key, performance.now() + CONFIRM_SECONDS * 1000);
    showArmed(true);
    setTimeout(() => showArmed(isArmed()), CONFIRM_SECONDS * 1000 + 50);
  });
}

export function renderStructureActions(parent, { label, onMove, onDismantle }) {
  const row = element('div', 'structure-actions', parent);
  const moveButton = element('button', 'item-action take', row, 'Move');
  moveButton.dataset.structureMove = label;
  moveButton.addEventListener('click', onMove);
  const dismantleButton = element('button', 'item-action take dismantle', row, 'Dismantle');
  dismantleButton.dataset.structureDismantle = label;
  confirmOnSecondTap(dismantleButton, 'Dismantle', `Tap again to dismantle the ${label}`, onDismantle);
  return row;
}

export function salvageAction(entry, run) {
  const refund = salvageReturn(entry.item.kind, definitionOf(entry.category, entry.item.kind));
  if (!refund) return null;
  const gain = Object.entries(refund).map(([type, amount]) => `${amount} ${RESOURCE_TYPES[type].icon}`).join(' ');
  return { label: `Salvage · +${gain}`, secondary: true, confirm: 'Tap again to salvage', data: { salvage: String(entry.item.id) }, run };
}
