import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  const step = (seconds, until) => { for (let t = 0; t < seconds; t += 1 / 60) { d.simulate(1 / 60); if (until && until()) return true; } return false; };
  const silenceAllBut = (keep) => { for (const enemy of d.enemies.list) if (!keep.includes(enemy)) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 }); };
  const clearRemains = () => { while (d.remains.list.length) d.remains.remove(d.remains.list[0]); };
  const logTexts = () => d.hud.gameLog.entries.map((entry) => entry.text);
  const outfit = (pieces) => {
    d.gear.state.shells = [];
    d.gear.state.claws = [{ id: 2, kind: 'bare', quality: 'fine' }];
    d.gear.state.wornShellId = null;
    d.gear.state.wornClawsId = 2;
    d.gear.state.wornSmallId = null;
    const items = {};
    for (const [slot, kind, quality] of pieces) {
      const item = d.gear.grant(slot === 'shell' || slot === 'packShell' ? 'shell' : 'claws', kind, quality || 'fine');
      if (slot === 'shell') d.gear.wear(item.id);
      if (slot === 'big' || slot === 'small') d.gear.wear(item.id, slot);
      items[slot] = item;
    }
    return items;
  };
  const killPlayerWith = (enemy) => {
    d.player.alive = true;
    const spot = d.navigation.nearestWalkable(enemy.x + 2, enemy.z, 10);
    Object.assign(d.player, { x: spot.x, z: spot.z, path: [], pathIndex: 0, combatTarget: null, gatherTarget: null });
    d.save.inventory = { shellBits: 3 };
    d.progression.state.health = 1;
    d.hitPlayer(enemy);
    step(3, () => d.progression.state.health > 1);
  };

  const rivals = d.enemies.list.filter((enemy) => enemy.kind === 'rivalHermit');
  out.rivalCount = rivals.length;
  out.rivalsPlaced = rivals.filter((enemy) => enemy.state !== 'dead').length;
  out.rivalOnReef = rivals.some((enemy) => d.world.isOnReef(enemy.x, enemy.z));
  out.rivalHasCrab = rivals.every((enemy) => Boolean(enemy.hermit));

  const rival = rivals[0];
  silenceAllBut([rival]);
  clearRemains();
  const baseAttack = d.looting.attackOf(rival);
  const baseDefense = d.looting.defenseOf(rival);
  const baseLevel = d.looting.levelOf(rival);
  const worn = outfit([['shell', 'turban'], ['big', 'coralTipped'], ['small', 'shellShield'], ['packShell', 'whelk']]);
  killPlayerWith(rival);
  out.rivalTookAll = Boolean(rival.loot && rival.loot.shell && rival.loot.shell.id === worn.shell.id && rival.loot.big && rival.loot.big.id === worn.big.id && rival.loot.small && rival.loot.small.id === worn.small.id);
  const corpse = d.remains.list[0];
  out.corpseKeepsRest = Boolean(corpse) && corpse.gear.shells.length === 1 && corpse.gear.shells[0].kind === 'whelk' && corpse.gear.claws.length === 0 && corpse.inventory.shellBits === 3;
  out.logTook = logTexts().some((text) => /Rival hermit crab took your Turban shell and Coral-tipped claws and Clam shield/.test(text));
  out.stronger = d.looting.attackOf(rival) > baseAttack && d.looting.defenseOf(rival) > baseDefense;
  out.attackGain = d.looting.attackOf(rival) - baseAttack;
  out.defenseGain = d.looting.defenseOf(rival) - baseDefense;
  out.levelRaised = d.looting.levelOf(rival) > baseLevel;
  out.levels = [baseLevel, d.looting.levelOf(rival)];
  out.starLabel = d.looting.labelOf(rival) === 'Rival hermit crab ★';

  d.player.alive = true;
  d.progression.state.health = d.progression.maxHealth();
  const before = d.progression.state.health;
  d.randomSource.next = () => 0.5;
  d.hitPlayer(rival);
  out.hitUsesLootAttack = (d.hud.gameLog.entries.at(-1).detail || '').includes(`attack ${d.looting.attackOf(rival)} ·`);
  d.randomSource.next = Math.random;
  out.hitTook = before - d.progression.state.health;

  clearRemains();
  outfit([['shell', 'coral']]);
  killPlayerWith(rival);
  out.betterShellSwapped = rival.loot.shell.kind === 'coral' && d.remains.list[0].gear.shells.some((item) => item.kind === 'turban');

  clearRemains();
  outfit([['shell', 'snail']]);
  killPlayerWith(rival);
  out.worseShellLeft = rival.loot.shell.kind === 'coral' && d.remains.list[0].gear.shells.some((item) => item.kind === 'snail');

  const crab = d.enemies.list.find((enemy) => enemy.kind === 'shoreCrab');
  d.enemies.spawn('shoreCrab', crab.home.x, crab.home.z, 0);
  silenceAllBut([crab, rival]);
  clearRemains();
  outfit([['shell', 'turban'], ['big', 'shellEdged']]);
  killPlayerWith(crab);
  out.shoreCrabTakesClawsOnly = Boolean(crab.loot && crab.loot.big && crab.loot.big.kind === 'shellEdged' && !crab.loot.shell) && d.remains.list[0].gear.shells.some((item) => item.kind === 'turban');

  const rat = d.enemies.list.find((enemy) => enemy.kind === 'rat');
  d.enemies.spawn('rat', rat.home.x, rat.home.z, 0);
  clearRemains();
  outfit([['shell', 'turban'], ['big', 'shellEdged']]);
  killPlayerWith(rat);
  out.ratCannotLoot = !rat.loot && d.remains.list[0].gear.shells.length === 1 && d.remains.list[0].gear.claws.length === 1;

  d.persist();
  const saved = JSON.parse(localStorage.getItem('seaofcrabs-crab-save'));
  out.savedLooters = (saved.looters || []).map((entry) => `${entry.key}:${Object.values(entry.loot).filter(Boolean).map((item) => item.kind).join('+')}`);
  return out;
}
'''

AFTER_RELOAD = r'''
() => {
  const d = window.__debug;
  const out = {};
  const step = (seconds, until) => { for (let t = 0; t < seconds; t += 1 / 60) { d.simulate(1 / 60); if (until && until()) return true; } return false; };
  const rival = d.enemies.list.find((enemy) => enemy.kind === 'rivalHermit' && enemy.loot);
  out.rivalRestored = Boolean(rival) && rival.loot.shell.kind === 'coral' && rival.loot.big.kind === 'coralTipped';
  out.crabRestored = d.enemies.list.some((enemy) => enemy.kind === 'shoreCrab' && enemy.loot && enemy.loot.big && enemy.loot.big.kind === 'shellEdged');
  while (d.remains.list.length) d.remains.remove(d.remains.list[0]);
  d.gear.state.shells = [];
  d.gear.state.claws = [{ id: 2, kind: 'bare', quality: 'fine' }];
  d.gear.state.wornShellId = null;
  d.gear.state.wornClawsId = 2;
  d.gear.state.wornSmallId = null;
  d.enemies.damage(rival, 1e6, d.simulationTime());
  const pile = d.remains.list[0];
  out.dropsOnDeath = Boolean(pile) && Math.hypot(pile.x - rival.x, pile.z - rival.z) < 0.5 && pile.gear.shells.length === 1 && pile.gear.claws.length === 2;
  out.lootCleared = !rival.loot;
  out.logDropped = d.hud.gameLog.entries.some((entry) => /Rival hermit crab dropped your/.test(entry.text));
  d.recoverRemains(pile);
  out.recoveredWorn = d.gear.state.wornShellId === pile.gear.wornShellId && d.gear.state.wornClawsId === pile.gear.wornClawsId && d.gear.state.wornSmallId === pile.gear.wornSmallId;
  step(2);
  out.rivalRespawnsPlain = rival.state === 'dead' || !rival.loot;
  return out;
}
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 915, 'height': 412})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate("() => localStorage.clear()")
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate("() => __debug.setPaused(true)")
    first = page.evaluate(FLOW)
    page.evaluate("() => __debug.persist()")
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate("() => __debug.setPaused(true)")
    second = page.evaluate(AFTER_RELOAD)
    browser.close()

result = {**first, **second, 'errors': errors}
print(json.dumps(result, indent=1))
checks = ['rivalHasCrab', 'rivalTookAll', 'corpseKeepsRest', 'logTook', 'stronger', 'levelRaised', 'starLabel', 'hitUsesLootAttack', 'betterShellSwapped', 'worseShellLeft', 'shoreCrabTakesClawsOnly', 'ratCannotLoot', 'rivalRestored', 'crabRestored', 'dropsOnDeath', 'lootCleared', 'logDropped', 'recoveredWorn']
failed = [name for name in checks if not result.get(name)]
if result['rivalCount'] < 4 or result['rivalsPlaced'] < 4: failed.append('rivalsPlaced')
if errors: failed.append('errors')
print('FAILED: ' + ', '.join(failed) if failed else 'PASS')
sys.exit(1 if failed else 0)
