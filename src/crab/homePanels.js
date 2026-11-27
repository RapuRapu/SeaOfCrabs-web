import { CLAWS, canAfford, salvageReturn } from './gear.js';
import { RESOURCE_TYPES } from './resources.js';
import { STATION_KINDS } from './stationModels.js';
import { element } from './workbench.js';
import { materialEntries, gearEntries, renderSlot, renderDetails, attachSlotGestures, salvageAction, renderStructureActions } from './inventoryView.js';
import { definitionOf } from './itemInfo.js';

function createPanelShell(root, className, title, onClose) {
  const overlay = element('div', `workbench ${className}`, root);
  const card = element('div', 'workbench-card', overlay);
  const header = element('div', 'workbench-header', card);
  const titleNode = element('div', 'workbench-title', header, title);
  const closeButton = element('button', 'workbench-close', header, '✕');
  closeButton.setAttribute('aria-label', 'Close');
  const body = element('div', 'workbench-body', card);
  closeButton.addEventListener('click', () => onClose());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) onClose();
  });
  return {
    overlay,
    body,
    setTitle: (text) => {
      titleNode.textContent = text;
    },
    get isOpen() {
      return overlay.classList.contains('visible');
    },
    show() {
      overlay.classList.add('visible');
      root.classList.add('panel-open');
    },
    hide() {
      overlay.classList.remove('visible');
      root.classList.remove('panel-open');
    },
  };
}

function costText(cost, inventory) {
  return Object.entries(cost).map(([type, amount]) => {
    const have = inventory[type] || 0;
    return have >= amount ? `${RESOURCE_TYPES[type].icon} ${amount} ✓` : `${RESOURCE_TYPES[type].icon} ${amount} (have ${have})`;
  });
}

export function createBuildPanel(root, { inventory, hasStation, buildProblem = () => null, onChoose, onClose }) {
  const shell = createPanelShell(root, 'build-panel', 'Build', onClose);

  function render() {
    shell.body.replaceChildren();
    element('div', 'summary', shell.body, 'Pick a station, then tap a spot inside your yard.');
    for (const [kind, definition] of Object.entries(STATION_KINDS)) {
      const built = !definition.multiple && hasStation(kind);
      const row = element('div', 'item', shell.body);
      const text = element('div', 'item-text', row);
      element('div', 'item-name', text, definition.label);
      element('div', 'item-ability', text, definition.description);
      const cost = element('div', 'cost', text);
      for (const [index, part] of costText(definition.cost, inventory()).entries()) element('span', part.includes('have') ? 'cost-item short' : 'cost-item', cost, part).dataset.index = String(index);
      const problem = built ? null : buildProblem(kind);
      if (problem) element('div', 'panel-hint', text, problem);
      const button = element('button', 'item-action', row, built ? 'Built' : 'Place');
      button.dataset.station = kind;
      button.disabled = built || Boolean(problem) || !canAfford(definition.cost, inventory());
      button.addEventListener('click', () => onChoose(kind));
    }
  }

  return {
    get isOpen() {
      return shell.isOpen;
    },
    open() {
      render();
      shell.show();
    },
    close: () => shell.hide(),
    render,
  };
}

