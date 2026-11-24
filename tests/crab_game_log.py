import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

FLOW = r'''
() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const out = {};
  const texts = () => d.hud.gameLog.entries.map((entry) => `${entry.kind}|${entry.text}`);
  d.setPaused(false);
  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  out.noToastElement = !document.querySelector('#hud .toast');
  out.logVisible = !!document.querySelector('#hud .game-log');

  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 3, seaLettuce: 3 });
  d.buildWorkshop();
  out.buildLogged = texts().some((t) => t.startsWith('build|'));

  if (d.isUnderground()) d.exitBurrow();
  const crab = d.enemies.list.find((e) => e.kind === 'shoreCrab');
  const home = crab.home || crab;
  const spot = d.navigation.nearestWalkable(home.x + 3, home.z, 10);
  Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0 });
  const enemy = d.enemies.spawn('shoreCrab', home.x, home.z);
  d.enemies.startChase(enemy);
  d.engage(enemy);
  step(30, () => !d.enemies.alive(enemy) || !d.player.alive);
  const lines = texts();
  out.hitYou = lines.find((t) => t.includes('hits you for')) || null;
  out.youHit = lines.find((t) => t.startsWith('combat|You hit')) || null;
  out.defeated = lines.find((t) => t.includes('defeated (+')) || null;

  d.hud.gameLog.submit('hello crabs');
  const last = d.hud.gameLog.entries.at(-1);
  out.chat = { kind: last.kind, author: last.author, text: last.text };
  d.hud.gameLog.submit('/help');
  out.helpListed = texts().some((t) => t.startsWith('system|/filter'));
  d.hud.gameLog.submit('/filter combat loot');
  out.multiFilter = [...d.hud.gameLog.shownKinds].sort().join(',');
  d.hud.gameLog.setExpanded(true);
  out.visibleKinds = [...new Set([...document.querySelectorAll('#hud .game-log .log-line')].map((line) => line.className.replace('log-line log-', '')))].sort().join(',');
  document.querySelector('#hud .game-log .log-chip.log-loot').click();
  out.afterChip = [...d.hud.gameLog.shownKinds].join(',');
  document.querySelector('#hud .game-log .log-chip.log-all').click();
  out.afterAll = d.hud.gameLog.shownKinds.size;
  d.hud.gameLog.setExpanded(false);
  d.hud.gameLog.submit('/filter helper-combat');
  out.helperCombatFilter = [...d.hud.gameLog.shownKinds].join(',') === 'helperCombat' && !!document.querySelector('#hud .game-log .log-chip.log-helperCombat');
  d.hud.gameLog.submit('/filter all');
  for (let i = 0; i < 70; i++) d.hud.log('notice', `spam ${i}`);
  out.capped = d.hud.gameLog.entries.length;
  d.hud.gameLog.submit('/clear');
  out.cleared = d.hud.gameLog.entries.length;

  out.perfHiddenByDefault = getComputedStyle(document.querySelector('#perf')).display === 'none';
  d.setShowPerformance(true);
  out.perfShown = getComputedStyle(document.querySelector('#perf')).display !== 'none' && localStorage.getItem('seaofcrabs-show-performance') === '1';
  d.setShowPerformance(false);
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
    print(json.dumps(out, indent=1))
    page.keyboard.press('Escape')
    page.click('#hud .game-log .log-lines')
    page.fill('#hud .game-log .log-input', 'wasd typed')
    page.keyboard.press('Enter')
    typed = page.evaluate("() => ({ last: __debug.hud.gameLog.entries.at(-1).text, moved: __debug.player.path.length })")
    checks = {
        'toastsGone': out['noToastElement'] and out['logVisible'],
        'buildLogged': out['buildLogged'],
        'damageTakenBreakdown': bool(out['hitYou']) and 'armour' in out['hitYou'] and '%' in out['hitYou'] and 'HP ' in out['hitYou'],
        'damageDealtBreakdown': bool(out['youHit']) and 'atk ' in out['youHit'],
        'killLogged': bool(out['defeated']),
        'chatEntry': out['chat']['kind'] == 'chat' and out['chat']['author'] == 'You' and out['chat']['text'] == 'hello crabs',
        'commands': out['helpListed'] and out['cleared'] == 0,
        'cappedAt50': out['capped'] == 50,
        'helperCombatFilter': out['helperCombatFilter'],
        'multiKindFilter': out['multiFilter'] == 'combat,loot' and set(out['visibleKinds'].split(',')) <= {'combat', 'loot', 'system'} and out['afterChip'] == 'combat' and out['afterAll'] == 0,
        'performanceSetting': out['perfHiddenByDefault'] and out['perfShown'],
        'typingInInput': typed['last'] == 'wasd typed',
        'noErrors': not errors,
    }
    print(json.dumps(checks, indent=2), typed, errors)
    browser.close()
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    sys.exit(0 if all(checks.values()) else 1)
