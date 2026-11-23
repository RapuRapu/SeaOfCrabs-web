import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  d.setPaused(false);
  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 3, seaLettuce: 3 });
  d.buildWorkshop();
  const validSpots = () => d.burrow.exitWallSpots().filter((spot) => !d.exitCellProblem(spot.column, spot.row));
  const corridors = [{ column: 4, row: 4, stepColumn: -1, stepRow: 0 }, { column: 6, row: 4, stepColumn: 0, stepRow: -1 }, { column: 4, row: 4, stepColumn: 0, stepRow: -1 }, { column: 6, row: 5, stepColumn: 1, stepRow: 0 }];
  for (let length = 1; length <= 8 && validSpots().length < 2; length++) {
    for (const corridor of corridors) {
      const column = corridor.column + corridor.stepColumn * length;
      const row = corridor.row + corridor.stepRow * length;
      if (d.burrow.canDig(column, row)) d.burrow.finishDig(column, row);
    }
  }
  const target = validSpots()[0];
  const exitPoint = () => d.burrow.travelPoints().find((point) => point.station);
  const mainPoint = () => d.burrow.travelPoints().find((point) => !point.station);
  Object.assign(d.save.inventory, { driftwood: 2 });
  d.buildStation('exit', target.column, target.row);
  const surface = { ...exitPoint().station.surface };
  out.surfaceBlockedAfterBuild = !d.world.isWalkable(surface.x, surface.z);

  out.removedExit = d.removeTravelPoint(exitPoint());
  out.refunded = d.save.inventory.driftwood === 2;
  out.wallRefilled = !d.burrow.isDug(target.column, target.row);
  out.spotOfferedAgain = d.burrow.exitWallSpots().some((spot) => spot.column === target.column && spot.row === target.row);
  out.surfaceFreed = d.world.isWalkable(surface.x, surface.z);

  d.buildStation('exit', target.column, target.row);
  const entranceBefore = { ...d.burrow.state.entrance };
  out.removedMain = d.removeTravelPoint(mainPoint());
  out.onePointLeft = d.burrow.travelPoints().length === 1 && !mainPoint();
  out.anchorKept = d.burrow.state.entrance.x === entranceBefore.x && d.burrow.state.entrance.z === entranceBefore.z;
  out.exitSurfaceSame = Math.hypot(exitPoint().station.surface.x - surface.x, exitPoint().station.surface.z - surface.z) < 1e-6;
  out.closedSaved = d.save.burrow.entranceClosed === true;
  const exitSurface = exitPoint().station.surface;
  out.rackAllowedNearExit = d.rackSpotProblem(exitSurface.x + 5, exitSurface.z) !== 'far' && d.rackSpotProblem(entranceBefore.x + 5, entranceBefore.z) === 'far';
  out.lastRouteKept = d.removeTravelPoint(exitPoint()) === false && d.burrow.travelPoints().length === 1;

  d.enterBurrow(exitPoint());
  d.simulate(1 / 60);
  out.actionsUnderground = d.travelActions();
  const original = { column: exitPoint().station.column, row: exitPoint().station.row };
  d.startMovingExit(exitPoint().station);
  const rejected = (d.placement.exitRejected || [])[0];
  if (rejected) {
    d.updateCamera(0, true);
    const mark = new d.camera.position.constructor(rejected.marker.x, 200.17, rejected.marker.z).project(d.camera);
    d.handleTap((mark.x + 1) / 2 * innerWidth, (1 - mark.y) / 2 * innerHeight, true);
  }
  const lastLine = [...document.querySelectorAll('#hud .game-log .log-line')].map((line) => line.textContent).slice(-1)[0] || '';
  out.rejectedSpotExplained = Boolean(rejected) && /Too|unexplored|wet|Rocks/.test(lastLine) && d.placement.station === 'exit';
  out.placingWithSpots = d.placement.exitSpots.length > 0 && d.burrow.travelPoints().length === 0;
  d.cancelPlacement();
  const restored = exitPoint();
  out.cancelRestores = Boolean(restored) && restored.station.column === original.column && restored.station.row === original.row;

  const driftwoodBeforeMove = d.save.inventory.driftwood;
  d.startMovingExit(exitPoint().station);
  const other = d.placement.exitSpots.find((spot) => spot.column !== original.column || spot.row !== original.row);
  d.updateCamera(0, true);
  const marker = new d.camera.position.constructor(other.marker.x, 200, other.marker.z).project(d.camera);
  d.handleTap((marker.x + 1) / 2 * innerWidth, (1 - marker.y) / 2 * innerHeight, true);
  const moved = exitPoint();
  out.movedToNewSpot = Boolean(moved) && moved.station.column === other.column && moved.station.row === other.row && !d.placement.station;
  out.moveWasFree = d.save.inventory.driftwood === driftwoodBeforeMove;
  out.oldWallRefilled = !d.burrow.isDug(original.column, original.row);
  out.savedOneExit = d.save.burrow.stations.filter((station) => station.kind === 'exit').length === 1;
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
    actions = out.pop('actionsUnderground')
    ok = all(out.values()) and actions == {'move': True, 'remove': True} and not errors
    print('errors', errors)
    print('ALL PASS' if ok else 'FAIL')
    browser.close()
    sys.exit(0 if ok else 1)
