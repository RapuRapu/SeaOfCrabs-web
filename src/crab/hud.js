import { QUALITY_LEVELS } from './quality.js';
import { createGameLog } from './gameLog.js';

function element(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

const SETTINGS_ICON_SVG = '<svg viewBox="0 0 24 24"><path fill="#fff8e8" fill-rule="evenodd" d="M10.3 1.5h3.4l.5 2.8 1.9.8 2.3-1.6 2.4 2.4-1.6 2.3.8 1.9 2.8.5v3.4l-2.8.5-.8 1.9 1.6 2.3-2.4 2.4-2.3-1.6-1.9.8-.5 2.8h-3.4l-.5-2.8-1.9-.8-2.3 1.6-2.4-2.4 1.6-2.3-.8-1.9-2.8-.5v-3.4l2.8-.5.8-1.9-1.6-2.3 2.4-2.4 2.3 1.6 1.9-.8zM12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"/></svg>';
const TRAVEL_EDGE_PIXELS = 70;
const REMOVE_CONFIRM_MS = 3000;
const TRAVEL_TOP_PIXELS = 130;

export function createHud(activeQualityName) {
  const root = element('div', '', document.body);
  root.id = 'hud';

  const topLeft = element('div', 'top-left', root);
  const pauseButton = element('button', 'pause-button', topLeft);
  pauseButton.setAttribute('aria-label', 'Settings');
  pauseButton.innerHTML = SETTINGS_ICON_SVG;
  const bagButton = element('button', 'bag-button', topLeft, '🎒');
  bagButton.setAttribute('aria-label', 'Backpack');
  const bagDot = element('span', 'bag-dot hidden', bagButton);
  const mapButton = element('button', 'bag-button map-button', topLeft, '🗺️');
  mapButton.setAttribute('aria-label', 'Map');
  const burrowButtons = element('div', 'burrow-buttons hidden', root);
  const iconButton = (className, icon, label) => {
    const button = element('button', `build-button icon-button ${className}`, burrowButtons);
    button.innerHTML = icon;
    button.setAttribute('aria-label', label);
    button.title = label;
    return button;
  };
  const moltButton = iconButton('molt-button hidden', '🦞', 'Molt');
  const moltCount = element('span', 'button-count', moltButton);
  const helpersButton = iconButton('helpers-button', '🦀', 'Helpers');
  const BUILD_ICON = '🔨';
  const DIG_BURROW_LABEL = 'Burrow';
  const buildButton = iconButton('build-open', BUILD_ICON, 'Build');
  const quickSlotBar = element('div', 'quick-slots', root);
  let quickSlotListener = () => {};
  const quickSlotButtons = [0, 1].map((index) => {
    const button = element('button', 'quick-slot empty', quickSlotBar);
    button.dataset.quickSlot = String(index);
    const icon = element('span', 'quick-slot-icon', button, '+');
    const count = element('span', 'quick-slot-count', button);
    const cooldown = element('span', 'quick-slot-cooldown', button);
    button.setAttribute('aria-label', `Quick slot ${index + 1}`);
    button.addEventListener('click', () => quickSlotListener(index));
    return { button, icon, count, cooldown };
  });
  const travelGroup = element('div', 'travel-group hidden', root);
  const travelButton = element('button', 'travel-button hidden', travelGroup);
  const travelMoveButton = element('button', 'travel-action move hidden', travelGroup, 'Move');
  const travelRemoveButton = element('button', 'travel-action remove hidden', travelGroup, 'Remove');
  const modeBar = element('div', 'mode-bar hidden', root);
  const modeText = element('span', 'mode-text', modeBar);
  const modeCancel = element('button', 'mode-cancel', modeBar, 'Cancel');
  const sceneFade = element('div', 'scene-fade', root);

  const vitals = element('div', 'vitals', root);
  const levelBadge = element('button', 'level-badge', vitals, 'Lv 1');
  levelBadge.setAttribute('aria-label', 'Status');
  const bars = element('div', 'vital-bars', vitals);
  const healthTrack = element('div', 'health-track', bars);
  const healthFill = element('div', 'health-fill', healthTrack);
  const healthText = element('div', 'health-text', healthTrack);
  const experienceTrack = element('div', 'experience-track', bars);
  const experienceFill = element('div', 'experience-fill', experienceTrack);
  const buffChip = element('div', 'buff-chip hidden', root);
  const hurtFlash = element('div', 'hurt-flash', root);
  const deathFade = element('div', 'death-fade', root);
  const floatLayer = element('div', 'float-layer', root);

  const topRight = element('div', 'top-right', root);
  const tide = element('div', 'chip tide', topRight);
  const tideLabel = element('span', '', tide, '🌊');
  const tideFill = element('div', 'tide-fill', element('div', 'tide-gauge', tide));

  const gameLog = createGameLog(root);

  const pauseMenu = element('div', 'pause-menu', root);
  const pauseCard = element('div', 'pause-card', pauseMenu);
  element('div', 'pause-title', pauseCard, 'Settings');
  const resumeButton = element('button', 'resume', pauseCard, 'Back to game');
  element('div', 'pause-note', pauseCard, 'Graphics (reloads the game)');
  const qualityRow = element('div', 'quality-row', pauseCard);
  const qualityButtons = Object.entries(QUALITY_LEVELS).map(([name, level]) => {
    const button = element('button', name === activeQualityName ? 'active' : '', qualityRow, level.label);
    button.dataset.quality = name;
    return button;
  });
  element('div', 'pause-note', pauseCard, 'Sound');
  const volumeInputs = {};
  for (const [key, label] of [['music', 'Music'], ['effects', 'Effects']]) {
    const row = element('label', 'volume-row', pauseCard, label);
    const input = element('input', '', row);
    Object.assign(input, { type: 'range', min: 0, max: 1, step: 0.05 });
    input.addEventListener('input', () => volumeListener(key, Number(input.value)));
    volumeInputs[key] = input;
  }
  element('div', 'pause-note', pauseCard, 'Display');
  const performanceRow = element('label', 'toggle-row', pauseCard, 'Show performance');
  const performanceToggle = element('input', '', performanceRow);
  performanceToggle.type = 'checkbox';
  performanceToggle.addEventListener('change', () => performanceListener(performanceToggle.checked));
  const fullscreenButton = element('button', 'fullscreen-button', pauseCard, 'Fullscreen');
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const refreshFullscreenButton = () => {
    fullscreenButton.textContent = fullscreenElement() ? 'Exit fullscreen' : 'Fullscreen';
  };
  fullscreenButton.addEventListener('click', async () => {
    try {
      if (fullscreenElement()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else {
        const page = document.documentElement;
        const request = page.requestFullscreen || page.webkitRequestFullscreen;
        if (!request || !(document.fullscreenEnabled || document.webkitFullscreenEnabled)) throw new Error('unsupported');
        await request.call(page, { navigationUI: 'hide' });
      }
    } catch {
      gameLog.post('notice', 'Fullscreen not available here');
    }
    refreshFullscreenButton();
  });
  document.addEventListener('fullscreenchange', refreshFullscreenButton);
  document.addEventListener('webkitfullscreenchange', refreshFullscreenButton);
  const resetButton = element('button', 'reset', pauseCard, 'Start over');
  element('div', 'pause-note', pauseCard, 'The game saves on its own.');

  let pauseListener = () => {};
  let resetListener = () => {};
  let qualityListener = () => {};
  let statusListener = () => {};
  let mapListener = () => {};
  let bagListener = () => {};
  let volumeListener = () => {};
  let performanceListener = () => {};
  let buildListener = () => {};
  let helpersListener = () => {};
  let moltListener = () => {};
  let modeCancelListener = () => {};
  let travelListener = () => {};
  let travelShown = null;
  let travelActionsShown = '';
  let travelActionListener = () => {};
  let removeArmedUntil = 0;
  let resetArmed = false;

  pauseButton.addEventListener('click', () => pauseListener(true));
  bagButton.addEventListener('click', () => bagListener());
  buildButton.addEventListener('click', () => buildListener());
  helpersButton.addEventListener('click', () => helpersListener());
  moltButton.addEventListener('click', () => moltListener());
  modeCancel.addEventListener('click', () => modeCancelListener());
  travelButton.addEventListener('click', () => travelListener());
  travelMoveButton.addEventListener('click', () => travelActionListener('move'));
  travelRemoveButton.addEventListener('click', () => {
    if (performance.now() > removeArmedUntil) {
      removeArmedUntil = performance.now() + REMOVE_CONFIRM_MS;
      travelRemoveButton.textContent = 'Remove?';
      travelRemoveButton.classList.add('armed');
      setTimeout(disarmRemove, REMOVE_CONFIRM_MS);
      return;
    }
    disarmRemove();
    travelActionListener('remove');
  });
  function disarmRemove() {
    removeArmedUntil = 0;
    travelRemoveButton.textContent = 'Remove';
    travelRemoveButton.classList.remove('armed');
  }
  levelBadge.addEventListener('click', () => statusListener());
  mapButton.addEventListener('click', () => mapListener());
  resumeButton.addEventListener('click', () => pauseListener(false));
  resetButton.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      resetButton.classList.add('armed');
      resetButton.textContent = 'Tap again to erase progress';
      return;
    }
    resetListener();
  });
  for (const button of qualityButtons) button.addEventListener('click', () => qualityListener(button.dataset.quality));

  const fadeablePanels = [vitals, topLeft, gameLog.root, quickSlotBar, burrowButtons, travelGroup, topRight];
  for (const panel of fadeablePanels) panel.classList.add('hud-fadeable');
  function fadePanelsOver(screenCircles) {
    for (const panel of fadeablePanels) {
      const keepSolid = panel === gameLog.root && gameLog.expanded;
      const box = panel.getBoundingClientRect();
      const covers = !keepSolid && box.width > 0 && screenCircles.some(({ x, y, radius }) => x + radius > box.left && x - radius < box.right && y + radius > box.top && y - radius < box.bottom);
      panel.classList.toggle('hud-faded', covers);
    }
  }

  return {
    fadePanelsOver,
    onPause: (listener) => { pauseListener = listener; },
    onReset: (listener) => { resetListener = listener; },
    onQuality: (listener) => { qualityListener = listener; },
    onVolume: (listener) => { volumeListener = listener; },
    onQuickSlot: (listener) => { quickSlotListener = listener; },
    setQuickSlots(views) {
      views.forEach((view, index) => {
        const slot = quickSlotButtons[index];
        slot.button.classList.toggle('empty', !view);
        slot.button.classList.toggle('used-up', Boolean(view) && view.count === 0);
        const iconText = view ? view.icon : '+';
        if (slot.icon.textContent !== iconText) slot.icon.textContent = iconText;
        const countText = view ? String(view.count) : '';
        if (slot.count.textContent !== countText) slot.count.textContent = countText;
        const cooldownDegrees = view ? Math.round(view.cooldownShare * 360) : 0;
        slot.cooldown.style.background = cooldownDegrees > 0 ? `conic-gradient(rgba(10, 14, 18, 0.65) ${cooldownDegrees}deg, transparent 0)` : 'none';
        slot.button.title = view ? view.label : `Quick slot ${index + 1} — assign an item in the backpack`;
      });
    },
    onPerformanceToggle: (listener) => { performanceListener = listener; },
    setPerformanceToggle(visible) {
      performanceToggle.checked = visible;
    },
    gameLog,
    log(kind, text, detail = null) {
      gameLog.post(kind, text, detail);
    },
    setVolumes(values) {
      for (const [key, input] of Object.entries(volumeInputs)) input.value = values[key];
    },
    onStatus: (listener) => { statusListener = listener; },
    onMap: (listener) => { mapListener = listener; },
    onBag: (listener) => { bagListener = listener; },
    onBuild: (listener) => { buildListener = listener; },
    onHelpers: (listener) => { helpersListener = listener; },
    onMolt: (listener) => { moltListener = listener; },
    setMoltButton(available) {
      moltButton.classList.toggle('hidden', !available);
      const countText = available ? String(available) : '';
      if (moltCount.textContent !== countText) moltCount.textContent = countText;
    },
    onTravel: (listener) => { travelListener = listener; },
    onTravelAction: (listener) => { travelActionListener = listener; },
    setTravel(option, actions = null) {
      const actionsKey = actions ? `${actions.move ? 'm' : ''}${actions.remove ? 'r' : ''}` : '';
      if (actionsKey !== travelActionsShown) {
        travelActionsShown = actionsKey;
        travelMoveButton.classList.toggle('hidden', !(actions && actions.move));
        travelRemoveButton.classList.toggle('hidden', !(actions && actions.remove));
        disarmRemove();
      }
      if (option === travelShown) return;
      travelShown = option;
      travelGroup.classList.toggle('hidden', !option);
      travelButton.classList.toggle('hidden', !option);
      root.classList.toggle('travel-shown', Boolean(option));
      if (option) travelButton.textContent = option === 'enter' ? 'Enter burrow' : 'Go outside';
    },
    placeTravel(screenX, screenY) {
      if (!travelShown) return;
      const edge = Math.max(TRAVEL_EDGE_PIXELS, travelGroup.offsetWidth / 2 + 8);
      const x = Math.min(innerWidth - edge, Math.max(edge, screenX));
      const y = Math.min(innerHeight - TRAVEL_EDGE_PIXELS, Math.max(TRAVEL_TOP_PIXELS, screenY));
      travelGroup.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    },
    bumpTravel() {
      travelButton.classList.remove('bump');
      void travelButton.offsetWidth;
      travelButton.classList.add('bump');
    },
    setBuildButton(visible, { surface = false } = {}) {
      burrowButtons.classList.toggle('hidden', !visible);
      burrowButtons.classList.toggle('surface', surface);
      const label = surface ? 'Dig a burrow' : 'Build';
      if (buildButton.getAttribute('aria-label') !== label) {
        buildButton.textContent = surface ? DIG_BURROW_LABEL : BUILD_ICON;
        buildButton.classList.toggle('text-button', surface);
        buildButton.setAttribute('aria-label', label);
        buildButton.title = label;
      }
    },
    setMode(text, onCancel = () => {}) {
      modeBar.classList.toggle('hidden', !text);
      burrowButtons.classList.toggle('dimmed', Boolean(text));
      root.classList.toggle('placing', Boolean(text));
      if (text && text !== modeText.textContent) gameLog.post('notice', text);
      modeText.textContent = text || '';
      modeCancelListener = onCancel;
    },
    fade() {
      sceneFade.classList.remove('visible');
      void sceneFade.offsetWidth;
      sceneFade.classList.add('visible');
    },
    setBagDot(visible) {
      bagDot.classList.toggle('hidden', !visible);
    },
    root,
    setPaused(paused) {
      pauseMenu.classList.toggle('visible', paused);
      resetArmed = false;
      resetButton.classList.remove('armed');
      resetButton.textContent = 'Start over';
    },
    bumpBag() {
      bagButton.classList.remove('bump');
      void bagButton.offsetWidth;
      bagButton.classList.add('bump');
    },
    setBuff(text) {
      buffChip.classList.toggle('hidden', !text);
      if (text && buffChip.textContent !== text) buffChip.textContent = text;
    },
    setTide(label, fraction) {
      tideLabel.textContent = /tide/i.test(label) ? label : `Tide ${label.toLowerCase()}`;
      tideFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    setVitals(level, health, maxHealth, experience, experienceToNext) {
      const levelText = `Lv ${level}`;
      if (levelBadge.textContent !== levelText) levelBadge.textContent = levelText;
      healthFill.style.width = `${(Math.max(0, health) / maxHealth) * 100}%`;
      const healthLabel = `${Math.ceil(Math.max(0, health))}/${maxHealth}`;
      if (healthText.textContent !== healthLabel) healthText.textContent = healthLabel;
      experienceFill.style.width = experienceToNext ? `${(experience / experienceToNext) * 100}%` : '100%';
    },
    floatText(x, y, text, kind) {
      const label = element('div', `float-text ${kind}`, floatLayer, text);
      label.style.left = `${x + (Math.random() - 0.5) * 18}px`;
      label.style.top = `${y}px`;
      setTimeout(() => label.remove(), 1000);
    },
    flashHurt() {
      hurtFlash.classList.remove('visible');
      void hurtFlash.offsetWidth;
      hurtFlash.classList.add('visible');
    },
    showDeath() {
      deathFade.classList.remove('visible');
      void deathFade.offsetWidth;
      deathFade.classList.add('visible');
    },
    setVisible(visible) {
      root.style.display = visible ? '' : 'none';
    },
  };
}
