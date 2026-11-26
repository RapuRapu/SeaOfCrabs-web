import os, json, statistics, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')
RUNS = 10

HELPERS = r'''
window.__reef = (() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const silenceOthers = (keep) => { for (const enemy of d.enemies.list) if (enemy !== keep) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 }); };
  const place = (x, z) => { if (d.isUnderground()) d.exitBurrow(); const spot = d.navigation.nearestWalkable(x, z, 20); Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0, combatTarget: null, gatherTarget: null, speed: 0, inkedUntil: 0 }); return spot; };
  const equip = (shell, shellInvestment, claws, clawInvestment) => d.equipBuild(shell, claws, shellInvestment > 0 || clawInvestment > 0);
  const arena = { moray: null, octopus: { x: 10, z: 82 }, mantisShrimp: { x: 10, z: 76 }, giantLobster: { x: -250, z: 156 } };
  function setup(kind, level, shell, shellInvestment, claws, clawInvestment, fed) {
    d.progression.setLevel(level);
    d.progression.state.experience = -1e9;
    d.progression.state.health = d.progression.maxHealth();
    equip(shell, shellInvestment, claws, clawInvestment);
    d.save.inventory = {};
    while (d.remains.list.length) d.remains.remove(d.remains.list[0]);
    let enemy;
    if (kind === 'moray') {
      const den = d.world.morayDens[0];
      place(den.x + 3.2, den.z);
      enemy = d.enemies.spawn('moray', den.x, den.z);
    } else if (kind === 'giantLobster') {
      place(arena.giantLobster.x, arena.giantLobster.z - 7);
      enemy = d.enemies.spawn('giantLobster', -250, 160);
    } else {
      const spot = place(arena[kind].x, arena[kind].z);
      const enemySpot = d.navigation.nearestWalkable(spot.x + 3, spot.z + 1, 10);
      enemy = d.enemies.spawn(kind, enemySpot.x, enemySpot.z);
    }
    silenceOthers(enemy);
    d.player.lastCombatTime = -100;
    d.player.wellFedUntil = fed ? d.simulationTime() + 999 : 0;
    return enemy;
  }
  function fight(kind, level, shell, shellInvestment, claws, clawInvestment, fed) {
    const enemy = setup(kind, level, shell, shellInvestment, claws, clawInvestment, fed);
    d.engage(enemy);
    const seconds = step(300, () => enemy.state === 'dying' || enemy.state === 'dead' || d.remains.list.length > 0);
    const won = enemy.state === 'dying' || enemy.state === 'dead';
    return { won, seconds, health: won ? d.progression.state.health : 0 };
  }
  return { step, setup, fight, place, silenceOthers };
})();
'''

