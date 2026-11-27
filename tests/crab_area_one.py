import os, json, sys, base64
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  const tideAt = (seconds) => { d.save.worldTime = seconds; d.simulate(1 / 60); };
  const home = { x: d.player.x, z: d.player.z };
  const holdDoor = d.navigation.nearestWalkable(290, -20, 10);
  tideAt(120);
  out.highTideBlocksHold = d.navigation.findPath(home.x, home.z, holdDoor.x, holdDoor.z).length === 0;
  tideAt(360);
  out.lowTideOpensHold = d.navigation.findPath(home.x, home.z, holdDoor.x, holdDoor.z).length > 0;
  out.sandbarIsTidal = d.world.isTidal(192, 22);
  let highestThalweg = -99;
  for (let z = -256; z <= 200; z += 1) {
    const point = d.world.thalwegPointAt(z);
    if (d.world.isNearCrossing(point.x, point.z, 8)) continue;
    highestThalweg = Math.max(highestThalweg, d.world.heightAt(point.x, point.z));
  }
  out.channelOnlyCrossableAtSandbar = highestThalweg < -6.2;
  const velvet = d.enemies.list.filter((enemy) => enemy.kind === 'velvetCrab');
  out.velvetCrabsInChannel = velvet.length >= 6 && velvet.every((enemy) => d.world.channelInfluenceAt(enemy.x, enemy.z) > 0.3);
  out.pearlsOnSideBars = d.resources.nodes.filter((node) => node.type === 'pearls' && !node.gathered && d.world.channelInfluenceAt(node.x, node.z) > 0.4).length >= 3;
  out.campReachable = d.navigation.findPath(home.x, home.z, -240, -150).length > 0;
  out.deepReefReachable = d.navigation.findPath(home.x, home.z, -250, 150).length > 0;

  Object.assign(d.player, { x: 192, z: 22, path: [], pathIndex: 0 });
  d.setPaused(false);
  d.save.worldTime = 445;
  for (let step = 0; step < 600; step++) d.simulate(1 / 60);
  out.washedOffSandbar = !d.world.isTidal(d.player.x, d.player.z) && [...document.querySelectorAll('#hud .game-log .log-line')].some((line) => line.textContent.includes('swept you off the sandbar'));

  const gulls = d.enemies.list.filter((enemy) => enemy.kind === 'gull');
  out.twoGulls = gulls.length === 2 && Math.abs(gulls[0].home.x - gulls[1].home.x) > 150;
  out.mapOpens = (() => { d.openMap(); const canvas = document.querySelector('#hud .map-canvas'); const open = canvas && canvas.width > 0; d.mapView.close(); return Boolean(open); })();
  return out;
}
'''

MIGRATED = r'''
() => {
  const d = window.__debug;
  return {
    version: d.save.version,
    homeStillRevealed: d.fog.isRevealed(13, -21),
    farWestHidden: !d.fog.isRevealed(-330, 0),
    remainsMovedToCamp: d.remains.list.length === 1 && Math.hypot(d.remains.list[0].x + 262, d.remains.list[0].z + 168) < 0.01,
    playerMovedWithCamp: Math.hypot(d.player.x + 260, d.player.z + 172) < 8,
  };
}
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    page = browser.new_page(viewport={'width': 915, 'height': 412})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    out = page.evaluate(FLOW)
    page.close()

    old_fog = base64.b64encode(bytes([255]) * (256 * 256 // 8)).decode()
    legacy_save = {'version': 6, 'x': -88, 'z': -64, 'heading': 0, 'worldTime': 260, 'inventory': {}, 'nodes': None, 'hasMoved': True, 'fog': old_fog, 'remains': [{'x': -90, 'z': -60, 'inventory': {'shellBits': 2}, 'gear': {'shells': [], 'claws': [], 'wornShellId': None, 'wornClawsId': None}}]}
    legacy = browser.new_context(viewport={'width': 915, 'height': 412})
    legacy.add_init_script(f"if (!sessionStorage.getItem('seeded')) {{ sessionStorage.setItem('seeded', '1'); localStorage.setItem('seaofcrabs-crab-save', JSON.stringify({json.dumps(legacy_save)})); }}")
    old = legacy.new_page()
    old.on('pageerror', lambda error: errors.append(str(error)))
    old.goto(URL)
    old.wait_for_function('!!window.__debug', timeout=180000)
    migrated = old.evaluate(MIGRATED)
    out.update(migrated)
    out['version'] = migrated['version'] == 7
    print(json.dumps(out, indent=1))
    ok = all(out.values()) and not errors
    print('errors', errors)
    print('ALL PASS' if ok else 'FAIL')
    browser.close()
    sys.exit(0 if ok else 1)
