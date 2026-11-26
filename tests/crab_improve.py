import os, json, sys
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

SETUP = r'''
() => {
  const d = window.__debug;
  d.setPaused(true);
  Object.assign(d.save.inventory, { shellBits: 5, driftwood: 3, seaLettuce: 3 });
  d.buildWorkshop();
  return d.burrow.hasStation('workshop');
}
'''

LOGIC = r'''
() => {
  const d = window.__debug;
  const out = {};
  const give = (items) => { for (const [type, amount] of Object.entries(items)) d.save.inventory[type] = (d.save.inventory[type] || 0) + amount; };
  const step = (seconds) => { for (let t = 0; t < seconds; t += 1 / 60) d.simulate(1 / 60); };

  give({ shellBits: 10, seaLettuce: 4 });
  const fineTurban = d.craftItem('shell', 'turban');
  give({ coral: 6, seaGlass: 2, shellBits: 6 });
  const crudeCoral = d.craftItem('shell', 'coral');
  out.toolOneQualities = [fineTurban.quality, crudeCoral.quality];
  out.upgradeWithoutMaterials = d.upgradeTools();
  give({ coral: 4, seaGlass: 2, pearls: 1 });
  out.upgraded = !!d.upgradeTools() && d.gear.state.toolTier === 2 && !d.save.inventory.pearls && !d.save.inventory.coral;
  give({ shellBits: 10, seaLettuce: 4 });
  const masterTurban = d.craftItem('shell', 'turban');
  out.toolTwoTurban = masterTurban.quality;

  out.refineTarget = d.gear.refineTarget(crudeCoral.id);
  out.refineRefusedWithoutPearl = (() => { give({ coral: 3, seaGlass: 1, shellBits: 3 }); return d.refineItem(crudeCoral.id) === null; })();
  give({ pearls: 1 });
  out.refined = !!d.refineItem(crudeCoral.id) && crudeCoral.quality === 'fine' && !d.save.inventory.pearls && !d.save.inventory.coral && !d.save.inventory.shellBits;
  out.refineTargetAfter = d.gear.refineTarget(crudeCoral.id);

  d.wearItem(masterTurban.id);
  out.masterworkDefense = d.playerStats().defense;
  give({ scrap: 3, cloth: 1 });
  d.modifyItem(masterTurban.id, 'metalPlate');
  const plated = d.playerStats();
  out.platedDefense = plated.defense;
  out.platedSpeed = +plated.speedFactor.toFixed(3);
  give({ fishBone: 3 });
  out.replaceRefusedSame = d.modifyItem(masterTurban.id, 'boneSpikes') !== null && d.modifyItem(masterTurban.id, 'boneSpikes') === null;
  out.spikesThorns = d.playerStats().thorns;
  out.spikesDefense = d.playerStats().defense;

  give({ shellBits: 6, driftwood: 4 });
  const claws = d.craftItem('claws', 'shellEdged');
  d.wearItem(claws.id);
  d.progression.setLevel(1);
  d.progression.state.clawSkill = 0;
  out.masterworkClawAttack = d.playerStats().attack;
  give({ scrap: 2, cloth: 1 });
  d.modifyItem(claws.id, 'wire');
  out.wireAttack = d.playerStats().attack;
  give({ cloth: 2 });
  d.modifyItem(claws.id, 'thread');
  out.threadInterval = d.playerStats().attackIntervalFactor;
  give({ driedKelp: 2 });
  d.modifyItem(claws.id, 'kelp');
  out.kelpHeal = d.playerStats().healOnHit;

  out.moltsAtLevelOne = d.progression.moltsAvailable();
  d.progression.setLevel(3);
  out.moltsAtLevelThree = d.progression.moltsAvailable();
  if (d.isUnderground()) d.exitBurrow();
  out.surfaceMoltRefused = d.startMolt('crusher') === false;
  d.enterBurrow();
  out.moltStarted = d.startMolt('crusher');
  out.moltingBlocksTravel = d.travelOption() === null;
  const attackBefore = d.playerStats().attack;
  step(30);
  out.stillMoltingAt30 = d.isMolting();
  step(31);
  out.molts = [...d.progression.state.molts];
  out.softAfterMolt = d.isSoft();
  out.softDefense = d.playerStats().defense;
  out.attackGrowth = +(d.playerStats().attack / attackBefore).toFixed(3);
  step(121);
  out.hardAgain = !d.isSoft() && d.playerStats().defense === out.spikesDefense;

  d.progression.setLevel(10);
  d.progression.state.molts = ['crusher', 'crusher', 'crusher'];
  out.moltsAtTen = d.progression.moltsAvailable();
  d.progression.setLevel(12);
  out.moltsAtTwelve = d.progression.moltsAvailable();
  d.progression.setLevel(23);
  out.moltsAt23 = d.progression.moltsEarned();
  d.progression.setLevel(50);
  out.moltsAtCap = d.progression.moltsEarned();
  out.levelCap = (() => { d.progression.setLevel(99); return d.progression.state.level; })();
  d.progression.setLevel(10);
  d.progression.state.molts = ['crusher', 'crusher', 'crusher'];

  d.progression.state.clawSkill = 0;
  for (let hit = 0; hit < 187; hit++) d.progression.practiceClaws();
  out.skillAfter187 = +d.progression.state.clawSkill.toFixed(2);
  for (let hit = 0; hit < 5000; hit++) d.progression.practiceClaws();
  out.skillCap = d.progression.state.clawSkill;
  d.progression.state.clawSkill = 10;
  d.die();
  step(3);
  out.skillAfterDeath = +d.progression.state.clawSkill.toFixed(3);
  out.backpackGrowth = (() => { document.querySelector('#hud .level-badge').click(); const text = document.querySelector('#hud .status-panel .status-body')?.textContent; document.querySelector('#hud .status-panel .workbench-close').click(); return text; })();
  if (d.remains.list.length) d.recoverRemains(d.remains.list[0]);
  d.persist();
  return out;
}
'''

