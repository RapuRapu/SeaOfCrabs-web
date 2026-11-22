import { CLAWS, HANDS, HAND_LABELS, carryCapacity } from './gear.js';
import { CONSUMABLES, QUICK_SLOT_COUNT } from './consumables.js';
import { element } from './workbench.js';
import { materialEntries, gearEntries, renderSlot, renderItemPopup, attachSlotGestures, salvageAction } from './inventoryView.js';
import { itemName, itemStatsText, definitionOf, shellDefense, clawAttack } from './itemInfo.js';

export function createBackpackPanel(root, { gear, inventory, thumbnails, onWear, onUnequip, onUse, onAssignQuickSlot, quickSlots, onSalvage, onClose, moltCount = () => 0 }) {
  const overlay = element('div', 'workbench backpack', root);
  const card = element('div', 'workbench-card', overlay);
  const header = element('div', 'workbench-header', card);
  element('div', 'workbench-title', header, 'Backpack');
  const closeButton = element('button', 'workbench-close', header, '✕');
  closeButton.setAttribute('aria-label', 'Close');
  const body = element('div', 'workbench-body inventory-body', card);
  const popupHost = element('div', 'item-popup-host', card);
  let selectedKey = null;

  const wornEntry = (slot) => {
    const item = slot === 'shell' ? gear.wornShell() : gear.heldIn(slot);
    if (!item) return null;
    return { key: `item:${item.id}`, kind: 'gear', category: slot === 'shell' ? 'shell' : 'claws', hand: slot === 'shell' ? null : slot, item, worn: true };
  };
  const capacityOf = (hand) => carryCapacity(hand, moltCount());
  const fitsIn = (item, hand) => (CLAWS[item.kind].weight || 0) <= capacityOf(hand);

  function allEntries() {
    return [...gearEntries(gear.state.shells.filter((item) => !gear.isWorn(item.id)), gear.state.claws.filter((item) => !gear.isWorn(item.id))), ...materialEntries(inventory())];
  }

  function entryFor(key) {
    return [wornEntry('shell'), wornEntry('big'), wornEntry('small'), ...allEntries()].find((entry) => entry && entry.key === key) || null;
  }

  function wearEntry(entry, hand = null) {
    if (entry.kind !== 'gear') return;
    selectedKey = null;
    if (entry.category === 'shell') return onWear(entry.item.id);
    onWear(entry.item.id, hand || (fitsIn(entry.item, 'big') || !fitsIn(entry.item, 'small') ? 'big' : 'small'));
  }

  function unequipEntry(entry) {
    selectedKey = null;
    onUnequip(entry.hand === 'small' ? 'small' : entry.category);
  }

  function compareWithWorn(entry) {
    if (entry.kind !== 'gear' || entry.worn) return null;
    const definition = definitionOf(entry.category, entry.item.kind);
    if (entry.category === 'shell') {
      const worn = gear.wornShell();
      const wornDefense = worn ? shellDefense(definitionOf('shell', worn.kind), worn) : 0;
      return shellDefense(definition, entry.item) - wornDefense || null;
    }
    if (definition.shield) return null;
    const worn = gear.wornClaws();
    return clawAttack(definition, entry.item) - clawAttack(definitionOf('claws', worn.kind), worn) || null;
  }

  function actionsFor(entry) {
    if (!entry) return [];
    if (entry.kind === 'material') {
      const consumable = CONSUMABLES[entry.type];
      if (!consumable) return [];
      const quickSlotActions = Array.from({ length: QUICK_SLOT_COUNT }, (_, index) => ({
        label: quickSlots()[index] === entry.type ? `In quick slot ${index + 1}` : `Quick slot ${index + 1}`,
        secondary: true,
        data: { quickSlot: String(index) },
        run: () => onAssignQuickSlot(index, entry.type),
      }));
      return [{ label: consumable.useLabel, data: { eat: entry.type }, run: () => onUse(entry.type) }, ...quickSlotActions];
    }
    if (entry.worn) return entry.category === 'shell' || CLAWS[entry.item.kind].cost ? [{ label: 'Take off', secondary: true, data: { unequip: entry.category }, run: () => unequipEntry(entry) }] : [];
    const salvage = salvageAction(entry, () => {
      selectedKey = null;
      onSalvage(entry.item.id);
    });
    if (entry.category === 'shell') return [{ label: 'Wear', data: { wear: String(entry.item.id) }, run: () => wearEntry(entry) }, ...(salvage ? [salvage] : [])];
    const handActions = HANDS.map((hand) => {
      const weight = CLAWS[entry.item.kind].weight || 0;
      const fits = fitsIn(entry.item, hand);
      return { label: fits ? HAND_LABELS[hand] : `${HAND_LABELS[hand]} — too heavy ${weight}/${capacityOf(hand)}`, secondary: !fits, data: { wear: String(entry.item.id), hand }, run: () => wearEntry(entry, hand) };
    });
    return [...handActions, ...(salvage ? [salvage] : [])];
  }

  function renderEquipSlot(parent, slot) {
    const entry = wornEntry(slot);
    const category = slot === 'shell' ? 'shell' : 'claws';
    const holder = element('div', 'equip-slot', parent);
    holder.dataset.slot = slot;
    const weight = entry && slot !== 'shell' ? CLAWS[entry.item.kind].weight || 0 : 0;
    element('div', 'equip-label', holder, slot === 'shell' ? 'Shell' : `${HAND_LABELS[slot]} ${weight}/${capacityOf(slot)}`);
    if (entry) {
      renderSlot(holder, entry, thumbnails, { selected: entry.key === selectedKey, zone: 'worn' });
      element('div', 'equip-name', holder, itemName(category, entry.item));
      element('div', 'equip-stats', holder, itemStatsText(category, entry.item));
    } else {
      element('div', 'slot-cell empty-cell', holder, slot === 'shell' ? '—' : '🦀');
      element('div', 'equip-name', holder, slot === 'shell' ? 'No shell' : 'Empty');
      element('div', 'equip-stats', holder, slot === 'shell' ? '🛡 0 · exposed!' : '🗡️ +0');
    }
  }

  function render() {
    body.replaceChildren();
    const layout = element('div', 'inventory-layout', body);
    const dollColumn = element('div', 'doll-column', layout);
    const dollFrame = element('div', 'doll-frame', dollColumn);
    const wornShell = gear.wornShell();
    const wornClaws = gear.wornClaws();
    const dollImage = thumbnails.dollImage(wornShell, wornClaws, gear.wornSmall());
    if (dollImage) element('img', 'doll-image', dollFrame).src = dollImage;
    else element('div', 'doll-fallback', dollFrame, '🦀');
    const equipRow = element('div', 'equip-row', dollColumn);
    renderEquipSlot(equipRow, 'shell');
    renderEquipSlot(equipRow, 'big');
    renderEquipSlot(equipRow, 'small');
    const gridColumn = element('div', 'grid-column', layout);
    const entries = allEntries();
    element('div', 'section-title grid-title', gridColumn, `${entries.length} items · tap to inspect · double-tap to wear`);
    const grid = element('div', 'slot-grid', gridColumn);
    for (const entry of entries) renderSlot(grid, entry, thumbnails, { selected: entry.key === selectedKey, zone: 'grid' });
    if (!entries.length) element('div', 'details-hint', grid, 'Empty — gather on the beach!');
    const selected = selectedKey ? entryFor(selectedKey) : null;
    if (!selected) selectedKey = null;
    popupHost.replaceChildren();
    renderItemPopup(popupHost, selected, actionsFor(selected), compareWithWorn, () => {
      selectedKey = null;
      render();
    });
  }

  attachSlotGestures(card, {
    deferSelect: true,
    entryFor,
    onSelect: (entry) => {
      selectedKey = entry.key;
      if (entry.kind === 'gear') delete entry.item.isNew;
      render();
    },
    onActivate: (entry, zone) => {
      if (entry.kind !== 'gear') {
        selectedKey = entry.key;
        render();
        return;
      }
      if (zone === 'worn') unequipEntry(entry);
      else wearEntry(entry);
    },
  });

  closeButton.addEventListener('click', () => onClose());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) onClose();
  });

  return {
    get isOpen() {
      return overlay.classList.contains('visible');
    },
    open() {
      selectedKey = null;
      render();
      overlay.classList.add('visible');
      root.classList.add('panel-open');
    },
    close() {
      if (overlay.classList.contains('visible')) gear.markAllSeen();
      overlay.classList.remove('visible');
      root.classList.remove('panel-open');
    },
    select(key) {
      selectedKey = key;
      render();
    },
    render,
  };
}

