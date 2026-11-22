import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  d.setPaused(false);
  const at = (level, shell) => {
    d.progression.setLevel(level);
    d.equipBuild(shell, 'bare', false);
    for (let frame = 0; frame < 400; frame++) d.hermit.update(1 / 60, d.player);
    return { scale: d.hermit.root.scale.x, stats: d.playerStats() };
  };
  const start = at(1, 'snail');
  const middle = at(12, 'coral');
  const grown = at(24, 'coral');
  const grownSnail = at(24, 'snail');
  out.scaleGrows = Math.abs(start.scale - 1) < 0.01 && Math.abs(middle.scale - 1.32) < 0.01 && Math.abs(grown.scale - 1.64) < 0.01;
  out.fitsWhenRightSize = start.stats.shellFit.label === null && middle.stats.shellFit.label === null && middle.stats.ability !== null;
  out.tooSmallPenalty = grown.stats.shellFit.label === 'Too small' && grown.stats.defense < middle.stats.defense * 0.3 && grown.stats.speedFactor < middle.stats.speedFactor * 0.5 && grown.stats.ability === null;
  out.twoStepsWorse = grownSnail.stats.speedFactor < grown.stats.speedFactor;
  const tooBig = at(1, 'coral');
  out.tooBigSlowKeepsDefense = tooBig.stats.shellFit.label === 'Too big' && tooBig.stats.speedFactor < 0.5 && tooBig.stats.defense === middle.stats.defense;
  out.cameraBacksOff = (() => { d.setCameraDistance(30); d.progression.setLevel(1); d.equipBuild('snail', 'bare', false); d.updateCamera(0, true); const near = d.camera.position.distanceTo(new d.camera.position.constructor(d.player.x, d.player.y, d.player.z)); d.progression.setLevel(24); d.equipBuild('snail', 'bare', false); d.updateCamera(0, true); const far = d.camera.position.distanceTo(new d.camera.position.constructor(d.player.x, d.player.y, d.player.z)); return far > near * 1.2; })();

  d.progression.setLevel(9);
  d.equipBuild('snail', 'bare', false);
  d.progression.state.molts = ['crusher', 'crusher'];
  d.player.moltKind = 'crusher';
  d.finishMolt();
  const lines = [...document.querySelectorAll('#hud .game-log .log-line')].map((line) => line.textContent);
  out.growLogged = lines.some((line) => line.includes('You grew to size M')) && lines.some((line) => line.includes('too small now'));
  d.openBackpack();
  out.backpackWarns = [...document.querySelectorAll('#hud .equip-warning')].some((node) => node.textContent === 'Too small');
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
    ok = all(out.values()) and not errors
    print('errors', errors)
    print('ALL PASS' if ok else 'FAIL')
    browser.close()
    sys.exit(0 if ok else 1)