export function createStoragePanel(root, { gear, inventory, storage: defaultStorage, thumbnails, onChange, onSalvage, onMove, onDismantle, onClose }) {
  const shell = createPanelShell(root, 'storage-panel', 'Storage', onClose);
  let selected = null;
  let storage = defaultStorage;
  let currentStation = null;
  let boxLabel = 'Storage';

  function moveMaterial(type, toStorage) {
    const from = toStorage ? inventory() : storage.inventory;
    const to = toStorage ? storage.inventory : inventory();
    const amount = from[type] || 0;
    if (!amount) return;
    to[type] = (to[type] || 0) + amount;
    from[type] = 0;
    onChange();
  }

  function storeAll() {
    for (const type of Object.keys(RESOURCE_TYPES)) {
      const amount = inventory()[type] || 0;
      if (amount) {
        storage.inventory[type] = (storage.inventory[type] || 0) + amount;
        inventory()[type] = 0;
      }
    }
    for (const item of gear.state.shells.filter((shellItem) => shellItem.id !== gear.state.wornShellId)) storeItem(item.id, false);
    for (const item of gear.state.claws.filter((clawItem) => !gear.isWorn(clawItem.id) && CLAWS[clawItem.kind].cost)) storeItem(item.id, false);
    onChange();
  }

  function storeItem(id, notify = true) {
    const found = gear.findItem(id);
    if (!found || gear.isWorn(id)) return;
    if (found.category === 'shell') {
      gear.state.shells = gear.state.shells.filter((item) => item.id !== id);
      storage.shells.push(found.item);
    } else {
      gear.state.claws = gear.state.claws.filter((item) => item.id !== id);
      storage.claws.push(found.item);
    }
    if (notify) onChange();
  }

  function takeItem(id) {
    const shellIndex = storage.shells.findIndex((item) => item.id === id);
    if (shellIndex >= 0) gear.state.shells.push(...storage.shells.splice(shellIndex, 1));
    const clawIndex = storage.claws.findIndex((item) => item.id === id);
    if (clawIndex >= 0) gear.state.claws.push(...storage.claws.splice(clawIndex, 1));
    onChange();
  }

  function salvageStored(entry) {
    const list = entry.category === 'shell' ? storage.shells : storage.claws;
    const refund = salvageReturn(entry.item.kind, definitionOf(entry.category, entry.item.kind));
    const index = list.indexOf(entry.item);
    if (!refund || index < 0) return;
    list.splice(index, 1);
    for (const [type, amount] of Object.entries(refund)) storage.inventory[type] = (storage.inventory[type] || 0) + amount;
    return refund;
  }

  function salvage(entry, zone) {
    const refund = zone === 'storage' ? salvageStored(entry) : gear.salvage(entry.item.id, inventory());
    if (!refund) return;
    selected = null;
    onSalvage(refund, definitionOf(entry.category, entry.item.kind).label);
    onChange();
  }

  const backpackEntries = () => [...gearEntries(gear.state.shells.filter((item) => !gear.isWorn(item.id)), gear.state.claws.filter((item) => !gear.isWorn(item.id))), ...materialEntries(inventory())];
  const storageEntries = () => [...gearEntries(storage.shells, storage.claws), ...materialEntries(storage.inventory)];

  function entryFor(key, zone) {
    return (zone === 'storage' ? storageEntries() : backpackEntries()).find((entry) => entry.key === key) || null;
  }

  function move(entry, fromZone) {
    const toStorage = fromZone === 'backpack';
    selected = { key: entry.key, zone: toStorage ? 'storage' : 'backpack' };
    if (entry.kind === 'material') moveMaterial(entry.type, toStorage);
    else if (toStorage) storeItem(entry.item.id);
    else takeItem(entry.item.id);
  }

  function renderSide(parent, title, zone, entries) {
    const side = element('div', 'storage-side', parent);
    element('div', 'section-title', side, `${title} · ${entries.length}`);
    const grid = element('div', 'slot-grid', side);
    for (const entry of entries) renderSlot(grid, entry, thumbnails, { selected: Boolean(selected) && selected.key === entry.key && selected.zone === zone, zone });
    if (!entries.length) element('div', 'details-hint', grid, zone === 'storage' ? 'Empty.' : 'Nothing to store. Worn gear stays on you.');
  }

  function render() {
    shell.body.replaceChildren();
    element('div', 'summary', shell.body, storage === defaultStorage ? 'Stored things stay safe here when you are defeated.' : 'Your helpers bring their finds to this nest box. Things here stay safe when you are defeated.');
    const storeAllButton = element('button', 'item-action store-all', shell.body, 'Store all · worn gear stays on you');
    storeAllButton.addEventListener('click', storeAll);
    const sides = element('div', 'storage-sides', shell.body);
    renderSide(sides, 'Backpack', 'backpack', backpackEntries());
    renderSide(sides, boxLabel, 'storage', storageEntries());
    const entry = selected ? entryFor(selected.key, selected.zone) : null;
    if (!entry) selected = null;
    const actions = [];
    if (entry) {
      const toStorage = selected.zone === 'backpack';
      const data = entry.kind === 'material' ? { [toStorage ? 'store' : 'take']: entry.type } : { [toStorage ? 'storeItem' : 'takeItem']: String(entry.item.id) };
      actions.push({ label: toStorage ? 'Store' : 'Take', secondary: !toStorage, data, run: () => move(entry, selected.zone) });
      const zone = selected.zone;
      const salvageButton = entry.kind === 'gear' ? salvageAction(entry, () => salvage(entry, zone)) : null;
      if (salvageButton) actions.push(salvageButton);
    }
    renderDetails(shell.body, entry, actions, 'Tap an item to see it. Double-tap to move it to the other side.');
    renderStructureActions(shell.body, { label: boxLabel.toLowerCase(), onMove: () => onMove(currentStation), onDismantle: () => onDismantle(currentStation) });
  }

  attachSlotGestures(shell.overlay, {
    entryFor,
    onSelect: (entry, zone) => {
      selected = { key: entry.key, zone };
      render();
    },
    onActivate: (entry, zone) => move(entry, zone),
  });

  return {
    get isOpen() {
      return shell.isOpen;
    },
    open(box = defaultStorage, { station = null, title = 'Storage' } = {}) {
      storage = box;
      currentStation = station;
      boxLabel = title;
      shell.setTitle(title);
      selected = null;
      render();
      shell.show();
    },
    get box() {
      return storage;
    },
    close: () => shell.hide(),
    select(key, zone) {
      selected = { key, zone };
      render();
    },
    render,
    storeAll,
  };
}

