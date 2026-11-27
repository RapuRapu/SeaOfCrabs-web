import os, json, statistics, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'
RUNS = int(os.environ.get('BALANCE_RUNS', '6'))
BOSSES = {'gull', 'giantLobster', 'shipCat', 'cook'}
ONLY = set(filter(None, os.environ.get('BALANCE_ONLY', '').split(',')))

AREA_GEAR = {
    'sandHopper': ('snail', 'shellEdged'),
    'shoreCrab': ('snail', 'shellEdged'),
    'gull': ('turban', 'shellEdged'),
    'mantisShrimp': ('turban', 'coralTipped'),
    'moray': ('turban', 'coralTipped'),
    'octopus': ('turban', 'coralTipped'),
    'giantLobster': ('coral', 'coralTipped'),
    'rat': ('whelk', 'coralTipped'),
    'shipCat': ('coral', 'coralTipped'),
    'cockroach': ('coral', 'coralTipped'),
    'cook': ('coral', 'coralTipped'),
}

SETUP = r'''
window.__balance = (() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const homes = {};
  for (const enemy of d.enemies.list) if (!homes[enemy.kind]) homes[enemy.kind] = { ...(enemy.home || { x: enemy.x, z: enemy.z }) };
  let helper = null;
  function ensureHelper() {
    if (helper) return helper;
    Object.assign(d.save.inventory, { shellBits: 5, driftwood: 7, seaLettuce: 5 });
    if (!d.burrow.exists) d.buildWorkshop();
    d.buildAtDefaultSpot('helperNest');
    for (const enemy of d.enemies.list) if (enemy.kind === 'gull') Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
    helper = d.rescueHelperAt(d.helpers.strandedVisible()[0]);
    return helper;
  }
  function fight(kind, level, shell, claws, invested, withHelper, fed = false, dodge = false) {

    for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
    while (d.remains.list.length) d.remains.remove(d.remains.list[0]);
    d.progression.setLevel(level);
    d.progression.state.experience = -1e9;
    d.equipBuild(shell, claws, invested);
    d.progression.state.health = d.progression.maxHealth();
    Object.assign(d.player, { alive: true, combatTarget: null, inkedUntil: 0, wellFedUntil: fed ? d.simulationTime() + 999 : 0, restedUntil: 0, lastCombatTime: -100 });
    const home = homes[kind];
    const spot = d.navigation.nearestWalkable(home.x + 4, home.z + 2, 20);
    Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0 });
    const enemy = d.enemies.spawn(kind, home.x, home.z);
    if (enemy.definition.flies) Object.assign(enemy, { altitude: 0, state: 'chase', anchor: { x: enemy.x, z: enemy.z }, attackTimer: enemy.definition.windup });
    if (withHelper) {
      const buddy = ensureHelper();
      d.helpers.setJob(buddy.id, 'follow');
      buddy.level = level;
      buddy.health = 10 + (level - 1) * 3;
      buddy.gear = { shell: { id: 9001, kind: shell, quality: 'fine' }, claws: { id: 9002, kind: claws === 'bare' ? 'shellEdged' : claws, quality: 'fine' } };
      Object.assign(buddy, { state: 'following', inside: false, x: spot.x - 1, z: spot.z - 1, path: [], pathIndex: 0, fightTargetId: null });
    } else if (helper) {
      d.helpers.setJob(helper.id, null);
      Object.assign(helper, { state: 'resting', inside: true });
    }
    d.enemies.startChase(enemy);
    const helperBefore = helper ? helper.health : 0;
    let dodging = null;
    const seconds = step(240, () => {
      if (dodge && enemy.zone && enemy.zone !== dodging) {
        const zone = enemy.zone;
        let target;
        if (zone.shape === 'line') target = { x: d.player.x + Math.cos(zone.angle) * 5, z: d.player.z - Math.sin(zone.angle) * 5 };
        else {
          const away = Math.atan2(d.player.z - zone.z, d.player.x - zone.x);
          target = { x: zone.x + Math.cos(away) * (zone.radius + 2.5), z: zone.z + Math.sin(away) * (zone.radius + 2.5) };
        }
        const spot = d.navigation.nearestWalkable(target.x, target.z, 4);
        d.player.combatTarget = null;
        if (spot) d.setDestination(spot.x, spot.z);
        dodging = zone;
      }
      if (dodging && !enemy.zone) dodging = null;
      if (!dodging && enemies_alive(enemy) && d.player.combatTarget !== enemy) d.engage(enemy);
      return !enemies_alive(enemy) || d.remains.list.length > 0 || !d.player.alive;
    });
    const won = !enemies_alive(enemy);
    return { won, seconds, health: won ? d.progression.state.health / d.progression.maxHealth() : 0, helperFled: withHelper ? helper.state !== 'following' : false };
  }
  const enemies_alive = (enemy) => d.enemies.alive(enemy);
  return { fight };
})();
'''

def summarize(results):
    wins = [r for r in results if r['won']]
    return {
        'win': f"{len(wins)}/{len(results)}",
        'seconds': round(statistics.mean(r['seconds'] for r in wins), 1) if wins else None,
        'hpLeft': f"{round(100 * statistics.mean(r['health'] for r in results))}%",
        'helperFled': sum(1 for r in results if r['helperFled']),
    }

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 915, 'height': 412})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    with page.expect_navigation(timeout=180000):
        page.evaluate('() => { setTimeout(() => window.__debug.startOver(), 0); }')
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate('() => window.__debug.setPaused(false)')
    page.evaluate(SETUP)
    levels = page.evaluate("() => Object.fromEntries(Object.entries(window.__debug.enemies.list.reduce((all, e) => ({ ...all, [e.kind]: e.definition.level }), {})))")
    rows = []
    for kind, (shell, claws) in AREA_GEAR.items():
        level = levels.get(kind)
        if level is None:
            continue
        boss = kind in BOSSES
        cases = [('even, invested, fed', level, True, False, True), ('+2, invested, fed', level + 2, True, False, True), ('even, invested, fed + helper', level, True, True, True)] if boss else [('even, fresh', level, False, False, False), ('even, invested', level, True, False, False), ('−3, fresh', max(1, level - 3), False, False, False), ('even, fresh + helper', level, False, True, False)]
        if ONLY and kind not in ONLY:
            continue
        for label, player_level, invested, with_helper, fed in cases:
            results = [page.evaluate(f"() => window.__balance.fight('{kind}', {player_level}, '{shell}', '{claws}', {str(invested).lower()}, {str(with_helper).lower()}, {str(fed).lower()}, {str(boss).lower()})") for _ in range(RUNS)]
            row = {'enemy': kind, 'enemyLevel': level, 'case': label, 'gear': f'{shell}+{claws}', **summarize(results)}
            rows.append(row)
            print(json.dumps(row), flush=True)
    browser.close()
    print('errors', errors[:5])
