import os, json, sys, time
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

FLOW = r'''
() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const out = {};
  d.setPaused(false);
  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 3, seaLettuce: 3 });
  d.buildWorkshop();
  const shaft = { column: 5, row: 7 };

  out.farCellInsideGrid = d.burrow.canDig(-10, 5) === false && d.burrow.cellOf(d.burrow.stationSpot({ column: 20, row: 20 }).x, d.burrow.stationSpot({ column: 20, row: 20 }).z).inside;
  out.unexploredRefused = null;
  for (let column = -10; column <= 20 && !out.unexploredRefused; column++) for (let row = -10; row <= 20; row++) if (d.exitCellProblem(column, row) === 'unexplored') { out.unexploredRefused = 'unexplored'; break; }

  const validSpots = () => d.burrow.exitWallSpots().filter((spot) => !d.exitCellProblem(spot.column, spot.row));
  const corridors = [{ column: 4, row: 4, stepColumn: -1, stepRow: 0 }, { column: 6, row: 4, stepColumn: 0, stepRow: -1 }, { column: 4, row: 4, stepColumn: 0, stepRow: -1 }, { column: 6, row: 5, stepColumn: 1, stepRow: 0 }];
  const t0 = performance.now();
  let dugCount = 0;
  for (let length = 1; length <= 8 && !validSpots().length; length++) {
    for (const corridor of corridors) {
      const column = corridor.column + corridor.stepColumn * length;
      const row = corridor.row + corridor.stepRow * length;
      if (d.burrow.canDig(column, row)) { d.burrow.finishDig(column, row); dugCount++; }
    }
  }
  out.digMsAverage = +((performance.now() - t0) / Math.max(1, dugCount)).toFixed(1);
  const target = validSpots()[0];
  out.target = target && { column: target.column, row: target.row, keep: target.keep.length };
  Object.assign(d.save.inventory, { driftwood: 2 });
  out.exitBuilt = d.buildStation('exit', target.column, target.row);
  out.keepLocked = target.keep.every(([column, row]) => !d.burrow.canDig(column, row));
  out.noLongerWallSpot = !d.burrow.exitWallSpots().some((spot) => spot.column === target.column && spot.row === target.row);
  const exit = d.burrow.state.stations.find((s) => s.kind === 'exit');
  out.exitSurface = exit && exit.surface;
  out.travelPoints = d.burrow.travelPoints().length;
  out.surfaceBlocked = exit && !d.world.isWalkable(exit.surface.x, exit.surface.z);

  d.enterBurrow();
  const exitSpot = d.burrow.stationSpot(exit);
  let nearExit = null;
  for (let angle = 0; angle < 16 && !nearExit; angle++) {
    const candidate = { x: exitSpot.x + Math.cos(angle / 16 * Math.PI * 2) * 1.7, z: exitSpot.z + Math.sin(angle / 16 * Math.PI * 2) * 1.7 };
    if (d.burrow.space.isWalkable(candidate.x, candidate.z)) nearExit = candidate;
  }
  Object.assign(d.player, { x: nearExit.x, z: nearExit.z, path: [], pathIndex: 0 });
  d.simulate(1/60);
  out.exitOption = d.travelOption();
  d.travel();
  out.cameUpAtExit = !d.isUnderground() && Math.hypot(d.player.x - exit.surface.x, d.player.z - exit.surface.z) < 6;
  d.simulate(1/60);
  out.enterOption = d.travelOption();
  d.travel();
  const below = d.burrow.stationSpot(exit);
  out.wentDownAtExit = d.isUnderground() && Math.hypot(d.player.x - below.x, d.player.z - below.z) < 4;

  Object.assign(d.save.inventory, { seaLettuce: 4, driftwood: 2 });
  const bedCell = d.burrow.freeCells().find((c) => !(c.column === 6 && c.row === 5) && !(c.column === 5 && c.row >= 6));
  out.bedBuilt = d.buildStation('crabBed', bedCell.column, bedCell.row);
  d.progression.state.health = 1;
  const bed = d.burrow.state.stations.find((s) => s.kind === 'crabBed');
  d.openStation(bed);
  const bedPanel = document.querySelector('#hud .bed-panel');
  out.bedPanelHasMove = Boolean(bedPanel) && [...bedPanel.querySelectorAll('button')].some((button) => button.textContent === 'Move');
  document.querySelector('[data-sleep]').click();
  out.sleeping = Boolean(d.player.sleeping);
  out.sleepSeconds = +step(20, () => !d.player.sleeping).toFixed(1);
  out.fullAfterSleep = d.progression.state.health === d.progression.maxHealth();
  out.rested = d.isRested();
  out.restedBuff = document.querySelector('#hud .buff-chip').textContent;

  d.wakeUp(false);
  out.fillRefusesStructure = d.burrow.fillProblem(6, 5) === 'structure' && d.burrow.fillProblem(5, 6) === 'shaft';
  d.burrow.finishDig(4, 3);
  d.burrow.finishDig(4, 2);
  out.fillableTip = d.burrow.fillProblem(4, 2);
  out.fillFrom = { bed: [bed.column, bed.row] };
  out.fillStarted = d.startFillCell(4, 2);
  step(12, () => !d.player.digTarget);
  out.tipFilled = !d.burrow.isDug(4, 2) && d.burrow.isDug(4, 3);
  d.exitBurrow();
  const before = d.fog.isRevealed(-60, 40);
  const walk = d.navigation.nearestWalkable(-60, 40, 10);
  Object.assign(d.player, { x: walk.x, z: walk.z, path: [], pathIndex: 0 });
  d.simulate(1/60);
  out.fogRevealsAroundCrab = !before && d.fog.isRevealed(walk.x, walk.z) && !d.fog.isRevealed(walk.x + 40, walk.z + 40);
  out.revealedShare = +d.fog.revealedShare.toFixed(3);
  d.persist();
  return out;
}
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    page = browser.new_page(viewport={'width': 915, 'height': 412})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    with page.expect_navigation(timeout=180000):
        page.evaluate('() => { setTimeout(() => window.__debug.startOver(), 0); }')
    page.wait_for_function('!!window.__debug', timeout=180000)
    flow = page.evaluate(FLOW)
    print(json.dumps(flow), flush=True)
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reloaded = page.evaluate("() => { const d = window.__debug; return { exits: d.burrow.travelPoints().length, fogKept: d.fog.isRevealed(-60, 40), bed: d.burrow.hasStation('crabBed'), rested: d.isRested() }; }")
    print(json.dumps({'reloaded': reloaded}), flush=True)
    checks = {
        'gridReachesFar': flow['farCellInsideGrid'],
        'unexploredExitRefused': flow['unexploredRefused'] == 'unexplored',
        'exitBuilt': flow['exitBuilt'] and flow['travelPoints'] == 2 and flow['surfaceBlocked'] and flow['target']['keep'] == 5 and flow['keepLocked'] and flow['noLongerWallSpot'],
        'digIsCheap': flow['digMsAverage'] < 60,
        'travelThroughExit': flow['exitOption'] == 'exit' and flow['cameUpAtExit'] and flow['enterOption'] == 'enter' and flow['wentDownAtExit'],
        'crabBed': flow['bedBuilt'] and flow['bedPanelHasMove'] and flow['sleeping'] and flow['sleepSeconds'] <= 11 and flow['fullAfterSleep'] and flow['rested'],
        'fillSand': flow['fillRefusesStructure'] and flow['fillableTip'] is None and flow['fillStarted'] and flow['tipFilled'],
        'fogOfWar': flow['fogRevealsAroundCrab'] and 0 < flow['revealedShare'] < 0.6,
        'saved': reloaded == {'exits': 2, 'fogKept': True, 'bed': True, 'rested': True},
    }

    perf = browser.new_page(viewport={'width': 915, 'height': 412})
    perf.on('pageerror', lambda error: errors.append(str(error)))
    perf.goto('file://' + os.path.abspath('dist/index.html') + '?pose=111&hud&quality=high')
    perf.wait_for_function('!!window.__frameReady', timeout=240000)
    frame = perf.evaluate('window.__frameReady')
    print(json.dumps({'pose111High': frame}), flush=True)
    checks['bigBurrowBudget'] = frame['calls'] <= 70 and frame['triangles'] <= 400000
    browser.close()
    checks['noErrors'] = not errors
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    sys.exit(0 if all(checks.values()) else 1)
