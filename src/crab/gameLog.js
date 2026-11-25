export const LOG_LIMIT = 50;
const COLLAPSED_LINES = 3;
export const LOG_KINDS = ['combat', 'helperCombat', 'loot', 'build', 'progress', 'helper', 'discovery', 'notice', 'chat', 'system'];
const KIND_LABELS = { helperCombat: 'helper combat' };
const commandNameOf = (kind) => (KIND_LABELS[kind] || kind).replace(' ', '-');
const FILTERABLE_KINDS = LOG_KINDS.filter((kind) => kind !== 'system');

const clockText = (date) => date.toTimeString().slice(0, 8);

export function createGameLog(parent, { localAuthor = 'You', transport = null } = {}) {
  const entries = [];
  const commands = new Map();
  const shownKinds = new Set();
  let expanded = false;
  let nextId = 1;

  const root = document.createElement('div');
  root.className = 'game-log';
  const filterBar = document.createElement('div');
  filterBar.className = 'log-filters';
  const filterChips = new Map();
  for (const kind of ['all', ...FILTERABLE_KINDS]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `log-chip log-${kind}`;
    chip.textContent = KIND_LABELS[kind] || kind;
    chip.addEventListener('click', () => toggleKind(kind));
    filterBar.append(chip);
    filterChips.set(kind, chip);
  }
  const lines = document.createElement('div');
  lines.className = 'log-lines';
  const form = document.createElement('form');
  form.className = 'log-form';
  const input = document.createElement('input');
  input.className = 'log-input';
  input.type = 'text';
  input.maxLength = 160;
  input.placeholder = 'Type here, /help for commands';
  input.enterKeyHint = 'send';
  form.append(input);
  root.append(filterBar, lines, form);
  parent.append(root);
  queueMicrotask(render);

  const send = transport ? transport.send : (message) => receive(message);

  function receive(message) {
    entries.push({ id: nextId++, time: new Date(), ...message });
    while (entries.length > LOG_LIMIT) entries.shift();
    render();
  }

  function post(kind, text, detail = null) {
    receive({ kind, author: null, text, detail });
  }

  function render() {
    for (const [kind, chip] of filterChips) chip.classList.toggle('active', kind === 'all' ? shownKinds.size === 0 : shownKinds.has(kind));
    const visible = entries.filter((entry) => shownKinds.size === 0 || shownKinds.has(entry.kind) || entry.kind === 'system');
    const shown = expanded ? visible : visible.slice(-COLLAPSED_LINES);
    lines.replaceChildren(...shown.map((entry) => {
      const line = document.createElement('div');
      line.className = `log-line log-${entry.kind}`;
      if (expanded || entry.kind === 'chat') {
        const stamp = document.createElement('span');
        stamp.className = 'log-time';
        stamp.textContent = clockText(entry.time);
        line.append(stamp);
      }
      if (entry.author) {
        const author = document.createElement('span');
        author.className = 'log-author';
        author.textContent = `${entry.author}:`;
        line.append(author);
      }
      line.append(document.createTextNode(entry.text));
      if (expanded && entry.detail) {
        const detail = document.createElement('span');
        detail.className = 'log-detail';
        detail.textContent = entry.detail;
        line.append(detail);
      }
      return line;
    }));
    if (!shown.length) {
      const hint = document.createElement('div');
      hint.className = 'log-line log-hint';
      hint.textContent = 'Log — tap to open';
      lines.append(hint);
    }
    if (expanded) lines.scrollTop = lines.scrollHeight;
  }

  function setExpanded(value) {
    expanded = value;
    root.classList.toggle('expanded', expanded);
    if (!expanded) input.blur();
    render();
  }

  function registerCommand(name, description, run) {
    commands.set(name, { description, run });
  }

  function submit(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('/')) {
      const [name, ...args] = trimmed.slice(1).split(/\s+/);
      const command = commands.get(name.toLowerCase());
      if (command) command.run(args);
      else post('system', `Unknown command /${name} — try /help`);
      return;
    }
    send({ kind: 'chat', author: localAuthor, text: trimmed });
  }

  registerCommand('help', 'list commands', () => {
    for (const [name, command] of commands) post('system', `/${name} — ${command.description}`);
  });
  registerCommand('clear', 'empty the log', () => {
    entries.length = 0;
    render();
  });
  function toggleKind(kind) {
    if (kind === 'all') shownKinds.clear();
    else if (shownKinds.has(kind)) shownKinds.delete(kind);
    else shownKinds.add(kind);
    render();
  }

  function describeFilter() {
    return shownKinds.size ? `Showing ${[...shownKinds].map((kind) => KIND_LABELS[kind] || kind).join(', ')}` : 'Showing everything';
  }

  registerCommand('filter', `show only some kinds, e.g. /filter combat loot (${FILTERABLE_KINDS.map(commandNameOf).join(', ')}) — or /filter all`, (kinds) => {
    const known = FILTERABLE_KINDS.filter((kind) => kinds.some((typed) => typed.toLowerCase() === commandNameOf(kind) || typed.toLowerCase() === kind.toLowerCase()));
    shownKinds.clear();
    if (!kinds.includes('all')) for (const kind of known) shownKinds.add(kind);
    post('system', describeFilter());
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit(input.value);
    input.value = '';
  });
  lines.addEventListener('click', () => setExpanded(!expanded));
  input.addEventListener('focus', () => {
    if (!expanded) setExpanded(true);
  });
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') setExpanded(false);
  });
  input.addEventListener('keyup', (event) => event.stopPropagation());

  return { root, shownKinds, toggleKind, post, submit, receive, registerCommand, entries, setExpanded, get expanded() { return expanded; } };
}
