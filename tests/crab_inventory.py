import os, json, sys
from playwright.sync_api import sync_playwright

BASE = 'file://' + os.path.abspath('dist/index.html')
URL = BASE + '?quality=low&dpr=0.5&norender' + os.environ.get('CRAB_QUERY', '')

SETUP = r'''() => {
  const d = window.__debug;
  d.setPaused(true);
  d.save.inventory = { shellBits: 8, coral: 3, scrap: 5, driedKelp: 1 };
  d.gear.state.shells = [{ id: 701, kind: 'coral', quality: 'masterwork', reinforcement: 'metalPlate' }, { id: 702, kind: 'turban', quality: 'fine' }, { id: 703, kind: 'whelk', quality: 'masterwork' }];
  d.gear.state.claws = [{ id: 2, kind: 'bare', quality: 'fine' }, { id: 704, kind: 'coralTipped', quality: 'masterwork', binding: 'wire' }, { id: 705, kind: 'cleaver', quality: 'fine' }];
  d.gear.state.wornShellId = 701;
  d.gear.state.wornClawsId = 704;
  d.openBackpack();
}'''

def slot_center(page, selector):
    box = page.locator(selector).first.bounding_box()
    return box['x'] + box['width'] / 2, box['y'] + box['height'] / 2

def drag(page, source, target):
    sx, sy = slot_center(page, source)
    tx, ty = slot_center(page, target)
    page.mouse.move(sx, sy)
    page.mouse.down()
    for step in range(1, 9):
        page.mouse.move(sx + (tx - sx) * step / 8, sy + (ty - sy) * step / 8)
    page.mouse.up()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    errors = []
    checks = {}
    context = browser.new_context(viewport={'width': 915, 'height': 412})
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text[:300]) if message.type == 'error' else None)
    page.goto(URL)
    page.wait_for_function('!!window.__debug', timeout=180000)
    page.evaluate(SETUP)

    view = page.evaluate(r"""() => {
      const q = (selector) => document.querySelector(`#hud .backpack ${selector}`);
      return {
        wornNames: [...document.querySelectorAll('#hud .backpack .equip-name')].map((e) => e.textContent),
        wornStats: [...document.querySelectorAll('#hud .backpack .equip-stats')].map((e) => e.textContent),
        gridGear: [...document.querySelectorAll('#hud .backpack .slot-grid [data-slot-item]')].map((e) => ({ id: e.dataset.slotItem, tier: [...e.classList].filter((c) => c.startsWith('tier-')).join(' '), badge: e.querySelector('.slot-tier').textContent, quality: e.querySelector('.slot-quality')?.textContent || '', image: !!e.querySelector('img') })),
        materials: [...document.querySelectorAll('#hud .backpack .slot-grid [data-material]')].map((e) => e.dataset.material + e.querySelector('.slot-count').textContent),
        doll: !!q('.doll-image'),
      };
    }""")
    print('view', json.dumps(view), flush=True)
    grid = {g['id']: g for g in view['gridGear']}
    checks['qualityInNames'] = view['wornNames'] == ['Masterwork coral shell + metal plate', 'Masterwork coral-tipped claws + wire binding', 'Empty'] and view['wornStats'][0].startswith('🛡 19') and view['wornStats'][1] == '🗡️ +12 · weight 3'
    checks['tiers'] = grid['702']['tier'] == 'tier-1' and grid['703']['tier'] == 'tier-2' and grid['703']['badge'] == 'T2' and grid['705']['tier'] == 'tier-5 tier-trophy' and grid['705']['badge'] == 'T5' and grid['703']['quality'] == '★' and grid['702']['quality'] == ''
    checks['slotsAndImages'] = len(view['gridGear']) == 3 and all(g['image'] for g in view['gridGear']) and view['materials'] == ['shellBits×8', 'coral×3', 'scrap×5', 'driedKelp×1'] and view['doll']

    page.click('#hud .backpack .slot-grid [data-slot-item="703"]')
    page.wait_for_timeout(450)
    details = page.evaluate("() => ({ name: document.querySelector('#hud .backpack .item-details .item-name').textContent, tier: document.querySelector('#hud .backpack .item-details .item-tier').textContent, breakdown: document.querySelector('#hud .backpack .item-details .item-owned')?.textContent, delta: document.querySelector('#hud .backpack .item-details .stat-delta')?.textContent, wear: !!document.querySelector('#hud .backpack [data-wear=\"703\"]') })")
    print('details', json.dumps(details), flush=True)
    checks['details'] = details['delta'] == ' ▼13 vs worn' and details['name'] == 'Masterwork spiral whelk' and 'Tier 2' in details['tier'] and 'Boss trophy' not in details['tier'] and details['breakdown'] == '🛡 5 + 1 masterwork' and details['wear']

    popup_shown = page.evaluate("() => !!document.querySelector('#hud .backpack .item-popup')")
    page.click('#hud .backpack .item-popup-close')
    checks['popupOpensAndCloses'] = popup_shown and page.evaluate("() => !document.querySelector('#hud .backpack .item-popup')")
    page.dblclick('#hud .backpack .slot-grid [data-slot-item="702"]')
    after_double = page.evaluate("() => __debug.gear.wornShell().kind")
    page.dblclick('#hud .backpack .slot-grid [data-slot-item="705"]')
    after_drag_doll = page.evaluate("() => __debug.gear.wornClaws().kind")
    page.dblclick('#hud .backpack .slot-grid [data-slot-item="701"]')
    after_drag_slot = page.evaluate("() => __debug.gear.wornShell().kind")
    page.dblclick('#hud .backpack .equip-slot [data-slot-item="705"]')
    after_unequip_drag = page.evaluate("() => __debug.gear.wornClaws().kind")
    page.dblclick('#hud .backpack .equip-slot [data-slot-item="701"]')
    after_unequip_double = page.evaluate("() => ({ shell: __debug.gear.wornShell() ? __debug.gear.wornShell().kind : null, label: document.querySelector('#hud .backpack .equip-name').textContent, look: __debug.playerStats().defense })")
    drag(page, '#hud .backpack .slot-grid [data-slot-item="702"]', '#hud .backpack .slot-grid [data-material="coral"]')
    drag(page, '#hud .backpack .slot-grid [data-slot-item="702"]', '#hud .backpack .slot-grid [data-material="coral"]')
    coral_untouched = page.evaluate("() => !__debug.gear.wornShell() && !document.querySelector('#hud .backpack .slot-grid [data-slot-item=\"702\"]').classList.contains('selected')")
    wear = {'double': after_double, 'dragDoll': after_drag_doll, 'dragSlot': after_drag_slot, 'unequipDrag': after_unequip_drag, 'unequipDouble': after_unequip_double, 'swipeIgnored': coral_untouched}
    print('wear', json.dumps(wear), flush=True)
    checks['doubleTapWear'] = after_double == 'turban' and after_unequip_double['shell'] is None and after_unequip_double['label'] == 'No shell' and after_unequip_double['look'] == 0
    checks['doubleTapSwapAndSwipe'] = after_drag_doll == 'cleaver' and after_drag_slot == 'coral' and after_unequip_drag == 'bare' and coral_untouched

    page.click('#hud .backpack .slot-grid [data-material="driedKelp"]')
    page.wait_for_timeout(450)
    page.click('#hud .backpack [data-eat]')
    checks['eatFromDetails'] = page.evaluate("() => __debug.isWellFed() && !__debug.save.inventory.driedKelp")
    page.evaluate("() => __debug.backpack.close()")

    page.evaluate(r"""() => {
      const d = window.__debug;
      d.storage.inventory = { coral: 2 };
      d.storage.shells = [{ id: 801, kind: 'coral', quality: 'masterwork' }];
      d.storage.claws = [];
      d.save.inventory = { scrap: 5 };
      d.gear.state.wornShellId = 701;
      d.storagePanel.open();
    }""")
    page.dblclick('#hud .storage-panel [data-zone="storage"][data-slot-item="801"]')
    took = page.evaluate("() => __debug.gear.state.shells.some((s) => s.id === 801) && !__debug.storage.shells.length")
    page.dblclick('#hud .storage-panel [data-zone="backpack"][data-material="scrap"]')
    stored = page.evaluate("() => __debug.storage.inventory.scrap === 5 && !__debug.save.inventory.scrap")
    page.click('#hud .storage-panel [data-zone="storage"][data-material="coral"]')
    page.click('#hud .storage-panel [data-take="coral"]')
    taken = page.evaluate("() => __debug.save.inventory.coral === 2 && !__debug.storage.inventory.coral")
    worn_hidden = page.evaluate("() => !document.querySelector('#hud .storage-panel [data-zone=\"backpack\"][data-slot-item=\"701\"]')")
    storage_result = {'doubleTapTake': took, 'doubleTapStore': stored, 'buttonTake': taken, 'wornNotListed': worn_hidden}
    print('storage', json.dumps(storage_result), flush=True)
    checks['storageSlots'] = all(storage_result.values())
    page.evaluate("() => __debug.storagePanel.close()")

    phone_context = browser.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, is_mobile=True, has_touch=True)
    phone = phone_context.new_page()
    phone.on('pageerror', lambda error: errors.append(str(error)))
    phone.goto(URL)
    phone.wait_for_function('!!window.__debug', timeout=180000)
    phone.evaluate(SETUP)
    phone.evaluate(r"""() => {
      for (let tap = 0; tap < 2; tap++) {
        const slot = document.querySelector('#hud .backpack .slot-grid [data-slot-item="702"]');
        const box = slot.getBoundingClientRect();
        const init = { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
        slot.dispatchEvent(new PointerEvent('pointerdown', init));
        slot.dispatchEvent(new PointerEvent('pointerup', init));
      }
    }""")
    phone_worn = phone.evaluate("() => __debug.gear.wornShell().kind")
    phone.tap('#hud .backpack .slot-grid [data-slot-item="703"]')
    phone.wait_for_timeout(500)
    phone.tap('#hud .backpack [data-wear="703"]')
    phone_button = phone.evaluate("() => __debug.gear.wornShell().kind")
    print('phone', phone_worn, phone_button, flush=True)
    checks['phoneTouch'] = phone_worn == 'turban' and phone_button == 'whelk'
    phone_context.close()

    checks['noConsoleErrors'] = not errors
    if errors: print(errors[:5])
    browser.close()

print(json.dumps(checks, indent=1))
sys.exit(0 if all(checks.values()) else 1)
