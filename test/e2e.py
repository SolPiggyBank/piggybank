"""
End-to-end run of the built extension in Chromium with a mocked Solana RPC.

Pass 1 (Russian UI): onboarding, goals, allocation, deposit, send, history,
settings, soft-lock guards, Jupiter Lock lock + claim + deposit refund, a legacy
Streamflow withdrawal, theme switching, lock/unlock.
Pass 2 (English UI): language auto-detection, import and the main screens in dark theme.
"""
import json, re, time
from playwright.sync_api import sync_playwright, expect
from harness import *

with sync_playwright() as p:
    # =============================================================== pass 1: Russian
    ctx, base = launch(p, 'ru')
    try:
        page = new_page(ctx, base)
        page.get_by_text('Копите на цели в долларах').wait_for()
        shot(page, '01-welcome')

        with ctx.expect_page() as newp:
            page.get_by_role('button', name='Создать копилку').click()
        tab = newp.value; watch(tab); tab.bring_to_front()
        tab.set_viewport_size({'width': 1100, 'height': 760})
        tab.get_by_text('Придумайте пароль').wait_for()
        tab.fill('#pw1', 'Kopilka-2026!')
        tab.fill('#pw2', 'Kopilka-2026!')
        tab.get_by_role('button', name='Продолжить').click()
        tab.get_by_role('button', name='Нажмите, чтобы показать').click()
        words = [w.inner_text() for w in tab.locator('.seed-word span').all()]
        assert len(words) == 12, words
        tab.get_by_role('button', name='Я записал слова').click()
        tab.get_by_text('Проверим запись').wait_for()
        for q in tab.locator('.verify-q').all():
            n = int(re.search(r'\d+', q.locator('.q').inner_text()).group())
            q.locator('.chip', has_text=re.compile(rf'^\s*{words[n-1]}\s*$')).click()
        tab.get_by_role('button', name='Создать копилку').click()
        tab.get_by_text('Копилка готова').wait_for()
        shot(tab, '02-ready')
        tab.close()

        page = new_page(ctx, base)
        page.locator('.addr-chip').wait_for()
        owner = storage_get(page, 'wallet')['publicKey']
        STATE['owner'] = owner
        page.reload()
        expect(page.locator('.hero .total')).to_contain_text('629', timeout=10000)
        shot(page, '03-home-empty')

        # soft-locked goal
        page.get_by_role('button', name='Поставить первую цель').click()
        page.get_by_role('button', name='🏝️ Отпуск').click()
        page.fill('#g-target', '1200')
        page.get_by_role('button', name='Полгода').click()
        page.locator('.set-row', has_text='Не трогать до цели').get_by_role('switch').click()
        page.get_by_role('button', name='Создать цель').click()
        page.get_by_text('История цели').wait_for()
        page.get_by_role('button', name='Отложить').first.click()
        page.locator('.amount-box input').fill('200')
        page.locator('.sheet .btn-coin').click()
        page.wait_for_timeout(1200)
        shot(page, '04-goal-detail')

        # second goal, completes
        page.get_by_role('button', name='Назад').click()
        page.get_by_role('button', name='Новая цель').first.click()
        page.get_by_role('button', name='📱 Новый телефон').click()
        page.fill('#g-target', '100')
        page.get_by_role('button', name='Создать цель').click()
        page.get_by_text('История цели').wait_for()
        page.get_by_role('button', name='Отложить').first.click()
        page.get_by_role('radio', name=re.compile('USDT')).first.click()
        page.get_by_role('button', name=re.compile('До цели')).click()
        page.locator('.sheet .btn-coin').click()
        page.locator('.sheet .h1', has_text='Цель достигнута').wait_for(timeout=5000)
        page.get_by_role('button', name='Ура!').click()
        page.get_by_role('button', name='Назад').click()

        # deposit detection
        STATE['USDC'] += 75_000_000
        page.get_by_role('button', name='Обновить').click()
        page.locator('.deposit-card').wait_for(timeout=8000)
        page.evaluate("document.querySelector('.scroll').scrollTop = 0")
        shot(page, '05-home-goals')

        # send
        page.locator('.action-tile', has_text='Вывести').click()
        page.fill('#to', OTHER)
        page.locator('.amount-box input').fill('10')
        page.get_by_role('button', name='Продолжить').click()
        page.get_by_text('Проверьте перевод').wait_for()
        page.get_by_role('button', name=re.compile('^Отправить')).click()
        page.get_by_text('Отправлено', exact=True).wait_for(timeout=15000)
        (ROOT / 'test' / 'sent_tx.json').write_text(json.dumps({'raw': STATE['sent'][-1], 'owner': owner, 'to': OTHER, 'ata': STATE['ata'][USDC], 'amount': 10_000_000}))
        page.get_by_role('button', name='Готово').click()

        # a look-alike of an address you paid before: a red warning, and sending waits for the tick
        fresh = node('keypair')['pubkey']
        filler = '2' if fresh[4] == '1' else '1'
        twin = fresh[:4] + filler * (len(fresh) - 8) + fresh[-4:]
        acts = storage_get(page, 'activity') or []
        storage_set(page, 'activity', acts + [{'id': 'poison', 'type': 'send', 'token': 'USDC', 'amount': '1', 'to': twin,
                                               'ts': int(time.time() * 1000) - 86_400_000, 'network': 'mainnet'}])
        page.reload()
        page.locator('.hero').wait_for()
        page.locator('.action-tile', has_text='Вывести').click()
        page.fill('#to', fresh)
        page.locator('.amount-box input').fill('1')
        page.get_by_role('button', name='Продолжить').click()
        page.get_by_text('Проверьте перевод').wait_for()
        page.locator('.banner.poison').wait_for()
        expect(page.locator('.banner.poison')).to_contain_text('похоже на подменённый адрес')
        expect(page.locator('.addr-diff').first).to_have_text(twin)
        expect(page.locator('.addr-diff').nth(1)).to_have_text(fresh)
        go = page.get_by_role('button', name=re.compile('^Отправить'))
        expect(go).to_be_disabled()
        page.locator('.scroll').evaluate('el => el.scrollTop = el.scrollHeight')
        shot(page, '05b-poison-warning')
        page.get_by_text('Я сверил адрес целиком').click()
        expect(go).to_be_enabled()
        # the address you actually paid goes through without a warning
        page.get_by_role('button', name='Изменить').click()
        page.fill('#to', OTHER)
        page.get_by_role('button', name='Продолжить').click()
        page.get_by_text('Проверьте перевод').wait_for()
        expect(page.locator('.banner.poison')).to_have_count(0)
        expect(page.locator('.ack')).to_have_count(0)
        expect(go).to_be_enabled()
        page.get_by_role('button', name='Изменить').click()
        page.get_by_role('button', name='Назад').click()
        page.locator('.hero').wait_for()

        # soft-lock guards: can't lower target or switch protection off, delete needs the word
        page.locator('.tab', has_text='Цели').click()
        page.locator('.jar-tile', has_text='Отпуск').click()
        page.get_by_role('button', name='Изменить цель').click()
        assert page.locator('.set-row', has_text='Не трогать до цели').get_by_role('switch').is_disabled()
        page.fill('#g-target', '100')
        page.get_by_text('сумму нельзя уменьшить').wait_for()
        assert page.get_by_role('button', name='Сохранить').is_disabled()
        shot(page, '06-soft-lock-guard')
        page.get_by_role('button', name='Удалить цель').click()
        page.locator('.sheet', has_text='удалить её можно, когда соберёте').wait_for()
        assert page.locator('.sheet .btn-danger').count() == 0, 'a protected goal with money cannot be deleted'
        page.locator('.sheet').get_by_role('button', name='Закрыть').first.click()
        page.get_by_role('button', name='Назад').click()

        # =========================== smart-contract lock
        page.get_by_role('button', name='Назад').click()
        page.locator('.jar-tile.new').click()
        page.get_by_role('button', name='💻 Ноутбук').click()
        page.fill('#g-target', '500')
        page.locator('.smart-card').get_by_role('switch').click()
        page.locator('.smart-points').wait_for()
        expect(page.locator('.smart-points')).to_contain_text('SOL', timeout=8000)
        page.locator('.smart-card').scroll_into_view_if_needed()
        shot(page, '07-smart-toggle')
        page.get_by_role('button', name='Создать цель').click()
        page.locator('.smart-badge').wait_for()
        shot(page, '08-smart-goal')

        sent_before = len(STATE['sent'])
        page.get_by_role('button', name='Заблокировать').first.click()
        page.locator('.sheet .banner.smart').wait_for()
        page.locator('.sheet .amount-box input').fill('50')
        # a focused field in a sliding sheet must not scroll the popup itself (blank space below)
        page.wait_for_timeout(400)
        shift = page.evaluate("[document.scrollingElement, document.body, document.getElementById('root'), document.querySelector('.app')].map(e => e ? e.scrollTop : 0)")
        assert shift == [0, 0, 0, 0], f'the popup scrolled: {shift}'
        sb = page.locator('.sheet').bounding_box()
        assert abs(sb['y'] + sb['height'] - page.viewport_size['height']) < 2, f'the sheet is not at the bottom: {sb}'
        expect(page.locator('.sheet .kv')).to_contain_text('Итого', timeout=8000)
        page.locator('.sheet .ack input').check()
        page.locator('.sheet .scroll, .sheet-body').first.evaluate('e => e.scrollTop = 200')
        shot(page, '09-lock-sheet')
        page.locator('.sheet .btn-coin').click()
        page.locator('.sheet').wait_for(state='detached', timeout=20000)
        page.locator('.lock-glyph').first.wait_for()
        page.wait_for_timeout(800)
        page.locator('.lock-glyph').first.scroll_into_view_if_needed()
        shot(page, '10-locked')
        assert len(STATE['sent']) == sent_before + 1, 'lock tx sent'
        goals = storage_get(page, 'goals')
        laptop = [g for g in goals if g.get('smart')][0]
        lock = laptop['locks']['mainnet'][0]
        assert lock['status'] == 'locked' and abs(lock['amount'] - 50) < 1e-9, lock
        assert lock['provider'] == 'jupiter' and lock['base'] and STATE['kinds'][-1] == 'jup-create', (lock, STATE['kinds'])
        assert lock['feeToken'] == 0, 'no protocol fee'
        (ROOT / 'test' / 'lock_tx.json').write_text(json.dumps({'raw': STATE['sent'][-1], 'owner': owner, 'lockId': lock['id'], 'base': lock['base'], 'unlockAt': lock['unlockAt'], 'amount': 50_000_000}))

        # deleting a goal with money in the contract is blocked
        page.get_by_role('button', name='Изменить цель').click()
        assert page.locator('#g-date').is_disabled(), 'unlock date fixed once money is locked'
        page.get_by_role('button', name='Удалить цель').click()
        page.get_by_text('ещё лежат деньги').wait_for()
        assert page.locator('.sheet .btn-danger').count() == 0
        page.locator('.sheet').get_by_role('button', name='Закрыть').first.click()
        page.get_by_role('button', name='Назад').click()

        # time travel: the unlock date has passed. Besides the Jupiter lock the goal
        # gets a lock made by v1.1 through Streamflow, which must still come out.
        past = int(time.time()) - 120
        legacy_id = node('keypair')['pubkey']
        for g in goals:
            if g.get('smart'):
                g['smart']['unlockAt'] = past
                g['locks']['mainnet'][0]['unlockAt'] = past
                g['locks']['mainnet'].append({'id': legacy_id, 'token': 'USDC', 'amount': 20, 'feeToken': 0.05, 'feeSol': 0.1,
                                              'unlockAt': past, 'createdAt': int(time.time() * 1000) - 86400000, 'signature': rnd(64), 'status': 'locked'})
        storage_set(page, 'goals', goals)
        STATE['escrows'][lock['id']] = bytearray(base64.b64decode(node('escrow', lock['base'], owner, USDC, '50000000', str(past), '0')['data']))
        STATE['streams'][legacy_id] = node('stream', legacy_id, owner, USDC, '20000000', str(past), STREAMFLOW)['data']
        # the background worker tells about the opened locks once
        sw = ctx.service_workers[0]
        sw.evaluate("chrome.alarms.create('deposits', { when: Date.now() + 300 })")
        for _ in range(40):
            notes = sw.evaluate("chrome.notifications.getAll()")
            if f'unlock-{lock["id"]}' in notes and f'unlock-{legacy_id}' in notes: break
            time.sleep(0.25)
        assert f'unlock-{lock["id"]}' in notes and f'unlock-{legacy_id}' in notes, notes
        sw.evaluate("chrome.alarms.create('deposits', { periodInMinutes: 2 })")
        page.reload()
        page.locator('.tab', has_text='Цели').click()
        page.locator('.jar-tile', has_text='Ноутбук').click()
        expect(page.locator('.list-row', has_text='можно забрать')).to_have_count(2, timeout=10000)
        page.locator('.list-row', has_text='можно забрать').last.scroll_into_view_if_needed()
        shot(page, '11-unlocked')

        sent_before = len(STATE['sent'])
        page.locator('.list-row', has_text='50 USDC').get_by_role('button', name='Забрать').click()
        page.get_by_text('50 USDC вернулись в кошелёк').wait_for(timeout=20000)
        assert STATE['kinds'][sent_before] == 'jup-claim', STATE['kinds']
        (ROOT / 'test' / 'withdraw_tx.json').write_text(json.dumps({'raw': STATE['sent'][sent_before], 'owner': owner, 'lockId': lock['id']}))
        # the emptied escrow is closed in the background and the deposit comes back
        for _ in range(50):
            if 'jup-close' in STATE['kinds'][sent_before:]: break
            page.wait_for_timeout(200)
        assert 'jup-close' in STATE['kinds'][sent_before:], STATE['kinds']
        close_raw = STATE['sent'][sent_before + STATE['kinds'][sent_before:].index('jup-close')]
        (ROOT / 'test' / 'close_tx.json').write_text(json.dumps({'raw': close_raw, 'owner': owner, 'lockId': lock['id']}))
        assert lock['id'] not in STATE['escrows']
        for _ in range(25):
            laptop = [g for g in storage_get(page, 'goals') if g.get('smart')][0]
            if laptop['locks']['mainnet'][0].get('depositBack'): break
            page.wait_for_timeout(200)
        assert laptop['locks']['mainnet'][0]['status'] == 'withdrawn'
        assert laptop['locks']['mainnet'][0].get('depositBack'), laptop['locks']['mainnet'][0]

        sent_before = len(STATE['sent'])
        page.locator('.list-row', has_text='20 USDC').get_by_role('button', name='Забрать').click()
        page.get_by_text('20 USDC вернулись в кошелёк').wait_for(timeout=20000)
        assert len(STATE['sent']) == sent_before + 1, 'legacy withdraw tx sent'
        (ROOT / 'test' / 'withdraw_sf_tx.json').write_text(json.dumps({'raw': STATE['sent'][-1], 'owner': owner, 'lockId': legacy_id}))
        goals = storage_get(page, 'goals')
        laptop = [g for g in goals if g.get('smart')][0]
        assert all(l['status'] == 'withdrawn' for l in laptop['locks']['mainnet']), laptop['locks']
        assert abs(laptop['allocations']['mainnet']['USDC'] - 70) < 1e-9, laptop['allocations']
        page.wait_for_timeout(600)
        shot(page, '12-withdrawn')

        # history shows lock entries
        page.get_by_role('button', name='Назад').click()
        page.locator('.tab', has_text='История').click()
        page.locator('.tab', has_text='История').click()
        page.get_by_role('tab', name='Цели').click()
        page.get_by_text('Заблокировано для «Ноутбук»').wait_for()
        shot(page, '13-history-goals')

        # language switch in settings
        page.get_by_role('button', name='Настройки').click()
        page.get_by_role('combobox', name='Язык', exact=True).click()
        page.get_by_role('listbox', name='Язык').get_by_role('option', name='English').wait_for()
        shot(page, '14-language-menu')
        page.keyboard.press('Escape')
        expect(page.get_by_role('listbox')).to_have_count(0)
        choose(page, 'Язык', 'English')
        page.get_by_text('Settings').first.wait_for()
        shot(page, '14-settings-en')
        choose(page, 'Language', 'Same as browser')
        page.get_by_text('Настройки').first.wait_for()
        page.get_by_role('button', name='Назад').click()

        # home with the smart-contract row
        page.locator('.tab', has_text='Копилка').click()
        page.evaluate("document.querySelector('.scroll').scrollTop = 600")
        shot(page, '15-home-bottom')

        # lock / unlock and dark mode
        page.get_by_role('button', name='Запереть копилку').click()
        page.get_by_text('С возвращением').wait_for()
        page.locator('input[type=password]').fill('Kopilka-2026!')
        page.get_by_role('button', name='Открыть копилку').click()
        page.locator('.addr-chip').wait_for()

        # theme: one-tap switch in the header, remembered across reloads
        html = page.locator('html')
        expect(html).to_have_attribute('data-theme', 'light')
        page.get_by_role('button', name='Включить тёмную тему').click()
        expect(html).to_have_attribute('data-theme', 'dark')
        assert storage_get(page, 'settings')['theme'] == 'dark'
        page.wait_for_timeout(500)
        shot(page, '16-home-dark')
        page.reload(wait_until='domcontentloaded')
        assert page.evaluate("document.documentElement.dataset.theme") == 'dark', 'applied before the app boots'
        page.locator('.addr-chip').wait_for()
        page.locator('.tab', has_text='Цели').click()
        page.locator('.jar-tile', has_text='Ноутбук').click()
        page.get_by_text('История цели').wait_for()
        shot(page, '17-goal-dark')
        page.get_by_role('button', name='Назад').click()
        page.get_by_role('button', name='Настройки').click()
        page.locator('.set-row', has_text='Тема').scroll_into_view_if_needed()
        shot(page, '18-settings-dark')
        # "auto" follows the system
        page.get_by_role('radio', name='Авто').click()
        page.emulate_media(color_scheme='dark')
        expect(html).to_have_attribute('data-theme', 'dark')
        page.emulate_media(color_scheme='light')
        expect(html).to_have_attribute('data-theme', 'light')
        page.get_by_role('radio', name='Тёмная').click()
        expect(html).to_have_attribute('data-theme', 'dark')
        page.get_by_role('radio', name='Светлая').click()
        expect(html).to_have_attribute('data-theme', 'light')
        assert storage_get(page, 'settings')['theme'] == 'light'
        page.get_by_role('button', name='Назад').click()

        dump = page.evaluate("chrome.storage.local.get(null).then(JSON.stringify)")
        pairs = [f'{a} {b}' for a, b in zip(words, words[1:])]
        assert ' '.join(words) not in dump and not any(pr in dump for pr in pairs), 'mnemonic leaked into local storage'
        assert '"secretKey"' not in dump, 'secret key leaked into local storage'
        print('pass 1 storage keys:', sorted(json.loads(dump).keys()))
    except Exception:
        fail_shots(ctx, 'ru')
        raise
    finally:
        ctx.close()

    # =============================================================== pass 2: English
    STATE.update(fresh_state())
    ctx, base = launch(p, 'en-US')
    try:
        page = new_page(ctx, base)
        page.get_by_text('Save for your goals in dollars').wait_for()
        shot(page, '20-en-welcome')
        tab = new_page(ctx, base + '?mode=tab&start=import', {'width': 1100, 'height': 760})
        tab.get_by_text('Import a wallet').wait_for()
        tab.locator('textarea').fill('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
        tab.get_by_text('Key accepted').wait_for()
        tab.get_by_role('button', name='Continue').click()
        tab.get_by_text('Create a password').wait_for()
        tab.fill('#pw1', 'Another-pass-1')
        tab.fill('#pw2', 'Another-pass-1')
        tab.get_by_role('button', name='Open piggy bank').click()
        tab.get_by_text('Your piggy bank is ready').wait_for()
        STATE['owner'] = storage_get(tab, 'wallet')['publicKey']
        assert STATE['owner'] == 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk'
        tab.close()
        page = new_page(ctx, base)
        expect(page.locator('.hero .total')).to_contain_text('$629', timeout=10000)
        shot(page, '21-en-home')
        page.get_by_role('button', name='Switch to dark theme').click()
        expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
        shot(page, '21-en-home-dark')
        page.get_by_role('button', name='Set your first goal').click()
        page.get_by_role('button', name='🏝️ Vacation').click()
        page.fill('#g-target', '1,500')
        page.locator('.smart-card').get_by_role('switch').click()
        expect(page.locator('.smart-points')).to_contain_text('SOL', timeout=8000)
        page.locator('.smart-card').scroll_into_view_if_needed()
        shot(page, '22-en-smart')
        page.get_by_role('button', name='Create goal').click()
        page.locator('.smart-badge').wait_for()
        shot(page, '23-en-goal')
        page.get_by_role('button', name='Lock').first.click()
        page.locator('.sheet .amount-box input').fill('25')
        expect(page.locator('.sheet .kv')).to_contain_text('Total', timeout=8000)
        expect(page.locator('.sheet .kv')).to_contain_text('Protocol fee')
        expect(page.locator('.sheet .kv .free-fee')).to_have_text('none')
        shot(page, '24-en-lock-sheet')
    except Exception:
        fail_shots(ctx, 'en')
        raise
    finally:
        ctx.close()

bad = [e for e in errors if '503' not in e]
print('\n'.join(bad) if bad else 'no page errors')
print('E2E OK')
