import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

FLOW = r'''
() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const out = {};
  d.setPaused(false);
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 7, seaLettuce: 5 });
  d.buildWorkshop();
  d.buildAtDefaultSpot('helperNest');
  const fighter = d.rescueHelperAt(d.helpers.strandedVisible()[0]);
  const coward = d.rescueHelperAt(d.helpers.strandedVisible()[0]);

  const claws = d.gear.grant('claws', 'cleaver');
  claws.quality = 'masterwork';
  const shell = d.gear.grant('shell', 'whelk');
  shell.quality = 'masterwork';
  const shellsBefore = d.gear.state.shells.length;
  out.equipped = d.equipHelper(fighter.id, 'claws', claws.id) && d.equipHelper(fighter.id, 'shell', shell.id);
  out.leftBackpack = d.gear.state.shells.length === shellsBefore - 1 && !d.gear.state.claws.some((item) => item.id === claws.id);
  out.panelGear = (() => { d.helpersPanel.open(); const select = document.querySelector(`#hud .helpers-panel select[data-gear="${fighter.id}:claws"]`); const value = select && select.value; d.helpersPanel.close(); return value === String(claws.id); })();

  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  const spawnNear = (helper, kind) => {
    const spot = d.navigation.nearestWalkable(helper.x + 3, helper.z, 6);
    const enemy = d.enemies.spawn(kind, spot.x, spot.z);
    enemy.state = 'idle';
    return enemy;
  };
  for (const node of d.resources.nodes) if (node.type === 'driftwood' && Math.hypot(node.x - d.home.yard.x, node.z - d.home.yard.z) < 30) node.gathered = true;
  const sendOut = (helper) => {
    d.helpers.setJob(helper.id, 'driftwood');
    step(40, () => helper.state === 'outbound' && !d.home.isInYard(helper.x, helper.z, -4));
  };

  sendOut(fighter);
  const crab = spawnNear(fighter, 'shoreCrab');
  const levelBefore = fighter.level;
  const expBefore = fighter.experience;
  step(20, () => crab.state === 'dying' || crab.state === 'dead');
  out.fighterWon = crab.state === 'dying' || crab.state === 'dead';
  out.fighterState = { state: fighter.state, health: fighter.health, crabHealth: crab.health, distance: Math.hypot(crab.x - fighter.x, crab.z - fighter.z) };
  out.fighterXp = { level: fighter.level, gained: fighter.level > levelBefore || fighter.experience > expBefore };
  out.fighterCarries = fighter.carrying;
  out.playerXpUntouched = d.progression.state.experience === 0;
  step(40, () => fighter.state === 'resting');
  const nest = d.home.state.stations.find((s) => s.kind === 'helperNest');
  out.lootInNest = Object.values(nest.box.inventory).reduce((sum, value) => sum + value, 0);

  sendOut(coward);
  const rat = spawnNear(coward, 'rat');
  let fought = false;
  for (let t = 0; t < 6; t += 1/60) { d.simulate(1/60); if (coward.state === 'fighting') fought = true; }
  out.cowardFled = !fought && ['fleeing', 'resting', 'returning'].includes(coward.state);
  out.ratHealthy = rat.health === rat.definition.health;
  Object.assign(rat, { state: 'dead', respawnTimer: 1e9 });

  d.helpers.setJob(coward.id, null);
  out.unequip = d.equipHelper(fighter.id, 'shell', null) && d.gear.state.shells.some((item) => item.id === shell.id);
  d.persist();
  return out;
}
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    page = browser.new_page(viewport={'width': 915, 'height': 412})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    with page.expect_navigation(timeout=180000):
        page.evaluate('() => { setTimeout(() => window.__debug.startOver(), 0); }')
    page.wait_for_function('!!window.__debug', timeout=180000)
    flow = page.evaluate(FLOW)
    print(json.dumps(flow), flush=True)
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reloaded = page.evaluate("() => { const d = window.__debug; const helper = d.helpers.list[0]; return { claws: helper.gear.claws && helper.gear.claws.kind, shell: helper.gear.shell, level: helper.level >= 1, xp: helper.experience > 0 || helper.level > 1 }; }")
    print(json.dumps({'reloaded': reloaded}), flush=True)
    checks = {
        'equipMovesItems': flow['equipped'] and flow['leftBackpack'] and flow['panelGear'],
        'fightsWhenItCanWin': flow['fighterWon'] and flow['fighterXp']['gained'] and flow['playerXpUntouched'],
        'bringsLootHome': flow['fighterCarries'] in ('shellBits', 'seaLettuce') and flow['lootInNest'] >= 1,
        'fleesWhenItWouldLose': flow['cowardFled'] and flow['ratHealthy'],
        'unequipReturnsItem': flow['unequip'],
        'saved': reloaded == {'claws': 'cleaver', 'shell': None, 'level': True, 'xp': True},
        'noErrors': not errors,
    }
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    browser.close()
    sys.exit(0 if all(checks.values()) else 1)
