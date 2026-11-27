import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5'

FLOW = r'''
() => {
  const d = window.__debug;
  d.setPaused(false);
  const start = performance.now();
  d.openMap();
  const openMilliseconds = performance.now() - start;
  const canvas = document.querySelector('#hud .map-canvas');
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const at = (x, y) => { const index = (Math.round(y) * canvas.width + Math.round(x)) * 4; return [pixels[index], pixels[index + 1], pixels[index + 2]]; };
  let distinctColours = new Set();
  for (let y = canvas.height * 0.3; y < canvas.height * 0.7; y += 7) for (let x = canvas.width * 0.3; x < canvas.width * 0.7; x += 7) distinctColours.add(at(x, y).map((value) => value >> 3).join(','));
  const visible = getComputedStyle(document.querySelector('#hud .map-panel')).display !== 'none' && document.querySelector('#hud .map-panel').classList.contains('visible');
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 3, seaLettuce: 3 });
  d.buildWorkshop();
  return { openMilliseconds, distinctColours: distinctColours.size, corner: at(4, 4), visible };
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
        'opens': out['visible'],
        'detailedTerrain': out['distinctColours'] >= 40,
        'unexploredBlack': max(out['corner']) < 12,
        'opensQuickly': out['openMilliseconds'] < 1500,
        'noErrors': not errors,
    }
    print(json.dumps(checks, indent=2), errors)
    browser.close()
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    sys.exit(0 if all(checks.values()) else 1)
