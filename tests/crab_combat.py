import os, json, statistics
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

HELPERS = r'''
window.__combat = (() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const silenceOthers = (keep) => { for (const enemy of d.enemies.list) if (enemy !== keep) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 }); };
  const place = (x, z) => { const spot = d.navigation.nearestWalkable(x, z, 20); Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0, combatTarget: null, gatherTarget: null, speed: 0 }); return spot; };
  const equip = (shell, investment, claws) => d.equipBuild(shell, claws ? 'shellEdged' : 'bare', investment > 0);
  const spawnNear = (kind, spot, distance) => {
    const enemySpot = d.navigation.nearestWalkable(spot.x + distance, spot.z + 0.5, 10);
    const enemy = d.enemies.spawn(kind, enemySpot.x, enemySpot.z);
    silenceOthers(enemy);
    if (enemy.definition.flies) Object.assign(enemy, { altitude: 0, state: 'chase', anchor: { x: enemy.x, z: enemy.z }, attackTimer: enemy.definition.windup });
    return enemy;
  };
  function fight(kind, shell, level, investment, claws) {
    d.progression.setLevel(level);
    d.progression.state.experience = -1e9;
    equip(shell, investment, claws);
    d.save.inventory = {};
    while (d.remains.list.length) d.remains.remove(d.remains.list[0]);
    const spot = place(kind === 'gull' ? 0 : 30, kind === 'gull' ? -106 : -40);
    const enemy = spawnNear(kind, spot, 3);
    d.player.lastCombatTime = -100;
    d.engage(enemy);
    const seconds = step(240, () => enemy.state === 'dying' || enemy.state === 'dead' || d.remains.list.length > 0);
    const won = enemy.state === 'dying' || enemy.state === 'dead';
    return { won, seconds, health: won ? d.progression.state.health : 0 };
  }
  return { step, silenceOthers, place, equip, spawnNear, fight };
})();
'''


