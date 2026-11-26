import os, json, statistics, sys
from playwright.sync_api import sync_playwright

BASE = 'file://' + os.path.abspath('dist/index.html')
URL = BASE + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')
RUNS = 10

HELPERS = r'''
window.__camp = (() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const silenceOthers = (keep) => { for (const enemy of d.enemies.list) if (!keep.includes(enemy)) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 }); };
  const place = (x, z) => { if (d.isUnderground()) d.exitBurrow(); const spot = d.navigation.nearestWalkable(x, z, 20); Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0, combatTarget: null, gatherTarget: null, speed: 0, inkedUntil: 0 }); return spot; };
  const equip = (shell, shellInvestment, claws, clawInvestment) => d.equipBuild(shell, claws, shellInvestment > 0 || clawInvestment > 0);
  function setup(kind, count, level, shell, shellInvestment, claws, clawInvestment, fed) {
    d.progression.setLevel(level);
    d.progression.state.experience = -1e9;
    d.progression.state.health = d.progression.maxHealth();
    equip(shell, shellInvestment, claws, clawInvestment);
    d.save.inventory = {};
    while (d.remains.list.length) d.remains.remove(d.remains.list[0]);
    const enemies = [];
    if (kind === 'shipCat') {
      place(-97, -63 + 9);
      enemies.push(d.enemies.spawn('shipCat', -97, -63));
    } else {
      const spot = place(-74, -58);
      for (let index = 0; index < count; index++) {
        const enemySpot = d.navigation.nearestWalkable(spot.x - 3 - index * 1.5, spot.z + 1.5 - index * 3, 10);
        enemies.push(d.enemies.spawn(kind, enemySpot.x, enemySpot.z, index));
      }
    }
    silenceOthers(enemies);
    d.player.lastCombatTime = -100;
    d.player.wellFedUntil = fed ? d.simulationTime() + 999 : 0;
    return enemies;
  }
  function fight(kind, count, level, shell, shellInvestment, claws, clawInvestment, fed) {
    const enemies = setup(kind, count, level, shell, shellInvestment, claws, clawInvestment, fed);
    const living = () => enemies.filter((enemy) => enemy.state !== 'dying' && enemy.state !== 'dead');
    for (const enemy of enemies) d.enemies.startChase(enemy);
    const seconds = step(300, () => { const target = living()[0]; if (target && d.player.combatTarget !== target) d.engage(target); return !target || d.remains.list.length > 0; });
    const won = living().length === 0;
    return { won, seconds, health: won ? d.progression.state.health : 0 };
  }
  return { step, setup, fight, place, silenceOthers };
})();
'''

def summarize(results):
    wins = [r for r in results if r['won']]
    return {'wins': f"{len(wins)}/{len(results)}", 'seconds': round(statistics.mean(r['seconds'] for r in results), 1), 'healthLeft': round(statistics.mean(r['health'] for r in results), 1)}