PANEL_STATE = r'''
() => {
  const d = window.__debug;
  const rows = [...document.querySelectorAll('#hud .workbench.visible [data-improve-item]')].map((row) => ({ id: row.dataset.improveItem, name: row.querySelector('.item-name').textContent }));
  return { rows, tools: d.gear.state.toolTier, result: document.querySelector('#hud .workbench.visible .improve-result')?.textContent || null, options: [...document.querySelectorAll('#hud .workbench.visible [data-modify], #hud .workbench.visible [data-refine]')].map((b) => b.dataset.modify || `refine:${b.dataset.refine}`) };
}
'''

V4_SAVE = {'version': 4, 'x': 13, 'z': -21, 'heading': 2.3, 'worldTime': 260, 'inventory': {'shellBits': 2}, 'nodes': None, 'goalAnnounced': True, 'hasMoved': True, 'wetness': 0, 'wetHeight': 0,
           'gear': {'nextId': 9, 'shells': [{'id': 1, 'kind': 'snail', 'enchant': 0}, {'id': 5, 'kind': 'turban', 'enchant': 5}], 'claws': [{'id': 2, 'kind': 'bare', 'enchant': 0}, {'id': 6, 'kind': 'shellEdged', 'enchant': 2}], 'wornShellId': 5, 'wornClawsId': 6},
           'workshopBuilt': True, 'craftedOnce': True, 'progression': {'level': 4, 'experience': 10, 'health': 54}, 'remains': [], 'storage': {'inventory': {}, 'shells': [{'id': 7, 'kind': 'cone', 'enchant': 9}], 'claws': []}}


def wait_frames(page, count=3):
    for _ in range(count):
        page.evaluate('() => new Promise((resolve) => requestAnimationFrame(() => resolve()))')