function helperStatus(helper) {
  const carried = helper.carrying ? (RESOURCE_TYPES[helper.carrying] || {}).label || helper.carrying : null;
  if (helper.state === 'resting') return helper.job ? 'Resting in the nest' : 'Resting in the nest · no job';
  if (helper.state === 'toRack') return helper.carrying ? 'Taking sea lettuce to the drying rack' : 'Fetching dried kelp from the drying rack';
  if (helper.state === 'outbound') return `Heading out for ${(RESOURCE_TYPES[helper.job] || {}).label || helper.job}`;
  if (helper.state === 'gathering') return `Gathering ${(RESOURCE_TYPES[helper.job] || {}).label || helper.job}`;
  if (helper.state === 'returning') return carried ? `Carrying ${carried} home` : 'Coming home';
  if (helper.state === 'fleeing') return 'Fleeing home!';
  if (helper.state === 'fighting') return 'Fighting!';
  if (helper.state === 'following') return helper.fightTargetId ? 'Fighting by your side!' : 'Following you';
  if (helper.state === 'toSource') return 'Walking to the box to pick up';
  if (helper.state === 'toTarget') return carried ? `Carrying ${carried}` : 'Carrying';
  if (helper.state === 'toNest') return 'Walking back to the nest';
  return helper.state;
}

