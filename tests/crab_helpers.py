import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

FLOW = r'''
() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const out = {};
  d.setPaused(false);
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 3, seaLettuce: 3 });
  d.buildWorkshop();
  const spots = d.helpers.strandedVisible();
  out.spotKinds = spots.map((spot) => spot.guardKind || 'free');
  out.refusedWithoutNest = d.rescueHelperAt(spots[0]) === null;
  const free = () => d.burrow.freeCells().filter((cell) => !(cell.column === 6 && cell.row === 5));
  Object.assign(d.save.inventory, { driftwood: 8, seaLettuce: 4 });
  const firstCell = free()[0];
  out.nestBuilt = d.buildStation('helperNest', firstCell.column, firstCell.row);
  out.freeRescued = spots.filter((spot) => !spot.guardKind).map((spot) => Boolean(d.rescueHelperAt(spot)));
  const gullSpot = spots.find((spot) => spot.guardKind === 'gull');
  out.guardedRefused = d.rescueHelperAt(gullSpot) === null;
  for (const enemy of d.enemies.list) if (enemy.kind === 'gull') Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  out.fullNestRefused = d.rescueHelperAt(gullSpot) === null;
  out.secondNestNeedsHeart = d.stationBuildProblem('helperNest') !== null;
  Object.assign(d.save.inventory, { pearls: 3, pebbles: 6, clay: 6, driftwood: 8, seaLettuce: 4 });
  const heartCell = free()[0];
  d.buildStation('burrowHeart', heartCell.column, heartCell.row);
  const secondCell = free()[0];
  out.secondNest = out.secondNestNeedsHeart && d.buildStation('helperNest', secondCell.column, secondCell.row);
  out.guardedRescued = Boolean(d.rescueHelperAt(gullSpot));
  out.helperCount = d.helpers.list.length;
  out.jobsAtStart = d.helpers.list.map((helper) => helper.job);

  for (const enemy of d.enemies.list) if (enemy.definition.temperament === 'aggressive') Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  const jobs = ['shellBits', 'driftwood', 'seaLettuce', 'coral'];
  d.helpers.list.forEach((helper, index) => d.helpers.setJob(helper.id, jobs[index]));
  let sharedTarget = false;
  for (let t = 0; t < 150; t += 1/60) {
    d.simulate(1/60);
    const targets = d.helpers.list.map((h) => h.targetId).filter(Boolean);
    if (new Set(targets).size !== targets.length) sharedTarget = true;
  }
  const nests = d.burrow.state.stations.filter((station) => station.kind === 'helperNest');
  const boxTotal = {};
  for (const nest of nests) for (const [type, amount] of Object.entries(nest.box.inventory)) boxTotal[type] = (boxTotal[type] || 0) + amount;
  out.nestBoxes = boxTotal;
  out.sharedTarget = sharedTarget;

  const runner = d.helpers.list[0];
  d.helpers.setJob(runner.id, 'shellBits');
  step(20, () => !runner.inside && runner.state === 'outbound');
  out.runnerOutside = !runner.inside;
  const crab = d.enemies.list.find((e) => e.kind === 'shoreCrab');
  Object.assign(crab, { state: 'idle', health: crab.definition.health, x: runner.x + 1, z: runner.z, respawnTimer: 0 });
  runner.health = 1;
  step(3, () => runner.inside);
  out.knockedOut = { inside: runner.inside, job: runner.job, count: d.helpers.list.length, toast: d.hud.gameLog.entries.map((entry) => entry.text).join(' | ') };
  Object.assign(crab, { state: 'dead', respawnTimer: 1e9 });

  const carrier = d.helpers.list[1];
  const carrierNest = nests.find((nest) => nest.id === carrier.nestId);
  carrierNest.box.inventory.shellBits = 12;
  const storage = d.burrow.state.stations.find((station) => station.kind === 'storage');
  const storageBefore = d.storage.inventory.shellBits || 0;
  d.helpers.setJob(carrier.id, 'carry', { fromId: carrierNest.id, toId: storage.id, material: 'shellBits' });
  step(60);
  out.carried = (d.storage.inventory.shellBits || 0) - storageBefore;
  out.nestLeft = carrierNest.box.inventory.shellBits;
  d.persist();
  return out;
}
'''

SETUP_STORAGE = r'''() => { const d = window.__debug; Object.assign(d.save.inventory, { driftwood: 4 }); const cell = d.burrow.freeCells().find((c) => !(c.column === 6 && c.row === 5)); d.buildStation('storage', cell.column, cell.row); }'''

