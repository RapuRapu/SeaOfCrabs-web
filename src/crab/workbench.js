import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySeaside } from './seaside.js';
import { createNoise2D } from '../noise.js';
import { SHELLS, CLAWS, canAfford, QUALITIES, TOOL_TIERS, BINDINGS, REINFORCEMENTS, qualityForTools, refineCost } from './gear.js';
import { RESOURCE_TYPES } from './resources.js';
import { CONSUMABLES } from './consumables.js';
import { tierClass, tierBadge, itemName, itemStatsText, modificationOf } from './itemInfo.js';
import { renderStructureActions } from './inventoryView.js';

export const WORKSHOP_REACH = 2.9;
export const WORKSHOP_BLOCK_RADIUS = 1.7;

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const STONE_COLOR = linearColor(0.82, 0.66, 0.48);
const SHELL_TOOL_COLOR = linearColor(0.95, 0.88, 0.76);
const SHELL_TOOL_EDGE = linearColor(0.82, 0.5, 0.36);
const HANDLE_COLOR = linearColor(0.62, 0.5, 0.36);

function painted(geometry, color, shadeByHeight = 0) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index++) {
    const heightShare = (positions.getY(index) - min.y) / Math.max(1e-5, max.y - min.y);
    const shade = 1 - shadeByHeight * (1 - heightShare);
    colors.set([color.r * shade, color.g * shade, color.b * shade], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  if (geometry.index) return geometry.toNonIndexed();
  return geometry;
}

function buildStoneGeometry() {
  const noise = createNoise2D(61);
  const geometry = new THREE.IcosahedronGeometry(1, 4);
  const positions = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    const bump = 1 + 0.08 * noise(point.x * 1.7 + 3, point.z * 1.7) + 0.04 * noise(point.x * 4.1, point.y * 4.1 + point.z * 2);
    const flatTop = point.y > 0.25 ? 0.25 + (point.y - 0.25) * 0.25 : point.y;
    positions.setXYZ(index, point.x * 1.75 * bump, flatTop * 0.62 * bump + 0.05, point.z * 1.4 * bump);
  }
  geometry.computeVertexNormals();
  return painted(geometry, STONE_COLOR, 0.35);
}

function buildToolsGeometry() {
  const hammerHead = painted(new THREE.CylinderGeometry(0.17, 0.24, 0.85, 10).rotateZ(Math.PI / 2), SHELL_TOOL_COLOR, 0.25);
  const hammerBand = painted(new THREE.TorusGeometry(0.215, 0.04, 5, 14).rotateY(Math.PI / 2), SHELL_TOOL_EDGE);
  const handle = painted(new THREE.CylinderGeometry(0.07, 0.085, 1.3, 7).rotateX(Math.PI / 2), HANDLE_COLOR, 0.3);
  const scallop = painted(new THREE.ConeGeometry(0.3, 0.12, 9, 1, true).rotateX(Math.PI).scale(1, 1, 1.1), SHELL_TOOL_COLOR);
  const awl = painted(new THREE.ConeGeometry(0.07, 0.62, 6).rotateZ(Math.PI / 2), SHELL_TOOL_EDGE);
  return mergeGeometries([
    hammerHead.translate(0, 0.62, 0.62).rotateY(0.5).translate(-0.25, 0, -0.2),
    hammerBand.translate(0, 0.62, 0.62).rotateY(0.5).translate(-0.25, 0, -0.2),
    handle.translate(0, 0.5, 0).rotateY(0.5).translate(-0.25, 0, -0.2),
    scallop.translate(0.55, 0.47, 0.45),
    awl.rotateY(-0.9).translate(-0.1, 0.43, -0.55),
  ]);
}

