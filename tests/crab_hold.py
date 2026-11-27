import os, json, statistics, sys
from playwright.sync_api import sync_playwright

BASE = 'file://' + os.path.abspath('dist/index.html')
URL = BASE + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')
RUNS = 10

HELPERS = r'''
window.__hold = (() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const silenceOthers = (keep) => { for (const enemy of d.enemies.list) if (!keep.includes(enemy)) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 }); };
  const place = (x, z) => { const spot = d.navigation.nearestWalkable(x, z, 20); Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0, combatTarget: null, gatherTarget: null, speed: 0, inkedUntil: 0 }); return spot; };
  const equip = (shell, shellInvestment, claws, clawInvestment) => d.equipBuild(shell, claws, shellInvestment > 0 || clawInvestment > 0);
  function setup(kind, count, level, shell, shellInvestment, claws, clawInvestment, fed) {
    d.progression.setLevel(level);
    d.progression.state.experience = -1e9;
    d.progression.state.health = d.progression.maxHealth();
    equip(shell, shellInvestment, claws, clawInvestment);
    d.save.inventory = {};
    while (d.remains.list.length) d.remains.remove(d.remains.list[0]);
    const enemies = [];
    if (kind === 'cook') {
      place(317 - 6, -54 - 1);
      enemies.push(d.enemies.spawn('cook', 317, -54));
    } else {
      const spot = place(282, -57);
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

    area = page.evaluate(r"""() => {
      const d = window.__debug; const w = d.world; const out = {};
      d.save.worldTime = 300; d.simulate(1 / 60);
      const nodes = d.resources.nodes.filter((n) => n.type === 'fishBone' || n.type === 'wax');
      out.counts = { fishBone: nodes.filter((n) => n.type === 'fishBone').length, wax: nodes.filter((n) => n.type === 'wax').length };
      const home = { x: d.player.x, z: d.player.z };
      out.reachable = nodes.filter((n) => { const spot = d.navigation.nearestWalkable(n.x, n.z, 4); return spot && d.navigation.findPath(home.x, home.z, spot.x, spot.z).length > 0; }).length;
      out.cookReachable = d.navigation.findPath(home.x, home.z, 311, -54).length > 0;
      out.insideReachable = d.navigation.findPath(home.x, home.z, 290, -58).length > 0;
      out.stationsWalkable = d.enemies.list.find((e) => e.kind === 'cook').entry.stations.every((s) => w.isWalkable(s.x, s.z) && w.isInHold(s.x, s.z));
      out.beachItemsInHold = d.resources.nodes.filter((n) => !['fishBone', 'wax'].includes(n.type) && !n.gathered && w.isInHold(n.x, n.z)).length;
      out.holdEnemies = { cockroaches: d.enemies.list.filter((e) => e.kind === 'cockroach').length, cooks: d.enemies.list.filter((e) => e.kind === 'cook').length, ratsInHold: d.enemies.list.filter((e) => e.kind === 'rat' && w.isInHold(e.x, e.z)).length };
      out.propsBlock = w.holdProps.filter((p) => p.kind !== 'fishBones').every((p) => !w.isWalkable(p.x, p.z));
      return out;
    }""")
    print('area', json.dumps(area), flush=True)
    checks['holdArea'] = area['counts'] == {'fishBone': 10, 'wax': 8} and area['reachable'] == 18 and area['cookReachable'] and area['stationsWalkable'] and area['insideReachable'] and area['beachItemsInHold'] == 0 and area['holdEnemies']['cockroaches'] == 6 and area['holdEnemies']['cooks'] == 1 and area['propsBlock']

    goal = page.evaluate(r"""async () => {
      const d = window.__debug; const out = {};
      const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
      d.setPaused(false);
      for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
      Object.assign(d.save.inventory, { shellBits: 8, driftwood: 3, seaLettuce: 3 });
      d.buildWorkshop();
      d.save.inventory.shellBits = 3;
      d.craftItem('shell', 'snail');

      Object.assign(d.save, { reefFound: true, reefGearCrafted: true, campFound: true });
      d.save.worldTime = 300;
      Object.assign(d.save.inventory, { scrap: 4, cloth: 2, pearls: 2 });
      d.gear.state.toolTier = 2;
      d.upgradeTools();
      const nearest = d.resources.nodes.filter((node) => node.type === 'fishBone' && !node.gathered).sort((a, b) => Math.hypot(a.x - d.player.x, a.z - d.player.z) - Math.hypot(b.x - d.player.x, b.z - d.player.z))[0];
      d.setDestination(nearest.x, nearest.z, nearest);
      const target = d.player.gatherTarget;
      out.walksToBone = !!target && target.type === 'fishBone';
      out.walkSeconds = +step(240, () => d.save.holdFound).toFixed(1);
      out.holdFound = d.save.holdFound;
      step(60, () => target.gathered);
      out.boneInBag = d.save.inventory.fishBone || 0;
      d.persist();
      return out;
    }""")
    print('goal', json.dumps(goal), flush=True)
    checks['findShipwreck'] = goal['walksToBone'] and goal['holdFound'] and goal['boneInBag'] == 1

    page.evaluate("() => __debug.setPaused(true)")
    page.evaluate(HELPERS)
    balance = {}

    behaviour = page.evaluate(r"""() => {
      const d = window.__debug; const c = window.__hold; const out = {};
      const [cook] = c.setup('cook', 1, 10, 'coral', 9, 'coralTipped', 0, false);
      cook.health = 1e5;
      const start = { x: cook.x, z: cook.z };
      c.place(256, -24);
      const activities = new Set();
      let farthest = 0;
      c.step(40, () => { if (cook.activity) activities.add(cook.activity); farthest = Math.max(farthest, Math.hypot(cook.x - start.x, cook.z - start.z)); return false; });
      out.cookIgnoresOutside = cook.state === 'idle';
      out.cookPatrols = farthest > 8 && activities.size >= 2 && d.world.isInHold(cook.x, cook.z);
      c.place(cook.x - 22, cook.z); const gapBefore = Math.hypot(d.player.x - cook.x, d.player.z - cook.z);
      c.step(3);
      out.cookWalksToPlayer = cook.state === 'chase' && Math.hypot(d.player.x - cook.x, d.player.z - cook.z) < gapBefore - 6;
      c.step(4, () => cook.zone);
      out.chopTelegraphed = !!(cook.zone && cook.zone.shape === 'line');
      const zone = cook.zone; const healthBefore = d.progression.state.health;
      d.player.combatTarget = null;
      if (zone) {
        c.place(d.player.x + Math.cos(zone.angle) * 5, d.player.z - Math.sin(zone.angle) * 5);
        c.step(zone.timer + 0.3);
      }
      out.chopDodged = d.progression.state.health >= healthBefore;
      c.place(cook.x - 5, cook.z); d.engage(cook);
      c.step(15, () => cook.zone && cook.zone.stomp);
      out.stompAfterTwoChops = !!(cook.zone && cook.zone.stomp) && cook.strikesMade === 2;
      c.place(256, -24); d.player.combatTarget = null;
      c.step(20, () => cook.state === 'idle');
      out.cookStaysInHold = cook.state !== 'chase' && d.world.isInHold(cook.x, cook.z);
      const apronBefore = d.save.inventory.apronScrap || 0;
      c.place(cook.x - 5, cook.z);
      d.enemies.damage(cook, 1e9, d.simulationTime(), d.player);
      out.fleeStarts = cook.state === 'dying' && (d.save.inventory.apronScrap || 0) > apronBefore;
      const fleeFrom = { x: cook.x, z: cook.z };
      const fleeSeconds = c.step(15, () => cook.state === 'dead');
      out.fleeSeconds = +fleeSeconds.toFixed(1);
      out.cookFled = cook.state === 'dead' && fleeSeconds < 10 && d.bossRestRemainingMs('cook') > 0;
      out.fleeDistance = +Math.hypot(cook.x - fleeFrom.x, cook.z - fleeFrom.z).toFixed(1);
      return out;
    }""")
    print('behaviour', json.dumps(behaviour), flush=True)
    checks['cookAttacks'] = behaviour['cookIgnoresOutside'] and behaviour['chopTelegraphed'] and behaviour['chopDodged'] and behaviour['cookWalksToPlayer'] and behaviour['stompAfterTwoChops']
    checks['cookPatrolsAndFlees'] = behaviour['cookPatrols'] and behaviour['cookStaysInHold'] and behaviour['fleeStarts'] and behaviour['cookFled'] and behaviour['fleeDistance'] > 15

    performance = {'start': frame_numbers(context, 1), 'holdOverview': frame_numbers(context, 84), 'inHold': frame_numbers(context, 85)}
    print('performance', json.dumps(performance), flush=True)
    checks['performance'] = performance['start']['calls'] <= 90 and performance['start']['triangles'] < 1250000 and performance['inHold']['calls'] <= 106
    checks['noConsoleErrors'] = not errors
    if errors: print(errors[:5])
    browser.close()

print(json.dumps({'balance': balance, 'checks': checks}, indent=1))
sys.exit(0 if all(checks.values()) else 1)
