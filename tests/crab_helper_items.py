import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender'

FLOW = r'''
() => {
  const d = window.__debug;
  const out = {};
  d.setPaused(false);
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 7, seaLettuce: 5 });
  d.buildWorkshop();
  d.buildAtDefaultSpot('helperNest');
  const helper = d.rescueHelperAt(d.helpers.strandedVisible()[0]);
  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  Object.assign(d.save.inventory, { kelpPoultice: 60, driedKelp: 3 });

  d.helpersPanel.open();
  document.querySelector(`#hud .helpers-panel [data-give="${helper.id}:kelpPoultice:5"]`).click();
  document.querySelector(`#hud .helpers-panel [data-give="${helper.id}:kelpPoultice:1"]`).click();
  out.afterGive = { bag: JSON.stringify(helper.bag), inventory: d.save.inventory.kelpPoultice };
  for (let i = 0; i < 4; i++) document.querySelector(`#hud .helpers-panel [data-give="${helper.id}:kelpPoultice:5"]`).click();
  for (let i = 0; i < 6; i++) document.querySelector(`#hud .helpers-panel [data-give="${helper.id}:kelpPoultice:5"]`)?.click();
  out.stackCapped = helper.bag[0].count === 50 && d.save.inventory.kelpPoultice === 10;
  document.querySelector(`#hud .helpers-panel [data-give="${helper.id}:driedKelp:1"]`).click();
  out.secondSlot = helper.bag[1] && helper.bag[1].type === 'driedKelp';
  d.helpersPanel.close();

  const max = d.helpers.maxHealthOf ? d.helpers.maxHealthOf(helper) : null;
  const setup = (mode, selfShare, playerShare, near = true) => {
    d.helpers.setItemUse(helper.id, mode);
    helper.itemReadyAt = {};
    helper.wellFedUntil = 0;
    const helperMax = d.helperInfo ? d.helperInfo(helper).maxHealth : 10;
    helper.health = helperMax * selfShare;
    d.progression.state.health = d.progression.maxHealth() * playerShare;
    Object.assign(helper, { x: d.player.x + (near ? 2 : 30), z: d.player.z });
    return d.helpers.useItemsIfNeeded(helper, 1000);
  };
  const result = (value) => value ? `${value.type}>${value.target}` : 'none';
  out.both_playerLower = result(setup('both', 0.35, 0.2));
  out.both_selfLower = result(setup('both', 0.1, 0.3));
  out.self_only = result(setup('self', 0.9, 0.1));
  out.self_hurt = result(setup('self', 0.2, 0.1));
  out.you_only = result(setup('you', 0.1, 0.9));
  out.you_hurt = result(setup('you', 0.1, 0.2));
  out.you_far = result(setup('you', 0.1, 0.2, false));
  out.nobody = result(setup('nobody', 0.1, 0.1));
  const healthBefore = d.progression.state.health;
  setup('you', 0.9, 0.2);
  out.playerHealed = d.progression.state.health > d.progression.maxHealth() * 0.2;
  const cooled = d.helpers.useItemsIfNeeded(helper, 1000);
  out.cooldownBlocks = !cooled;
  d.helpers.setItemUse(helper.id, 'self');
  helper.bag[0] = null;
  helper.itemReadyAt = {};
  helper.health = 1;
  out.kelpFallback = result(d.helpers.useItemsIfNeeded(helper, 1000));
  d.helpers.giveItem(helper.id, 'kelpPoultice', 3);
  d.helpers.setItemUse(helper.id, 'you');
  d.persist();
  out.saved = JSON.stringify(d.helpers.serialize().list[0].bag) + '|' + d.helpers.serialize().list[0].itemUse;
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
    with page.expect_navigation(timeout=180000):
        page.evaluate('() => { setTimeout(() => window.__debug.startOver(), 0); }')
    page.wait_for_function('!!window.__debug', timeout=180000)
    out = page.evaluate(FLOW)
    print(json.dumps(out, indent=1))
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reloaded = page.evaluate("() => { const h = __debug.helpers.list[0]; return JSON.stringify(h.bag) + '|' + h.itemUse; }")
    checks = {
        'giveFromPanel': out['afterGive']['inventory'] == 54 and '"count":6' in out['afterGive']['bag'],
        'stackLimit50': out['stackCapped'],
        'twoSlots': out['secondSlot'],
        'bothPicksLowerShare': out['both_playerLower'] == 'kelpPoultice>player' and out['both_selfLower'] == 'kelpPoultice>self',
        'selfMode': out['self_only'] == 'none' and out['self_hurt'] == 'kelpPoultice>self',
        'youMode': out['you_only'] == 'none' and out['you_hurt'] == 'kelpPoultice>player' and out['you_far'] == 'none',
        'nobodyMode': out['nobody'] == 'none',
        'healsPlayer': out['playerHealed'],
        'cooldown': out['cooldownBlocks'],
        'kelpForSelf': out['kelpFallback'] == 'driedKelp>self',
        'savedAndReloaded': reloaded == out['saved'] and 'kelpPoultice' in reloaded and reloaded.endswith('|you'),
        'noErrors': not errors,
    }
    print(json.dumps(checks, indent=2), reloaded, errors)
    browser.close()
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    sys.exit(0 if all(checks.values()) else 1)