export function createWorkbenchModel(scene, world, quality, spot, labelParent) {
  const group = new THREE.Group();
  const stoneMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { surface: 'rock', wetDarkening: 0.55, wetRoughness: 0.3, chromaticCaustics: quality.chromaticCaustics });
  const toolMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, side: THREE.DoubleSide }), { chromaticCaustics: quality.chromaticCaustics });
  const stone = new THREE.Mesh(buildStoneGeometry(), stoneMaterial);
  const tools = new THREE.Mesh(buildToolsGeometry(), toolMaterial);
  for (const mesh of [stone, tools]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  group.add(stone, tools);
  group.position.set(spot.x, world.heightAt(spot.x, spot.z) - 0.12, spot.z);
  group.rotation.y = 0.4;
  group.visible = false;
  scene.add(group);

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 2.65, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.0), transparent: true, opacity: 0, depthWrite: false, fog: false }),
  );
  marker.position.set(spot.x, world.heightAt(spot.x, spot.z) + 0.1, spot.z);
  marker.visible = false;
  scene.add(marker);
  const label = element('div', 'world-label burrow-label hidden', labelParent, 'Workshop');
  const labelPoint = new THREE.Vector3();

  return {
    get spot() {
      return spot;
    },
    group,
    marker,
    place(newSpot, floorY) {
      spot = newSpot;
      group.position.set(spot.x, floorY, spot.z);
      marker.position.set(spot.x, floorY + 0.1, spot.z);
    },
    get built() {
      return group.visible;
    },
    build() {
      group.visible = true;
    },
    remove() {
      group.visible = false;
      marker.visible = false;
      label.classList.add('hidden');
    },
    update(time, highlighted, camera, labelShown = marker.visible) {
      marker.visible = group.visible && highlighted;
      labelPoint.set(spot.x, group.position.y + 2.2, spot.z).project(camera);
      const labelVisible = group.visible && (marker.visible || labelShown) && labelPoint.z < 1;
      label.classList.toggle('hidden', !labelVisible);
      if (labelVisible) label.style.transform = `translate(-50%, -100%) translate(${(labelPoint.x * 0.5 + 0.5) * innerWidth}px, ${(-labelPoint.y * 0.5 + 0.5) * innerHeight - 6 * Math.abs(Math.sin(time * 2.6))}px)`;
      marker.material.opacity = 0.55 + 0.35 * Math.sin(time * 3.2);
      marker.scale.setScalar(1 + 0.05 * Math.sin(time * 3.2));
    },
  };
}

