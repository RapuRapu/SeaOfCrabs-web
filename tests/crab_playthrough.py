import os, json
from playwright.sync_api import sync_playwright

SCRIPT = r'''
() => {
  const d = window.__debug; const p = d.player;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const report = { start: [p.x, p.z].map(v => +v.toFixed(1)), gathered: {}, walk: [] };
  d.setPaused(false);
  const wanted = { shellBits: 5, driftwood: 3, seaLettuce: 3 };
  for (const [type, count] of Object.entries(wanted)) {
    for (let n = 0; n < count; n++) {
      const nodes = d.resources.nodes.filter(node => node.type === type && !node.gathered).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      const node = nodes[0];
      const distance = Math.hypot(node.x - p.x, node.z - p.z);
      const found = d.setDestination(node.x, node.z, node);
      const seconds = step(120, () => node.gathered);
      report.walk.push({ type, distance: +distance.toFixed(1), pathFound: found, seconds: +seconds.toFixed(1), gathered: node.gathered });
    }
    report.gathered[type] = d.save.inventory[type] || 0;
  }
  const before = d.resources.nodes.filter(n => n.gathered).length;
  const tideStart = d.seaLevelAt(d.save.worldTime);
  step(520);
  report.gatheredBeforeTide = before;
  report.gatheredAfterTide = d.resources.nodes.filter(n => n.gathered).length;
  report.tide = [tideStart, d.seaLevelAt(d.save.worldTime)].map(v => +v.toFixed(2));
  let unreachable = 0;
  for (const node of d.resources.nodes) if (!node.gathered && !d.navigation.findPath(p.x, p.z, node.x, node.z).length) unreachable++;
  report.unreachableNodes = unreachable;
  report.buildButtonShown = !document.querySelector('#hud .home-buttons').classList.contains('hidden');
  const t0 = performance.now(); for (let i = 0; i < 200; i++) d.navigation.findPath(p.x, p.z, -90 + (i % 20) * 9, -100 + Math.floor(i / 20) * 20); report.pathMsAverage = +((performance.now() - t0) / 200).toFixed(2);
  return report;
}
'''
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 915, 'height': 412})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'); pg.wait_for_function('!!window.__debug', timeout=120000)
    print(json.dumps(pg.evaluate(SCRIPT), indent=1))
    print('errors:', errs)
    b.close()
