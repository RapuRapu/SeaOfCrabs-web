import os, json, sys
from playwright.sync_api import sync_playwright

BASE = 'file://' + os.path.abspath('dist/index.html')
URL = BASE + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

TERRAIN = r'''
() => {
  const d = window.__debug;
  const w = d.world;
  const out = {};
  const heights = [];
  let reefCells = 0, walkableReefCells = 0;
  for (let x = -112; x <= 112; x += 2) for (let z = 44; z <= 116; z += 2) {
    if (!w.isOnReef(x, z)) continue;
    reefCells++;
    if (!w.isWalkable(x, z)) continue;
    walkableReefCells++;
    heights.push(w.heightAt(x, z));
  }
  heights.sort((a, b) => a - b);
  const quantile = (share) => +heights[Math.floor(share * (heights.length - 1))].toFixed(2);
  out.walkableShare = +(walkableReefCells / reefCells).toFixed(2);
  out.heights = { p05: quantile(0.05), p50: quantile(0.5), p95: quantile(0.95), max: quantile(1) };
  out.exposedAtLowTide = +(heights.filter((h) => h > d.seaLevelAt(480 * 0.75)).length / heights.length).toFixed(2);
  out.submergedAtMidTide = +(heights.filter((h) => h < -0.9).length / heights.length).toFixed(2);
  let dropBlocked = 0, dropSamples = 0;
  for (let x = -100; x <= 100; x += 10) { dropSamples++; if (!w.isWalkable(x, 116) && w.heightAt(x, 116) < -5) dropBlocked++; }
  out.dropBlocked = `${dropBlocked}/${dropSamples}`;
  out.reefPools = w.pools.filter((p) => p.onReef).map((p) => ({ x: p.x, z: p.z, retained: +p.retainedLevel.toFixed(2), centerDepth: +(w.retained.levelAt(p.x, p.z) - w.heightAt(p.x, p.z)).toFixed(2), holdsAtLowTide: p.retainedLevel > d.seaLevelAt(480 * 0.75) }));
  d.save.worldTime = 300; d.simulate(1 / 60);
  const home = { x: d.player.x, z: d.player.z };
  const targets = [[0, 80], [-250, 160], [80, 92], [20, 104], [-100, 70]];
  out.paths = targets.map(([x, z]) => { const spot = d.navigation.nearestWalkable(x, z, 8); const path = spot ? d.navigation.findPath(home.x, home.z, spot.x, spot.z) : []; return { x, z, length: path.length }; });
  const props = w.reefProps;
  out.props = Object.fromEntries(Object.entries(props).map(([kind, list]) => [kind, list.length]));
  out.urchinsBlock = props.urchin.every((u) => !w.isWalkable(u.x, u.z));
  const nodes = d.resources.nodes;
  const reefNodes = nodes.filter((n) => n.type === 'coral' || n.type === 'seaGlass');
  out.reefNodeCounts = { coral: reefNodes.filter((n) => n.type === 'coral').length, seaGlass: reefNodes.filter((n) => n.type === 'seaGlass').length };
  out.reefNodesOnReef = reefNodes.every((n) => w.isOnReef(n.x, n.z));
  out.reefNodesReachable = reefNodes.filter((n) => { const spot = d.navigation.nearestWalkable(n.x, n.z, 4); return spot && d.navigation.findPath(home.x, home.z, spot.x, spot.z).length > 0; }).length;
  const starter = nodes.find((n) => n.id === 'coral-0');
  out.starterCoral = { x: starter.x, z: starter.z };
  out.homeItemsOffReef = nodes.filter((n) => ['shellBits', 'seaLettuce', 'pearls'].includes(n.type) && w.isOnReef(n.x, n.z)).length;
  out.shoreCrabsOffReef = d.enemies.list.filter((e) => e.kind === 'shoreCrab' && w.isOnReef(e.x, e.z)).length;
  return out;
}
'''

