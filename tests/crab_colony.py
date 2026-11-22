import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  d.setPaused(false);
  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  const nodesOf = (type) => d.resources.nodes.filter((node) => node.type === type && !node.gathered && node.y > -100);
  out.newMaterialsPlaced = ['kelp', 'pebbles', 'clay', 'sand'].every((type) => nodesOf(type).length >= 5);

  Object.assign(d.save.inventory, { shellBits: 20, driftwood: 30, seaLettuce: 20, pearls: 3, pebbles: 6, clay: 10 });
  d.buildWorkshop();
  const dugBefore = d.save.inventory.sand || 0;
  const wall = [];
  for (let column = 0; column < 31 && !wall.length; column++) for (let row = 0; row < 31 && !wall.length; row++) if (d.burrow.canDig(column, row)) wall.push([column, row]);
  if (!d.isUnderground()) d.enterBurrow(d.burrow.travelPoints()[0]);
  out.digStarted = d.startDigCell(wall[0][0], wall[0][1]) !== false;
  for (let time = 0; time < 25 && (d.save.inventory.sand || 0) === dugBefore; time += 1 / 30) d.simulate(1 / 30);
  out.digGivesSand = (d.save.inventory.sand || 0) === dugBefore + 2;

  const free = () => d.burrow.freeCells();
  const place = (kind) => { const cell = free()[0]; return d.buildStation(kind, cell.column, cell.row); };
  out.firstNest = place('helperNest');
  out.secondNestBlocked = d.stationBuildProblem('helperNest') !== null && !place('helperNest');
  out.pantryNeedsHeart = d.stationBuildProblem('pantry') === 'Needs Burrow heart' && !place('pantry');
  out.heartBuilt = place('burrowHeart') && d.burrowStage() === 2;
  out.secondNestAfterHeart = place('helperNest');
  out.pantryBuilt = place('pantry');

  const helper = d.helpers.rescue({ id: 'test-spot' });
  out.helperRescued = Boolean(helper);
  const pantry = d.burrow.state.stations.find((station) => station.kind === 'pantry');
  pantry.box.inventory.driedKelp = 1;
  Object.assign(helper, { state: 'resting', inside: true, mealIn: 0, restTimer: 999 });
  d.helpers.update(0.1, 0);
  out.ateFromPantry = pantry.box.inventory.driedKelp === 0 && !helper.hungry && helper.mealIn > 1000;
  helper.mealIn = 0;
  d.helpers.update(0.1, 0);
  out.hungryWithoutFood = helper.hungry === true;
  const lines = [...document.querySelectorAll('#hud .game-log .log-line')].map((line) => line.textContent);
  out.hungerLogged = lines.some((line) => line.includes('is hungry'));
  const nest = d.burrow.state.stations.find((station) => station.id === helper.nestId);
  nest.box.inventory.driedKelp = 2;
  helper.mealIn = 0;
  d.helpers.update(0.1, 0);
  out.ateFromNest = !helper.hungry && nest.box.inventory.driedKelp === 1;
  out.mealSaved = d.helpers.serialize().list[0].mealIn > 0;

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
