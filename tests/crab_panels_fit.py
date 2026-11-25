import os, json
from playwright.sync_api import sync_playwright

PANELS = [
    ('settings', '#hud .pause-button', '#hud .pause-menu', '#hud .pause-card', '#hud .pause-card .resume'),
    ('backpack', '#hud .bag-button:not(.map-button)', '#hud .backpack', '#hud .backpack .workbench-card', '#hud .backpack .workbench-close'),
    ('map', '#hud .map-button', '#hud .map-panel', '#hud .map-panel .workbench-card', '#hud .map-panel .workbench-close'),
    ('status', '#hud .level-badge', '#hud .status-panel', '#hud .status-panel .workbench-card', '#hud .status-panel .workbench-close'),
]
VIEWPORTS = [(800, 300), (915, 340), (412, 600), (360, 520)]

failures = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for width, height in VIEWPORTS:
        context = b.new_context(viewport={'width': width, 'height': height}, has_touch=True)
        pg = context.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender')
        pg.wait_for_function('!!window.__debug', timeout=120000)
        for name, opener, overlay, card, close in PANELS:
            pg.click(opener)
            visible = pg.evaluate(f"document.querySelector('{overlay}').classList.contains('visible')")
            fit = pg.evaluate(f"""(() => {{
                const c = document.querySelector('{card}').getBoundingClientRect();
                const x = document.querySelector('{close}').getBoundingClientRect();
                return {{ cardTop: Math.round(c.top), cardBottom: Math.round(c.bottom), closeTop: Math.round(x.top), closeBottom: Math.round(x.bottom), height: innerHeight }};
            }})()""")
            fits = fit['cardTop'] >= 0 and fit['closeTop'] >= 0 and fit['closeBottom'] <= fit['height'] and fit['cardBottom'] <= fit['height'] + 1
            pg.mouse.click(3, height - 3)
            closed = not pg.evaluate(f"document.querySelector('{overlay}').classList.contains('visible')")
            if not (visible and fits and closed):
                failures.append({'viewport': [width, height], 'panel': name, 'opened': visible, 'fit': fit, 'backdropCloses': closed})
        if errs:
            failures.append({'viewport': [width, height], 'errors': errs})
        context.close()
    b.close()
print(json.dumps({'failures': failures}, indent=1))
print('PASS' if not failures else 'FAIL')
