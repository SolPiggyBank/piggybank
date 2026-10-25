"""
Money flows and their failure paths: hidden amounts, the send form's checks,
failed and stuck transactions, the SOL fee reserve, a protected goal that keeps its money,
the shortfall fix, smart-lock errors, devnet, a custom RPC and deposit
notifications from the background worker.
"""
import json, re, time
from playwright.sync_api import sync_playwright, expect
from harness import *

MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

def step(name):
    print('·', name, flush=True)

def home(page):
    page.locator('.tab', has_text='Копилка').click()
    page.locator('.hero').wait_for()

def toast_text(page):
    return page.locator('.toast:not(.leaving)').inner_text()

with sync_playwright() as p:
    ctx, base = launch(p, 'ru')
    sw = ctx.service_workers[0]
    try:
        owner = import_wallet(ctx, base, MNEMONIC)
        page = new_page(ctx, base)
        expect(page.locator('.hero .total')).to_contain_text('629', timeout=10000)

        step('hide amounts everywhere')
        make_goals(page, [{'name': 'Отпуск', 'emoji': '🏝️', 'target': 1000, 'alloc': {'USDC': 120, 'USDT': 0, 'SOL': 0}, 'locked': True},
                          {'name': 'Телефон', 'emoji': '📱', 'target': 300}])
        page.reload()
        page.locator('.hero .total').click()  # tapping the total hides amounts
        expect(page.locator('.hero .total')).to_contain_text('••••')
        assert '120' not in page.locator('.split').inner_text()
        assert '250' not in page.locator('.token-list').inner_text()
        page.locator('.tab', has_text='Цели').click()
        expect(page.locator('.jar-tile').first).to_contain_text('••••')
        page.locator('.jar-tile', has_text='Отпуск').click()
        expect(page.locator('.goal-hero .saved')).to_have_text('••••')
        page.get_by_role('button', name='Назад').click()
        page.get_by_role('button', name='Настройки').click()
        sw_toggle = page.locator('.set-row', has_text='Скрывать суммы').get_by_role('switch')
        expect(sw_toggle).to_have_attribute('aria-checked', 'true')
        sw_toggle.click()
        page.get_by_role('button', name='Назад').click()
        home(page)
        expect(page.locator('.hero .total')).to_contain_text('629')

        step('the Paste button reads the clipboard (and Solana Pay links)')
        page.locator('.action-tile', has_text='Вывести').click()
        page.evaluate(f"navigator.clipboard.writeText('Адрес друга: {OTHER} — спасибо')")
        page.get_by_role('button', name='Вставить').click()
        expect(page.locator('#to')).to_have_value(OTHER)
        page.fill('#to', '')
        page.get_by_role('radio', name=re.compile('SOL')).click()
        page.evaluate(f"navigator.clipboard.writeText('solana:{OTHER}?amount=2.5&spl-token={USDC}&label=Shop')")
        page.get_by_role('button', name='Вставить').click()
        expect(page.locator('#to')).to_have_value(OTHER)
        expect(page.locator('.amount-box input')).to_have_value('2,5')
        expect(page.get_by_role('radio', name=re.compile('USDC'))).to_have_attribute('aria-checked', 'true')
        page.evaluate("navigator.clipboard.writeText('')")
        page.get_by_role('button', name='Вставить').click()
        page.get_by_text('В буфере обмена пусто').wait_for()
        page.get_by_role('button', name='Назад').click()

        step('send form checks')
        page.locator('.action-tile', has_text='Вывести').click()
        page.fill('#to', 'not-an-address')
        page.get_by_text('Это не адрес Solana').wait_for()
        page.fill('#to', owner)
        page.get_by_text('Это адрес вашей же копилки').wait_for()
        page.fill('#to', OTHER)
        amount = page.locator('.amount-box input')
        amount.fill('500')
        page.get_by_text('Можно вывести').wait_for()
        expect(page.get_by_text('Ещё 120 отложено в целях')).to_be_visible()
        assert page.get_by_role('button', name='Продолжить').is_disabled()
        amount.fill('')
        amount.press_sequentially('1,1234567')
        expect(amount).to_have_value('1,123456')  # USDC has 6 decimals: the 7th is refused
        amount.press_sequentially(',5')
        expect(amount).to_have_value('1,123456')
        page.locator('.amount-box .max-btn').click()
        expect(amount).to_have_value('130')  # 250 − 120 in the goal
        page.get_by_role('radio', name=re.compile('SOL')).click()
        page.locator('.amount-box .max-btn').click()
        expect(amount).to_have_value('1,498')  # 0.002 SOL stays for fees
        page.get_by_role('radio', name=re.compile('USDC')).click()
        ata = node('ata', OTHER, USDC)['address']
        page.fill('#to', ata)
        amount.fill('5')
        page.get_by_role('button', name='Продолжить').click()
        page.get_by_text('адрес программы').wait_for(timeout=10000)

        step('a failed transaction is reported, not shown as sent')
        page.fill('#to', OTHER)
        page.get_by_role('button', name='Продолжить').click()
        page.get_by_text('Проверьте перевод').wait_for()
        expect(page.locator('.review .big')).to_have_text('5 USDC')
        STATE['sig_mode'] = 'fail'
        page.get_by_role('button', name=re.compile('^Отправить')).click()
        page.get_by_text('Не отправлено').wait_for(timeout=15000)
        page.get_by_text('Сеть отклонила транзакцию').wait_for()
        STATE['sig_mode'] = 'confirmed'
        assert storage_get(page, 'pendingTxs') == [], 'failed tx not left pending'

        step('a rejected simulation (not enough funds) is explained')
        page.get_by_role('button', name='Повторить').click()
        page.get_by_role('button', name='Продолжить').click()
        page.get_by_text('Проверьте перевод').wait_for()
        STATE['send_error'] = 'Transaction simulation failed: Error processing Instruction 3: custom program error: 0x1'
        page.get_by_role('button', name=re.compile('^Отправить')).click()
        page.get_by_text('Недостаточно средств').wait_for(timeout=15000)

        step('the network is down while checking the address')
        page.get_by_role('button', name='Повторить').click()
        STATE['fail_rpc'] = True
        page.get_by_role('button', name='Продолжить').click()
        page.get_by_text('Не удалось связаться с сетью Solana').wait_for(timeout=40000)
        STATE['fail_rpc'] = False

        step('a stuck transaction survives closing the popup')
        STATE['sig_mode'] = 'pending'
        page.get_by_role('button', name='Продолжить').click()
        page.get_by_text('Проверьте перевод').wait_for()
        page.get_by_role('button', name=re.compile('^Отправить')).click()
        page.get_by_text('Ждём подтверждения сети').wait_for(timeout=15000)
        pend = storage_get(page, 'pendingTxs')
        assert len(pend) == 1 and pend[0]['amount'] == '5', pend
        page.close()
        page = new_page(ctx, base)
        page.locator('.tab', has_text='История').click()
        page.get_by_text('Отправляется').wait_for(timeout=10000)
        shot(page, 'money-01-pending')
        STATE['sig_mode'] = 'confirmed'
        page.reload()
        for _ in range(40):
            if storage_get(page, 'pendingTxs') == []: break
            page.wait_for_timeout(250)
        assert storage_get(page, 'pendingTxs') == []
        acts = [a for a in storage_get(page, 'activity') if a['type'] == 'send']
        assert acts and acts[0]['signature'] == pend[0]['signature'], 'confirmed later and logged'

        step('SOL fee reserve when putting SOL aside')
        home(page)
        page.locator('.action-tile', has_text='Отложить').click()
        page.locator('.sheet .goal-pick button', has_text='Телефон').click()
        page.get_by_role('radio', name=re.compile('SOL')).click()
        page.get_by_text('Немного SOL (0,002) всегда остаётся свободным').wait_for()
        page.locator('.sheet .chip', has_text='Всё свободное').click()
        expect(page.locator('.sheet .amount-box input')).to_have_value('1,498')
        page.locator('.sheet .btn-coin').click()
        page.locator('.sheet').wait_for(state='detached')
        page.locator('.action-tile', has_text='Вывести').click()
        page.get_by_role('radio', name=re.compile('SOL')).click()
        expect(page.locator('.amount-box .max-btn')).to_be_disabled()
        page.get_by_role('button', name='Назад').click()
        assert page.locator('.banner.danger').count() == 0, 'no shortfall from fee money'

        step('a protected goal keeps its money until it is reached')
        page.locator('.tab', has_text='Цели').click()
        page.locator('.jar-tile', has_text='Отпуск').click()
        page.get_by_role('button', name='Забрать').click()
        page.locator('.sheet', has_text='Цель защищена').wait_for()
        page.locator('.sheet', has_text='можно будет забрать, когда соберёте').wait_for()
        assert page.locator('.sheet input').count() == 0, 'no word, no amount: nothing to type your way out'
        assert page.locator('.sheet .btn-danger').count() == 0
        shot(page, 'money-02b-guard')
        page.locator('.sheet').get_by_role('button', name='Отложить ещё').click()
        page.locator('.sheet', has_text='Отложить в цель').wait_for()
        expect(page.locator('.sheet .goal-pick button.on')).to_contain_text('Отпуск')
        page.locator('.sheet').get_by_role('button', name='Закрыть').first.click()
        page.locator('.sheet').wait_for(state='detached')
        g = [g for g in storage_get(page, 'goals') if g['name'] == 'Отпуск'][0]
        assert g['allocations']['mainnet']['USDC'] == 120, g

        step('a protected goal with money cannot be deleted or unlocked')
        page.get_by_role('button', name='Изменить цель').click()
        assert page.locator('.set-row', has_text='Не трогать до цели').get_by_role('switch').is_disabled()
        page.get_by_role('button', name='Удалить цель').click()
        page.locator('.sheet', has_text='удалить её можно, когда соберёте').wait_for()
        assert page.locator('.sheet .btn-danger').count() == 0
        page.locator('.sheet').get_by_role('button', name='Закрыть').first.click()
        page.get_by_role('button', name='Назад').click()
        assert [g for g in storage_get(page, 'goals') if g['name'] == 'Отпуск']

        step('reaching a protected goal takes the lock off, and it stays off')
        STATE['USDC'] = 250_000_000
        make_goals(page, [{'name': 'Велосипед', 'emoji': '🚲', 'target': 100, 'alloc': {'USDC': 60, 'USDT': 0, 'SOL': 0}, 'locked': True}])
        page.reload()
        page.locator('.tab', has_text='Цели').click()
        page.locator('.jar-tile', has_text='Велосипед').click()
        page.locator('.lock-badge', has_text='Защищена до цели').wait_for()
        page.get_by_role('button', name='Отложить').first.click()
        page.locator('.sheet .amount-box input').fill('40')
        page.locator('.sheet .btn-coin').click()
        done = page.locator('.sheet', has_text='Цель достигнута')
        done.wait_for(timeout=5000)
        done.get_by_text('Замок снялся сам').wait_for()
        assert done.locator('.done-lock').count() == 1, 'the padlock springs open'
        page.wait_for_timeout(1300)  # the lock opens, a second burst of confetti
        shot(page, 'money-02c-goal-done-unlocked')
        g = storage_get(page, 'goals')[0]
        assert g.get('reachedAt', {}).get('mainnet'), g
        done.get_by_role('button', name='Забрать деньги').click()
        page.locator('.sheet', has_text='Забрать из «Велосипед»').wait_for()
        page.locator('.sheet .amount-box input').fill('30')
        page.locator('.sheet .btn-primary').click()
        page.locator('.sheet').wait_for(state='detached')
        # below the target again, but the goal was reached: the money stays free
        page.locator('.lock-badge.open', has_text='Замок снят').wait_for()
        assert page.locator('.lock-badge', has_text='Защищена до цели').count() == 0
        page.get_by_role('button', name='Забрать').click()
        page.locator('.sheet', has_text='Забрать из «Велосипед»').wait_for()
        assert page.locator('.sheet', has_text='Цель защищена').count() == 0
        page.locator('.sheet .amount-box input').fill('70')
        page.locator('.sheet .btn-primary').click()
        page.locator('.sheet').wait_for(state='detached')
        g = storage_get(page, 'goals')[0]
        assert not g['reachedAt'].get('mainnet'), 'an emptied goal starts a new round'
        # a new round: the lock holds again until the goal is reached
        page.get_by_role('button', name='Отложить').first.click()
        page.locator('.sheet .amount-box input').fill('10')
        page.locator('.sheet .btn-coin').click()
        page.locator('.sheet').wait_for(state='detached')
        page.locator('.lock-badge', has_text='Защищена до цели').wait_for()
        page.get_by_role('button', name='Забрать').click()
        page.locator('.sheet', has_text='Цель защищена').wait_for()
        page.locator('.sheet').get_by_role('button', name='Понятно').click()
        page.locator('.sheet').wait_for(state='detached')
        # a goal that filled up without a top-up (SOL got dearer) is noticed and celebrated too,
        # and raising the target of a reached goal locks it again
        make_goals(page, [{'name': 'Велосипед', 'emoji': '🚲', 'target': 100, 'alloc': {'USDC': 100, 'USDT': 0, 'SOL': 0}, 'locked': True}])
        page.reload()
        page.locator('.sheet', has_text='Цель достигнута').wait_for(timeout=10000)
        page.get_by_role('button', name='Ура!').click()
        page.locator('.sheet').wait_for(state='detached')
        g = storage_get(page, 'goals')[0]
        assert g['reachedAt'].get('mainnet') and g['celebrated'].get('mainnet'), g
        assert any(a['type'] == 'goal-completed' and a['goalName'] == 'Велосипед' for a in storage_get(page, 'activity'))
        page.locator('.tab', has_text='Цели').click()
        page.locator('.jar-tile', has_text='Велосипед').click()
        page.get_by_role('button', name='Изменить цель').click()
        page.fill('#g-target', '150')
        page.get_by_role('button', name='Сохранить').click()
        page.locator('.lock-badge', has_text='Защищена до цели').wait_for()
        page.get_by_role('button', name='Назад').click()

        step('shortfall: the wallet holds less than the goals')
        make_goals(page, [{'name': 'Машина', 'target': 5000, 'alloc': {'USDC': 200, 'USDT': 0, 'SOL': 0}}])
        page.reload()
        STATE['USDC'] = 100_000_000
        page.locator('.tab', has_text='Копилка').click()
        page.get_by_role('button', name='Обновить').click()
        page.get_by_text('Пересчитать цели').wait_for(timeout=10000)
        shot(page, 'money-02-shortfall')
        page.get_by_text('Пересчитать цели').click()
        page.get_by_text('Цели пересчитаны').wait_for()
        g = storage_get(page, 'goals')[0]
        assert g['allocations']['mainnet']['USDC'] == 100, g
        expect(page.locator('.banner.danger')).to_have_count(0)  # it folds away
        STATE['USDC'] = 250_000_000
        page.get_by_role('button', name='Обновить').click()

        step('smart lock: not enough SOL, failed tx, quote unavailable')
        page.locator('.jar-tile.new').click()
        page.fill('#g-name', 'Сейф')
        page.fill('#g-target', '400')
        page.locator('.smart-card').get_by_role('switch').click()
        page.get_by_role('button', name='Создать цель').click()
        page.locator('.smart-badge').wait_for()
        def open_safe():
            page.reload()
            page.locator('.tab', has_text='Цели').click()
            page.locator('.jar-tile', has_text='Сейф').click()
            page.locator('.smart-badge').wait_for()
        STATE['SOL'] = 4_000_000
        open_safe()
        page.get_by_role('button', name='Заблокировать', exact=True).click()
        page.locator('.sheet .amount-box input').fill('10')
        page.get_by_text('Не хватает SOL на залог').wait_for(timeout=10000)
        page.locator('.sheet .ack input').check()
        assert page.locator('.sheet .btn-coin').is_disabled()
        page.locator('.sheet').get_by_role('button', name='Закрыть').first.click()
        STATE['SOL'] = 1_500_000_000
        open_safe()
        page.get_by_role('button', name='Заблокировать', exact=True).click()
        page.locator('.sheet .amount-box input').fill('10')
        expect(page.locator('.sheet .kv')).to_contain_text('Итого', timeout=8000)
        page.locator('.sheet .ack input').check()
        STATE['sig_mode'] = 'fail'
        page.locator('.sheet .btn-coin').click()
        page.locator('.sheet').get_by_text('Сеть отклонила транзакцию').wait_for(timeout=15000)
        STATE['sig_mode'] = 'confirmed'
        g = [g for g in storage_get(page, 'goals') if g['name'] == 'Сейф'][0]
        assert not (g.get('locks') or {}).get('mainnet'), 'no lock recorded for a failed tx'
        STATE['send_error'] = 'Transaction simulation failed: Error processing Instruction 3: custom program error: 0x1771'
        page.locator('.sheet .btn-coin').click()
        page.locator('.sheet').get_by_text('Смарт-контракт отклонил операцию').wait_for(timeout=15000)
        page.locator('.sheet').get_by_role('button', name='Закрыть').first.click()
        STATE['fail_rpc'] = True
        page.get_by_role('button', name='Заблокировать', exact=True).click()
        page.get_by_text('Не удалось связаться с Jupiter Lock').wait_for(timeout=40000)
        STATE['fail_rpc'] = False
        page.locator('.sheet').get_by_role('button', name='Закрыть').first.click()

        step('devnet: no USDT, no Jupiter Lock, test SOL')
        page.get_by_role('button', name='Назад').click()
        page.get_by_role('button', name='Настройки').click()
        page.get_by_role('radio', name='Devnet (тест)').click()
        page.get_by_role('button', name='Назад').click()
        expect(page.locator('.net-pill')).to_have_text('Devnet')
        home(page)
        expect(page.locator('.token-row', has_text='USDT')).to_contain_text('Нет в Devnet')
        page.locator('.action-tile', has_text='Пополнить').click()
        assert page.locator('.chip', has_text='USDT').count() == 0
        sol_before = STATE['SOL']
        page.get_by_role('button', name='Получить 1 SOL').click()
        page.get_by_text('Пришёл 1 тестовый SOL').wait_for(timeout=15000)
        assert STATE['SOL'] == sol_before + 1_000_000_000
        page.get_by_role('button', name='Назад').click()
        page.locator('.jar-tile.new').click()
        page.locator('.smart-card').get_by_role('switch').click()
        page.get_by_text('Jupiter Lock недоступен в этой сети').wait_for(timeout=10000)
        shot(page, 'money-03-devnet-smart')
        page.get_by_role('button', name='Назад').click()
        assert any('devnet' in h for h in STATE['hosts'][-5:])
        page.get_by_role('button', name='Настройки').click()
        page.get_by_role('radio', name='Mainnet').click()

        step('RPC: public nodes by default, each one checked; a custom node checks the address and the network')
        expect(page.locator('.set-row', has_text='RPC-адрес')).to_contain_text('Публичные узлы Solana')
        page.get_by_role('button', name=re.compile('RPC-адрес')).click()
        expect(page.locator('.rpc-node')).to_have_count(6)
        for name in ('PublicNode', 'Solana Vibe Station', 'Solana Foundation', 'Solana Labs', 'Tatum', 'Pocket Network'):
            expect(page.locator('.rpc-node', has_text=name)).to_have_count(1)
        expect(page.locator('.rpc-ms.ok')).to_have_count(6, timeout=10000)
        health = storage_get(page, 'rpcHealth') or {}
        assert sum(1 for h in health.values() if h.get('ok')) >= 6, health
        expect(page.locator('.rpc-node.active')).to_have_count(1)
        assert not any('helius' in h for h in STATE['hosts']), 'no personal Helius key any more'
        shot(page, 'money-05-rpc')
        page.fill('#rpc-url', 'http://good-node.example.com')
        page.get_by_role('button', name='Подключить').click()
        page.get_by_text('Нужен адрес вида https://').wait_for()
        page.fill('#rpc-url', 'https://devnet-node.example.com')
        page.get_by_role('button', name='Подключить').click()
        page.get_by_text('Этот узел не из сети Mainnet').wait_for(timeout=10000)
        page.fill('#rpc-url', 'https://nobody-here.example.org')
        page.get_by_role('button', name='Подключить').click()
        page.get_by_text('Узел не отвечает').wait_for(timeout=20000)
        page.fill('#rpc-url', 'https://good-node.example.com/rpc')
        page.get_by_role('button', name='Подключить').click()
        page.get_by_text('Узел работает').wait_for(timeout=10000)
        expect(page.locator('.rpc-node').first).to_contain_text('Ваш узел')
        expect(page.locator('.rpc-node')).to_have_count(7)
        page.get_by_role('button', name='Назад').click()
        expect(page.locator('.set-row', has_text='RPC-адрес')).to_contain_text('good-node.example.com')
        STATE['hosts'].clear()
        page.get_by_role('button', name='Назад').click()
        home(page)
        page.get_by_role('button', name='Обновить').click()
        page.wait_for_timeout(1500)
        assert STATE['hosts'] and STATE['hosts'][0] == 'good-node.example.com', STATE['hosts'][:3]
        page.get_by_role('button', name='Настройки').click()
        page.get_by_role('button', name=re.compile('RPC-адрес')).click()
        page.get_by_role('button', name='Вернуть публичные узлы').click()
        page.get_by_text('Снова через публичные узлы').wait_for()
        expect(page.locator('.rpc-node')).to_have_count(6)
        page.get_by_role('button', name='Назад').click()
        expect(page.locator('.set-row', has_text='RPC-адрес')).to_contain_text('Публичные узлы Solana')
        page.get_by_role('button', name='Назад').click()

        step('history: dust from a stranger is tagged as spam, and paying it back is warned')
        spammer = node('keypair')['pubkey']
        STATE['dust_from'] = spammer
        page.locator('.tab', has_text='История').click()
        page.get_by_role('button', name='Обновить историю').click()
        spam_row = page.locator('.list-row[data-spam]')
        spam_row.wait_for(timeout=15000)
        expect(spam_row).to_have_count(1)
        expect(spam_row).to_contain_text('похоже на спам')
        assert 'in' not in (spam_row.locator('.val').get_attribute('class') or '').split()
        # real deposits are not tagged
        expect(page.locator('.list-row:not([data-spam])', has_text='+0,5 SOL')).to_have_count(1)
        shot(page, 'money-02b-spam-row')
        page.locator('.tab', has_text='Копилка').click()
        page.locator('.action-tile', has_text='Вывести').click()
        page.fill('#to', spammer)
        page.locator('.amount-box input').fill('1')
        page.get_by_role('button', name='Продолжить').click()
        page.get_by_text('Проверьте перевод').wait_for()
        expect(page.locator('.banner.danger')).to_contain_text('приходила только мелочь')
        go = page.get_by_role('button', name=re.compile('^Отправить'))
        expect(go).to_be_disabled()
        page.get_by_text('Я сверил адрес целиком').click()
        expect(go).to_be_enabled()
        page.get_by_role('button', name='Изменить').click()
        page.get_by_role('button', name='Назад').click()
        STATE['dust_from'] = None

        step('history: network failure is reported')
        STATE['fail_rpc'] = True
        page.locator('.tab', has_text='История').click()
        page.get_by_role('button', name='Обновить историю').click()
        page.get_by_text('Не удалось загрузить переводы').wait_for(timeout=40000)
        STATE['fail_rpc'] = False
        page.get_by_role('button', name='Обновить историю').click()
        expect(page.get_by_text('Не удалось загрузить переводы')).to_have_count(0, timeout=15000)

        step('spam dust while the popup is closed: no notification, no badge')
        page.close()
        for pg in ctx.pages:
            if pg.url.startswith('chrome-extension'): pg.close()
        sw.evaluate("chrome.action.setBadgeText({ text: '' })")
        read_known = "chrome.storage.local.get('knownBalances').then(r => Object.values(r.knownBalances || {}).map(v => v.USDC || 0))"
        before = sw.evaluate(read_known)
        inbox_before = sw.evaluate("chrome.storage.local.get('depositInbox').then(r => (r.depositInbox || []).length)")
        STATE['USDC'] += 500_000      # 0.5 USDC
        STATE['SOL'] += 5_000_000     # 0.005 SOL
        sw.evaluate("chrome.alarms.create('deposits', { when: Date.now() + 300 })")
        for _ in range(40):
            known = sw.evaluate(read_known)
            if any(abs(k - b - 0.5) < 1e-6 for k in known for b in before): break
            time.sleep(0.25)
        else:
            raise AssertionError(f'the dust was never seen: {before} -> {known}')
        assert sw.evaluate("chrome.storage.local.get('depositInbox').then(r => (r.depositInbox || []).length)") == inbox_before
        notes = sw.evaluate("chrome.notifications.getAll()")
        assert not any(k.startswith('deposit-') for k in notes), notes
        assert sw.evaluate("chrome.action.getBadgeText({})") == ''

        step('a deposit while the popup is closed: notification and badge')
        STATE['USDC'] += 30_000_000
        sw.evaluate("chrome.alarms.create('deposits', { when: Date.now() + 300 })")
        notes = {}
        for _ in range(40):
            notes = sw.evaluate("chrome.notifications.getAll()")
            if any(k.startswith('deposit-') for k in notes): break
            time.sleep(0.25)
        assert any(k.startswith('deposit-') for k in notes), notes
        assert sw.evaluate("chrome.action.getBadgeText({})") == '+'
        sw.evaluate("chrome.alarms.create('deposits', { periodInMinutes: 2 })")
        page = new_page(ctx, base)
        page.locator('.deposit-card').wait_for(timeout=10000)
        expect(page.locator('.deposit-card')).to_contain_text('+30 USDC')
        for _ in range(20):
            if sw.evaluate("chrome.action.getBadgeText({})") == '': break
            time.sleep(0.2)
        assert sw.evaluate("chrome.action.getBadgeText({})") == ''
        # the popup's own refresh must not announce the same deposit again
        page.get_by_role('button', name='Обновить').click()
        page.wait_for_timeout(1500)
        inbox = storage_get(page, 'depositInbox')
        assert len([d for d in inbox if d['token'] == 'USDC' and abs(d['amount'] - 30) < 1e-9]) == 1, inbox
        page.locator('.deposit-card').get_by_role('button', name='Отложить').click()
        expect(page.locator('.sheet .amount-box input')).to_have_value('30')
        shot(page, 'money-04-deposit')
    except Exception:
        fail_shots(ctx, 'money')
        raise
    finally:
        ctx.close()

bad = [e for e in errors if '503' not in e and 'ERR_' not in e and '404' not in e]
print('\n'.join(bad) if bad else 'no page errors')
assert not bad, 'console errors'
print('MONEY OK')
