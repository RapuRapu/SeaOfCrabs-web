import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=high&dpr=0.5'

FLOW = r'''
async () => {
  const d = window.__debug;
  const out = {};
  const terrain = d.world.terrain;
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  d.setPaused(true);
  d.updateCamera(0, true);
  out.startsAtOrigin = terrain.center.x === 0 && terrain.center.z === 0;
  const walk = (x, z) => {
    let frames = 0;
    Object.assign(d.player, { x, z, y: d.world.heightAt(x, z) });
    for (; frames < 400; frames++) {
      d.updateCamera(1 / 60, false);
      if (!terrain.hasPendingWork && Math.abs(terrain.center.x - x) <= terrain.step && Math.abs(terrain.center.z - z) <= terrain.step) break;
    }
    return frames;
  };
  const steps = [];
  for (let x = 0; x <= 100; x += 8) steps.push(walk(x, x * 0.4));
  out.followsEast = terrain.center.x > 60 && terrain.center.z > 20;
  out.stepsFinishInFrames = Math.max(...steps) < 120;
  const heightUnderPlayer = d.world.heightAt(d.player.x, d.player.z);
  const positions = terrain.mesh.geometry.attributes.position.array;
  let nearest = Infinity;
  let nearestHeight = 0;
  for (let index = 0; index < positions.length; index += 3) {
    const distance = Math.hypot(positions[index] - d.player.x, positions[index + 2] - d.player.z);
    if (distance < nearest) {
      nearest = distance;
      nearestHeight = positions[index + 1];
    }
  }
  out.meshUnderPlayer = nearest < 1 && Math.abs(nearestHeight - heightUnderPlayer) < 0.6;
  for (let x = 100; x >= -100; x -= 8) walk(x, 0);
  out.followsWest = terrain.center.x < -60;
  Object.assign(d.player, { x: 0, z: 0 });
  d.updateCamera(0, true);
  out.teleportRebuilds = !terrain.hasPendingWork && Math.abs(terrain.center.x) <= terrain.step;
  d.setRendering(true);
  d.renderScene();
  await frame();
  out.draws = d.renderer.info.render.calls;
  out.triangles = d.renderer.info.render.triangles;
  out.drawsUnchanged = out.draws <= 90;
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
    out = page.evaluate(FLOW)
    print(json.dumps(out, indent=1))
    checks = {key: value for key, value in out.items() if isinstance(value, bool)}
    ok = all(checks.values()) and not errors
    print('errors', errors)
    print('ALL PASS' if ok else 'FAIL')
    browser.close()
    sys.exit(0 if ok else 1)
