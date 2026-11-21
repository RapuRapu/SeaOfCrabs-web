import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

START_FIGHT = r'''
(cameraDistance) => {
  const d = window.__debug;
  d.setPaused(false);
  d.progression.setLevel(11);
  const cat = d.enemies.list.find((enemy) => enemy.kind === 'shipCat');
  const spot = d.navigation.nearestWalkable(cat.home.x + 4, cat.home.z, 8);
  Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0 });
  d.enemies.spawn('shipCat', cat.home.x, cat.home.z);
  d.enemies.startChase(cat);
  d.engage(cat);
  for (let time = 0; time < 3; time += 1 / 60) d.simulate(1 / 60);
  d.progression.state.health = d.progression.maxHealth();
  d.setCameraDistance(cameraDistance);
  d.updateCamera(0, true);
  const project = (x, y, z) => {
    const point = new d.camera.position.constructor(x, y, z).project(d.camera);
    return [(point.x + 1) / 2 * innerWidth, (1 - point.y) / 2 * innerHeight];
  };
  const catScreen = project(cat.x, cat.y + cat.definition.radius * 0.8, cat.z);
  const playerScreen = project(d.player.x, d.player.y, d.player.z);
  return { catScreen, playerScreen };
}
'''

AFTER_TAP = r'''
() => {
  const d = window.__debug;
  const before = [d.player.x, d.player.z];
  const fighting = Boolean(d.player.combatTarget);
  for (let time = 0; time < 1.5; time += 1 / 60) d.simulate(1 / 60);
  return { fighting, moved: Math.hypot(d.player.x - before[0], d.player.z - before[1]) };
}
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 412, 'height': 915}, has_touch=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    results = {}
    for name, distance in [('zoomedOut', 70), ('default', 30)]:
        screens = page.evaluate(START_FIGHT, distance)
        cat_x, cat_y = screens['catScreen']
        away_x, away_y = screens['playerScreen'][0] - cat_x, screens['playerScreen'][1] - cat_y
        length = max(1, (away_x ** 2 + away_y ** 2) ** 0.5)
        tap_x = min(400, max(12, cat_x + away_x / length * 100))
        tap_y = min(700, max(80, cat_y + away_y / length * 100))
        page.touchscreen.tap(tap_x, tap_y)
        results[name + 'Away'] = page.evaluate(AFTER_TAP)
        screens = page.evaluate(START_FIGHT, distance)
        page.touchscreen.tap(*screens['catScreen'])
        results[name + 'OnCat'] = page.evaluate(AFTER_TAP)
    print(json.dumps(results, indent=1))
    ok = not errors
    for name in ('zoomedOut', 'default'):
        ok &= not results[name + 'Away']['fighting'] and results[name + 'Away']['moved'] > 1.5
        ok &= results[name + 'OnCat']['fighting']
    print('errors', errors)
    print('PASS' if ok else 'FAIL')
    browser.close()
    sys.exit(0 if ok else 1)
