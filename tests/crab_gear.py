import os, json
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath('dist/index.html') + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

GATHER_AND_BUILD = r'''
() => {
  const d = window.__debug; const p = d.player;
  const step = (seconds, until) => { let t = 0; for (; t < seconds; t += 1/60) { d.simulate(1/60); if (until && until()) break; } return t; };
  d.setPaused(false);
  for (const enemy of d.enemies.list) Object.assign(enemy, { state: 'dead', respawnTimer: 1e9 });
  for (const [type, count] of Object.entries({ shellBits: 5, driftwood: 3, seaLettuce: 3 })) {
    for (let n = 0; n < count; n++) {
      const node = d.resources.nodes.filter(node => node.type === type && !node.gathered).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      d.setDestination(node.x, node.z, node);
      step(120, () => node.gathered);
    }
  }
  return { inventory: { ...d.save.inventory } };
}
'''

TAP_WORKSHOP = r'''
() => {
  const d = window.__debug;
  const point = new d.camera.position.constructor(d.workshop.spot.x, d.workshop.group.position.y + 0.5, d.workshop.spot.z).project(d.camera);
  return { x: (point.x * 0.5 + 0.5) * innerWidth, y: (-point.y * 0.5 + 0.5) * innerHeight };
}
'''

WALK_SPEED_SAMPLE = r'''
() => {
  const d = window.__debug; const p = d.player;
  const step = (seconds) => { for (let t = 0; t < seconds; t += 1/60) d.simulate(1/60); };
  d.workbenchPanel.close();

  const start = d.navigation.nearestWalkable(30, -40, 10);
  Object.assign(p, { x: start.x, z: start.z });
  step(0.5);
  d.setDestination(start.x + 30, start.z);
  step(1);
  const x0 = p.x, z0 = p.z;
  step(2);
  return Math.hypot(p.x - x0, p.z - z0) / 2;
}
'''

