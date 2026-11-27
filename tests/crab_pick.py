import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5'

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  d.setPaused(false);
  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 9, seaLettuce: 9 });
  d.buildWorkshop();
  const screenOf = (x, y, z) => {
    d.updateCamera(0, true);
    const point = new d.camera.position.constructor(x, y, z).project(d.camera);
    return [(point.x + 1) / 2 * innerWidth, (1 - point.y) / 2 * innerHeight];
  };

  d.goHome();
  d.buildAtDefaultSpot('crabBed');
  const bed = d.home.stationOf('crabBed');
  const floor = d.world.heightAt(bed.x, bed.z);
  out.bedOnModel = d.home.stationUnder(...screenOf(bed.x, floor + 0.2, bed.z), d.camera) === bed;
  out.bedBesideModel = d.home.stationUnder(...screenOf(bed.x + 3, d.world.heightAt(bed.x + 3, bed.z + 3), bed.z + 3), d.camera) === bed;
  return out;
}
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 915, 'height': 412})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate('() => localStorage.clear()')
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    out = page.evaluate(FLOW)
    print(json.dumps(out))
    checks = {
        'bedOnlyOnModel': out['bedOnModel'] and not out['bedBesideModel'],
        'noErrors': not errors,
    }
    print(json.dumps(checks, indent=2), errors)
    browser.close()
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    sys.exit(0 if all(checks.values()) else 1)
