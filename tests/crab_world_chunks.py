import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

SNAPSHOT = r'''
() => {
  const d = window.__debug;
  const spots = d.life.anemoneSpotsNear(18, 8, 60).map((spot) => `${spot.x.toFixed(3)},${spot.z.toFixed(3)}`);
  return spots.join(';');
}
'''

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  d.setPaused(true);
  const blades = () => d.scene.children.filter((child) => child.geometry && child.geometry.isInstancedBufferGeometry && child.geometry.attributes.aBlade).map((child) => child.geometry.instanceCount);
  Object.assign(d.player, { x: 0, z: 0 });
  d.updateCamera(0, true);
  const atHome = blades();
  Object.assign(d.player, { x: 0, z: -110 });
  d.updateCamera(0, true);
  const onDunes = blades();
  Object.assign(d.player, { x: 0, z: 0 });
  d.updateCamera(0, true);
  const backHome = blades();
  out.bladesRestream = onDunes.join() !== atHome.join() && backHome.join() === atHome.join();
  out.grassOnDunes = onDunes[1] > atHome[1];

  const idle = d.enemies.list.find((enemy) => enemy.kind === 'sandHopper' && enemy.state === 'idle');
  Object.assign(d.player, { x: idle.x + 200, z: idle.z });
  const before = { x: idle.x, z: idle.z, wanderTimer: idle.wanderTimer };
  d.setPaused(false);
  for (let step = 0; step < 600; step++) d.simulate(1 / 60);
  out.farEnemyRests = idle.x === before.x && idle.z === before.z && idle.wanderTimer === before.wanderTimer;
  Object.assign(d.player, { x: idle.x + 30, z: idle.z });
  for (let step = 0; step < 600; step++) d.simulate(1 / 60);
  out.nearEnemyWakes = idle.wanderTimer !== before.wanderTimer || idle.x !== before.x;
  out.resourcesScaleWithArea = d.resources.nodes.filter((node) => node.type === 'shellBits').length > 16 && d.resources.nodes.filter((node) => node.type === 'scrap').length === 10;
  return out;
}
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    snapshots = []
    for run in range(2):
        page = browser.new_page(viewport={'width': 915, 'height': 412})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(URL)
        page.wait_for_function('!!window.__debug', timeout=180000)
        snapshots.append(page.evaluate(SNAPSHOT))
        if run == 0:
            out = page.evaluate(FLOW)
        page.close()
    out['sameAfterReload'] = snapshots[0] == snapshots[1] and len(snapshots[0]) > 0
    print(json.dumps(out, indent=1))
    ok = all(out.values()) and not errors
    print('errors', errors)
    print('ALL PASS' if ok else 'FAIL')
    browser.close()
    sys.exit(0 if ok else 1)
