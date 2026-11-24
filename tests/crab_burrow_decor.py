import os, json, sys
from playwright.sync_api import sync_playwright

QUALITY_URL = 'file://' + os.path.abspath('dist/index.html') + '?quality={}&dpr=0.5'

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  const total = (counts) => Object.values(counts).reduce((sum, count) => sum + count, 0);
  d.buildWorkshop();
  d.enterBurrow();
  const start = d.burrow.decorCounts();
  for (let column = 2; column <= 4; column++) d.burrow.finishDig(column, 1);
  const dug = d.burrow.decorCounts();
  d.burrow.finishFill(4, 1);
  const filledOne = d.burrow.decorCounts();
  d.burrow.finishDig(4, 1);
  const dugAgain = d.burrow.decorCounts();
  out.start = start;
  out.dug = dug;
  out.allKindsPresent = Object.values(start).every((count) => count > 0);
  out.digAddsProps = total(dug) > total(start) && dug.root >= start.root;
  out.fillRemovesProps = total(filledOne) < total(dug);
  out.deterministic = JSON.stringify(dugAgain) === JSON.stringify(dug);
  let triangles = 0;
  let instancedMeshes = 0;
  d.burrow.interior.traverse((object) => {
    if (!object.isInstancedMesh) return;
    const geometry = object.geometry;
    const perInstance = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    triangles += perInstance * object.count;
    instancedMeshes++;
  });
  out.decorTriangles = triangles;
  out.instancedMeshes = instancedMeshes;
  out.total = total(dug);
  return out;
}
'''

results = {}
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    for quality in ('high', 'low'):
        page = browser.new_page(viewport={'width': 915, 'height': 412})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(QUALITY_URL.format(quality) + '&norender')
        page.wait_for_function('!!window.__debug', timeout=180000)
        page.evaluate('() => localStorage.clear()')
        page.reload()
        page.wait_for_function('!!window.__debug', timeout=180000)
        results[quality] = page.evaluate(FLOW)
        print(quality, json.dumps(results[quality]))
        page.close()
    high, low = results['high'], results['low']
    checks = {
        'allKindsPresent': high['allKindsPresent'],
        'digAddsProps': high['digAddsProps'],
        'fillRemovesProps': high['fillRemovesProps'],
        'deterministicRebuild': high['deterministic'],
        'decorTriangleBudget': high['decorTriangles'] < 60000,
        'lowQualityFewerProps': low['total'] < high['total'] * 0.7,
        'noErrors': not errors,
    }
    print(json.dumps(checks, indent=2), errors)
    browser.close()
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    sys.exit(0 if all(checks.values()) else 1)