function addSelect(parent, label, options, value, onChange) {
  const wrapper = element('label', 'job-select', parent);
  element('span', 'job-label', wrapper, label);
  const select = element('select', '', wrapper);
  for (const option of options) {
    const node = element('option', '', select, option.label);
    node.value = String(option.value);
  }
  select.value = String(value ?? '');
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

const ITEM_USE_LABELS = { both: 'Itself and you', self: 'Itself', you: 'You', nobody: 'Nobody' };

export function createHelpersPanel(root, { helpers, limit, jobOptions, boxOptions, gearOptions, helperInfo, foodSummary = () => null, satchelInfo = () => null, onSatchel = () => {}, onJob, onEquip, giveOptions = () => [], onGiveItem = () => {}, onTakeItem = () => {}, onItemUse = () => {}, onClose }) {
  const shell = createPanelShell(root, 'helpers-panel', 'Helpers', onClose);
  const statusLines = new Map();

  function changeJob(helper, job, carryOrder) {
    onJob(helper.id, job || null, carryOrder);
    render();
  }

  function renderCarry(parent, helper) {
    const boxes = boxOptions();
    const order = helper.carryOrder || { fromId: boxes[0] && boxes[0].id, toId: boxes[1] && boxes[1].id, material: null };
    const materials = [{ value: '', label: 'Anything' }, ...Object.entries(RESOURCE_TYPES).map(([type, definition]) => ({ value: type, label: definition.label }))];
    const update = (patch) => changeJob(helper, 'carry', { ...order, ...patch });
    addSelect(parent, 'From', boxes.map((box) => ({ value: box.id, label: box.label })), order.fromId, (value) => update({ fromId: Number(value) }));
    addSelect(parent, 'To', boxes.map((box) => ({ value: box.id, label: box.label })), order.toId, (value) => update({ toId: Number(value) }));
    addSelect(parent, 'What', materials, order.material || '', (value) => update({ material: value || null }));
    if (!helper.carryOrder) onJob(helper.id, 'carry', order);
    if (boxes.length < 2) element('div', 'item-ability danger', parent, 'Needs two boxes: a storage or helper nests.');
  }

  function renderBag(parent, helper) {
    const bagRow = element('div', 'job-row helper-bag', parent);
    element('span', 'job-label', bagRow, 'Bag');
    for (const [slotIndex, slot] of (helper.bag || []).entries()) {
      const cell = element('span', 'bag-slot', bagRow);
      if (!slot) {
        cell.textContent = 'Empty';
        cell.classList.add('empty');
        continue;
      }
      element('span', '', cell, `${RESOURCE_TYPES[slot.type].icon} ${RESOURCE_TYPES[slot.type].label} ×${slot.count}`);
      const take = element('button', 'bag-take', cell, 'Take');
      take.dataset.take = `${helper.id}:${slotIndex}`;
      take.addEventListener('click', () => {
        onTakeItem(helper.id, slotIndex);
        render();
      });
    }
    const giveRow = element('div', 'job-row helper-give', parent);
    const options = giveOptions();
    if (!options.length) element('span', 'item-stats', giveRow, 'Make kelp poultices or dry kelp to give your helpers.');
    for (const option of options) {
      for (const amount of [1, 5]) {
        const button = element('button', 'bag-give', giveRow, `Give ${option.icon} +${amount}`);
        button.dataset.give = `${helper.id}:${option.type}:${amount}`;
        button.title = `${option.label} (you have ${option.count})`;
        button.addEventListener('click', () => {
          onGiveItem(helper.id, option.type, amount);
          render();
        });
      }
    }
    const useSelect = addSelect(giveRow, 'Use items on', Object.entries(ITEM_USE_LABELS).map(([value, label]) => ({ value, label })), helper.itemUse || 'both', (value) => onItemUse(helper.id, value));
    useSelect.dataset.itemUse = String(helper.id);
  }

  function render() {
    shell.body.replaceChildren();
    statusLines.clear();
    element('div', 'summary', shell.body, `${helpers.list.length}/${limit} helpers. Stranded helper crabs wait out in the world — find them, then give them a job here.`);
    const food = foodSummary();
    if (food) element('div', 'summary food-summary', shell.body, food);
    if (!helpers.list.length) element('div', 'placeholder', shell.body, 'No helpers yet. Build a helper nest, then look for stranded crabs on the beach.');
    for (const [index, helper] of helpers.list.entries()) {
      const row = element('div', 'item helper-row', shell.body);
      row.dataset.helper = String(helper.id);
      const text = element('div', 'item-text', row);
      const info = helperInfo(helper);
      element('div', 'item-name', text, `Helper ${index + 1} · Lv ${info.level} · ${Math.max(0, Math.ceil(helper.health))}/${info.maxHealth} HP`);
      element('div', 'item-stats', text, `Attack ${info.attack} · Defense ${info.defense} · XP ${info.experience}/${info.toNext}`);
      if (info.food) element('div', info.hungry ? 'item-ability danger helper-food' : 'item-stats helper-food', text, info.food);
      const satchel = satchelInfo(helper);
      if (typeof satchel === 'string') element('div', 'item-stats', text, satchel);
      else if (satchel) {
        const satchelRow = element('div', 'job-row', text);
        const satchelButton = element('button', 'item-action', satchelRow, `Make satchel · ${satchel.cost} cord (have ${satchel.have})`);
        satchelButton.dataset.satchel = String(helper.id);
        satchelButton.disabled = satchel.have < satchel.cost;
        satchelButton.addEventListener('click', () => onSatchel(helper.id));
      }
      statusLines.set(helper, element('div', helper.state === 'fleeing' ? 'item-ability danger' : 'item-stats', text, helperStatus(helper)));
      const jobRow = element('div', 'job-row', text);
      const select = addSelect(jobRow, 'Job', jobOptions(helper), helper.job || '', (value) => changeJob(helper, value, null));
      select.dataset.job = String(helper.id);
      if (helper.job === 'carry') renderCarry(jobRow, helper);
      const gearRow = element('div', 'job-row', text);
      for (const [category, label] of [['shell', 'Shell'], ['claws', 'Claws']]) {
        const options = [{ value: '', label: 'None' }, ...gearOptions(helper, category)];
        const current = helper.gear && helper.gear[category];
        const select = addSelect(gearRow, label, options, current ? current.id : '', (value) => {
          onEquip(helper.id, category, value ? Number(value) : null);
          render();
        });
        select.dataset.gear = `${helper.id}:${category}`;
      }
      renderBag(text, helper);
    }
  }

  function refresh() {
    for (const [helper, line] of statusLines) {
      const status = helperStatus(helper);
      if (line.textContent !== status) line.textContent = status;
      line.className = helper.state === 'fleeing' ? 'item-ability danger' : 'item-stats';
    }
  }

  return {
    get isOpen() {
      return shell.isOpen;
    },
    open() {
      render();
      shell.show();
    },
    close: () => shell.hide(),
    render,
    refresh,
  };
}

export function createRackPanel(root, { rack, inventory, batch, drySeconds, onLoad, onCollect, onMove, onDismantle, onClose }) {
  const shell = createPanelShell(root, 'rack-panel', 'Drying rack', onClose);

  function render() {
    shell.body.replaceChildren();
    const state = rack.state;
    if (!state) return;
    element('div', 'summary', shell.body, `${batch} sea lettuce dry into 1 dried kelp in ${drySeconds} s. Eat it from the backpack (Well fed: 2× HP regen for 90 s) or craft Kelp-wrapped claws.`);
    const slots = element('div', 'rack-slots', shell.body);
    state.slots.forEach((progress, index) => {
      const slot = element('div', progress === null ? 'rack-slot empty' : 'rack-slot', slots);
      slot.dataset.slot = String(index);
      if (progress === null) {
        element('div', 'rack-slot-label', slot, 'Empty');
        return;
      }
      element('div', 'rack-slot-label', slot, `Drying · ${Math.ceil((1 - progress) * drySeconds)} s left`);
      const bar = element('div', 'rack-bar', slot);
      element('div', 'rack-fill', bar).style.width = `${Math.round(progress * 100)}%`;
    });
    const lettuce = inventory().seaLettuce || 0;
    const kelp = inventory().kelp || 0;
    const have = Math.max(lettuce, kelp);
    const loadRow = element('div', 'item', shell.body);
    const loadText = element('div', 'item-text', loadRow);
    element('div', 'item-name', loadText, `Hang ${batch} sea lettuce or kelp to dry`);
    element('div', have >= batch ? 'item-stats' : 'item-stats short-text', loadText, `You have ${lettuce} sea lettuce, ${kelp} kelp`);
    if (have < batch) element('div', 'panel-hint', loadText, 'Sea lettuce grows at the waterline and in tide pools; kelp in shallow water.');
    const loadButton = element('button', 'item-action', loadRow, 'Hang');
    loadButton.dataset.rackLoad = '1';
    loadButton.disabled = have < batch || rack.freeSlots() === 0;
    loadButton.addEventListener('click', () => onLoad());
    const collectRow = element('div', state.ready ? 'item ready-row' : 'item', shell.body);
    const collectText = element('div', 'item-text', collectRow);
    element('div', 'item-name', collectText, `Ready: ${state.ready}`);
    const collectButton = element('button', 'item-action take', collectRow, 'Collect');
    collectButton.dataset.rackCollect = '1';
    collectButton.disabled = state.ready === 0;
    collectButton.addEventListener('click', () => onCollect());
    renderStructureActions(shell.body, { label: 'drying rack', onMove, onDismantle });
  }

  let pressed = false;
  shell.overlay.addEventListener('pointerdown', () => { pressed = true; });
  for (const name of ['pointerup', 'pointercancel']) window.addEventListener(name, () => { pressed = false; });

  return {
    get isPressed() {
      return pressed;
    },
    get isOpen() {
      return shell.isOpen;
    },
    open() {
      render();
      shell.show();
    },
    close: () => shell.hide(),
    render,
  };
}

export function createProcessPanel(root, { view, inventory, labelOf, onLoad, onCollect, onMove, onDismantle, onClose }) {
  const shell = createPanelShell(root, 'process-panel', 'Station', onClose);
  let currentStation = null;

  function render() {
    shell.body.replaceChildren();
    if (!currentStation) return;
    const { recipe, working, ready, free } = view(currentStation);
    shell.setTitle(labelOf(currentStation));
    element('div', 'summary', shell.body, `${recipe.inputAmount} ${RESOURCE_TYPES[recipe.input].label.toLowerCase()} → 1 ${RESOURCE_TYPES[recipe.output].label.toLowerCase()} in ${recipe.seconds} s. ${recipe.slots} at a time.`);
    const slots = element('div', 'rack-slots', shell.body);
    for (let index = 0; index < recipe.slots; index++) {
      const secondsLeft = working[index];
      const slot = element('div', secondsLeft === undefined ? 'rack-slot empty' : 'rack-slot', slots);
      element('div', 'rack-slot-label', slot, secondsLeft === undefined ? 'Empty' : `Working · ${secondsLeft} s left`);
      if (secondsLeft !== undefined) element('div', 'rack-fill', element('div', 'rack-bar', slot)).style.width = `${Math.round((1 - secondsLeft / recipe.seconds) * 100)}%`;
    }
    const have = inventory()[recipe.input] || 0;
    const loadRow = element('div', 'item', shell.body);
    const loadText = element('div', 'item-text', loadRow);
    element('div', 'item-name', loadText, `Load ${recipe.inputAmount} ${RESOURCE_TYPES[recipe.input].label.toLowerCase()}`);
    element('div', have >= recipe.inputAmount ? 'item-stats' : 'item-stats short-text', loadText, `You have ${have}`);
    const loadButton = element('button', 'item-action', loadRow, 'Load');
    loadButton.dataset.processLoad = '1';
    loadButton.disabled = have < recipe.inputAmount || free === 0;
    loadButton.addEventListener('click', () => onLoad(currentStation));
    const collectRow = element('div', ready ? 'item ready-row' : 'item', shell.body);
    element('div', 'item-name', element('div', 'item-text', collectRow), `Ready: ${ready} ${RESOURCE_TYPES[recipe.output].label.toLowerCase()}`);
    const collectButton = element('button', 'item-action take', collectRow, 'Collect');
    collectButton.dataset.processCollect = '1';
    collectButton.disabled = ready === 0;
    collectButton.addEventListener('click', () => onCollect(currentStation));
    renderStructureActions(shell.body, { label: labelOf(currentStation).toLowerCase(), onMove: () => onMove(currentStation), onDismantle: () => onDismantle(currentStation) });
  }

  return {
    get isOpen() {
      return shell.isOpen;
    },
    get station() {
      return currentStation;
    },
    open(station) {
      currentStation = station;
      render();
      shell.show();
    },
    close: () => shell.hide(),
    render,
  };
}

export function createBoardPanel(root, { orders, materialOptions, boxOptions, amounts, onAdd, onMove, onRemove, onMoveStructure, onDismantleStructure, onClose }) {
  const shell = createPanelShell(root, 'board-panel', 'Job board', onClose);
  let draft = { material: null, toId: null, amount: 10 };

  function render() {
    shell.body.replaceChildren();
    element('div', 'summary', shell.body, 'Helpers on the Board job take the first unmet order they can do: gather it, run a station that makes it, or carry it from another box. Up to 2 helpers per order.');
    const list = orders();
    if (!list.length) element('div', 'placeholder', shell.body, 'No orders yet.');
    list.forEach((order, index) => {
      const row = element('div', 'item board-order', shell.body);
      row.dataset.order = String(order.id);
      const text = element('div', 'item-text', row);
      element('div', 'item-name', text, `${index + 1}. ${order.text}`);
      element('div', order.status === 'No way to get it yet' || order.status === 'Box gone' ? 'item-ability danger' : 'item-stats', text, order.status);
      for (const [label, offset] of [['↑', -1], ['↓', 1]]) {
        const button = element('button', 'item-action secondary', row, label);
        button.disabled = (offset < 0 && index === 0) || (offset > 0 && index === list.length - 1);
        button.addEventListener('click', () => onMove(order.id, offset));
      }
      const remove = element('button', 'item-action secondary', row, '✕');
      remove.dataset.removeOrder = String(order.id);
      remove.addEventListener('click', () => onRemove(order.id));
    });
    const materials = materialOptions();
    const boxes = boxOptions();
    if (!draft.material || !materials.some((option) => option.value === draft.material)) draft.material = materials[0] ? materials[0].value : null;
    if (!boxes.some((option) => option.value === draft.toId)) draft.toId = boxes[0] ? boxes[0].value : null;
    const addRow = element('div', 'item board-add', shell.body);
    const addText = element('div', 'item-text', addRow);
    element('div', 'item-name', addText, 'New order: keep at least');
    const pick = (label, options, value, change) => addSelect(addText, label, options, value, change);
    pick('Amount', amounts().map((amount) => ({ value: amount, label: String(amount) })), draft.amount, (value) => { draft.amount = Number(value); });
    pick('Material', materials, draft.material, (value) => { draft.material = value; }).dataset.boardMaterial = '1';
    pick('Box', boxes, draft.toId, (value) => { draft.toId = Number(value); }).dataset.boardBox = '1';
    const add = element('button', 'item-action', addRow, 'Add');
    add.dataset.addOrder = '1';
    add.disabled = !draft.material || draft.toId === null;
    add.addEventListener('click', () => onAdd(draft.material, draft.toId, draft.amount));
    renderStructureActions(shell.body, { label: 'colony heart', onMove: onMoveStructure, onDismantle: onDismantleStructure });
  }

  return {
    get isOpen() {
      return shell.isOpen;
    },
    open() {
      render();
      shell.show();
    },
    close: () => shell.hide(),
    render,
  };
}

export function createBedPanel(root, { onSleep, onMove, onDismantle, onClose }) {
  const shell = createPanelShell(root, 'bed-panel', 'Crab bed', onClose);
  let currentStation = null;

  function render() {
    shell.body.replaceChildren();
    element('div', 'summary', shell.body, 'Sleep to heal fast. Wake up rested: faster healing and +10% speed for 15 min.');
    const row = element('div', 'item', shell.body);
    element('div', 'item-name', element('div', 'item-text', row), 'Sleep');
    const sleep = element('button', 'item-action', row, 'Sleep');
    sleep.dataset.sleep = '1';
    sleep.addEventListener('click', () => onSleep(currentStation));
    renderStructureActions(shell.body, { label: 'crab bed', onMove: () => onMove(currentStation), onDismantle: () => onDismantle(currentStation) });
  }

  return {
    get isOpen() {
      return shell.isOpen;
    },
    open(station) {
      currentStation = station;
      render();
      shell.show();
    },
    close: () => shell.hide(),
  };
}
