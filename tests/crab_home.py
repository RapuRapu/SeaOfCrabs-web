import os, json
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

HELPERS = r'''
window.__step = (seconds, until) => { const d = window.__debug; let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
window.__screenOf = (x, y, z) => { const d = window.__debug; const p = new d.camera.position.constructor(x, y, z).project(d.camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; };
window.__homeButtonsShown = () => !document.querySelector('#hud .home-buttons').classList.contains('hidden');
'''

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  d.setPaused(false);
  d.renderScene();
  out.startsInYard = d.isHome();
  out.buttonsInYard = window.__homeButtonsShown();
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 7, seaLettuce: 3 });
  document.querySelector('#hud .build-open').click();
  out.buildPanelOpen = d.buildPanel.isOpen;
  document.querySelector('#hud .build-panel [data-station="workshop"]').click();
  out.placing = !document.querySelector('#hud .mode-bar').classList.contains('hidden') && d.placement.station === 'workshop';
  out.farRefused = d.placementProblemAt(d.home.yard.x + 30, d.home.yard.z) === 'far';
  out.wetRefused = d.placementProblemAt(d.home.yard.x, d.home.yard.z + 30) !== null;
  const spot = d.home.defaultSpot('workshop');
  d.updateCamera(0, true);
  d.renderScene();
  return { out, spot, screen: window.__screenOf(spot.x, d.world.heightAt(spot.x, spot.z), spot.z) };
}
'''

AFTER_PLACE = r'''
() => {
  const d = window.__debug;
  const out = {};
  out.workshopBuilt = d.home.hasStation('workshop') && d.workshop.built;
  out.placingEnded = !d.placement.station && !d.placement.moving;
  out.inventoryAfterWorkshop = { ...d.save.inventory };
  out.storageBuilt = d.buildAtDefaultSpot('storage');
  out.duplicateRefused = d.buildAtDefaultSpot('storage') === false;
  const workshopStation = d.home.stationOf('workshop');
  out.crowdedRefused = d.placementProblemAt(workshopStation.x + 1, workshopStation.z) === 'crowded';
  d.walkToStation(workshopStation);
  window.__step(10, () => d.workbenchPanel.isOpen);
  out.workshopPanelOpens = d.workbenchPanel.isOpen;
  d.workbenchPanel.close();
  Object.assign(d.save.inventory, { shellBits: 8, driftwood: 4 });
  out.coneCrafted = Boolean(d.craftItem('shell', 'cone'));
  Object.assign(d.save.inventory, { shellBits: 6, seaLettuce: 2, pearls: 1 });
  const storageStation = d.home.stationOf('storage');
  d.walkToStation(storageStation);
  window.__step(10, () => d.storagePanel.isOpen);
  out.storagePanelOpens = d.storagePanel.isOpen;
  document.querySelector('#hud .storage-panel .store-all').click();
  out.storedInventory = { ...d.storage.inventory };
  out.storedShellKinds = d.storage.shells.map((item) => item.kind);
  d.storagePanel.select('material:pearls', 'storage');
  document.querySelector('#hud .storage-panel [data-take="pearls"]').click();
  out.pearlTaken = d.save.inventory.pearls === 1 && !d.storage.inventory.pearls;
  d.storagePanel.close();
  const before = { x: storageStation.x, z: storageStation.z };
  d.startMovingStructure(storageStation);
  const target = d.home.defaultSpot('ropeWalk');
  d.previewPlacement(target.x, target.z);
  d.previewPlacement(target.x, target.z);
  out.storageMoved = Math.hypot(storageStation.x - before.x, storageStation.z - before.z) > 2 && !d.placement.moving;
  const away = d.navigation.nearestWalkable(d.home.yard.x - 40, d.home.yard.z, 10);
  Object.assign(d.player, { x: away.x, z: away.z });
  window.__step(0.2);
  out.buttonsHiddenAway = !window.__homeButtonsShown() && !d.isHome();
  Object.assign(d.save.inventory, { driftwood: 2 });
  d.die();
  window.__step(3);
  out.wokeAtHome = d.isHome();
  out.remainsCount = d.remains.list.length;
  out.remainsHasPearl = d.remains.list.some((entry) => entry.inventory.pearls === 1);
  out.storageKept = d.storage.inventory.shellBits >= 6 && d.storage.shells.some((item) => item.kind === 'cone');
  d.setRendering(true);
  d.renderScene();
  d.setRendering(false);
  out.homeCalls = d.renderer.info.render.calls;
  d.persist();
  return out;
}
'''

SAFE_YARD = r'''
() => {
  const d = window.__debug;
  const yard = d.home.yard;
  const crab = d.enemies.spawn('shoreCrab', yard.x, yard.z + yard.radius + 6);
  for (const other of d.enemies.list) if (other !== crab) Object.assign(other, { state: 'dead', respawnTimer: 999 });
  const near = d.navigation.nearestWalkable(yard.x, yard.z + yard.radius + 3, 6);
  Object.assign(d.player, { x: near.x, z: near.z });
  window.__step(6);
  d.engage(crab);
  window.__step(1.5, () => crab.state === 'chase');
  const chased = crab.state === 'chase';
  const inside = d.navigation.nearestWalkable(yard.x, yard.z, 6);
  Object.assign(d.player, { x: inside.x, z: inside.z });
  let deepest = Infinity;
  window.__step(8, () => { deepest = Math.min(deepest, Math.hypot(crab.x - yard.x, crab.z - yard.z)); return false; });
  return { chased, gaveUp: crab.state !== 'chase', stayedOut: deepest > yard.radius - 0.5, deepest };
}
'''

RELOADED = r'''
() => {
  const d = window.__debug;
  return { version: d.save.version, stations: d.home.state.stations.map((s) => s.kind).sort(), storageShells: d.storage.shells.length, storedBits: d.storage.inventory.shellBits || 0, inYard: d.home.state.stations.every((s) => d.home.isInYard(s.x, s.z)) };
}
'''

V3_SAVE = {'version': 3, 'x': 13, 'z': -21, 'heading': 2.3, 'worldTime': 260, 'inventory': {'shellBits': 2}, 'nodes': None, 'goalAnnounced': True, 'hasMoved': True, 'wetness': 0, 'wetHeight': 0, 'gear': {'nextId': 4, 'shells': [{'id': 1, 'kind': 'snail', 'enchant': 0}, {'id': 3, 'kind': 'turban', 'enchant': 2}], 'claws': [{'id': 2, 'kind': 'bare', 'enchant': 0}], 'wornShellId': 3, 'wornClawsId': 2}, 'workshopBuilt': True, 'craftedOnce': True, 'progression': None, 'remains': []}

V7_SAVE = {'version': 7, 'x': 1003, 'z': 3, 'heading': 0, 'worldTime': 300, 'inventory': {'shellBits': 3}, 'nodes': None, 'goalAnnounced': True, 'hasMoved': True, 'wetness': 0, 'wetHeight': 0, 'gear': None, 'workshopBuilt': True, 'craftedOnce': True, 'progression': None, 'remains': [], 'looters': [],
           'burrow': {'entrance': {'x': 24, 'z': -21}, 'entranceClosed': False, 'dug': [1, 2], 'grid': 31, 'stations': [
               {'kind': 'workshop', 'column': 6, 'row': 5, 'id': 1}, {'kind': 'storage', 'column': 4, 'row': 5, 'id': 2},
               {'kind': 'helperNest', 'column': 4, 'row': 6, 'id': 3, 'box': {'inventory': {'driftwood': 4}, 'shells': [], 'claws': []}},
               {'kind': 'exit', 'column': 2, 'row': 4, 'id': 4, 'surface': {'x': 0, 'z': -30}, 'access': {'column': 3, 'row': 4}, 'keep': []},
               {'kind': 'exit', 'column': 8, 'row': 4, 'id': 6, 'surface': {'x': 30, 'z': -30}, 'access': {'column': 7, 'row': 4}, 'keep': []},
               {'kind': 'crabBed', 'column': 7, 'row': 6, 'id': 5}]},
           'storage': {'inventory': {'seaLettuce': 5}, 'shells': [], 'claws': []}, 'underground': True,
           'helpers': {'list': [{'id': 1, 'spotId': 'beachPool', 'nestId': 3, 'job': 'shellBits'}], 'rescued': ['beachPool']}, 'fog': None}

def wait_frames(page, count=3):
    page.evaluate(f'() => new Promise(r => {{ let n = 0; const f = () => (++n >= {count} ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }})')

def fresh_page(context, errors):
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    with page.expect_navigation(timeout=180000):
        page.evaluate('() => { setTimeout(() => window.__debug.startOver(), 0); }')
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate(HELPERS)
    return page

def migrated_page(browser, save, errors):
    context = browser.new_context(viewport={'width': 915, 'height': 412})
    context.add_init_script(f"if (!sessionStorage.getItem('seeded')) {{ sessionStorage.setItem('seeded', '1'); localStorage.setItem('seaofcrabs-crab-save', JSON.stringify({json.dumps(save)})); }}")
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    return context, page

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    checks = {}
    context = browser.new_context(viewport={'width': 915, 'height': 412})
    page = fresh_page(context, errors)
    flow = page.evaluate(FLOW)
    print(json.dumps(flow))
    for _ in range(2):
        page.mouse.click(flow['screen']['x'], flow['screen']['y'])
        wait_frames(page)
    after = page.evaluate(AFTER_PLACE)
    print(json.dumps(after))
    first = flow['out']
    checks.update({
        'startsHome': first['startsInYard'] and first['buttonsInYard'],
        'buildPanelPlacement': first['buildPanelOpen'] and first['placing'] and after['workshopBuilt'] and after['placingEnded'] and after['inventoryAfterWorkshop'].get('shellBits') == 0,
        'placementRules': first['farRefused'] and first['wetRefused'] and after['crowdedRefused'],
        'storageStation': after['storageBuilt'] and after['duplicateRefused'],
        'stationsOpen': after['workshopPanelOpens'] and after['storagePanelOpens'],
        'storeAll': after['storedInventory'].get('shellBits') == 6 and 'cone' in after['storedShellKinds'],
        'takeMaterial': after['pearlTaken'],
        'moveStation': after['storageMoved'],
        'homeButtonsOnlyAtHome': after['buttonsHiddenAway'],
        'deathWakesAtHomeStorageSafe': after['wokeAtHome'] and after['remainsCount'] == 1 and after['remainsHasPearl'] and after['storageKept'],
    })
    safe = page.evaluate(SAFE_YARD)
    print(json.dumps(safe))
    checks['enemiesStayOutOfYard'] = safe['chased'] and safe['gaveUp'] and safe['stayedOut']
    page.evaluate('() => window.__debug.persist()')
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reloaded = page.evaluate(RELOADED)
    print(json.dumps(reloaded))
    checks['saved'] = reloaded == {'version': 8, 'stations': ['storage', 'workshop'], 'storageShells': 1, 'storedBits': 6, 'inYard': True}
    context.close()

    old_context, old = migrated_page(browser, V3_SAVE, errors)
    migrated = old.evaluate('''() => { const d = window.__debug; return { stations: d.home.state.stations.map((s) => s.kind), inYard: d.home.state.stations.every((s) => d.home.isInYard(s.x, s.z)), worn: d.gear.wornShell().kind, quality: d.gear.wornShell().quality }; }''')
    print(json.dumps(migrated))
    checks['migratesV3'] = migrated == {'stations': ['workshop'], 'inYard': True, 'worn': 'turban', 'quality': 'fine'}
    old_context.close()

    burrow_context, burrow = migrated_page(browser, V7_SAVE, errors)
    moved = burrow.evaluate('''() => { const d = window.__debug; const nest = d.home.stationOf('helperNest'); const helper = d.helpers.list[0]; window.__step = (seconds, until) => { for (let t = 0; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) return; } };
      const out = { version: d.save.version, stations: d.home.state.stations.map((s) => s.kind).sort(), ids: d.home.state.stations.map((s) => s.id).sort(), inYard: d.home.state.stations.every((s) => d.home.isInYard(s.x, s.z)), nestBox: nest.box.inventory.driftwood, exitRefund: d.storage.inventory.driftwood, playerHome: d.isHome(), noLegacyKeys: !('burrow' in d.save) && !('underground' in d.save) };
      window.__step(60, () => (nest.box.inventory.shellBits || 0) > 0);
      out.helperDelivered = (nest.box.inventory.shellBits || 0) > 0;
      return out; }''')
    print(json.dumps(moved))
    checks['migratesBurrowToYard'] = moved['version'] == 8 and moved['stations'] == ['crabBed', 'helperNest', 'storage', 'workshop'] and moved['ids'] == [1, 2, 3, 5] and moved['inYard'] and moved['nestBox'] == 4 and moved['exitRefund'] == 4 and moved['playerHome'] and moved['noLegacyKeys']
    checks['helpersWorkFromYard'] = moved['helperDelivered']
    burrow_context.close()

    mobile = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True, device_scale_factor=2)
    touch = fresh_page(mobile, errors)
    touch.evaluate('() => { const d = window.__debug; Object.assign(d.save.inventory, { driftwood: 4 }); d.renderScene(); }')
    touch.tap('#hud .build-open')
    touch.tap('#hud .build-panel [data-station="storage"]')
    screen = touch.evaluate('() => { const d = window.__debug; const spot = d.home.defaultSpot("storage"); d.updateCamera(0, true); d.renderScene(); return window.__screenOf(spot.x, d.world.heightAt(spot.x, spot.z), spot.z); }')
    touch.touchscreen.tap(screen['x'], screen['y'])
    previewed = touch.evaluate('() => !window.__debug.home.hasStation("storage") && document.querySelector("#hud .mode-text").textContent.includes("again")')
    touch.touchscreen.tap(screen['x'], screen['y'])
    built_by_touch = touch.evaluate('() => window.__debug.home.hasStation("storage")')
    checks['touchPlacement'] = previewed and built_by_touch
    print(json.dumps({'touchPreview': previewed, 'touchBuilt': built_by_touch}))
    mobile.close()
    browser.close()

    checks['noErrors'] = not errors
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAIL')