def fresh_page(context, errors):
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:300]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate('() => window.__debug.startOver()')
    page.wait_for_function('!!window.__debug', timeout=180000)
    return page


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    checks = {}
    context = browser.new_context(viewport={'width': 915, 'height': 412})
    page = fresh_page(context, errors)
    checks['workshopBuilt'] = page.evaluate(SETUP)
    logic = page.evaluate(LOGIC)
    print(json.dumps(logic), flush=True)
    checks.update({
        'qualityFromTools': logic['toolOneQualities'] == ['fine', 'crude'] and logic['toolTwoTurban'] == 'masterwork',
        'toolUpgradeCosts': logic['upgradeWithoutMaterials'] is None and logic['upgraded'],
        'refine': logic['refineTarget'] == 'fine' and logic['refineRefusedWithoutPearl'] and logic['refined'] and logic['refineTargetAfter'] is None,
        'reinforcement': logic['masterworkDefense'] == 9 and logic['platedDefense'] == 11 and logic['platedSpeed'] == round(0.88 * 0.95, 3),
        'spikesReplacePlate': logic['replaceRefusedSame'] and logic['spikesThorns'] == 3 and logic['spikesDefense'] == 9,
        'bindings': logic['masterworkClawAttack'] == 9 and logic['wireAttack'] == 10 and abs(logic['threadInterval'] - 0.9) < 1e-9 and logic['kelpHeal'] == 1,
        'moltSchedule': logic['moltsAtLevelOne'] == 0 and logic['moltsAtLevelThree'] == 1 and logic['moltsAtTen'] == 0 and logic['moltsAtTwelve'] == 1 and logic['moltsAt23'] == 7 and logic['moltsAtCap'] == 8 and logic['levelCap'] == 50,
        'moltInBurrowOnly': logic['surfaceMoltRefused'] and logic['moltStarted'] and logic['moltingBlocksTravel'] and logic['stillMoltingAt30'],
        'moltGrowsAndSoftens': logic['molts'] == ['crusher'] and logic['softAfterMolt'] and logic['softDefense'] == 5 and logic['attackGrowth'] > 1 and logic['hardAgain'],
        'clawSkill': 9.5 < logic['skillAfter187'] < 10.5 and logic['skillCap'] == 20 and logic['skillAfterDeath'] == 9.5,
        'statusShowsGrowth': bool(logic['backpackGrowth']) and 'Claw skill9.5 / 20' in logic['backpackGrowth'],
    })

    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    reloaded = page.evaluate('''() => { const d = window.__debug; const shell = d.gear.wornShell(); const claws = d.gear.wornClaws(); return { tools: d.gear.state.toolTier, shell: shell && `${shell.kind}:${shell.quality}:${shell.reinforcement}`, claws: `${claws.kind}:${claws.quality}:${claws.binding}`, skill: d.progression.state.clawSkill, molts: d.progression.state.molts.length, version: d.save.version }; }''')
    print('reloaded', json.dumps(reloaded), flush=True)
    checks['saved'] = reloaded == {'tools': 2, 'shell': 'turban:masterwork:boneSpikes', 'claws': 'shellEdged:masterwork:kelp', 'skill': 9.5, 'molts': 3, 'version': 7}
    context.close()

    old = browser.new_context(viewport={'width': 915, 'height': 412})
    old.add_init_script(f"if (!sessionStorage.getItem('seeded')) {{ localStorage.setItem('seaofcrabs-crab-save', {json.dumps(json.dumps(V4_SAVE))}); sessionStorage.setItem('seeded', '1'); }}")
    old_page = old.new_page()
    old_page.on('pageerror', lambda error: errors.append(str(error)))
    old_page.goto(URL)
    old_page.wait_for_function('!!window.__debug', timeout=180000)
    migrated = old_page.evaluate('''() => { const d = window.__debug; return { shells: d.gear.state.shells.map((i) => `${i.kind}:${i.quality}:${'enchant' in i}`), claws: d.gear.state.claws.map((i) => `${i.kind}:${i.quality}`), stored: d.storage.shells.map((i) => `${i.kind}:${i.quality}`), tools: d.gear.state.toolTier, level: d.progression.state.level, molts: d.progression.moltsAvailable(), skill: d.progression.state.clawSkill }; }''')
    print('migrated', json.dumps(migrated), flush=True)
    checks['migratesEnchant'] = migrated == {'shells': ['snail:fine:false', 'turban:masterwork:false'], 'claws': ['bare:fine', 'shellEdged:fine'], 'stored': ['cone:masterwork'], 'tools': 1, 'level': 4, 'molts': 1, 'skill': 0}
    old.close()

    mobile = browser.new_context(viewport={'width': 412, 'height': 915}, is_mobile=True, has_touch=True, device_scale_factor=2)
    touch = fresh_page(mobile, errors)
    touch.evaluate(SETUP)
    touch.evaluate('''() => {
      const d = window.__debug;
      d.setPaused(false);
      Object.assign(d.save.inventory, { shellBits: 10, seaLettuce: 4, coral: 4, seaGlass: 2, pearls: 2, scrap: 3, cloth: 1 });
      const turban = d.craftItem('shell', 'turban');
      d.wearItem(turban.id);
      d.workbenchPanel.open('Improve');
    }''')
    wait_frames(touch)
    first = touch.evaluate(PANEL_STATE)
    touch.tap('[data-upgrade-tools="2"]')
    wait_frames(touch)
    after_upgrade = touch.evaluate(PANEL_STATE)
    turban_id = next(row['id'] for row in after_upgrade['rows'] if row['name'].startswith('Turban'))
    touch.tap(f'[data-expand="{turban_id}"]')
    wait_frames(touch)
    expanded = touch.evaluate(PANEL_STATE)
    touch.tap(f'[data-modify="{turban_id}:metalPlate"]')
    wait_frames(touch)
    plated = touch.evaluate(PANEL_STATE)
    worn = touch.evaluate('() => { const s = window.__debug.gear.wornShell(); return `${s.quality}:${s.reinforcement}`; }')
    print(json.dumps({'first': first, 'upgrade': after_upgrade, 'expanded': expanded, 'plated': plated, 'worn': worn}), flush=True)
    checks['touchUpgradeTools'] = first['tools'] == 1 and after_upgrade['tools'] == 2 and after_upgrade['result'] and 'Coral file' in after_upgrade['result']
    checks['touchExpandShowsOptions'] = f'refine:{turban_id}' in expanded['options'] and f'{turban_id}:metalPlate' in expanded['options'] and f'{turban_id}:boneSpikes' in expanded['options']
    checks['touchReinforce'] = worn == 'fine:metalPlate' and plated['result'] and 'metal plate' in plated['result']

    molt_flow = touch.evaluate('''() => {
      const d = window.__debug;
      d.workbenchPanel.close();
      d.progression.setLevel(3);
      d.enterBurrow();
      d.refreshHud && d.refreshHud(null);
      return true;
    }''')
    wait_frames(touch, 6)
    button_visible = touch.evaluate("() => { const b = document.querySelector('#hud .molt-button'); return b && !b.classList.contains('hidden') && b.getBoundingClientRect().width > 0 ? b.textContent : null; }")
    if button_visible:
        touch.tap('#hud .molt-button')
        wait_frames(touch)
    panel_open = touch.evaluate('() => window.__debug.moltPanel.isOpen')
    if panel_open:
        touch.tap('[data-molt="cutter"]')
        wait_frames(touch)
    molting = touch.evaluate('() => ({ molting: window.__debug.isMolting(), panel: window.__debug.moltPanel.isOpen })')
    print(json.dumps({'button': button_visible, 'panel': panel_open, 'molting': molting}), flush=True)
    checks['touchMolt'] = bool(button_visible) and button_visible.endswith('1') and panel_open and molting == {'molting': True, 'panel': False}
    mobile.close()
    browser.close()

    checks['noErrors'] = not errors
    print(json.dumps({'checks': checks, 'errors': errors[:5]}, indent=1))
    print('ALL PASS' if all(checks.values()) else 'FAIL')
    sys.exit(0 if all(checks.values()) else 1)