def frame_numbers(context, pose):
    page = context.new_page()
    page.goto(f'{BASE}?pose={pose}&quality=high')
    page.wait_for_function('!!window.__frameReady', timeout=240000)
    numbers = page.evaluate('() => window.__frameReady')
    page.close()
    return numbers

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 915, 'height': 412})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate("() => localStorage.clear()")
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    checks = {}

    area = page.evaluate(r'''() => {
      const d = window.__debug; const w = d.world; const out = {};
      const nodes = d.resources.nodes.filter((n) => n.type === 'scrap' || n.type === 'cloth');
      out.counts = { scrap: nodes.filter((n) => n.type === 'scrap').length, cloth: nodes.filter((n) => n.type === 'cloth').length };
      const home = { x: d.player.x, z: d.player.z };
      out.reachable = nodes.filter((n) => { const spot = d.navigation.nearestWalkable(n.x, n.z, 4); return spot && d.navigation.findPath(home.x, home.z, spot.x, spot.z).length > 0; }).length;
      out.lairReachable = d.navigation.findPath(home.x, home.z, -269, -163).length > 0;
      out.beachItemsInCamp = d.resources.nodes.filter((n) => ['shellBits', 'driftwood'].includes(n.type) && !n.gathered && Math.hypot(n.x + 260, n.z + 170) < 34).length;
      out.hoppersInCamp = d.enemies.list.filter((e) => e.kind === 'sandHopper' && Math.hypot(e.x + 260, e.z + 170) < 36).length;
      out.campEnemies = { rats: d.enemies.list.filter((e) => e.kind === 'rat').length, cats: d.enemies.list.filter((e) => e.kind === 'shipCat').length };
      out.propsBlock = w.campProps.every((p) => !w.isWalkable(p.x, p.z));
      return out;
    }''')
    print('area', json.dumps(area), flush=True)
    checks['campArea'] = area['counts'] == {'scrap': 10, 'cloth': 8} and area['reachable'] == 18 and area['lairReachable'] and area['beachItemsInCamp'] == 0 and area['hoppersInCamp'] == 0 and area['campEnemies'] == {'rats': 6, 'cats': 1} and area['propsBlock']

    goal = page.evaluate(r'''async () => {
      const d = window.__debug; const out = {};
      const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
      d.setPaused(false);
      for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
      Object.assign(d.save.inventory, { shellBits: 8, driftwood: 3, seaLettuce: 3 });
      d.buildWorkshop();
      d.save.inventory.shellBits = 3;
      d.craftItem('shell', 'snail');
      if (d.isUnderground()) d.exitBurrow();
      d.save.reefFound = true;
      Object.assign(d.save.inventory, { coral: 6, seaGlass: 2, shellBits: 6 });
      d.craftItem('shell', 'coral');
      const nearest = d.resources.nodes.filter((node) => node.type === 'scrap' && !node.gathered).sort((a, b) => Math.hypot(a.x - d.player.x, a.z - d.player.z) - Math.hypot(b.x - d.player.x, b.z - d.player.z))[0];
      d.setDestination(nearest.x, nearest.z, nearest);
      const target = d.player.gatherTarget;
      out.walksToScrap = !!target && target.type === 'scrap';
      out.walkSeconds = +step(200, () => d.save.campFound).toFixed(1);
      out.campFound = d.save.campFound;
      step(60, () => target.gathered);
      out.scrapInBag = d.save.inventory.scrap || 0;
      d.persist();
      return out;
    }''')
    print('goal', json.dumps(goal), flush=True)
    checks['findCamp'] = goal['walksToScrap'] and goal['campFound'] and goal['scrapInBag'] == 1

    page.evaluate("() => __debug.setPaused(true)")
    page.evaluate(HELPERS)
    scenarios = {
        'rat L6 turban★ edged★': "'rat', 1, 6, 'turban', 4, 'shellEdged', 4, false",
        'rat L10 coral★ coralTipped★': "'rat', 1, 10, 'coral', 3, 'coralTipped', 3, false",
        'two rats L10 coral★ coralTipped★': "'rat', 2, 10, 'coral', 3, 'coralTipped', 3, false",
        'two rats L10 turban★ edged★': "'rat', 2, 10, 'turban', 4, 'shellEdged', 4, false",
    }
    balance = {}
    for name, arguments in scenarios.items():
        results = [page.evaluate(f"() => __camp.fight({arguments})") for _ in range(RUNS)]
        balance[name] = summarize(results)
        print(name, balance[name], flush=True)
    wins = lambda name: int(balance[name]['wins'].split('/')[0])
    checks['ratsGateTier1'] = wins('rat L10 coral★ coralTipped★') >= 8 and wins('two rats L10 coral★ coralTipped★') >= 6 and wins('two rats L10 turban★ edged★') <= 3

    behaviour = page.evaluate(r'''() => {
      const d = window.__debug; const c = window.__camp; const out = {};
      const [cat] = c.setup('shipCat', 1, 10, 'coral', 9, 'coralTipped', 0, false);
      cat.health = 1e5;
      c.place(-97, -63 + 30); c.step(2);
      out.catIgnoresOutside = cat.state === 'idle';
      c.place(-97, -63 + 9); d.engage(cat);
      c.step(12, () => cat.zone && cat.zone.pounce);
      out.pounceTelegraphed = !!(cat.zone && cat.zone.pounce);
      out.swipesBeforePounce = cat.strikesMade;
      const zone = cat.zone; const healthBefore = d.progression.state.health;
      d.player.combatTarget = null;
      c.place(zone.x + zone.radius + 3, zone.z);
      c.step(zone.timer + 0.6);
      out.pounceDodged = d.progression.state.health >= healthBefore;
      out.catLanded = Math.hypot(cat.x - zone.x, cat.z - zone.z) < cat.definition.radius + 3;
      out.catNotOnPlayer = Math.hypot(cat.x - d.player.x, cat.z - d.player.z) > 1.5;
      const [mate, other] = c.setup('rat', 2, 10, 'coral', 9, 'coralTipped', 0, false);
      c.place(mate.x + 6, mate.z); c.step(2);
      out.ratPairBothChase = mate.state === 'chase' && other.state === 'chase';
      return out;
    }''')
    print('behaviour', json.dumps(behaviour), flush=True)
    checks['catPounce'] = behaviour['catIgnoresOutside'] and behaviour['pounceTelegraphed'] and behaviour['pounceDodged'] and behaviour['catLanded'] and behaviour['catNotOnPlayer']
    checks['ratsHuntTogether'] = behaviour['ratPairBothChase']

    performance = {'start': frame_numbers(context, 1), 'campOverview': frame_numbers(context, 75), 'inCamp': frame_numbers(context, 76)}
    print('performance', json.dumps(performance), flush=True)
    checks['performance'] = performance['start']['calls'] <= 90 and performance['start']['triangles'] < 1215000 and performance['inCamp']['calls'] <= 100
    checks['noConsoleErrors'] = not errors
    if errors: print(errors[:5])
    browser.close()

print(json.dumps({'balance': balance, 'checks': checks}, indent=1))
sys.exit(0 if all(checks.values()) else 1)