export function element(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

export function percent(value) {
  return `${Math.round(value * 100)}%`;
}

export function shellStatsText(definition) {
  return `🛡 ${definition.defense} · 🏃 ${percent(definition.speedFactor)} · 🗡️ ×${definition.attackFactor.toFixed(2)}`;
}

function costRow(cost, inventory, parent) {
  const row = element('div', 'cost', parent);
  for (const [type, amount] of Object.entries(cost)) {
    const have = inventory[type] || 0;
    element('span', have >= amount ? 'cost-item' : 'cost-item short', row, have >= amount ? `${RESOURCE_TYPES[type].icon} ${amount} ✓` : `${RESOURCE_TYPES[type].icon} ${amount} (have ${have})`);
  }
}

export function createWorkbenchPanel(root, { gear, inventory, isDiscovered, onCraft, onCraftSupply = () => {}, onUpgradeTools, onRefine, onModify, onMove, onDismantle, onClose }) {
  const overlay = element('div', 'workbench workshop-panel', root);
  const card = element('div', 'workbench-card', overlay);
  const header = element('div', 'workbench-header', card);
  element('div', 'workbench-title', header, 'Workshop');
  const closeButton = element('button', 'workbench-close', header, '✕');
  closeButton.setAttribute('aria-label', 'Close');
  const tabRow = element('div', 'workbench-tabs', card);
  const tabNames = ['Craft', 'Improve'];
  const tabButtons = tabNames.map((name) => {
    const button = element('button', '', tabRow, name);
    button.dataset.tab = name;
    return button;
  });
  const body = element('div', 'workbench-body', card);
  let activeTab = 'Craft';

  function renderCraft() {
    const entries = [
      ...Object.entries(SHELLS).filter(([, definition]) => definition.cost).map(([kind, definition]) => ({ category: 'shell', kind, definition })),
      ...Object.entries(CLAWS).filter(([, definition]) => definition.cost).map(([kind, definition]) => ({ category: 'claws', kind, definition })),
    ];
    const known = entries.filter(({ category, kind, definition }) => isDiscovered(category, kind, definition));
    const hidden = entries.length - known.length;
    for (const { category, kind, definition } of known) {
      const row = element('div', `item ${tierClass(definition)}`, body);
      const text = element('div', 'item-text', row);
      element('div', 'item-name', text, `${category === 'shell' ? `${definition.label} · ${definition.role}` : definition.label} · ${tierBadge(definition)}`);
      element('div', 'item-stats', text, category === 'shell' ? shellStatsText(definition) : `🗡️ +${definition.attackBonus} attack`);
      const quality = qualityForTools(definition, gear.state.toolTier);
      element('div', `item-quality quality-${quality}`, text, `${quality === 'masterwork' ? '★ ' : ''}${QUALITIES[quality].label} with your ${TOOL_TIERS[gear.state.toolTier].label.toLowerCase()}`);
      if (definition.ability) element('div', 'item-ability', text, `${definition.ability.label} — ${definition.ability.description}`);
      if (definition.healOnHit) element('div', 'item-ability', text, `Mend — every hit heals ${definition.healOnHit} HP`);
      const owned = (category === 'shell' ? gear.state.shells : gear.state.claws).filter((item) => item.kind === kind).length;
      if (owned) element('div', 'item-owned', text, `Owned: ${owned}`);
      costRow(definition.cost, inventory(), text);
      const button = element('button', 'item-action', row, 'Craft');
      button.dataset.craft = `${category}:${kind}`;
      button.disabled = !canAfford(definition.cost, inventory());
      button.addEventListener('click', () => onCraft(category, kind));
    }
    if (hidden) element('div', 'placeholder undiscovered', body, `${hidden} more ${hidden === 1 ? 'recipe' : 'recipes'} to discover — find new materials out in the world.`);
    for (const [type, supply] of Object.entries(CONSUMABLES).filter(([, definition]) => definition.recipe)) {
      const row = element('div', 'item supply', body);
      const text = element('div', 'item-text', row);
      element('div', 'item-name', text, `${RESOURCE_TYPES[type].icon} ${RESOURCE_TYPES[type].label} · supply`);
      element('div', 'item-ability', text, supply.description);
      if (inventory()[type]) element('div', 'item-owned', text, `Owned: ${inventory()[type]}`);
      costRow(supply.recipe, inventory(), text);
      const button = element('button', 'item-action', row, 'Craft');
      button.dataset.craft = `supply:${type}`;
      button.disabled = !canAfford(supply.recipe, inventory());
      button.addEventListener('click', () => onCraftSupply(type));
    }
  }

  function renderResult() {
    if (improveState.lastResult) element('div', 'improve-result', body, improveState.lastResult);
  }

  function renderTools() {
    const tier = gear.state.toolTier;
    const section = element('div', 'item tools-row', body);
    const text = element('div', 'item-text', section);
    element('div', 'item-name', text, `${TOOL_TIERS[tier].label} · tools T${tier}`);
    element('div', 'item-ability', text, `Crafting T${tier} gear: Fine. Lower tiers: ★ Masterwork (+25%). Higher tiers: Crude (−15%).`);
    const next = TOOL_TIERS[tier + 1];
    if (!next) {
      element('div', 'item-stats', text, 'Your tools are the best there are.');
      return;
    }
    element('div', 'item-stats', text, `Next: ${next.label} (T${tier + 1})`);
    costRow(next.cost, inventory(), text);
    const button = element('button', 'item-action', section, 'Upgrade');
    button.dataset.upgradeTools = String(tier + 1);
    button.disabled = !canAfford(next.cost, inventory());
    button.addEventListener('click', () => {
      if (onUpgradeTools()) improveState.lastResult = `New tools: ${next.label}!`;
      render();
    });
  }

  function renderOption(parent, { label, description, cost, dataKey, dataValue, current, onChoose }) {
    const row = element('div', current ? 'item option-row current' : 'item option-row', parent);
    const text = element('div', 'item-text', row);
    element('div', 'item-name', text, current ? `${label} · ✓ on` : label);
    element('div', 'item-ability', text, description);
    if (!current) costRow(cost, inventory(), text);
    const button = element('button', 'item-action', row, current ? 'On' : 'Apply');
    button.dataset[dataKey] = dataValue;
    button.disabled = current || !canAfford(cost, inventory());
    button.addEventListener('click', onChoose);
  }

  function renderImprove() {
    renderResult();
    renderTools();
    const entries = gear.improvableItems().sort((first, second) => isWorn(second.item) - isWorn(first.item));
    if (!entries.length) element('div', 'placeholder', body, 'Craft a shell or claws to improve them.');
    for (const { category, item, definition } of entries) {
      const row = element('div', `${isWorn(item) ? 'item worn' : 'item'} ${tierClass(definition)}`, body);
      row.dataset.improveItem = String(item.id);
      const text = element('div', 'item-text', row);
      const name = element('div', 'item-name', text, itemName(category, item));
      if (isWorn(item)) element('span', 'worn-mark', name, '✓ Wearing');
      element('div', `item-quality quality-${item.quality}`, text, `${item.quality === 'masterwork' ? '★ ' : ''}${QUALITIES[item.quality].label} · T${definition.tier || 1}`);
      element('div', 'item-stats', text, itemStatsText(category, item));
      const modification = modificationOf(category, item);
      element('div', 'item-ability', text, modification ? `${modification.label} — ${modification.description}` : category === 'shell' ? 'No reinforcement yet' : 'No binding yet');
      const expanded = improveState.expandedId === item.id;
      const toggle = element('button', expanded ? 'item-action secondary-action' : 'item-action', row, expanded ? '▲ Hide' : 'Improve');
      toggle.dataset.expand = String(item.id);
      toggle.addEventListener('click', () => {
        improveState.expandedId = expanded ? null : item.id;
        improveState.lastResult = null;
        render();
      });
      if (!expanded) continue;
      const options = element('div', 'improve-options', body);
      const target = gear.refineTarget(item.id);
      if (target) {
        renderOption(options, {
          label: `Refine → ${QUALITIES[target].label}`,
          description: `Rework it with your ${TOOL_TIERS[gear.state.toolTier].label.toLowerCase()}.`,
          cost: refineCost(definition), dataKey: 'refine', dataValue: String(item.id),
          onChoose: () => {
            if (onRefine(item.id)) improveState.lastResult = `${definition.label} is now ${QUALITIES[target].label.toLowerCase()}!`;
            render();
          },
        });
      }
      const choices = category === 'shell' ? REINFORCEMENTS : BINDINGS;
      const field = category === 'shell' ? 'reinforcement' : 'binding';
      for (const [key, choice] of Object.entries(choices)) {
        renderOption(options, {
          label: choice.label, description: item[field] && item[field] !== key ? `${choice.description} · replaces ${modification.label.toLowerCase()}` : choice.description,
          cost: choice.cost, dataKey: 'modify', dataValue: `${item.id}:${key}`, current: item[field] === key,
          onChoose: () => {
            if (onModify(item.id, key)) improveState.lastResult = `${definition.label}: ${choice.label.toLowerCase()} on`;
            render();
          },
        });
      }
    }
  }

  function isWorn(item) {
    return gear.isWorn(item.id);
  }

  const improveState = { expandedId: null, lastResult: null };

  function render() {
    body.replaceChildren();
    for (const button of tabButtons) button.classList.toggle('active', button.dataset.tab === activeTab);
    if (activeTab === 'Craft') renderCraft();
    else renderImprove();
    renderStructureActions(body, { label: 'workshop', onMove, onDismantle });
  }

  for (const button of tabButtons) {
    button.addEventListener('click', () => {
      activeTab = button.dataset.tab;
      Object.assign(improveState, { expandedId: null, lastResult: null });
      render();
    });
  }
  closeButton.addEventListener('click', () => onClose());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) onClose();
  });

  return {
    get isOpen() {
      return overlay.classList.contains('visible');
    },
    open(tab) {
      if (tab) activeTab = tab;
      render();
      overlay.classList.add('visible');
      root.classList.add('panel-open');
    },
    close() {
      Object.assign(improveState, { expandedId: null, lastResult: null });
      overlay.classList.remove('visible');
      root.classList.remove('panel-open');
    },
    render,
  };
}
