import os, json, statistics, sys
from playwright.sync_api import sync_playwright

BASE = 'file://' + os.path.abspath('dist/index.html')
URL = BASE + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')
RUNS = 10
DAY_MS = 24 * 3600 * 1000

HELPERS = r'''
window.__drops = (() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const silenceOthers = (keep) => { for (const enemy of d.enemies.list) if (!keep.includes(enemy) && !enemy.definition.dailyBoss) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 }); for (const enemy of d.enemies.list) if (!keep.includes(enemy) && enemy.definition.dailyBoss && enemy.state !== 'dead') Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 }); };
  const place = (x, z) => { if (d.isUnderground()) d.exitBurrow(); const spot = d.navigation.nearestWalkable(x, z, 20); Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0, combatTarget: null, gatherTarget: null, speed: 0, inkedUntil: 0 }); return spot; };
  const equip = (shell, shellInvestment, claws, clawInvestment) => d.equipBuild(shell, claws, shellInvestment > 0 || clawInvestment > 0);
  const arenas = {
    giantLobster: { lair: { x: -62, z: 96 }, stand: { x: -62, z: 89 } },
    shipCat: { lair: { x: -97, z: -63 }, stand: { x: -97, z: -54 } },
    cook: { lair: { x: 106, z: -64 }, stand: { x: 100, z: -65 } },
  };
  function fight(kind, level, shell, shellInvestment, claws, clawInvestment, fed) {
    d.progression.setLevel(level);
    d.progression.state.experience = -1e9;
    d.progression.state.health = d.progression.maxHealth();
    equip(shell, shellInvestment, claws, clawInvestment);
    d.save.inventory = {};
    while (d.remains.list.length) d.remains.remove(d.remains.list[0]);
    const arena = arenas[kind];
    place(arena.stand.x, arena.stand.z);
    const boss = d.enemies.spawn(kind, arena.lair.x, arena.lair.z);
    silenceOthers([boss]);
    d.player.lastCombatTime = -100;
    d.player.wellFedUntil = fed ? d.simulationTime() + 999 : 0;
    d.enemies.startChase(boss);
    const seconds = step(300, () => { if (boss.state !== 'dying' && boss.state !== 'dead' && d.player.combatTarget !== boss) d.engage(boss); return boss.state === 'dying' || boss.state === 'dead' || d.remains.list.length > 0; });
    const won = boss.state === 'dying' || boss.state === 'dead';
    return { won, seconds, health: won ? d.progression.state.health : 0 };
  }
  return { step, place, fight, equip, silenceOthers };
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

    loot = page.evaluate(r"""() => {
      const d = window.__debug; const c = window.__drops; const out = {};
      const cook = d.enemies.list.find((e) => e.kind === 'cook');
      c.equip('coral', 9, 'coralTipped', 9);
      d.save.inventory = {};
      d.randomSource.next = () => 0.5;
      d.dropLoot(cook);
      out.materialOnly = { apronScrap: d.save.inventory.apronScrap || 0, cleavers: d.gear.state.claws.filter((i) => i.kind === 'cleaver').length };
      out.restingHours = +(d.bossRestRemainingMs('cook') / 3600000).toFixed(2);
      d.randomSource.next = () => 0.05;
      d.dropLoot(cook);
      out.withItem = { apronScrap: d.save.inventory.apronScrap || 0, cleavers: d.gear.state.claws.filter((i) => i.kind === 'cleaver').length };
      d.randomSource.next = Math.random;
      const trophies = { gull: 'gullFeather', giantLobster: 'lobsterPlate', shipCat: 'catWhisker', cook: 'apronScrap' };
      const gearCount = () => d.gear.state.shells.length + d.gear.state.claws.length;
      d.save.bossDefeatedAt = {};
      out.trophyMaterials = Object.fromEntries(Object.entries(trophies).map(([kind, material]) => { d.save.inventory = {}; d.randomSource.next = () => 0.01; const before = gearCount(); d.dropLoot(d.enemies.list.find((e) => e.kind === kind)); d.randomSource.next = Math.random; return [kind, (d.save.inventory[material] || 0) === 2 && (kind === 'cook' || gearCount() === before)]; }));
      out.minibossesNotResting = ['gull', 'giantLobster', 'shipCat'].every((kind) => !(d.save.bossDefeatedAt || {})[kind]);
      out.common = {};
      for (const kind of ['sandHopper', 'shoreCrab', 'octopus', 'rat', 'cockroach']) {
        d.save.inventory = {};
        const definition = d.enemies.list.find((e) => e.kind === kind).definition;
        const fake = { kind, definition, x: 20, z: -20, y: 0, altitude: 0 };
        const kills = 4000;
        for (let index = 0; index < kills; index++) d.dropLoot(fake);
        const total = Object.values(d.save.inventory).reduce((sum, value) => sum + value, 0);
        out.common[kind] = { rate: +(total / kills).toFixed(3), onlyOwnDrops: Object.keys(d.save.inventory).every((type) => definition.drops.includes(type)), allDropsSeen: definition.drops.every((type) => d.save.inventory[type] > 0) };
      }
      out.shoreCrabNoScrap = !d.enemies.list.find((e) => e.kind === 'shoreCrab').definition.drops.includes('scrap');
      return out;
    }""")
    print('loot', json.dumps(loot), flush=True)
    checks['bossMaterialAlways'] = loot['materialOnly'] == {'apronScrap': 2, 'cleavers': 0} and all(loot['trophyMaterials'].values()) and loot['minibossesNotResting']
    checks['bossItemChance'] = loot['withItem'] == {'apronScrap': 4, 'cleavers': 1}
    checks['restsOneDay'] = 23.9 < loot['restingHours'] <= 24
    checks['commonDrops'] = all(0.32 < r['rate'] < 0.38 and r['onlyOwnDrops'] and r['allDropsSeen'] for r in loot['common'].values()) and loot['shoreCrabNoScrap']

    resting = page.evaluate(r"""() => {
      const d = window.__debug; const c = window.__drops; const out = {};
      d.save.bossDefeatedAt = {};
      const cat = d.enemies.spawn('shipCat', -97, -63);
      c.silenceOthers([cat]);
      cat.health = 1; d.engage(cat);
      c.place(-97, -57);
      d.progression.setLevel(10); d.progression.state.health = d.progression.maxHealth();
      c.equip('coral', 9, 'coralTipped', 9);
      c.step(20, () => cat.state === 'dead');
      out.killed = cat.state === 'dead';
      out.whiskers = d.save.inventory.catWhisker || 0;
      c.place(20, -20);
      c.step(14 * 60);
      out.deadAfter14min = cat.state === 'dead';
      c.step(120, () => cat.state !== 'dead');
      out.backAfter15min = cat.state !== 'dead';
      d.persist();
      return out;
    }""")
    print('resting', json.dumps(resting), flush=True)
    checks['minibossBackIn15min'] = resting['killed'] and resting['whiskers'] == 2 and resting['deadAfter14min'] and resting['backAfter15min']

    page.evaluate("() => { const d = window.__debug; d.save.bossDefeatedAt = { cook: Date.now() - 3600000 }; d.gear.state.shells.push({ id: 950, kind: 'tinCan', quality: 'masterwork' }); d.gear.state.claws.push({ id: 951, kind: 'fishhook', quality: 'fine', binding: 'wire' }); d.persist(); }")
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reload_state = page.evaluate("() => { const d = window.__debug; const cook = d.enemies.list.find((e) => e.kind === 'cook'); const lobster = d.enemies.list.find((e) => e.kind === 'giantLobster'); return { cookDead: cook.state === 'dead', lobsterAlive: lobster.state !== 'dead', hours: +(d.bossRestRemainingMs('cook') / 3600000).toFixed(1) }; }")
    print('reload', json.dumps(reload_state), flush=True)
    retired = page.evaluate("() => { const d = window.__debug; const shell = d.gear.state.shells.find((i) => i.id === 950); const claws = d.gear.state.claws.find((i) => i.id === 951); return [shell.kind, shell.quality, claws.kind, claws.binding]; }")
    print('retired', json.dumps(retired), flush=True)
    checks['retiredGearMigrates'] = retired == ['coral', 'masterwork', 'coralTipped', 'wire']
    checks['restSurvivesReload'] = reload_state['cookDead'] and reload_state['lobsterAlive'] and 22.9 < reload_state['hours'] < 23.1

    page.evaluate("() => __debug.setPaused(true)")
    page.evaluate(HELPERS)
    crafting = page.evaluate(r"""() => {
      const d = window.__debug; const out = {};
      d.save.inventory = { apronScrap: 2, scrap: 6, fishBone: 4, catWhisker: 2, gullFeather: 2, lobsterPlate: 2 };
      d.gear.state.shells = [{ id: 900, kind: 'snail', quality: 'fine' }];
      const cleaver = d.craftItem('claws', 'cleaver');
      out.crafted = [!!cleaver, !!d.modifyItem(cleaver.id, 'whisker'), !!d.modifyItem(900, 'featherLining')];
      d.wearItem(cleaver.id); d.wearItem(900);
      out.swiftFactor = d.playerStats().attackIntervalFactor;
      out.featherSpeed = d.playerStats().speedFactor;
      out.crafted.push(!!d.modifyItem(900, 'lobsterArmor'));
      out.lobsterThorns = d.playerStats().thorns;
      out.leftover = Object.values(d.save.inventory).reduce((sum, value) => sum + value, 0);
      return out;
    }""")
    print('crafting', json.dumps(crafting), flush=True)
    checks['trophyMaterialsUseful'] = all(crafting['crafted']) and crafting['leftover'] == 0 and crafting['swiftFactor'] == 0.8 and abs(crafting['featherSpeed'] - 1.08) < 1e-6 and crafting['lobsterThorns'] == 3

    sheen = page.evaluate(r"""() => {
      const d = window.__debug; const out = {};
      const glowOf = (quality) => { d.gear.state.shells = [{ id: 500, kind: 'coral', quality }]; d.gear.state.wornShellId = 500; d.equipBuild && 0; d.wearItem(500); d.simulate(1 / 60); const mesh = d.scene.getObjectsByProperty('isInstancedMesh', true).find((m) => m.geometry.type === 'IcosahedronGeometry' && m.material.blending === 2); return { particles: mesh && mesh.visible ? mesh.count : 0 }; };
      out.fine = glowOf('fine');
      out.masterwork = glowOf('masterwork');
      return out;
    }""")
    print('sheen', json.dumps(sheen), flush=True)
    checks['masterworkSheenWithoutParticles'] = sheen['fine']['particles'] == 0 and sheen['masterwork']['particles'] == 0

    page.evaluate(HELPERS)
    scenarios = {
        'cook L10 coral★ coralTipped★ fed': "'cook', 10, 'coral', 4, 'coralTipped', 4, true",
        'cook L10 coral★ cleaver★ fed': "'cook', 10, 'coral', 4, 'cleaver', 4, true",
    }
    balance = {}
    for name, arguments in scenarios.items():
        results = [page.evaluate(f"() => __drops.fight({arguments})") for _ in range(RUNS)]
        balance[name] = summarize(results)
        print(name, balance[name], flush=True)
    wins = lambda name: int(balance[name]['wins'].split('/')[0])
    better = lambda base, trophy: wins(trophy) > wins(base) or (wins(trophy) == wins(base) and balance[trophy]['healthLeft'] >= balance[base]['healthLeft'])
    checks['cleaverHelps'] = better('cook L10 coral★ coralTipped★ fed', 'cook L10 coral★ cleaver★ fed')

    checks['noConsoleErrors'] = not errors
    if errors: print(errors[:5])
    browser.close()

print(json.dumps({'balance': balance, 'checks': checks}, indent=1))
sys.exit(0 if all(checks.values()) else 1)
