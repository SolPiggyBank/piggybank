"""
Swaps: the home tile, quoting with PiggyBank's 0.7 % fee, flipping and picking
tokens, the review, the swapping/finished screens, history, and every way a
swap is refused (rate limit, no route, unsafe answers, slippage, a bad rate,
not enough SOL, money kept in goals, devnet). Every swap that was signed is
written to test/swap_txs.json for verify_swaps.mjs.
"""
import json, re, time
from playwright.sync_api import sync_playwright, expect
from harness import *

MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
signed = []

def step(name):
    print('·', name, flush=True)

def go_home(page):
    # the popup may still be starting after a reload: wait for a screen first
    page.locator('.tab, .topbar').first.wait_for(timeout=15000)
    for _ in range(4):
        if page.locator('.tab', has_text='Копилка').count():
            break
        page.get_by_role('button', name='Назад').click()
    page.locator('.tab', has_text='Копилка').click()
    page.locator('.hero').wait_for()

def open_swap(page):
    go_home(page)
    page.locator('.action-tile', has_text='Обменять').click()
    expect(page.locator('.topbar')).to_contain_text('Обмен')

def pick(page, which, sym):
    page.get_by_role('button', name=which, exact=True).click()
    page.locator('.tok-menu').get_by_role('option', name=re.compile(sym)).click()
    expect(page.locator('.tok-menu')).to_have_count(0)

def amount(page, text):
    page.locator('.swap-input').fill(text)

def quoted(page):
    # a fresh quote (the previous one stays on screen, dimmed, while the next loads)
    page.locator('.swap-details:not(.dim) .swap-kv').wait_for(timeout=8000)
    expect(page.locator('.swap-go')).to_be_enabled(timeout=8000)
    sw = page.evaluate("[...document.querySelectorAll('.scroll')].map(s => s.scrollWidth - s.clientWidth)")
    assert all(w <= 0 for w in sw), f'swap screen is wider than the popup: {sw}'

def last_call():
    return STATE['jup_calls'][-1]

def record(raw, owner, frm, to, in_raw, fee_new=False):
    signed.append({'raw': raw, 'owner': owner, 'from': frm, 'to': to, 'inRaw': str(in_raw), 'feeAccountNew': fee_new})