def fresh_page(context, errors):
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    with page.expect_navigation(timeout=180000):
        page.evaluate('() => { setTimeout(() => window.__debug.startOver(), 0); }')
    page.wait_for_function('!!window.__debug', timeout=180000)
    return page

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    checks = {}
    context = browser.new_context(viewport={'width': 915, 'height': 412})
    page = fresh_page(context, errors)
    page.evaluate("() => { const d = window.__debug; Object.assign(d.save.inventory, { shellBits: 5, driftwood: 3, seaLettuce: 3 }); d.buildWorkshop(); }")
    page.evaluate(SETUP_STORAGE)
    flow = page.evaluate(FLOW)
    print(json.dumps(flow), flush=True)
    boxes = flow['nestBoxes']
    checks.update({
        'strandedSpots': flow['spotKinds'] == ['free', 'free', 'free', 'gull', 'giantLobster', 'shipCat'],
        'needsNest': flow['refusedWithoutNest'] and flow['nestBuilt'],
        'rescueFreeHelpers': flow['freeRescued'] == [True, True, True],
        'guardAndCapacity': flow['guardedRefused'] and flow['fullNestRefused'] and flow['secondNest'] and flow['guardedRescued'] and flow['helperCount'] == 4,
        'rescuedWithoutJob': flow['jobsAtStart'] == [None, None, None, None],
        'gatherEveryJobIncludingFar': all(boxes.get(job, 0) >= 1 for job in ('shellBits', 'driftwood', 'seaLettuce', 'coral')) and boxes.get('shellBits', 0) >= 2,
        'noSharedTargets': not flow['sharedTarget'],
        'knockedOutGoesHomeWithoutJob': flow['runnerOutside'] and flow['knockedOut']['inside'] and flow['knockedOut']['job'] is None and flow['knockedOut']['count'] == 4 and 'nest' in flow['knockedOut']['toast'],
        'carryBetweenBoxes': flow['carried'] >= 5 and flow['nestLeft'] <= 7,
    })
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reloaded = page.evaluate("() => { const d = window.__debug; return { helpers: d.helpers.list.length, nests: d.burrow.state.stations.filter((s) => s.kind === 'helperNest').length, stranded: d.helpers.strandedVisible().length, carryJob: d.helpers.list.some((h) => h.job === 'carry' && h.carryOrder && h.carryOrder.material === 'shellBits') }; }")
    print(json.dumps({'reloaded': reloaded}), flush=True)
    checks['saved'] = reloaded == {'helpers': 4, 'nests': 2, 'stranded': 2, 'carryJob': True}
    context.close()

    legacy = browser.new_context(viewport={'width': 915, 'height': 412})
    legacy_save = {'version': 5, 'x': 15, 'z': -20, 'heading': 0, 'worldTime': 260, 'inventory': {}, 'nodes': None, 'hasMoved': True, 'burrow': {'entrance': {'x': 18, 'z': -17}, 'dug': [60, 61, 59, 49, 71, 82, 83], 'stations': [{'kind': 'workshop', 'column': 6, 'row': 5}, {'kind': 'storage', 'column': 4, 'row': 5}]}, 'storage': {'inventory': {}, 'shells': [], 'claws': []}, 'helpers': [{'id': 1, 'job': 'shellBits'}, {'id': 2, 'job': 'driftwood'}], 'underground': False}
    legacy.add_init_script(f"localStorage.setItem('seaofcrabs-crab-save', JSON.stringify({json.dumps(legacy_save)}));")
    old = legacy.new_page()
    old.on('pageerror', lambda error: errors.append(str(error)))
    old.goto(URL)
    old.wait_for_function('!!window.__debug', timeout=180000)
    migrated = old.evaluate("() => { const d = window.__debug; const nest = d.burrow.state.stations.find((s) => s.kind === 'helperNest'); return { version: d.save.version, nest: Boolean(nest), housed: d.helpers.list.every((h) => nest && h.nestId === nest.id), jobs: d.helpers.list.map((h) => h.job), stranded: d.helpers.strandedVisible().length, workshopDug: d.burrow.isDug(6, 5), fogStart: d.fog.isRevealed(13, -21) }; }")
    print(json.dumps({'migrated': migrated}), flush=True)
    checks['migratesOldHelpers'] = migrated == {'version': 6, 'nest': True, 'housed': True, 'jobs': ['shellBits', 'driftwood'], 'stranded': 4, 'workshopDug': True, 'fogStart': True}
    legacy.close()

    mobile = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True, device_scale_factor=2)
    touch = fresh_page(mobile, errors)
    touch.evaluate('''() => { const d = window.__debug; d.setPaused(false); Object.assign(d.save.inventory, { shellBits: 5, driftwood: 7, seaLettuce: 5 }); d.buildWorkshop(); const cell = d.burrow.freeCells().find((c) => !(c.column === 6 && c.row === 5)); d.buildStation('helperNest', cell.column, cell.row); d.rescueHelperAt(d.helpers.strandedVisible()[0]); d.enterBurrow(); }''')
    touch.tap('#hud .helpers-button')
    touch.select_option('#hud .helpers-panel select[data-job]', 'driftwood')
    panel = touch.evaluate('''() => { const d = window.__debug; return { open: d.helpersPanel.isOpen, jobs: d.helpers.list.map((h) => h.job) }; }''')
    print(json.dumps(panel), flush=True)
    checks['touchJobDropdown'] = panel == {'open': True, 'jobs': ['driftwood']}
    mobile.close()
    browser.close()

    checks['noErrors'] = not errors
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    sys.exit(0 if all(checks.values()) else 1)
