import { element, percent } from './workbench.js';
import { MAX_LEVEL, MAX_CLAW_SKILL } from './progression.js';

export function createStatusPanel(root, { progression, combatStats, onClose }) {
  const overlay = element('div', 'workbench status-panel', root);
  const card = element('div', 'workbench-card', overlay);
  const header = element('div', 'workbench-header', card);
  element('div', 'workbench-title', header, 'Status');
  const closeButton = element('button', 'workbench-close', header, '✕');
  closeButton.setAttribute('aria-label', 'Close');
  const body = element('div', 'workbench-body status-body', card);

  function addRow(parent, label, value) {
    const row = element('div', 'status-row', parent);
    element('span', 'status-label', row, label);
    element('span', 'status-value', row, value);
  }

  function render() {
    body.replaceChildren();
    const { state } = progression;
    const stats = combatStats();
    const progressSection = element('div', 'status-section', body);
    element('div', 'section-title', progressSection, 'Progress');
    addRow(progressSection, 'Level', `${state.level} / ${MAX_LEVEL}`);
    const toNext = progression.experienceToNext();
    addRow(progressSection, 'Experience', toNext ? `${Math.floor(state.experience)} / ${toNext}` : 'Max level');
    addRow(progressSection, 'Health', `${Math.ceil(Math.max(0, state.health))} / ${progression.maxHealth()}`);

    const combatSection = element('div', 'status-section', body);
    element('div', 'section-title', combatSection, 'Combat');
    addRow(combatSection, 'Attack', stats.strikingHands.length > 1 ? `${stats.handAttack.big} big / ${stats.handAttack.small} small` : String(stats.attack));
    addRow(combatSection, 'Defense', String(stats.defense));
    if (stats.blockChance) addRow(combatSection, 'Block chance', percent(stats.blockChance));
    addRow(combatSection, 'Attack speed', percent(1 / stats.attackIntervalFactor));
    addRow(combatSection, 'Move speed', percent(stats.speedFactor));

    const skillSection = element('div', 'status-section', body);
    element('div', 'section-title', skillSection, 'Skills');
    addRow(skillSection, 'Claw skill', `${state.clawSkill.toFixed(1)} / ${MAX_CLAW_SKILL} (+${Math.round(state.clawSkill)}% damage)`);
    addRow(skillSection, 'Crusher molts', `${progression.moltCount('crusher')} (+${progression.moltCount('crusher') * 5}% damage)`);
    addRow(skillSection, 'Cutter molts', `${progression.moltCount('cutter')} (${progression.moltCount('cutter') * 5}% faster attacks)`);
    const waiting = progression.moltsAvailable();
    if (waiting) addRow(skillSection, 'Molts ready', `${waiting} · molt in your burrow`);
  }

  closeButton.addEventListener('click', () => onClose());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) onClose();
  });

  return {
    get isOpen() {
      return overlay.classList.contains('visible');
    },
    open() {
      render();
      overlay.classList.add('visible');
      root.classList.add('panel-open');
    },
    close() {
      overlay.classList.remove('visible');
      root.classList.remove('panel-open');
    },
    render,
  };
}
