"""UI interactions: drag-to-scroll rails, the pig's hover reactions, progress
percentages, milestone celebrations and the daily saving pace."""
import sys
from playwright.sync_api import sync_playwright, expect
from harness import *

MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

with sync_playwright() as p:
    ctx, base = launch(p, 'ru')
    try:
        import_wallet(ctx, base, MNEMONIC)
        page = new_page(ctx, base)
        expect(page.locator('.hero .total')).to_contain_text('629', timeout=10000)

        # 0. no visible scrollbars anywhere (they still scroll)
        assert page.evaluate("getComputedStyle(document.querySelector('.scroll')).scrollbarWidth") == 'none'
        assert page.evaluate("getComputedStyle(document.documentElement).scrollbarWidth") == 'none'

        # 1. goal templates
        page.get_by_role('button', name='Поставить первую цель').click()
        rail = page.locator('.chips.scroll-x')
        rail.wait_for()
        assert rail.evaluate('e => e.scrollWidth > e.clientWidth + 20'), 'templates overflow'
        expect(rail).to_have_class(re.compile(r'\bcan-drag\b'))
        expect(rail).to_have_class(re.compile(r'\bfade-r\b'))
        assert scroll_left(rail) == 0
        drag(page, rail, -160)
        page.wait_for_timeout(800)
        moved = scroll_left(rail)
        assert moved > 100, f'dragged templates scrolled {moved}'
        expect(rail).to_have_class(re.compile(r'\bfade-l\b'))
        assert page.locator('#g-name').input_value() == '', 'a drag must not pick a template'
        expect(rail).not_to_have_class(re.compile(r'\bdragging\b'))
        shot(page, 'drag-01-templates')
        # fast flick coasts further than the hand moved
        page.evaluate("document.querySelector('.chips.scroll-x').scrollLeft = 0")
        drag(page, rail, -60, steps=3, pause=8)
        page.wait_for_timeout(1200)
        flick = scroll_left(rail)
        assert flick > 80, f'flick coasted to {flick}'
        # dragging back to the start
        drag(page, rail, 400)
        page.wait_for_timeout(900)
        assert scroll_left(rail) < 2
        expect(rail).not_to_have_class(re.compile(r'\bfade-l\b'))
        # a plain click still picks a template
        rail.locator('.chip').nth(1).click()
        assert page.locator('#g-name').input_value() != ''
        # a plain mouse wheel scrolls the rail sideways, the page stays put
        page.evaluate("document.querySelector('.chips.scroll-x').scrollLeft = 0")
        page.wait_for_timeout(500)
        box = rail.bounding_box()
        page.mouse.move(box['x'] + 120, box['y'] + box['height'] / 2)
        page.mouse.wheel(0, 200)
        page.wait_for_timeout(800)
        assert scroll_left(rail) > 120, scroll_left(rail)
        assert page.evaluate("document.querySelector('.scroll').scrollTop") == 0, 'page did not move'
        # at the end of the rail the wheel scrolls the page again
        page.evaluate("const e = document.querySelector('.chips.scroll-x'); e.scrollLeft = e.scrollWidth")
        page.wait_for_timeout(500)
        page.mouse.wheel(0, 200)
        page.wait_for_timeout(600)
        assert page.evaluate("document.querySelector('.scroll').scrollTop") > 50, 'page scrolls at the rail end'
        # while the page is scrolling, passing over the rail doesn't hijack the wheel
        page.evaluate("document.querySelector('.scroll').scrollTop = 0; document.querySelector('.chips.scroll-x').scrollLeft = 0")
        page.wait_for_timeout(400)
        page.mouse.move(box['x'] + 120, box['y'] + 300)
        page.mouse.wheel(0, 60)
        page.wait_for_timeout(100)
        page.mouse.move(box['x'] + 120, box['y'] + box['height'] / 2)
        page.mouse.wheel(0, 120)
        page.wait_for_timeout(600)
        assert scroll_left(rail) == 0, 'rail ignored a wheel that was scrolling the page'
        page.get_by_role('button', name='Назад').click()

        # 2. home goals rail with many goals
        make_goals(page, [{'name': f'Цель {i}', 'emoji': '🎯🏝️📱💻🎁🚗📚'[i], 'target': 100 * (i + 1)} for i in range(6)])
        page.reload()
        jr = page.locator('.jar-rail')
        jr.wait_for()
        page.locator('.jar-tile').nth(5).wait_for()
        jr.scroll_into_view_if_needed()
        assert jr.evaluate('e => e.scrollWidth > e.clientWidth + 100')
        drag(page, jr, -220)
        page.wait_for_timeout(1000)
        left = scroll_left(jr)
        assert left > 150, f'rail scrolled {left}'
        assert page.locator('.hero').count() == 1, 'still on home: the dragged tile did not open'
        # snapped to a tile edge (scroll-snap restored)
        snapped = jr.evaluate("""e => { const pad = parseFloat(getComputedStyle(e).paddingLeft); const b = e.getBoundingClientRect().left;
            return [...e.children].some(c => Math.abs(c.getBoundingClientRect().left - b - pad) < 2) || e.scrollLeft >= e.scrollWidth - e.clientWidth - 2 }""")
        assert snapped, ('rail rests on a tile', jr.evaluate("e => [e.scrollLeft, e.scrollWidth - e.clientWidth, getComputedStyle(e).scrollSnapType, e.className, ...[...e.children].map(c => c.getBoundingClientRect().left - e.getBoundingClientRect().left)]"))
        shot(page, 'drag-02-rail')
        # one wheel notch moves the rail by one tile
        page.evaluate("document.querySelector('.jar-rail').scrollLeft = 0")
        page.wait_for_timeout(600)
        box = jr.bounding_box()
        page.mouse.move(box['x'] + 100, box['y'] + box['height'] / 2)
        page.mouse.wheel(0, 100)
        page.wait_for_timeout(1000)
        tile_step = jr.evaluate("e => e.children[1].getBoundingClientRect().left - e.children[0].getBoundingClientRect().left")
        assert abs(scroll_left(jr) - tile_step) < 2, (scroll_left(jr), tile_step)
        expect(jr).not_to_have_class(re.compile(r'\bdragging\b'))
        # a click on a tile still opens the goal
        jr.locator('.jar-tile').nth(3).click()
        page.get_by_text('История цели').wait_for()
        page.get_by_role('button', name='Назад').click()

        # 3. goal picker in the "put aside" sheet
        page.locator('.action-tile', has_text='Отложить').click()
        gp = page.locator('.sheet .goal-pick')
        gp.wait_for()
        page.wait_for_timeout(500)
        first_on = gp.locator('[aria-checked="true"]').inner_text()
        drag(page, gp, -200)
        page.wait_for_timeout(900)
        assert scroll_left(gp) > 120, scroll_left(gp)
        assert gp.locator('[aria-checked="true"]').inner_text() == first_on, 'drag did not change the selected goal'
        gp.locator('button').nth(4).click()
        expect(gp.locator('button').nth(4)).to_have_attribute('aria-checked', 'true')
        shot(page, 'drag-03-picker')
        page.locator('.sheet').get_by_role('button', name='Закрыть').first.click()
        # opened from the last goal: its chip starts in view
        page.locator('.tab', has_text='Цели').click()
        page.locator('.jar-tile', has_text='Цель 5').click()
        page.get_by_role('button', name='Отложить').first.click()
        gp = page.locator('.sheet .goal-pick')
        gp.wait_for()
        page.wait_for_timeout(400)
        vis = gp.evaluate("""e => { const c = e.querySelector('[aria-checked="true"]').getBoundingClientRect(); const b = e.getBoundingClientRect();
            return c.left >= b.left - 1 && c.right <= b.right + 1 }""")
        assert vis, 'selected goal visible'
        assert 'Цель 5' in gp.locator('[aria-checked="true"]').inner_text()
        shot(page, 'drag-04-picker-last')
        page.locator('.sheet').get_by_role('button', name='Закрыть').first.click()

        # 4. the pig reacts differently each time the pointer comes to it, and its eye follows
        page.get_by_role('button', name='Назад').click()
        page.locator('.tab', has_text='Копилка').click()
        pig = page.locator('.hero .pig')
        pig.wait_for()
        seen = []
        for _ in range(3):
            page.mouse.move(5, 595)
            page.wait_for_timeout(1500)
            b = pig.bounding_box()
            page.mouse.move(b['x'] + b['width'] * 0.3, b['y'] + b['height'] * 0.5)
            page.wait_for_timeout(120)
            cls = pig.get_attribute('class')
            m = re.search(r'react-(\w+)', cls)
            assert m, cls
            seen.append(m.group(1))
        assert len(set(seen)) == 3, f'three different reactions: {seen}'
        page.wait_for_timeout(1500)
        b = pig.bounding_box()
        page.mouse.move(b['x'] + b['width'] - 2, b['y'] + 2)
        page.wait_for_timeout(300)
        look = page.evaluate("getComputedStyle(document.querySelector('.hero .pig svg')).getPropertyValue('--look-x')")
        assert look.strip() not in ('', '0px'), look
        page.mouse.move(5, 595)

        # 5. progress shows as a percentage on tiles; crossing 25 % is celebrated
        make_goals(page, [{'name': 'Отпуск', 'target': 400, 'alloc': {'USDC': 90, 'USDT': 0, 'SOL': 0}},
                          {'name': 'Подарок', 'target': 300, 'deadline': time.strftime('%Y-%m-%d', time.localtime(time.time() + 19 * 86400))}])
        page.reload()
        tile = page.locator('.jar-tile', has_text='Отпуск')
        expect(tile.locator('.pct-badge')).to_have_text('22%')
        expect(page.locator('.split .pct-chip')).to_have_text('12%')
        tile.click()
        expect(page.locator('.stat-row .v').first).to_have_text('22%', timeout=4000)
        page.get_by_role('button', name='Отложить').first.click()
        page.locator('.sheet .amount-box input').fill('15')
        page.locator('.sheet .btn-coin').click()
        page.locator('.toast.milestone:not(.leaving)').wait_for(timeout=4000)
        expect(page.locator('.toast.milestone:not(.leaving)')).to_contain_text('Четверть пути')
        shot(page, 'drag-05-milestone')
        page.get_by_role('button', name='Назад').click()

        # 6. a deadline within a month: how much to save per day
        page.locator('.jar-tile', has_text='Подарок').click()
        expect(page.locator('.banner', has_text='в день')).to_be_visible()
        page.get_by_role('button', name='Назад').click()
    except Exception:
        fail_shots(ctx, 'drag')
        raise
    finally:
        ctx.close()

bad = [e for e in errors if '503' not in e]
print('\n'.join(bad) if bad else 'no page errors')
print('UI OK')