def wait_frames(page, count=3):
    page.evaluate(f'() => new Promise(r => {{ let n = 0; const f = () => (++n >= {count} ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }})')

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 915, 'height': 412})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:400]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate("() => { localStorage.clear(); }")
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    checks = {}

    gathered = page.evaluate(GATHER_AND_BUILD)
    checks['gatheredForWorkshop'] = {**gathered, 'pass': gathered['inventory'].get('shellBits', 0) >= 5 and gathered['inventory'].get('driftwood', 0) >= 3 and gathered['inventory'].get('seaLettuce', 0) >= 3}

    page.evaluate("() => { const d = __debug; d.goHome(); d.renderScene(); }")
    page.click('#hud .build-open')
    page.click('#hud .build-panel [data-station="workshop"]')
    cell = page.evaluate("() => { const d = __debug; const s = d.home.defaultSpot('workshop'); d.renderScene(); const p = new d.camera.position.constructor(s.x, d.world.heightAt(s.x, s.z), s.z).project(d.camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; }")
    page.mouse.click(cell['x'], cell['y'])
    page.mouse.click(cell['x'], cell['y'])
    built = page.evaluate("() => { const d = __debug; const s = d.home.stationOf('workshop'); return { built: Boolean(s), home: d.isHome(), visible: d.workshop.built, inventory: { ...d.save.inventory }, spotBlocked: Boolean(s) && !d.world.isWalkable(s.x, s.z) } }")
    checks['buildWorkshop'] = {**built, 'pass': built['built'] and built['home'] and built['visible'] and built['spotBlocked'] and all(v == 0 for v in built['inventory'].values())}

    page.evaluate("() => { const d = __debug; const s = d.home.stationOf('workshop'); const p = d.navigation.nearestWalkable(s.x + 6, s.z + 5, 6); Object.assign(d.player, { x: p.x, z: p.z }); d.simulate(1/60); d.updateCamera(0, true); }")
    wait_frames(page)
    tap = page.evaluate(TAP_WORKSHOP)
    page.mouse.click(tap['x'], tap['y'])
    walked = page.evaluate("() => { const d = __debug; let t = 0; for (; t < 20 && !d.workbenchPanel.isOpen; t += 1/60) d.simulate(1/60); return { seconds: +t.toFixed(1), open: d.workbenchPanel.isOpen, distance: +Math.hypot(d.player.x - d.workshop.spot.x, d.player.z - d.workshop.spot.z).toFixed(2) }; }")
    checks['tapOpensPanel'] = {'tap': tap, **walked, 'pass': walked['open']}

    page.evaluate("() => { const inv = __debug.save.inventory; inv.shellBits = 30; inv.driftwood = 12; inv.seaLettuce = 8; __debug.workbenchPanel.render(); }")
    disabled_before = page.evaluate("() => [...document.querySelectorAll('#hud .workshop-panel [data-craft]')].map(b => b.disabled)")
    page.click('#hud .workshop-panel [data-craft="shell:turban"]')
    page.click('#hud .workshop-panel [data-craft="shell:cone"]')
    page.click('#hud .workshop-panel [data-craft="claws:shellEdged"]')
    crafted = page.evaluate("() => { const d = __debug; return { shells: d.gear.state.shells.map(s => s.kind), claws: d.gear.state.claws.map(c => c.kind), inventory: { ...d.save.inventory } } }")
    checks['craft'] = {'buttonsEnabled': disabled_before, **crafted, 'pass': crafted['shells'] == ['snail', 'turban', 'cone'] and crafted['claws'] == ['bare', 'shellEdged'] and crafted['inventory'] == {'shellBits': 6, 'driftwood': 4, 'seaLettuce': 4}}

    page.evaluate("() => { const inv = __debug.save.inventory; inv.shellBits = 0; __debug.workbenchPanel.render(); }")
    blocked = page.evaluate("() => ({ disabled: document.querySelector('#hud .workshop-panel [data-craft=\"shell:turban\"]').disabled, result: __debug.craftItem('shell', 'turban'), shells: __debug.gear.state.shells.length })")
    checks['cannotCraftWithoutMaterials'] = {**blocked, 'pass': blocked['disabled'] and blocked['result'] is None and blocked['shells'] == 3}

    snail_speed = page.evaluate(WALK_SPEED_SAMPLE)
    speeds = {'snail': snail_speed}
    stats = {}
    bag_dot_after_craft = page.evaluate("() => !document.querySelector('#hud .bag-dot').classList.contains('hidden')")
    page.evaluate("() => __debug.workbenchPanel.close()")
    page.click('#hud .bag-button')
    backpack_view = page.evaluate("() => ({ open: __debug.backpack.isOpen, newBadges: document.querySelectorAll('#hud .backpack .new-badge').length, materials: [...document.querySelectorAll('#hud .backpack .slot-grid [data-material]')].map(m => m.dataset.material), gearSlots: document.querySelectorAll('#hud .backpack .slot-grid [data-slot-item]').length, wornName: document.querySelector('#hud .backpack .equip-slot .equip-name')?.textContent, hudCountersGone: !document.querySelector('#hud .slot') })")
    checks['backpack'] = {'dotAfterCraft': bag_dot_after_craft, **backpack_view, 'pass': bag_dot_after_craft and backpack_view['open'] and backpack_view['newBadges'] == 3 and len(backpack_view['materials']) >= 1 and backpack_view['gearSlots'] == 3 and backpack_view['wornName'] == 'Snail shell' and backpack_view['hudCountersGone']}
    page.click('#hud .backpack .workbench-close')
    after_close = page.evaluate("() => ({ dotHidden: document.querySelector('#hud .bag-dot').classList.contains('hidden'), anyNew: __debug.gear.hasNewItems() })")
    checks['backpack']['afterClose'] = after_close
    checks['backpack']['pass'] = checks['backpack']['pass'] and after_close['dotHidden'] and not after_close['anyNew']
    for kind in ('turban', 'cone'):
        page.click('#hud .bag-button')
        shell_id = page.evaluate(f"() => __debug.gear.state.shells.find(s => s.kind === '{kind}').id")
        page.dblclick(f'#hud .backpack [data-slot-item="{shell_id}"]')
        page.evaluate("() => __debug.backpack.close()")
        stats[kind] = page.evaluate("() => __debug.gear.stats()")
        speeds[kind] = page.evaluate(WALK_SPEED_SAMPLE)
    claws_id = page.evaluate("() => __debug.gear.state.claws.find(c => c.kind === 'shellEdged').id")
    page.click('#hud .bag-button')
    page.click(f'#hud .backpack [data-slot-item="{claws_id}"]')
    page.click(f'#hud .backpack [data-wear="{claws_id}"]')
    worn_first = page.evaluate(f"() => !!document.querySelector('#hud .backpack .equip-slot [data-slot-item=\"{claws_id}\"]')")
    page.evaluate("() => __debug.backpack.close()")
    stats['cone+shellEdged'] = page.evaluate("() => __debug.gear.stats()")
    ratio = {kind: round(speeds[kind] / speeds['snail'], 3) for kind in ('turban', 'cone')}
    checks['wearAndStats'] = {'speeds': {k: round(v, 2) for k, v in speeds.items()}, 'ratio': ratio, 'stats': stats,
        'pass': abs(ratio['turban'] - 0.88) < 0.02 and abs(ratio['cone'] - 1.05) < 0.02 and stats['turban']['defense'] == 7 and stats['cone']['defense'] == 3 and stats['cone']['attack'] == 5 and stats['cone+shellEdged']['attack'] == 10 and worn_first}

    page.evaluate("() => window.dispatchEvent(new Event('pagehide'))")
    page.reload()
    page.wait_for_function('!!window.__debug', timeout=180000)
    restored = page.evaluate("() => { const d = __debug; return { version: d.save.version, built: d.workshop.built && d.home.hasStation('workshop'), spotBlocked: !d.world.isWalkable(d.home.stationOf('workshop').x, d.home.stationOf('workshop').z), worn: d.gear.wornShell().kind, claws: d.gear.wornClaws().kind, shells: d.gear.state.shells.length } }")
    checks['saveRestores'] = {**restored, 'pass': restored == {'version': 8, 'built': True, 'spotBlocked': True, 'worn': 'cone', 'claws': 'shellEdged', 'shells': 3}}

    legacy_context = browser.new_context(viewport={'width': 915, 'height': 412})
    legacy_context.add_init_script("localStorage.setItem('seaofcrabs-crab-save', JSON.stringify({ version: 1, x: 20, z: -30, heading: 1, worldTime: 100, inventory: { shellBits: 4, driftwood: 2 }, nodes: null, goalAnnounced: false, hasMoved: true }))")
    legacy_page = legacy_context.new_page()
    legacy_page.on('pageerror', lambda error: errors.append(str(error)))
    legacy_page.goto(URL)
    legacy_page.wait_for_function('!!window.__debug', timeout=180000)
    migrated = legacy_page.evaluate("() => { const d = __debug; return { version: d.save.version, x: Math.round(d.player.x), z: Math.round(d.player.z), inventory: { ...d.save.inventory }, worn: d.gear.wornShell().kind, built: d.home.hasStation('workshop') } }")
    checks['migrateVersion1'] = {**migrated, 'pass': migrated['version'] == 8 and migrated['inventory'] == {'shellBits': 4, 'driftwood': 2} and migrated['worn'] == 'snail' and not migrated['built'] and abs(migrated['x'] - 20) <= 1 and abs(migrated['z'] + 30) <= 1}
    legacy_context.close()

    phone_context = browser.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, is_mobile=True, has_touch=True)
    phone = phone_context.new_page()
    phone.on('pageerror', lambda error: errors.append(str(error)))
    phone.goto(URL)
    phone.wait_for_function('!!window.__debug', timeout=180000)
    phone.evaluate("() => { const d = __debug; d.save.inventory = { shellBits: 15, driftwood: 3, seaLettuce: 7 }; d.buildWorkshop(); d.workbenchPanel.open('Craft'); }")
    phone.tap('#hud .workshop-panel [data-craft="shell:turban"]')
    phone.tap('#hud .workshop-panel .workbench-close')
    phone.tap('#hud .bag-button')
    phone_shell = phone.evaluate("() => __debug.gear.state.shells.find(s => s.kind === 'turban').id")
    phone.tap(f'#hud .backpack [data-slot-item="{phone_shell}"]')
    phone.tap(f'#hud .backpack [data-slot-item="{phone_shell}"]')
    phone_result = phone.evaluate("() => ({ worn: __debug.gear.wornShell().kind, badgeOnTurban: document.querySelector('#hud .backpack .equip-slot .equip-name').textContent })")
    checks['phoneTouchWear'] = {**phone_result, 'pass': phone_result['worn'] == 'turban' and phone_result['badgeOnTurban'].startswith('Turban')}
    phone_context.close()

    for quality in ('medium', 'high'):
        page.goto(URL.replace('quality=low', f'quality={quality}').replace('&norender', ''))
        page.wait_for_function('!!window.__debug', timeout=180000)
        page.evaluate("() => { __debug.save.inventory = { shellBits: 5, driftwood: 3, seaLettuce: 3 }; __debug.buildWorkshop(); }")
        page.wait_for_timeout(1500)
    context.close()
    browser.close()
    print(json.dumps(checks, indent=1))
    failed = [name for name, check in checks.items() if not check['pass']]
    print('FAILED:' if failed or errors else 'ALL PASS', failed, errors[:4])
