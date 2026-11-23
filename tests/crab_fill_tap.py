import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5'

FLOW = r'''
() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const out = {};
  d.setPaused(false);
  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 3, seaLettuce: 3 });
  d.buildWorkshop();
  d.enterBurrow();
  for (let column = 2; column <= 4; column++) for (let row = 1; row <= 3; row++) d.burrow.finishDig(column, row);
  d.burrow.finishDig(4, 4);
  const spot = d.burrow.stationSpot({ column: 4, row: 4 });
  Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0 });
  const screenOf = (column, row) => {
    d.updateCamera(0, true);
    const center = d.burrow.stationSpot({ column, row });
    const point = new d.camera.position.constructor(center.x, 200, center.z).project(d.camera);
    return [(point.x + 1) / 2 * innerWidth, (1 - point.y) / 2 * innerHeight];
  };
  const tap = (column, row) => { const [x, y] = screenOf(column, row); d.handleTap(x, y, true); };

  out.middleRefused = d.burrow.fillProblem(3, 2) === 'notBesideSand';
  out.edgeAllowed = d.burrow.fillProblem(2, 1) === null;
  d.startFillMode();
  tap(2, 1);
  out.firstTapSelects = !d.player.digTarget && d.placement.fillSelection && d.placement.fillSelection.column === 2 && d.placement.fillSelection.row === 1;
  tap(3, 2);
  out.middleTapWalks = !d.player.digTarget && !d.placement.fillSelection && d.player.path.length > 0 && d.placement.filling;
  const walkEnd = d.player.path[d.player.path.length - 1];
  out.middleTapWalksToTappedCell = Boolean(walkEnd) && d.burrow.cellOf(walkEnd.x, walkEnd.z).column === 3 && d.burrow.cellOf(walkEnd.x, walkEnd.z).row === 2;
  step(4, () => d.player.path.length === 0);
  tap(2, 1);
  tap(2, 1);
  out.secondTapFills = Boolean(d.player.digTarget) && d.player.digTarget.kind === 'fill';
  step(12, () => !d.player.digTarget);
  out.filled = !d.burrow.isDug(2, 1) && d.placement.filling;
  d.cancelPlacement();

  d.exitBurrow();
  const guarded = d.helpers.strandedVisible().filter((s) => s.guardKind);
  out.guardDistances = guarded.map((s) => { const guard = d.enemies.list.find((e) => e.kind === s.guardKind); const home = guard.home || guard; return +Math.hypot(home.x - s.x, home.z - s.z).toFixed(1); });
  const gullSpot = guarded.find((s) => s.guardKind === 'giantLobster');
  const guard = d.enemies.list.find((e) => e.kind === 'giantLobster');
  Object.assign(guard, { state: 'idle', health: guard.maxHealth || guard.health, respawnTimer: 0 });
  d.fog.reveal && d.fog.reveal(gullSpot.x, gullSpot.z, 30);
  Object.assign(d.player, { x: gullSpot.x + 6, z: gullSpot.z, path: [], pathIndex: 0, combatTarget: null, walkGoal: null });
  d.updateCamera(0, true);
  const point = new d.camera.position.constructor(gullSpot.x, d.world.heightAt(gullSpot.x, gullSpot.z) + 0.5, gullSpot.z).project(d.camera);
  d.handleTap((point.x + 1) / 2 * innerWidth, (1 - point.y) / 2 * innerHeight, true);
  out.guardedTapIgnored = !(d.player.walkGoal && d.player.walkGoal.strandedSpot);
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
        'fillOnlyBesideSand': out['middleRefused'] and out['edgeAllowed'],
        'tapSelectsThenFills': out['firstTapSelects'] and out['secondTapFills'] and out['filled'],
        'otherTapWalks': out['middleTapWalks'],
        'guardedHelperAwayFromBoss': all(distance >= 7 for distance in out['guardDistances']),
        'guardedTapIgnored': out['guardedTapIgnored'],
        'noErrors': not errors,
    }
    print(json.dumps(checks, indent=2), errors)
    browser.close()
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    sys.exit(0 if all(checks.values()) else 1)