with sync_playwright() as p:
    ctx, base = launch(p, 'ru')
    try:
        owner = import_wallet(ctx, base, MNEMONIC)
        page = new_page(ctx, base)
        expect(page.locator('.hero .total')).to_contain_text('629', timeout=10000)

        step('four action tiles, swap among them')
        expect(page.locator('.action-tile')).to_have_count(4)
        assert page.locator('.actions-row').inner_text().split() == ['Пополнить', 'Отложить', 'Обменять', 'Вывести'], page.locator('.actions-row').inner_text()
        for tile in page.locator('.action-tile').all():
            box = tile.bounding_box()
            assert box['width'] > 70, box
        shot(page, 'swap-01-home')

        step('a quote: 0.7 % kept, the rest goes to Jupiter')
        open_swap(page)
        expect(page.get_by_role('button', name='Отдаёте', exact=True)).to_contain_text('USDC')
        expect(page.get_by_role('button', name='Получаете', exact=True)).to_contain_text('SOL')
        assert page.locator('.swap-go').is_disabled()
        amount(page, '100')
        quoted(page)
        q = last_call()
        assert q['inputMint'] == USDC and q['outputMint'] == SOL_MINT, q
        assert q['amount'] == '99300000', q  # 100 USDC minus the 0.7 USDC fee
        assert q['taker'] == owner and q['slippageBps'] == '50', q
        kv = page.locator('.swap-kv').inner_text()
        assert 'Комиссия PiggyBank, 0,7%' in kv and '0,7 USDC' in kv, kv
        assert 'Получите минимум' in kv and 'Комиссия сети' in kv, kv
        assert '1 SOL ≈ 172' in kv, kv
        expect(page.locator('.swap-out')).to_contain_text('0,5748')
        expect(page.locator('.swap-sub').nth(1)).to_contain_text('за вычетом комиссии 0,7%')
        page.get_by_text('PiggyBank берёт 0,7% от суммы').wait_for()
        shot(page, 'swap-02-quote')

        step('flip: what comes out goes in')
        page.locator('.swap-flip').click()
        expect(page.get_by_role('button', name='Отдаёте', exact=True)).to_contain_text('SOL')
        expect(page.locator('.swap-input')).to_have_value(re.compile(r'^0,5748'))
        quoted(page)
        assert last_call()['inputMint'] == SOL_MINT, last_call()
        expect(page.locator('.swap-kv')).to_contain_text('SOL')
        page.locator('.swap-flip').click()
        expect(page.get_by_role('button', name='Отдаёте', exact=True)).to_contain_text('USDC')

        step('token menu; picking the token on the other side swaps them')
        page.get_by_role('button', name='Получаете', exact=True).click()
        expect(page.locator('.tok-menu [role=option]')).to_have_count(3)
        shot(page, 'swap-03-menu')
        page.locator('.tok-menu').get_by_role('option', name=re.compile('USDT')).click()
        expect(page.get_by_role('button', name='Получаете', exact=True)).to_contain_text('USDT')
        pick(page, 'Получаете', 'USDC')  # the other side's token: they trade places
        expect(page.get_by_role('button', name='Отдаёте', exact=True)).to_contain_text('USDT')
        expect(page.get_by_role('button', name='Получаете', exact=True)).to_contain_text('USDC')
        pick(page, 'Отдаёте', 'USDC')
        pick(page, 'Получаете', 'SOL')

        step('more than is free; Max')
        amount(page, '1000')
        page.locator('.hint.err', has_text='Можно вывести').wait_for()
        assert page.locator('.swap-go').is_disabled()
        page.get_by_role('button', name='Максимум').click()
        expect(page.locator('.swap-input')).to_have_value('250')
        amount(page, '0,5')
        page.locator('.hint.err', has_text='Минимальная сумма обмена — 1 USDC').wait_for()
        # Max in SOL leaves enough for the fee and the temporary wSOL account
        pick(page, 'Отдаёте', 'SOL')
        expect(page.get_by_role('button', name='Получаете', exact=True)).to_contain_text('USDC')
        page.get_by_role('button', name='Максимум').click()
        expect(page.locator('.swap-input')).to_have_value('1,495')
        quoted(page)
        expect(page.locator('.banner.danger')).to_have_count(0)
        assert page.locator('.swap-go').is_enabled()
        pick(page, 'Отдаёте', 'USDC')
        pick(page, 'Получаете', 'SOL')

        step('review and swap 100 USDC → SOL')
        amount(page, '100')
        quoted(page)
        page.locator('.swap-go').click()
        expect(page.locator('.topbar')).to_contain_text('Проверьте обмен')
        expect(page.locator('.swap-pair')).to_contain_text('100 USDC')
        expect(page.locator('.swap-kv')).to_contain_text('Комиссия PiggyBank, 0,7%')
        page.get_by_text('сеть отменит обмен').wait_for()
        shot(page, 'swap-04-review')
        STATE['sig_mode'] = 'pending'
        sent_before = len(STATE['swap_sent'])
        page.get_by_role('button', name='Обменять 100 USDC на SOL').click()
        page.locator('.swap-orbit').wait_for()
        page.get_by_text('Меняем…').wait_for(timeout=8000)
        shot(page, 'swap-05-orbit')
        STATE['sig_mode'] = 'confirmed'
        page.get_by_text('Обмен готов!').wait_for(timeout=15000)
        expect(page.locator('.swap-received')).to_contain_text('+0,57')
        page.get_by_text('Отдано 100 USDC, из них комиссия 0,7 USDC').wait_for()
        page.wait_for_timeout(1300)
        assert page.locator('canvas').count() >= 1, 'confetti'
        shot(page, 'swap-06-done')
        assert len(STATE['swap_sent']) == sent_before + 1
        sig = tx_signature(STATE['swap_sent'][-1])
        assert STATE['swaps'][sig]['fee'] == 700_000, STATE['swaps'][sig]
        record(STATE['swap_sent'][-1], owner, 'USDC', 'SOL', 100_000_000)
        activity = storage_get(page, 'activity')
        sw = next(a for a in activity if a['type'] == 'swap')
        assert sw['from'] == 'USDC' and sw['to'] == 'SOL' and sw['amount'] == 100 and sw['fee'] == 0.7, sw
        assert abs(sw['outAmount'] - 0.5748) < 0.01, sw
        assert not storage_get(page, 'pendingTxs'), 'pending cleared'

        step('back home: balances moved, no "deposit arrived" for the swap')
        page.get_by_role('button', name='Готово').click()
        page.locator('.hero').wait_for()
        expect(page.locator('.token-list')).to_contain_text('150')
        page.wait_for_timeout(1500)
        expect(page.locator('.deposit-card')).to_have_count(0)
        inbox = storage_get(page, 'depositInbox') or []
        assert not any(d['token'] == 'SOL' for d in inbox), inbox

        step('history shows the swap')
        page.locator('.tab', has_text='История').click()
        row = page.locator('.list-row', has_text='Обмен').first
        row.wait_for(timeout=8000)
        expect(row).to_contain_text('USDC → SOL')
        expect(row).to_contain_text('+0,57')
        expect(row).to_contain_text('−100 USDC')
        shot(page, 'swap-07-history')
        page.get_by_role('tab', name='Цели').click()
        expect(page.locator('.list-row', has_text='Обмен')).to_have_count(0)

        step('SOL → USDT: the fee is 0.7 % in SOL')
        open_swap(page)
        pick(page, 'Отдаёте', 'SOL')
        pick(page, 'Получаете', 'USDT')
        amount(page, '0,5')
        quoted(page)
        assert last_call()['amount'] == '496500000', last_call()
        expect(page.locator('.swap-kv')).to_contain_text('0,0035 SOL')
        page.locator('.swap-go').click()
        page.get_by_role('button', name=re.compile('Обменять 0,5 SOL на USDT')).click()
        page.get_by_text('Обмен готов!').wait_for(timeout=15000)
        record(STATE['swap_sent'][-1], owner, 'SOL', 'USDT', 500_000_000)
        assert STATE['swaps'][tx_signature(STATE['swap_sent'][-1])]['fee'] == 3_500_000
        page.get_by_role('button', name='Ещё обмен').click()
        expect(page.locator('.swap-input')).to_have_value('')

        step('the fee wallet has no USDT account yet: opening it is shown and paid once')
        STATE['fee_accounts'] = {'USDC'}
        pick(page, 'Отдаёте', 'USDT')
        pick(page, 'Получаете', 'USDC')
        amount(page, '20')
        quoted(page)
        expect(page.locator('.swap-kv')).to_contain_text('Открытие счёта для комиссии')
        page.locator('.swap-go').click()
        page.get_by_role('button', name=re.compile('Обменять 20 USDT на USDC')).click()
        page.get_by_text('Обмен готов!').wait_for(timeout=15000)
        record(STATE['swap_sent'][-1], owner, 'USDT', 'USDC', 20_000_000, fee_new=True)
        STATE['fee_accounts'] = None
        page.get_by_role('button', name='Ещё обмен').click()

        step('refusals: rate limit, no route, unsafe answers, slippage, a bad rate')
        sent_before = len(STATE['swap_sent'])
        pick(page, 'Отдаёте', 'USDC')
        pick(page, 'Получаете', 'SOL')
        STATE['jup_mode'] = 'busy'
        amount(page, '10')
        page.locator('.banner.danger', has_text='Слишком много запросов').wait_for(timeout=8000)
        assert page.locator('.swap-go').is_disabled()
        STATE['jup_mode'] = 'ok'
        page.locator('.banner.danger').get_by_role('button', name='Повторить').click()
        quoted(page)
        for mode, text, frm, to, value in [
            ('noroute', 'не нашлось маршрута', 'USDC', 'SOL', '15'),
            ('down', 'Сервис обмена сейчас не отвечает', 'USDC', 'SOL', '16'),
            ('evil-setup', 'проверка показала', 'SOL', 'USDC', '0,2'),
            ('evil-out', 'проверка показала', 'USDC', 'USDT', '17'),
            ('slippage', 'Курс сдвинулся', 'USDC', 'SOL', '18'),
        ]:
            STATE['jup_mode'] = mode
            pick(page, 'Отдаёте', frm)
            pick(page, 'Получаете', to)
            amount(page, value)
            page.locator('.banner.danger', has_text=text).wait_for(timeout=8000)
            assert page.locator('.swap-go').is_disabled(), mode
            if mode == 'evil-out':
                shot(page, 'swap-08-unsafe')
        STATE['jup_mode'] = 'ok'
        STATE['jup_rate'] = 0.85
        pick(page, 'Отдаёте', 'USDC')
        pick(page, 'Получаете', 'SOL')
        amount(page, '30')
        page.locator('.banner.danger', has_text='сильно отличается от рыночного').wait_for(timeout=8000)
        STATE['jup_rate'] = 0.998
        assert len(STATE['swap_sent']) == sent_before, 'nothing was sent'

        step('the price moves while sending: the network refuses, the person is told why')
        STATE['jup_mode'] = 'ok'
        pick(page, 'Отдаёте', 'USDC')
        pick(page, 'Получаете', 'SOL')
        amount(page, '21')
        quoted(page)
        page.locator('.swap-go').click()
        expect(page.locator('.topbar')).to_contain_text('Проверьте обмен')
        STATE['send_error'] = 'Transaction simulation failed: Error processing Instruction 5: custom program error: 0x1771'
        page.get_by_role('button', name='Обменять 21 USDC на SOL').click()
        page.locator('.status-wrap', has_text='Курс сдвинулся сильнее допуска').wait_for(timeout=8000)
        assert len(STATE['swap_sent']) == sent_before, 'nothing was sent'
        assert not storage_get(page, 'pendingTxs'), 'nothing pending'
        page.get_by_role('button', name='Повторить').click()
        quoted(page)
        expect(page.locator('.swap-input')).to_have_value('21')

        step('not enough SOL for the network fee')
        STATE['SOL'] = 1_000_000  # 0.001 SOL
        go_home(page)
        page.get_by_role('button', name='Обновить', exact=True).click()
        page.locator('.token-list').get_by_text('0,001').wait_for(timeout=8000)
        open_swap(page)
        amount(page, '10')
        page.locator('.banner.danger', has_text='Для обмена нужно').wait_for(timeout=8000)
        assert page.locator('.swap-go').is_disabled()
        STATE['SOL'] = 1_500_000_000

        step('money in goals is not swapped')
        make_goals(page, [{'name': 'Отпуск', 'emoji': '🏝️', 'target': 1000, 'alloc': {'USDC': 100, 'USDT': 0, 'SOL': 0}}])
        page.reload()
        open_swap(page)
        page.locator('.hint', has_text='Ещё 100 USDC отложено в цели').wait_for()
        page.get_by_role('button', name='Максимум').click()
        free_raw = STATE['USDC'] - 100_000_000
        free_text = f'{free_raw // 1_000_000},{free_raw % 1_000_000:06d}'.rstrip('0').rstrip(',')
        expect(page.locator('.swap-input')).to_have_value(free_text)
        amount(page, str(free_raw // 1_000_000 + 5))
        page.locator('.hint.err', has_text='Ещё 100 отложено в целях').wait_for()

        step('devnet: swaps are mainnet only')
        settings = storage_get(page, 'settings') or {}
        storage_set(page, 'settings', {**settings, 'network': 'devnet'})
        page.reload()
        calls = len(STATE['jup_calls'])
        open_swap(page)
        page.get_by_text('Обмен работает в основной сети.').wait_for()
        expect(page.locator('.swap-input')).to_be_disabled()
        assert page.locator('.swap-flip').is_disabled()
        shot(page, 'swap-09-devnet')
        page.get_by_role('button', name='Открыть настройки').click()
        expect(page.locator('.topbar')).to_contain_text('Настройки')
        assert len(STATE['jup_calls']) == calls
        storage_set(page, 'settings', {**settings, 'network': 'mainnet', 'language': 'en', 'theme': 'dark'})

        step('English, dark')
        page.reload()
        page.locator('.action-tile', has_text='Swap').click()
        expect(page.get_by_role('button', name='You pay', exact=True)).to_be_visible()
        amount(page, '25')
        quoted(page)
        kv = page.locator('.swap-kv').inner_text()
        assert 'PiggyBank fee, 0.7%' in kv and 'Minimum received' in kv, kv
        page.get_by_text('PiggyBank keeps 0.7% of the amount').wait_for()
        shot(page, 'swap-10-en-dark')
        page.locator('.swap-go').click()
        expect(page.locator('.topbar')).to_contain_text('Review the swap')
        shot(page, 'swap-11-en-review')

        (ROOT / 'test' / 'swap_txs.json').write_text(json.dumps(signed))
        # the refusal steps answer 429/400/500 on purpose; the browser logs those loads
        real = [e for e in errors if not re.search(r'Failed to load resource.*\b(429|400|500)\b', e)]
        assert not real, real
        print('SWAP OK')
    except Exception:
        fail_shots(ctx, 'swap')
        print('errors:', errors)
        raise
    finally:
        ctx.close()