def summarize(results):
    wins = [r for r in results if r['won']]
    return {'wins': f"{len(wins)}/{len(results)}", 'seconds': round(statistics.mean(r['seconds'] for r in results), 1), 'healthLeft': round(statistics.mean(r['health'] for r in results), 1)}

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
    page.evaluate("() => __debug.setPaused(true)")
    page.evaluate(HELPERS)
    checks = {}

    scenarios = {
        'mantis L1 snail': "'mantisShrimp', 1, 'snail', 0, 'bare', 0, false",
        'moray L1 snail': "'moray', 1, 'snail', 0, 'bare', 0, false",
        'octopus L1 snail': "'octopus', 1, 'snail', 0, 'bare', 0, false",
        'mantis L3 turban edged': "'mantisShrimp', 3, 'turban', 0, 'shellEdged', 0, false",
        'moray L3 turban edged': "'moray', 3, 'turban', 0, 'shellEdged', 0, false",
        'octopus L3 turban edged': "'octopus', 3, 'turban', 0, 'shellEdged', 0, false",
        'mantis L6 turban★ edged★': "'mantisShrimp', 6, 'turban', 4, 'shellEdged', 4, false",
        'moray L6 turban★ edged★': "'moray', 6, 'turban', 4, 'shellEdged', 4, false",
        'mantis L6 cone★ edged★': "'mantisShrimp', 6, 'cone', 4, 'shellEdged', 4, false",
        'moray L6 cone★ edged★': "'moray', 6, 'cone', 4, 'shellEdged', 4, false",
        'octopus L6 turban★ edged★': "'octopus', 6, 'turban', 4, 'shellEdged', 4, false",
        'lobster L10 turban★ edged★ fed': "'giantLobster', 10, 'turban', 6, 'shellEdged', 6, true",
        'lobster L10 cone★ edged★ fed': "'giantLobster', 10, 'cone', 6, 'shellEdged', 6, true",
        'lobster L10 coral coralTipped fed': "'giantLobster', 10, 'coral', 0, 'coralTipped', 0, true",
        'lobster L10 coral★ coralTipped★ fed': "'giantLobster', 10, 'coral', 6, 'coralTipped', 6, true",
        'lobster L10 whelk★ coralTipped★ fed': "'giantLobster', 10, 'whelk', 6, 'coralTipped', 6, true",
    }
    balance = {}
    for name, arguments in scenarios.items():
        results = [page.evaluate(f"() => __reef.fight({arguments})") for _ in range(RUNS)]
        balance[name] = summarize(results)
        print(name, balance[name], flush=True)
    wins = lambda name: int(balance[name]['wins'].split('/')[0])
    checks['earlyLevelsLose'] = all(wins(name) <= 2 for name in balance if ' L1 ' in name) and all(wins(f'{kind} L3 turban edged') <= 3 for kind in ('mantis', 'moray', 'octopus'))
    checks['level6WinsMantisAndMoray'] = all(wins(name) >= 8 for name in ('mantis L6 turban★ edged★', 'moray L6 turban★ edged★', 'mantis L6 cone★ edged★', 'moray L6 cone★ edged★'))
    checks['bossNeedsReefGear'] = wins('lobster L10 turban★ edged★ fed') <= 3 and wins('lobster L10 cone★ edged★ fed') <= 3 and wins('lobster L10 coral★ coralTipped★ fed') >= 7

    behaviour = page.evaluate(r'''() => {
      const d = window.__debug; const r = window.__reef; const out = {};
      let moray = r.setup('moray', 10, 'turban', 6, 'shellEdged', 6, false);
      const den = { x: moray.x, z: moray.z };
      moray.health = 5000;
      r.place(den.x + 7, den.z); r.step(3);
      out.morayIgnoresFar = moray.state === 'idle';
      r.place(den.x + 2.6, den.z); r.step(1.5);
      out.morayStrikesNear = moray.state === 'chase' && moray.strikesMade > 0;
      d.enemies.damage(moray, 1, d.simulationTime(), d.player);
      out.morayRetreats = moray.retreat > 0;
      r.step(4);
      out.morayStaysHome = Math.hypot(moray.x - den.x, moray.z - den.z) < 0.01;
      r.place(den.x + 12, den.z); r.step(2);
      out.morayStillWatchingInGrace = moray.state === 'chase';
      r.step(2);
      out.morayGivesUp = moray.state === 'idle';

      const octopus = r.setup('octopus', 10, 'turban', 6, 'shellEdged', 6, false);
      d.player.wellFedUntil = 0;
      const octopusStart = d.simulationTime();
      r.step(12, () => d.player.inkedUntil > d.simulationTime());
      out.inkAfterThirdAttack = d.player.inkedUntil > d.simulationTime() && octopus.strikesMade === 3;
      out.inkSeconds = +(d.simulationTime() - octopusStart).toFixed(1);
      out.inkCloudShown = !!d.enemies.inkAt(d.simulationTime());
      const walkSpeed = () => { const start = { x: d.player.x, z: d.player.z }; d.setDestination(d.player.x - 6, d.player.z - 4); r.step(0.6); return Math.hypot(d.player.x - start.x, d.player.z - start.z) / 0.6; };
      octopus.state = 'dead'; octopus.respawnTimer = 1e9;
      const inkedSpeed = walkSpeed();
      d.player.inkedUntil = 0;
      const normalSpeed = walkSpeed();
      out.inkSlowRatio = +(inkedSpeed / normalSpeed).toFixed(2);

      const mantis = r.setup('mantisShrimp', 10, 'turban', 6, 'shellEdged', 6, false);
      const strikeTimes = [];
      const before = mantis.strikesMade;
      for (let t = 0; t < 4 && strikeTimes.length < 2; t += 1/60) { const n = mantis.strikesMade; d.simulate(1/60); if (mantis.strikesMade > n) strikeTimes.push(d.simulationTime()); }
      out.mantisDoubleStrikeGap = strikeTimes.length === 2 ? +(strikeTimes[1] - strikeTimes[0]).toFixed(2) : null;

      const lobster = r.setup('giantLobster', 10, 'coral', 6, 'coralTipped', 6, false);
      r.place(-250, 160 - 25); r.step(2);
      out.lobsterIgnoresOutsideTerritory = lobster.state === 'idle';
      r.place(-250, 160 - 7); r.step(4, () => !!lobster.zone);
      out.lobsterTelegraphs = !!lobster.zone;
      const zone = lobster.zone;
      const healthBefore = d.progression.state.health;
      const away = { x: d.player.x - zone.x, z: d.player.z - zone.z }; const length = Math.hypot(away.x, away.z) || 1;
      r.place(zone.x + away.x / length * (zone.radius + 2.5), zone.z + away.z / length * (zone.radius + 2.5));
      r.step(zone.timer + 0.1);
      out.dodgeAvoidsDamage = d.progression.state.health === healthBefore && lobster.strikesMade === 1;
      r.place(-250, 160 - 7); r.step(6, () => lobster.strikesMade >= 2);
      const lobsterHealth = lobster.health;
      out.spikesHurtAttacker = lobster.health < lobster.definition.health;
      lobster.health = 1; d.save.inventory.pearls = 0; d.engage(lobster); r.step(5, () => lobster.state === 'dying');
      out.bossDropsTwoPearls = d.save.inventory.pearls === 2;
      return out;
    }''')
    print('behaviour', json.dumps(behaviour), flush=True)
    checks['morayLurks'] = behaviour['morayIgnoresFar'] and behaviour['morayStrikesNear'] and behaviour['morayRetreats'] and behaviour['morayStaysHome'] and behaviour['morayStillWatchingInGrace'] and behaviour['morayGivesUp']
    checks['octopusInk'] = behaviour['inkAfterThirdAttack'] and behaviour['inkCloudShown'] and 0.4 <= behaviour['inkSlowRatio'] <= 0.6
    checks['mantisDoubleStrike'] = behaviour['mantisDoubleStrikeGap'] is not None and behaviour['mantisDoubleStrikeGap'] < 0.4
    checks['lobsterTelegraphAndTerritory'] = behaviour['lobsterIgnoresOutsideTerritory'] and behaviour['lobsterTelegraphs'] and behaviour['dodgeAvoidsDamage']
    checks['coralSpikes'] = behaviour['spikesHurtAttacker']
    checks['bossReward'] = behaviour['bossDropsTwoPearls']
    checks['noConsoleErrors'] = not errors
    if errors: print(errors[:5])
    browser.close()

print(json.dumps({'balance': balance, 'checks': checks}, indent=1))
sys.exit(0 if all(checks.values()) else 1)