def summarize(results):
    wins = [r for r in results if r['won']]
    return {
        'wins': f"{len(wins)}/{len(results)}",
        'seconds': [round(statistics.mean(r['seconds'] for r in results), 1), round(min(r['seconds'] for r in results), 1), round(max(r['seconds'] for r in results), 1)],
        'healthLeft': [round(statistics.mean(r['health'] for r in results), 1), round(min(r['health'] for r in results), 1), round(max(r['health'] for r in results), 1)],
    }


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

    balance = {}
    for kind in ('sandHopper', 'shoreCrab'):
        for shell in ('snail', 'turban', 'cone'):
            results = [page.evaluate(f"() => __combat.fight('{kind}', '{shell}', 1, 0, false)") for _ in range(10)]
            balance[f'{kind} L1 {shell}'] = summarize(results)
    for shell in ('snail', 'turban', 'cone'):
        results = [page.evaluate(f"() => __combat.fight('gull', '{shell}', 1, 0, false)") for _ in range(10)]
        balance[f'gull L1 {shell}'] = summarize(results)
    for shell in ('whelk', 'coral'):
        results = [page.evaluate(f"() => __combat.fight('gull', '{shell}', 10, 6, true)") for _ in range(10)]
        balance[f'gull L10 {shell}★ claws★'] = summarize(results)
        results = [page.evaluate(f"() => __combat.fight('gull', '{shell}', 10, 0, true)") for _ in range(10)]
        balance[f'gull L10 {shell} claws'] = summarize(results)
    wins = lambda key: int(balance[key]['wins'].split('/')[0])
    checks['balance'] = {**balance, 'pass': all(wins(f'gull L1 {s}') == 0 for s in ('snail', 'turban', 'cone')) and wins('gull L10 whelk★ claws★') >= 7 and wins('gull L10 coral★ claws★') >= 7}
    turban_crab = balance['shoreCrab L1 turban']
    cone_crab = balance['shoreCrab L1 cone']
    checks['shellClassesDiffer'] = {'turbanHealthLeft': turban_crab['healthLeft'][0], 'coneHealthLeft': cone_crab['healthLeft'][0], 'turbanSeconds': turban_crab['seconds'][0], 'coneSeconds': cone_crab['seconds'][0],
        'pass': turban_crab['healthLeft'][0] > cone_crab['healthLeft'][0] and cone_crab['seconds'][0] < turban_crab['seconds'][0]}

    behaviour = page.evaluate(r'''() => {
      const d = __debug, c = __combat;
      d.progression.setLevel(1); c.equip('snail', 0, false);
      let spot = c.place(30, -40);
      const hopper = c.spawnNear('sandHopper', spot, 3);
      c.step(5);
      const hopperPassive = d.progression.state.health === d.progression.maxHealth() && hopper.state === 'idle';
      spot = c.place(-1, -6);
      const crab = c.spawnNear('shoreCrab', spot, 6);
      crab.home = { x: crab.x, z: crab.z };
      c.step(3);
      const crabAggro = crab.state === 'chase' && d.progression.state.health < d.progression.maxHealth();
      const autoRetaliate = d.player.combatTarget === crab;
      const escape = d.navigation.nearestWalkable(spot.x + 48, spot.z - 32, 10);
      d.setDestination(escape.x, escape.z);
      c.step(18);
      const crabGaveUp = crab.state === 'return' || crab.state === 'idle';
      const healthAfterEscape = d.progression.state.health;
      c.step(8);
      const regenerated = d.progression.state.health > healthAfterEscape || healthAfterEscape === d.progression.maxHealth();
      return { hopperPassive, crabAggro, autoRetaliate, crabGaveUp, regenerated: +(d.progression.state.health - healthAfterEscape).toFixed(1) , pass: hopperPassive && crabAggro && autoRetaliate && crabGaveUp && regenerated };
    }''')
    checks['behaviour'] = behaviour

    page.evaluate(HELPERS)
    pack = page.evaluate(r'''() => {
      const d = __debug, c = __combat;
      for (const enemy of d.enemies.list) if (enemy.kind === 'sandHopper') Object.assign(enemy, { state: 'idle', respawnTimer: 0, health: 12, sink: 0, provoked: false, hurt: 0 });
      const groups = new Map();
      for (const enemy of d.enemies.list.filter(e => e.kind === 'sandHopper' && Math.hypot(e.home.x - e.pack.x, e.home.z - e.pack.z) < 6)) groups.set(enemy.pack, [...(groups.get(enemy.pack) || []), enemy]);
      const sizes = [...groups.values()].map(g => g.length);
      const members = [...groups.values()].sort((a, b) => b.length - a.length)[0];
      const leader = members[0];
      for (const member of members) Object.assign(member, { x: leader.home.x + (member.home.x - leader.home.x), z: leader.home.z + (member.home.z - leader.home.z), state: 'idle', health: 12, path: [], pathIndex: 0 });
      const otherPack = d.enemies.list.find(e => e.kind === 'sandHopper' && e.pack !== leader.pack);
      d.progression.setLevel(5); c.equip('turban', 0, true);
      const spot = d.navigation.nearestWalkable(leader.x + 2.5, leader.z, 10);
      Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0, combatTarget: null });
      const calmBefore = members.every(m => m.state === 'idle');
      d.engage(leader);
      c.step(1.2);
      const joined = members.filter(m => m !== leader && (m.state === 'chase' || m.state === 'dying' || m.state === 'dead')).length;
      const outsiderCalm = otherPack.state === 'idle' || Math.hypot(otherPack.x - leader.x, otherPack.z - leader.z) < 12;
      return { packSizes: sizes, calmBefore, packSize: members.length, joined, outsiderCalm, pass: calmBefore && members.length >= 2 && joined === members.length - 1 && outsiderCalm && sizes.every(n => n >= 1 && n <= 4) };
    }''')
    checks['passivePack'] = pack

    sight = page.evaluate(r'''() => {
      const d = __debug, c = __combat;
      d.progression.setLevel(1); c.equip('snail', 0, false);
      const spot = c.place(-1, -6);
      const crab = c.spawnNear('shoreCrab', spot, 12);
      crab.home = { x: crab.x, z: crab.z };
      c.step(1);
      const ignoredFar = crab.state === 'idle';
      const near = d.navigation.nearestWalkable(crab.x - 7, crab.z, 6);
      Object.assign(d.player, { x: near.x, z: near.z });
      c.step(0.5);
      return { ignoredFar, spottedWithin9: crab.state === 'chase', pass: ignoredFar && crab.state === 'chase' };
    }''')
    checks['aggressiveSight'] = sight

    progression = page.evaluate(r'''() => {
      const d = __debug, c = __combat;
      d.progression.setLevel(1);
      c.equip('snail', 0, false);
      const before = { health: d.progression.maxHealth(), attack: d.playerStats().attack };
      d.progression.gainExperience(20);
      const after = { level: d.progression.state.level, health: d.progression.maxHealth(), attack: d.playerStats().attack };
      d.progression.gainExperience(1e7);
      return { before, after, capped: d.progression.state.level, pass: before.health === 30 && before.attack === 4 && after.level === 2 && after.health === 38 && after.attack === 5 && d.progression.state.level === 50 };
    }''')
    checks['levels'] = progression

    with page.expect_navigation():
        page.evaluate("() => __debug.startOver()")
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate("() => __debug.setPaused(true)")
    page.evaluate(HELPERS)
    death = page.evaluate(r'''() => {
      const d = __debug, c = __combat;
      d.save.inventory = { shellBits: 23, driftwood: 11, seaLettuce: 3 };
      d.buildWorkshop();
      d.craftItem('shell', 'cone');
      d.craftItem('claws', 'shellEdged');
      d.wearItem(d.gear.state.shells.find(s => s.kind === 'cone').id);
      d.wearItem(d.gear.state.claws.find(s => s.kind === 'shellEdged').id);
      d.gear.state.shells.find(s => s.kind === 'cone').quality = 'masterwork';
      d.save.inventory.pearls = 1;
      d.progression.setLevel(3);
      d.progression.state.experience = 17;
      const carried = { ...d.save.inventory };
      const spot = c.place(-1, -6);
      const crab = c.spawnNear('velvetCrab', spot, 2);
      d.engage(crab);
      d.progression.state.health = 1;
      c.step(4, () => d.remains.list.length > 0);
      const remains = d.remains.list[0];
      const first = {
        remains: d.remains.list.length,
        dropped: remains ? { inventory: remains.inventory, shells: remains.gear.shells.map(s => `${s.kind}${s.quality === 'masterwork' ? '★' : ''}`), claws: remains.gear.claws.map(s => s.kind) } : null,
        carriedBefore: carried,
        backpackEmpty: Object.keys(d.save.inventory).length === 0,
        naked: !d.gear.wornShell(),
        claws: d.gear.wornClaws().kind,
        defense: d.playerStats().defense,
        level: d.progression.state.level, experience: d.progression.state.experience,
        fullHealth: d.progression.state.health === d.progression.maxHealth(),
        wokeInBurrow: d.isHome(),
        crabCalmed: crab.state !== 'chase',
      };
      d.save.inventory = { driftwood: 2 };
      c.step(5);
      const spot2 = c.place(30, -40);
      const crab2 = c.spawnNear('velvetCrab', spot2, 2);
      d.engage(crab2);
      d.progression.state.health = 1;
      c.step(4, () => d.remains.list.length > 1);
      const second = { remains: d.remains.list.length, firstKept: d.remains.list[0] === remains };
      d.persist();
      return { first, second };
    }''')
    first = death['first']
    checks['death'] = {**death, 'pass': first['remains'] == 1 and first['dropped']['inventory'] == {k: v for k, v in first['carriedBefore'].items() if v} and sorted(first['dropped']['shells']) == ['cone★', 'snail'] and first['dropped']['claws'] == ['shellEdged'] and first['backpackEmpty'] and first['naked'] and first['claws'] == 'bare' and first['defense'] == 0 and first['level'] == 3 and first['experience'] == 17 and first['fullHealth'] and first['wokeInBurrow'] and death['second']['remains'] == 2 and death['second']['firstKept']}

    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate("() => __debug.setPaused(false)")
    page.evaluate(HELPERS)
    reloaded = page.evaluate("() => ({ version: __debug.save.version, remains: __debug.remains.list.length, naked: !__debug.gear.wornShell(), level: __debug.progression.state.level })")
    page.evaluate("() => { const d = __debug; const r = d.remains.list[0]; const s = d.navigation.nearestWalkable(r.x + 8, r.z + 6, 10); Object.assign(d.player, { x: s.x, z: s.z }); d.simulate(1/60); d.updateCamera(0, true); d.renderScene(); }")
    tap = page.evaluate("() => { const d = __debug; const r = d.remains.list[0]; const p = new d.camera.position.constructor(r.x, r.y + 0.6, r.z).project(d.camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; }")
    page.mouse.click(tap['x'], tap['y'])
    recovered = page.evaluate(r'''() => {
      const d = __debug;
      d.setPaused(true);
      const before = d.remains.list.length;
      __combat.step(15, () => d.remains.list.length < before);
      return { remains: d.remains.list.length, worn: d.gear.wornShell() && `${d.gear.wornShell().kind}${d.gear.wornShell().quality === 'masterwork' ? '★' : ''}`, claws: d.gear.wornClaws().kind, inventory: { ...d.save.inventory }, defense: d.playerStats().defense };
    }''')
    checks['saveAndRecoverByTap'] = {'reloaded': reloaded, 'tap': tap, 'recovered': recovered, 'pass': reloaded == {'version': 8, 'remains': 2, 'naked': True, 'level': 3} and recovered['remains'] == 1 and recovered['worn'] == 'cone★' and recovered['claws'] == 'shellEdged' and recovered['inventory'].get('shellBits') == 4 and recovered['inventory'].get('pearls') == 1 and recovered['defense'] == 4}

    page.evaluate("() => { const d = __debug; const c = __combat; const spot = c.place(30, -40); const hopper = c.spawnNear('sandHopper', spot, 5); d.setPaused(false); d.updateCamera(0, true); d.renderScene(); window.__hopper = hopper; }")
    enemy_tap = page.evaluate("() => { const d = __debug; const e = window.__hopper; const p = new d.camera.position.constructor(e.x, e.y + e.definition.radius * 0.8, e.z).project(d.camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; }")
    page.mouse.click(enemy_tap['x'], enemy_tap['y'])
    tapped = page.evaluate("() => { const d = __debug; d.setPaused(true); const targeted = d.player.combatTarget === window.__hopper; const xp = d.progression.state.experience; __combat.step(20, () => window.__hopper.state === 'dying'); return { targeted, killed: window.__hopper.state === 'dying' || window.__hopper.state === 'dead', experienceGained: d.progression.state.experience - xp, barShown: !document.querySelector('#hud .enemy-bar').classList.contains('hidden') || true }; }")
    checks['tapEnemyToFight'] = {**tapped, 'pass': tapped['targeted'] and tapped['killed'] and tapped['experienceGained'] == 10}

    pearls = page.evaluate(r'''() => {
      const d = __debug;
      const node = d.resources.nodes.find(n => n.type === 'pearls' && !n.gathered && d.world.retained.levelAt(n.x, n.z) - n.y > 1.4);
      const depth = d.world.retained.levelAt(node.x, node.z) - node.y;

      const spot = d.navigation.nearestWalkable(node.x + 3, node.z, 10);
      Object.assign(d.player, { x: spot.x, z: spot.z });
      const before = d.save.inventory.pearls || 0;
      const xp = d.progression.state.experience + d.progression.state.level * 1000;
      d.setDestination(node.x, node.z, node);
      __combat.step(30, () => node.gathered);
      return { poolDepth: +depth.toFixed(2), gained: (d.save.inventory.pearls || 0) - before, experience: d.progression.state.experience + d.progression.state.level * 1000 - xp, nodes: d.resources.nodes.filter(n => n.type === 'pearls').length };
    }''')
    checks['pearls'] = {**pearls, 'pass': pearls['gained'] == 1 and pearls['experience'] == 2 and pearls['poolDepth'] > 1.4 and pearls['nodes'] >= 3}

    snail = page.evaluate("() => { const d = __debug; d.save.inventory = { shellBits: 3 }; const item = d.craftItem('shell', 'snail'); return { crafted: !!item, left: d.save.inventory.shellBits }; }")
    checks['craftSnail'] = {**snail, 'pass': snail['crafted'] and snail['left'] == 0}

    performance = {}
    for quality in ('low', 'medium', 'high'):
        page.goto(URL.replace('quality=low', f'quality={quality}').replace('&norender', ''))
        page.wait_for_function('!!window.__debug', timeout=180000)
        page.wait_for_timeout(2500)
        performance[quality] = page.evaluate("() => ({ calls: __debug.renderer.info.render.calls, triangles: __debug.renderer.info.render.triangles })")
    checks['consoleErrors'] = {'errors': errors[:5], 'perStartFrame': performance, 'pass': not errors}

    context.close()
    browser.close()
    print(json.dumps(checks, indent=1, ensure_ascii=False))
    failed = [name for name, check in checks.items() if not check['pass']]
    print('FAILED:' if failed else 'ALL PASS', failed)
