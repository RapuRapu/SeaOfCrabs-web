import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  d.setPaused(false);
  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  Object.assign(d.save.inventory, { shellBits: 30, driftwood: 40, seaLettuce: 20, pearls: 3, pebbles: 20, clay: 20, kelp: 6 });
  d.buildWorkshop();
  for (let pass = 0; pass < 3; pass++) for (let column = 1; column <= 11; column++) for (let row = 1; row <= 11; row++) if (d.burrow.canDig(column, row)) d.burrow.finishDig(column, row);
  const place = (kind) => { const cell = d.burrow.freeCells().find((candidate) => candidate.column % 2 === 0 && candidate.row % 2 === 0); return d.buildStation(kind, cell.column, cell.row) && d.burrow.state.stations.find((s) => s.kind === kind && s.column === cell.column && s.row === cell.row); };
  const station = (kind) => d.burrow.state.stations.find((s) => s.kind === kind);
  place('helperNest');
  place('storage');
  place('burrowHeart');
  const pantry = place('pantry');
  const ropeWalk = place('ropeWalk');
  const grinder = place('grinder');
  out.stationsBuilt = Boolean(pantry && ropeWalk && grinder);
  out.defaultPantryOrder = d.boardOrders().length === 1 && d.boardOrders()[0].material === 'driedKelp' && d.boardOrders()[0].toId === pantry.id;

  d.openStation(ropeWalk);
  document.querySelector('[data-process-load]').click();
  out.loadedRopeWalk = d.save.inventory.kelp === 3 && ropeWalk.process.slots.length === 1;
  d.processPanel.close();
  for (let time = 0; time < 41; time += 0.5) d.simulate(0.5);
  d.openStation(ropeWalk);
  document.querySelector('[data-process-collect]').click();
  out.cordMade = d.save.inventory.cord === 1;
  d.processPanel.close();
  d.save.inventory.cord = 2;

  const helper = d.rescueHelperAt(d.helpers.strandedVisible().find((spot) => !spot.guardKind));
  out.rescuedOnBoard = helper && helper.job === 'board';
  out.satchelGiven = d.giveSatchel(helper.id) && helper.satchel === true && d.save.inventory.cord === 0;

  const storage = station('storage');
  d.addBoardOrder('cord', storage.id, 1);
  const nest = d.burrow.state.stations.find((s) => s.id === helper.nestId);
  nest.box.inventory.kelp = 3;
  Object.assign(helper, { state: 'resting', inside: true, restTimer: 0 });
  for (let time = 0; time < 180 && !(d.boardView()[1] && d.boardView()[1].status === 'Done'); time += 0.25) d.simulate(0.25);
  const view = d.boardView();
  out.ropeOrderDone = view[1] && view[1].status === 'Done';
  out.pantryOrderBlocked = view[0].status === 'No way to get it yet';

  d.moveBoardOrder(view[1].id, -1);
  out.reordered = d.boardOrders()[0].material === 'cord';
  out.removed = d.removeBoardOrder(d.boardOrders()[0].id) && d.boardOrders().length === 1;

  d.helpers.setJob(helper.id, 'pebbles');
  Object.assign(helper, { state: 'resting', inside: true, restTimer: 0 });
  const pebblesBefore = nest.box.inventory.pebbles || 0;
  let biggestDrop = 0, last = pebblesBefore;
  for (let time = 0; time < 240 && biggestDrop < 2; time += 0.25) {
    d.simulate(0.25);
    const now = nest.box.inventory.pebbles || 0;
    biggestDrop = Math.max(biggestDrop, now - last);
    last = now;
  }
  out.satchelCarriesTwo = biggestDrop === 2;
  out.lockedJobKept = helper.job === 'pebbles';
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
