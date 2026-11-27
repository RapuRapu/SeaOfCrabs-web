import os, json
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

FLOW = r'''
() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const out = {};
  const q = (selector) => document.querySelector(selector);
  d.setPaused(false);

  const craftKeys = () => [...document.querySelectorAll('#hud .workshop-panel [data-craft]')].map((b) => b.dataset.craft);
  Object.assign(d.save.inventory, { shellBits: 40, driftwood: 20, seaLettuce: 3 });
  d.buildWorkshop();
  d.save.inventory.seaLettuce = 0;
  d.save.inventory.driftwood = 0;
  d.save.discovered = [];
  d.workbenchPanel.open();
  out.craftStart = craftKeys();
  out.undiscoveredHint = Boolean(q('#hud .workshop-panel .undiscovered'));
  d.workbenchPanel.close();
  d.save.inventory.coral = 1;
  d.workbenchPanel.open();
  out.craftWithCoral = craftKeys();
  d.workbenchPanel.close();
  d.save.inventory.coral = 0;
  d.persist();
  d.workbenchPanel.open();
  out.craftAfterSpendingCoral = craftKeys();
  d.workbenchPanel.close();

  Object.assign(d.save.inventory, { driftwood: 20, shellBits: 40 });
  d.goHome();
  const before = { ...d.save.inventory };
  d.buildAtDefaultSpot('storage');
  const storage = d.home.stationOf('storage');
  d.storage.inventory.shellBits = 2;
  d.storagePanel.open();
  q('#hud .storage-panel [data-structure-dismantle]').click();
  q('#hud .storage-panel [data-structure-dismantle]').click();
  out.storageNotEmptyKept = d.home.hasStation('storage');
  d.storage.inventory.shellBits = 0;
  d.storagePanel.render();
  q('#hud .storage-panel [data-structure-move]').click();
  out.moveMode = Boolean(d.placement.moving) && !d.storagePanel.isOpen;
  const target = d.home.defaultSpot('grinder');
  out.moved = d.moveStructureTo(target.x, target.z);
  d.cancelPlacement();
  out.movedSaved = d.save.home.stations.find((s) => s.kind === 'storage');
  out.movedTarget = target;
  d.storagePanel.open();
  const dismantle = q('#hud .storage-panel [data-structure-dismantle]');
  dismantle.click();
  out.armedText = dismantle.textContent;
  out.afterOneTap = d.home.hasStation('storage');
  d.storagePanel.render();
  out.armedSurvivesRender = q('#hud .storage-panel [data-structure-dismantle]').classList.contains('armed');
  q('#hud .storage-panel [data-structure-dismantle]').click();
  out.storageGone = !d.home.hasStation('storage');
  out.storageRefund = d.save.inventory.driftwood - (before.driftwood - 4);

  const wbBefore = { ...d.save.inventory };
  out.workshopGone = d.dismantleStructure('workshop') && !d.home.hasStation('workshop') && !d.workshop.built;
  out.workshopRefund = ['shellBits', 'driftwood', 'seaLettuce'].map((t) => (d.save.inventory[t] || 0) - (wbBefore[t] || 0));

  Object.assign(d.save.inventory, { driftwood: 10, shellBits: 10, seaLettuce: 6 });
  d.buildAtDefaultSpot('dryingRack');
  d.rack.load();
  d.rack.state.ready = 2;
  const oldRack = { x: d.rack.state.x, z: d.rack.state.z };
  d.startMovingStructure('dryingRack');
  out.rackFarRejected = !d.moveStructureTo(d.home.yard.x + 40, d.home.yard.z);
  const rackTarget = d.home.defaultSpot('ropeWalk');
  const movedRack = d.moveStructureTo(rackTarget.x, rackTarget.z);
  d.cancelPlacement();
  out.rackMoved = movedRack && (d.rack.state.x !== oldRack.x || d.rack.state.z !== oldRack.z);
  out.oldRackUnblocked = d.world.isWalkable(oldRack.x, oldRack.z) || Math.hypot(oldRack.x - d.rack.state.x, oldRack.z - d.rack.state.z) < 2.6;
  out.newRackBlocked = !d.world.isWalkable(d.rack.state.x, d.rack.state.z);
  const rackBefore = { ...d.save.inventory };
  const rackSpot = { x: d.rack.state.x, z: d.rack.state.z };
  out.rackGone = d.dismantleStructure('dryingRack') && !d.rack.exists;
  out.rackRefund = ['driftwood', 'shellBits', 'seaLettuce', 'driedKelp'].map((t) => (d.save.inventory[t] || 0) - (rackBefore[t] || 0));
  out.rackSpotFree = d.world.isWalkable(rackSpot.x, rackSpot.z);

  Object.assign(d.save.inventory, { shellBits: 20, driftwood: 10 });
  const spare = d.craftItem('claws', 'shellEdged');
  const worn = d.craftItem('shell', 'snail');
  d.wearItem(worn.id);
  d.openBackpack();
  d.backpack.select(`item:${worn.id}`);
  out.wornHasSalvage = Boolean(q('#hud .backpack [data-salvage]'));
  d.backpack.select(`item:${spare.id}`);
  const salvageButton = q('#hud .backpack [data-salvage]');
  out.salvageLabel = salvageButton && salvageButton.textContent;
  const bagBefore = { ...d.save.inventory };
  salvageButton.click();
  out.afterOneSalvageTap = Boolean(d.gear.findItem(spare.id));
  q('#hud .backpack [data-salvage]').click();
  out.salvaged = !d.gear.findItem(spare.id);
  out.salvageRefund = { shellBits: d.save.inventory.shellBits - bagBefore.shellBits, driftwood: d.save.inventory.driftwood - bagBefore.driftwood };
  d.backpack.close();
  d.gear.grant('claws', 'cleaver');
  const cleaver = d.gear.state.claws.find((c) => c.kind === 'cleaver');
  const scrapBefore = d.save.inventory.scrap || 0;
  const cleaverRefund = d.salvageItem(cleaver.id);
  out.cleaverRefund = cleaverRefund;
  out.wornSalvageRefused = d.salvageItem(worn.id) === null;
  d.persist();
  return out;
}
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    context = browser.new_context(viewport={'width': 915, 'height': 412})
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    with page.expect_navigation(timeout=180000):
        page.evaluate('() => { setTimeout(() => window.__debug.startOver(), 0); }')
    page.wait_for_function('!!window.__debug', timeout=180000)
    flow = page.evaluate(FLOW)
    print(json.dumps(flow))
    checks = {
        'startHidesUndiscovered': 'shell:snail' in flow['craftStart'] and 'shell:coral' not in flow['craftStart'] and 'claws:cleaver' not in flow['craftStart'] and 'shell:turban' not in flow['craftStart'] and flow['undiscoveredHint'],
        'materialRevealsRecipe': 'shell:coral' in flow['craftWithCoral'] and 'claws:coralTipped' in flow['craftWithCoral'] and 'shell:whelk' in flow['craftWithCoral'],
        'discoveryRemembered': 'shell:coral' in flow['craftAfterSpendingCoral'],
        'storageMustBeEmpty': flow['storageNotEmptyKept'],
        'storageMoves': flow['moveMode'] and flow['moved'] and abs(flow['movedSaved']['x'] - flow['movedTarget']['x']) < 0.01 and abs(flow['movedSaved']['z'] - flow['movedTarget']['z']) < 0.01,
        'dismantleNeedsTwoTaps': flow['armedSurvivesRender'] and flow['afterOneTap'] and 'again' in flow['armedText'] and flow['storageGone'] and flow['storageRefund'] == 4,
        'workshopDismantle': flow['workshopGone'] and flow['workshopRefund'] == [5, 3, 3],
        'rackMoves': flow['rackMoved'] and flow['oldRackUnblocked'] and flow['newRackBlocked'] and flow['rackFarRejected'],
        'rackDismantle': flow['rackGone'] and flow['rackRefund'] == [4, 2, 3, 2] and flow['rackSpotFree'],
        'salvage': not flow['wornHasSalvage'] and flow['afterOneSalvageTap'] and flow['salvaged'] and flow['salvageRefund'] == {'shellBits': 3, 'driftwood': 2},
        'cleaverGivesScrap': flow['cleaverRefund'] == {'scrap': 3},
        'wornNotSalvaged': flow['wornSalvageRefused'],
    }
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reloaded = page.evaluate("() => { const d = window.__debug; return { stations: d.save.home.stations.length, rack: d.rack.exists, discovered: d.save.discovered.includes('coral') }; }")
    print(json.dumps(reloaded))
    checks['saved'] = reloaded == {'stations': 0, 'rack': False, 'discovered': True}
    browser.close()
    checks['noErrors'] = not errors
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAIL')