FLOW = r'''
async () => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const out = {};
  d.setPaused(false);
  Object.assign(d.save.inventory, { shellBits: 8, driftwood: 3, seaLettuce: 3 });
  d.buildWorkshop();
  d.save.inventory.shellBits = 3;
  d.craftItem('shell', 'snail');
  if (d.isUnderground()) d.exitBurrow();
  const nearestCoral = d.resources.nodes.filter((node) => node.type === 'coral' && !node.gathered).sort((a, b) => Math.hypot(a.x - d.player.x, a.z - d.player.z) - Math.hypot(b.x - d.player.x, b.z - d.player.z))[0];
  d.setDestination(nearestCoral.x, nearestCoral.z, nearestCoral);
  out.walksToCoral = d.player.path.length > 0 && d.player.gatherTarget && d.player.gatherTarget.type === 'coral';
  const target = d.player.gatherTarget;
  out.walkSeconds = +step(180, () => target.gathered).toFixed(1);
  out.reefFound = d.save.reefFound;
  out.coralInBag = d.save.inventory.coral || 0;
  const glass = d.resources.nodes.find((n) => n.type === 'seaGlass' && !n.gathered);
  d.enemies.calmAll(1e6, d.simulationTime());
  d.setDestination(glass.x, glass.z, glass);
  out.glassSeconds = +step(240, () => glass.gathered).toFixed(1);
  out.glassInBag = d.save.inventory.seaGlass || 0;
  out.backpackRows = (() => { d.openBackpack(); const rows = [...document.querySelectorAll('#hud .backpack .slot-grid [data-material]')].map((m) => m.dataset.material); d.backpack.close(); return rows; })();
  const returned = d.resources.washAshore({ x: d.player.x, z: d.player.z });
  out.washedBack = returned;
  out.washedOnReef = [target, glass].every((n) => !n.gathered && d.world.isOnReef(n.x, n.z));
  d.persist();
  return out;
}
'''

def fresh_page(context, errors, url=URL):
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
    page.goto(url)
    page.wait_for_function('!!window.__debug', timeout=180000)
    with page.expect_navigation(timeout=180000):
        page.evaluate('() => { setTimeout(() => window.__debug.startOver(), 0); }')
    page.wait_for_function('!!window.__debug', timeout=180000)
    return page

def frame_numbers(context, pose):
    page = context.new_page()
    page.goto(f'{BASE}?pose={pose}&quality=high')
    page.wait_for_function('!!window.__frameReady', timeout=240000)
    numbers = page.evaluate('() => window.__frameReady')
    page.close()
    return numbers

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    checks = {}
    context = browser.new_context(viewport={'width': 915, 'height': 412})
    page = fresh_page(context, errors)
    terrain = page.evaluate(TERRAIN)
    print(json.dumps(terrain))
    checks['plateauHeights'] = -3.6 < terrain['heights']['p05'] and terrain['heights']['max'] <= -1.1 and 0.15 <= terrain['exposedAtLowTide'] <= 0.5 and terrain['submergedAtMidTide'] > 0.95
    checks['walkableAndReachable'] = terrain['walkableShare'] > 0.7 and all(p['length'] > 0 for p in terrain['paths'])
    checks['dropOffEdge'] = terrain['dropBlocked'] == '21/21'
    checks['reefPoolsHoldWater'] = len(terrain['reefPools']) == 5 and all(p['holdsAtLowTide'] and p['centerDepth'] > 2 for p in terrain['reefPools'])
    checks['props'] = terrain['props'] == {'brainCoral': 135, 'barnacleRock': 117, 'branchCoral': 324, 'urchin': 180} and terrain['urchinsBlock']
    checks['reefResources'] = terrain['reefNodeCounts'] == {'coral': 56, 'seaGlass': 38} and terrain['reefNodesOnReef'] and terrain['reefNodesReachable'] == 94 and abs(terrain['starterCoral']['x'] - 14) < 0.01
    checks['beachUnchanged'] = terrain['homeItemsOffReef'] == 0 and terrain['shoreCrabsOffReef'] == 0
    flow = page.evaluate(FLOW)
    print(json.dumps(flow))
    checks['findReef'] = flow['walksToCoral'] and flow['reefFound']
    checks['gatherReefItems'] = flow['coralInBag'] == 1 and flow['glassInBag'] == 1 and 'coral' in flow['backpackRows'] and 'seaGlass' in flow['backpackRows']
    checks['tideReturns'] = flow['washedBack'] >= 2 and flow['washedOnReef']
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reloaded = page.evaluate("() => { const d = window.__debug; return { reefFound: d.save.reefFound, coral: d.save.inventory.coral, seaGlass: d.save.inventory.seaGlass }; }")
    print(json.dumps(reloaded))
    checks['saved'] = reloaded == {'reefFound': True, 'coral': 1, 'seaGlass': 1}
    performance = {'start': frame_numbers(context, 1), 'onReef': frame_numbers(context, 59), 'reefEdge': frame_numbers(context, 64)}
    print(json.dumps(performance))
    checks['performance'] = performance['start']['calls'] <= 90 and performance['start']['triangles'] < 1215000 and all(performance[view]['calls'] <= 104 and performance[view]['triangles'] < 1550000 for view in ('onReef', 'reefEdge'))
    checks['noConsoleErrors'] = not errors
    if errors: print(errors[:5])
    browser.close()

print(json.dumps(checks, indent=1))
sys.exit(0 if all(checks.values()) else 1)
