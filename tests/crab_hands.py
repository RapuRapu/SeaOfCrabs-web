import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  d.setPaused(false);
  d.equipBuild('turban', 'bare', false);
  d.progression.state.molts = [];
  const grant = (kind) => d.gear.grant('claws', kind);
  const cleaver = grant('cleaver'), edged = grant('shellEdged'), coral = grant('coralTipped'), clam = grant('shellShield'), lobster = grant('lobsterShield');

  out.cleaverRefusedSmall = d.wearItem(cleaver.id, 'small') === false && d.gear.state.wornSmallId === null;
  out.lobsterRefusedSmall = d.wearItem(lobster.id, 'small') === false;
  d.progression.state.molts = ['crusher', 'crusher', 'crusher', 'crusher'];
  out.lobsterFitsAfterMolts = d.wearItem(lobster.id, 'small') === true;
  d.progression.state.molts = [];
  d.unequipItem('small');

  const bareStats = d.playerStats();
  out.bareAlternates = JSON.stringify(bareStats.strikingHands) === '["big","small"]';

  d.wearItem(edged.id, 'big');
  const oneWeapon = d.playerStats();
  out.oneWeaponOnlyBig = JSON.stringify(oneWeapon.strikingHands) === '["big"]';

  d.wearItem(coral.id, 'small');
  const dual = d.playerStats();
  out.dualAlternates = JSON.stringify(dual.strikingHands) === '["big","small"]';
  out.smallWeaker = dual.handAttack.small < dual.handAttack.big;

  d.wearItem(edged.id, 'small');
  out.movedBetweenHands = d.gear.state.wornSmallId === edged.id && d.gear.state.wornClawsId !== edged.id;

  d.wearItem(cleaver.id, 'big');
  d.wearItem(clam.id, 'small');
  const shielded = d.playerStats();
  out.shieldOnlyBigStrikes = JSON.stringify(shielded.strikingHands) === '["big"]';
  out.shieldArmour = shielded.shieldArmour === 3 && Math.abs(shielded.blockChance - 0.1) < 1e-9;

  const enemy = d.enemies.list.find((candidate) => candidate.kind === 'shoreCrab');
  d.progression.state.health = d.progression.maxHealth();
  const realRandom = Math.random;
  Math.random = () => 0.01;
  const before = d.progression.state.health;
  d.hitPlayer(enemy);
  out.blockedNoDamage = d.progression.state.health === before;
  Math.random = () => 0.99;
  d.hitPlayer(enemy);
  out.unblockedDamage = d.progression.state.health < before;
  Math.random = realRandom;

  const hands = [];
  for (let index = 0; index < 4; index++) {
    d.strike(enemy);
    hands.push([...document.querySelectorAll('#hud .log-line')].map((line) => line.textContent).filter((text) => text.includes('You hit')).slice(-1)[0] || '');
  }
  out.cleaverLogged = hands.every((line) => !/small claw/.test(line));

  const saved = d.gear.serialize();
  out.savedSmall = saved.wornSmallId === clam.id;
  const dropped = d.gear.dropAll();
  out.droppedSmall = dropped.wornSmallId === clam.id && d.gear.state.wornSmallId === null;
  d.gear.restore(dropped);
  out.restoredSmall = d.gear.state.wornSmallId === clam.id;
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
