import os, json
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

FLOW = r'''
() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const out = {};
  d.setPaused(false);
  Object.assign(d.save.inventory, { shellBits: 7, driftwood: 11, seaLettuce: 3 });
  d.buildWorkshop();
  d.buildAtDefaultSpot('storage');
  d.save.inventory.seaLettuce = 3;
  d.goHome();
  document.querySelector('#hud .build-open').click();
  document.querySelector('#hud .build-panel [data-station="dryingRack"]').click();
  const rackSpot = d.home.defaultSpot('dryingRack');
  d.previewPlacement(rackSpot.x, rackSpot.z);
  d.previewPlacement(rackSpot.x, rackSpot.z);
  out.rackBuilt = d.rack.exists;
  out.costPaid = { driftwood: d.save.inventory.driftwood, shellBits: d.save.inventory.shellBits };
  out.rackBlocksGround = !d.world.isWalkable(d.rack.state.x, d.rack.state.z);
  d.walkToRack();
  step(20, () => d.rackPanel.isOpen);
  out.panelOpens = d.rackPanel.isOpen;
  document.querySelector('#hud .rack-panel [data-rack-load]').click();
  out.loaded = { slots: [...d.rack.state.slots], lettuce: d.save.inventory.seaLettuce };
  d.rackPanel.close();
  step(59);
  out.readyBefore60 = d.rack.state.ready;
  step(2);
  out.readyAfter61 = d.rack.state.ready;
  d.rackPanel.open();
  document.querySelector('#hud .rack-panel [data-rack-collect]').click();
  out.kelpCollected = d.save.inventory.driedKelp;
  d.rackPanel.close();

  d.progression.state.health = 10;
  d.player.lastCombatTime = d.save.worldTime;
  const hungryStart = d.progression.state.health;
  d.player.lastCombatTime = Infinity;
  step(2);
  out.hungryRegenInCombat = +(d.progression.state.health - hungryStart).toFixed(2);
  d.openBackpack();
  d.backpack.select('material:driedKelp');
  const eatButton = document.querySelector('#hud .backpack [data-eat]');
  if (!eatButton) return out;
  eatButton.click();
  d.backpack.close();
  out.wellFed = d.isWellFed();
  out.kelpAfterEat = d.save.inventory.driedKelp;
  const fedStart = d.progression.state.health;
  step(2);
  out.fedRegenInCombat = +(d.progression.state.health - fedStart).toFixed(2);
  d.player.lastCombatTime = -100;

  Object.assign(d.save.inventory, { driedKelp: 2, shellBits: 6, driftwood: 4 });
  const claws = d.craftItem('claws', 'shellEdged');
  out.clawsCrafted = Boolean(claws) && Boolean(d.modifyItem(claws.id, 'kelp'));
  d.wearItem(claws.id);
  out.clawStats = d.playerStats();
  d.player.wellFedUntil = 0;
  const hopper = d.enemies.list.find((e) => e.kind === 'sandHopper' && e.state !== 'dead' && e.state !== 'dying');
  const spot = d.navigation.nearestWalkable(hopper.x - 1.8, hopper.z, 6);
  Object.assign(d.player, { x: spot.x, z: spot.z });
  d.progression.state.health = 15;
  d.engage(hopper);
  step(6, () => d.player.hitCount > 0);
  out.healthAfterHit = d.progression.state.health;
  out.hits = d.player.hitCount;
  step(10, () => hopper.state === 'dying' || hopper.state === 'dead');

  Object.assign(d.save.inventory, { seaLettuce: 5, driftwood: 4 });
  d.buildAtDefaultSpot('helperNest');
  const nest = d.home.state.stations.find((s) => s.kind === 'helperNest');
  nest.box.inventory.seaLettuce = 6;
  nest.box.inventory.driedKelp = 0;
  d.rack.state.slots = [null, null, null];
  d.rack.state.ready = 0;
  const helper = d.rescueHelperAt(d.helpers.strandedVisible()[0]);
  if (helper) d.helpers.setJob(helper.id, 'rack');
  out.rackHelper = Boolean(helper);
  step(150);
  out.helperResult = { storageLettuce: nest.box.inventory.seaLettuce, storageKelp: nest.box.inventory.driedKelp || 0, rack: { slots: d.rack.state.slots.map((s) => s === null ? null : +s.toFixed(2)), ready: d.rack.state.ready } };
  d.player.wellFedUntil = d.save.worldTime;
  d.persist();
  return out;
}
'''

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
    flow = page.evaluate(FLOW)
    print(json.dumps(flow))
    result = flow['helperResult']
    checks.update({
        'buildRack': flow['rackBuilt'] and flow['costPaid'] == {'driftwood': 0, 'shellBits': 0} and flow['rackBlocksGround'],
        'panelLoadsBatch': flow['panelOpens'] and flow['loaded']['slots'][0] == 0 and flow['loaded']['lettuce'] == 0,
        'driesIn60s': flow['readyBefore60'] == 0 and flow['readyAfter61'] == 1 and flow['kelpCollected'] == 1,
        'eatDoublesRegenInCombat': flow['hungryRegenInCombat'] == 0 and flow['wellFed'] and flow['kelpAfterEat'] == 0 and abs(flow['fedRegenInCombat'] - 4) < 0.15,
        'kelpClaws': flow['clawsCrafted'] and flow['clawStats']['healOnHit'] == 1 and flow['clawStats']['attack'] == 8 and flow['hits'] >= 1 and flow['healthAfterHit'] >= 16,
        'helperTendsRack': flow['rackHelper'] and result['storageLettuce'] <= 3 and (result['storageKelp'] >= 1 or result['rack']['ready'] >= 1),
    })
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reloaded = page.evaluate("() => { const d = window.__debug; return { rack: !!d.rack.state, slots: d.rack.state.slots.length, label: true }; }")
    print(json.dumps(reloaded))
    checks['saved'] = reloaded['rack'] and reloaded['slots'] == 3
    browser.close()
    checks['noErrors'] = not errors
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAIL')
