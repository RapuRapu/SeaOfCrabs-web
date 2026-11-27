import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

FLOW = r'''
() => {
  const d = window.__debug;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  const out = {};
  d.setPaused(false);
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 7, seaLettuce: 5 });
  d.buildWorkshop();
  d.buildAtDefaultSpot('helperNest');
  const buddy = d.rescueHelperAt(d.helpers.strandedVisible()[0]);
  const other = d.rescueHelperAt(d.helpers.strandedVisible()[0]);
  const claws = d.gear.grant('claws', 'shellEdged');
  d.equipHelper(buddy.id, 'claws', claws.id);
  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });

  out.followSet = d.helpers.setJob(buddy.id, 'follow');
  out.secondRefused = d.helpers.setJob(other.id, 'follow') === false;
  out.optionHidden = (() => { d.helpersPanel.open(); const options = [...document.querySelectorAll(`#hud .helpers-panel select[data-job="${other.id}"] option`)].map((o) => o.value); d.helpersPanel.close(); return !options.includes('follow'); })();


  step(8, () => buddy.state === 'following');
  out.cameOut = buddy.state === 'following';
  const goal = d.navigation.nearestWalkable(d.player.x + 14, d.player.z + 6, 8);
  d.setDestination(goal.x, goal.z);
  step(10);
  out.followDistance = +Math.hypot(buddy.x - d.player.x, buddy.z - d.player.z).toFixed(1);

  const crabSpot = d.navigation.nearestWalkable(d.player.x + 3, d.player.z, 6);
  const crab = d.enemies.spawn('shoreCrab', crabSpot.x, crabSpot.z);
  crab.health = crab.definition.health * 5;
  d.engage(crab);
  let helperHits = 0;
  let lastHealth = crab.health;
  for (let t = 0; t < 8; t += 1/60) {
    d.simulate(1/60);
    if (buddy.fightTargetId === crab.id && crab.health < lastHealth) helperHits++;
    lastHealth = crab.health;
  }
  out.helpedInFight = buddy.fightTargetId === crab.id || helperHits > 0;
  const experienceBefore = (buddy.experience || 0) + (buddy.level || 1) * 1e6;
  crab.assistingHelperIds = new Set([buddy.id]);
  crab.health = 1;
  d.enemies.damage(crab, 999, d.simulationTime, null);
  step(0.2);
  out.assistExperience = (buddy.experience || 0) + (buddy.level || 1) * 1e6 > experienceBefore;
  Object.assign(crab, { state: 'dead', respawnTimer: 1e9 });
  d.player.combatTarget = null;

  d.goHome();
  step(30, () => d.isHome());
  out.fledEarlier = buddy.state === 'resting';
  step(10, () => buddy.state === 'following');
  step(2);
  out.homeDebug = { home: d.isHome(), state: buddy.state, distance: Math.hypot(buddy.x - d.player.x, buddy.z - d.player.z), health: buddy.health };
  out.homeWithYou = d.isHome() && buddy.state === 'following' && Math.hypot(buddy.x - d.player.x, buddy.z - d.player.z) < 8;
  out.unfollow = d.helpers.setJob(buddy.id, null) && d.helpers.setJob(other.id, 'follow');
  d.persist();
  return out;
}
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    page = browser.new_page(viewport={'width': 915, 'height': 412})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    with page.expect_navigation(timeout=180000):
        page.evaluate('() => { setTimeout(() => window.__debug.startOver(), 0); }')
    page.wait_for_function('!!window.__debug', timeout=180000)
    flow = page.evaluate(FLOW)
    print(json.dumps(flow), flush=True)
    checks = {
        'onlyOneFollower': flow['followSet'] and flow['secondRefused'] and flow['optionHidden'],
        'followsOnSurface': flow['cameOut'] and flow['followDistance'] <= 6,
        'helpsInFight': flow['helpedInFight'],
        'assistGivesExperience': flow['assistExperience'],
        'followsHome': flow['homeWithYou'],
        'canSwitchFollower': flow['unfollow'],
        'noErrors': not errors,
    }
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    browser.close()
    sys.exit(0 if all(checks.values()) else 1)
