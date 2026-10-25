"""
Screenshots of every screen and sheet in both languages and both themes, for
a visual review. Usage: python3 test/shoot_all.py <out-dir> [ru,en,de,…] [light|dark]
"""
import json, re, sys, time
from playwright.sync_api import sync_playwright, expect
from harness import *

OUT = pathlib.Path(sys.argv[1])
LANGS = sys.argv[2].split(',') if len(sys.argv) > 2 else ['ru', 'en']
THEMES = [sys.argv[3]] if len(sys.argv) > 3 else ['light', 'dark']
MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

NAMES = {
    'ru': ('Отпуск в Грузии с друзьями и собакой', 'Новый телефон', 'Ноутбук', 'Подушка безопасности', 'Велосипед', 'Цветы маме'),
    'en': ('Trip to Georgia with friends and the dog', 'New phone', 'Laptop', 'Rainy-day fund', 'Bicycle', 'Flowers for mum'),
    'es': ('Viaje a Georgia con amigos y el perro', 'Teléfono nuevo', 'Laptop', 'Fondo de emergencia', 'Bicicleta', 'Flores para mamá'),
    'fr': ('Voyage en Géorgie avec les amis et le chien', 'Nouveau téléphone', 'Ordinateur portable', 'Épargne de précaution', 'Vélo', 'Fleurs pour maman'),
    'de': ('Reise nach Georgien mit Freunden und Hund', 'Neues Handy', 'Laptop', 'Notgroschen', 'Fahrrad', 'Blumen für Mama'),
    'pt': ('Viagem à Geórgia com os amigos e o cachorro', 'Celular novo', 'Notebook', 'Reserva de emergência', 'Bicicleta', 'Flores para a mamãe'),
    'zh': ('和朋友、狗狗一起去格鲁吉亚旅行', '新手机', '笔记本电脑', '应急金', '自行车', '给妈妈的花'),
    'ja': ('友達と犬とジョージア旅行', '新しいスマホ', 'ノートパソコン', 'もしものための備え', '自転車', 'お母さんに花束'),
}

def labels(lang):
    """Button and tab names in this language, straight from the translation files."""
    S = STR[lang]
    trip, phone, laptop, safety, sol, flowers = NAMES[lang]
    cta = re.escape(S['send.cta']).replace(re.escape('{amount}'), '.+')
    return {'trip': trip, 'phone': phone, 'laptop': laptop, 'safety': safety, 'sol': sol, 'flowers': flowers,
            'back': S['common.back'], 'settings': S['settings.title'], 'lock_app': S['home.lock'], 'put': S['home.putAside'],
            'take': S['goals.takeOut'], 'edit': S['goals.edit'], 'delete': S['goals.delete'], 'withdraw': S['home.withdraw'],
            'deposit': S['home.deposit'], 'continue': S['common.continue'], 'send_re': '^' + cta + '$', 'history': S['tabs.history'],
            'goals': S['tabs.goals'], 'home': S['tabs.home'], 'secret': re.escape(S['settings.phraseAndKey']), 'show': S['reveal.show'],
            'changepw': S['settings.changePw'], 'rpc': re.escape(S['settings.rpc']), 'open': S['unlock.open'], 'forgot': S['unlock.forgot'],
            'lock': S['smart.lockCta'], 'new': S['goals.new'], 'retry': S['common.retry'], 'gotit': S['guard.ok'],
            'close': S['common.close'], 'gohome': S['common.goHome'],
            'amount': '12,345678' if lang in ('ru', 'es', 'fr', 'de', 'pt') else '12.345678'}

T = {l: labels(l) for l in LANG_CODES}
REPORT = []  # text that spills out of its box, per screen

def fixtures(page, owner, L):
    now = int(time.time())
    future = now + 120 * 86400
    past = now - 3600
    ms = now * 1000
    iso = lambda sec: time.strftime('%Y-%m-%d', time.localtime(sec))
    lap, saf = node('escrowid'), node('escrowid')
    STATE['escrows'][saf['id']] = bytearray(base64.b64decode(node('escrow', saf['base'], owner, USDC, '75000000', str(past), '0')['data']))
    goals = [
        {'id': 'trip', 'name': L['trip'], 'emoji': '🏝️', 'color': 'sky', 'target': 1500, 'deadline': iso(now + 150 * 86400),
         'locked': True, 'createdAt': ms - 5, 'allocations': {'mainnet': {'USDC': 180, 'USDT': 0, 'SOL': 0}}},
        {'id': 'phone', 'name': L['phone'], 'emoji': '📱', 'color': 'plum', 'target': 100, 'deadline': None,
         'createdAt': ms - 4, 'allocations': {'mainnet': {'USDC': 0, 'USDT': 100, 'SOL': 0}}, 'celebrated': {'mainnet': ms}},
        {'id': 'laptop', 'name': L['laptop'], 'emoji': '💻', 'color': 'coin', 'target': 900, 'deadline': iso(future),
         'smart': {'provider': 'jupiter', 'unlockAt': future}, 'createdAt': ms - 3, 'allocations': {'mainnet': {'USDC': 0, 'USDT': 0, 'SOL': 0}},
         'locks': {'mainnet': [
             {'id': lap['id'], 'base': lap['base'], 'provider': 'jupiter', 'token': 'USDC', 'amount': 50, 'feeToken': 0, 'feeSol': 0.005, 'depositSol': 0.005,
              'unlockAt': future, 'createdAt': ms - 86400000, 'signature': rnd(64), 'status': 'locked'},
             {'id': rnd(), 'provider': 'jupiter', 'token': 'USDT', 'amount': 25.5, 'feeToken': 0, 'feeSol': 0.005,
              'unlockAt': future, 'createdAt': ms - 20000, 'signature': rnd(64), 'status': 'pending'}]}},
        {'id': 'safety', 'name': L['safety'], 'emoji': '🛡️', 'color': 'mint', 'target': 500, 'deadline': iso(past),
         'smart': {'provider': 'jupiter', 'unlockAt': past}, 'createdAt': ms - 2, 'allocations': {'mainnet': {'USDC': 0, 'USDT': 0, 'SOL': 0}},
         'locks': {'mainnet': [{'id': saf['id'], 'base': saf['base'], 'provider': 'jupiter', 'token': 'USDC', 'amount': 75, 'feeToken': 0,
                                'feeSol': 0.005, 'depositSol': 0.005, 'unlockAt': past, 'createdAt': ms - 90 * 86400000, 'signature': rnd(64), 'status': 'locked'}]}},
        {'id': 'bike', 'name': L['sol'], 'emoji': '🚲', 'color': 'tangerine', 'target': 400, 'deadline': iso(now + 40 * 86400),
         'createdAt': ms - 1, 'allocations': {'mainnet': {'USDC': 0, 'USDT': 0, 'SOL': 0.75}}},
    ]
    act = []
    for i, (typ, gid, tok, amt) in enumerate([('allocate', 'trip', 'USDC', 200), ('allocate', 'trip', 'USDC', 120), ('release', 'trip', 'USDC', 15),
                                              ('lock', 'laptop', 'USDC', 50), ('allocate', 'bike', 'SOL', 0.75), ('goal-completed', 'phone', None, None)]):
        g = [x for x in goals if x['id'] == gid][0]
        a = {'id': f'a{i}', 'ts': ms - (6 - i) * 3600_000, 'network': 'mainnet', 'type': typ, 'goalId': gid, 'goalName': g['name'], 'emoji': g['emoji']}
        if tok: a.update(token=tok, amount=amt)
        act.append(a)
    storage_set(page, 'goals', goals)
    storage_set(page, 'activity', list(reversed(act)))
    storage_set(page, 'depositInbox', [{'id': 'd1', 'token': 'USDC', 'amount': 42.5, 'ts': ms, 'network': 'mainnet'}])
    w = storage_get(page, 'wallet'); w['backedUp'] = False
    storage_set(page, 'wallet', w)

def run(p, lang):
    L = T[lang]
    STATE.update(fresh_state())
    ctx, base = launch(p, lang)
    try:
        owner = import_wallet(ctx, base, MNEMONIC, lang=lang)
        page = new_page(ctx, base)
        page.locator('.hero').wait_for()
        fixtures(page, owner, L)
        for theme in THEMES:
            d = OUT / f'{lang}-{theme}'
            d.mkdir(parents=True, exist_ok=True)
            n = [0]
            def snap(name, pg=None):
                n[0] += 1
                (pg or page).wait_for_timeout(500)
                (pg or page).screenshot(path=str(d / f'{n[0]:02d}-{name}.png'))
                for o in (pg or page).evaluate(OVERFLOW_JS):
                    REPORT.append({'lang': lang, 'theme': theme, 'screen': f'{n[0]:02d}-{name}', **o})
            s = storage_get(page, 'settings') or {}
            s.update(theme=theme, language=lang, hideBalances=False)
            storage_set(page, 'settings', s)
            page.reload()
            page.locator('.hero').wait_for()
            expect(page.locator('html')).to_have_attribute('data-theme', theme)
            page.wait_for_timeout(1200)
            snap('home')
            page.evaluate("document.querySelector('.scroll').scrollTop = 460")
            snap('home-goals')
            page.evaluate("document.querySelector('.scroll').scrollTop = 2000")
            snap('home-wallet')
            page.locator('.tab', has_text=L['goals']).click()
            snap('goals')
            page.evaluate("document.querySelector('.scroll').scrollTop = 2000")
            snap('goals-bottom')
            # protected goal
            page.locator('.jar-tile', has_text=L['trip'][:10]).first.click()
            snap('goal-protected')
            page.evaluate("document.querySelector('.scroll').scrollTop = 2000")
            snap('goal-protected-bottom')
            page.get_by_role('button', name=L['take'], exact=True).click()
            page.wait_for_timeout(900)
            snap('sheet-guard')
            page.locator('.sheet').get_by_role('button', name=L['gotit'], exact=True).click()
            page.locator('.sheet').wait_for(state='detached')
            page.get_by_role('button', name=L['edit'], exact=True).click()
            snap('goal-edit-existing')
            page.evaluate("document.querySelector('.scroll').scrollTop = 2000")
            snap('goal-edit-existing-bottom')
            page.get_by_role('button', name=L['delete'], exact=True).click()
            snap('sheet-delete')
            page.locator('.sheet').get_by_role('button', name=L['close'], exact=True).first.click()
            page.get_by_role('button', name=L['back'], exact=True).click()
            page.get_by_role('button', name=L['back'], exact=True).click()
            # taking money out of a goal that isn't protected
            page.locator('.jar-tile', has_text=L['phone']).first.click()
            page.get_by_role('button', name=L['take'], exact=True).click()
            page.locator('.sheet .amount-box input').fill('15')
            snap('sheet-release')
            page.locator('.sheet').get_by_role('button', name=L['close'], exact=True).first.click()
            page.get_by_role('button', name=L['back'], exact=True).click()
            # smart goal with locks
            page.locator('.jar-tile', has_text=L['laptop']).click()
            snap('goal-smart')
            page.evaluate("document.querySelector('.scroll').scrollTop = 330")
            snap('goal-smart-locks')
            page.get_by_role('button', name=L['lock'], exact=True).click()
            page.locator('.sheet .amount-box input').fill('40')
            expect(page.locator('.sheet .kv')).to_contain_text('40', timeout=8000)
            snap('sheet-lock')
            page.locator('.sheet .sheet-body').evaluate('e => e.scrollTop = 1000')
            snap('sheet-lock-bottom')
            page.locator('.sheet').get_by_role('button', name=L['close'], exact=True).first.click()
            page.get_by_role('button', name=L['back'], exact=True).click()
            page.locator('.jar-tile', has_text=L['safety']).click()
            page.evaluate("document.querySelector('.scroll').scrollTop = 330")
            snap('goal-smart-unlocked')
            page.get_by_role('button', name=L['back'], exact=True).click()
            # new goal editor
            page.locator('.jar-tile.new').first.click()
            snap('goal-new')
            page.locator('.smart-card').get_by_role('switch').click()
            page.locator('.smart-card').scroll_into_view_if_needed()
            expect(page.locator('.smart-points')).to_contain_text('SOL', timeout=8000)
            snap('goal-new-smart')
            page.get_by_role('button', name=L['back'], exact=True).click()
            # put aside
            page.locator('.tab', has_text=L['home']).click()
            page.locator('.action-tile', has_text=L['put']).click()
            page.locator('.sheet .amount-box input').fill('25')
            snap('sheet-allocate')
            page.locator('.sheet').get_by_role('button', name=L['close'], exact=True).first.click()
            # deposit
            page.locator('.action-tile', has_text=L['deposit']).click()
            page.locator('.qr-card svg').first.wait_for()
            snap('deposit')
            page.evaluate("document.querySelector('.scroll').scrollTop = 2000")
            snap('deposit-bottom')
            page.get_by_role('button', name=L['back'], exact=True).click()
            # send
            page.locator('.action-tile', has_text=L['withdraw']).click()
            page.fill('#to', OTHER)
            page.locator('.amount-box input').fill(L['amount'])
            snap('send-form')
            page.get_by_role('button', name=L['continue'], exact=True).click()
            page.locator('.review').wait_for()
            snap('send-review')
            page.get_by_role('button', name=re.compile(L['send_re'])).click()
            page.locator('.send-done').wait_for(timeout=15000)
            page.wait_for_timeout(1300)  # let the coin fly off and the tick land
            snap('send-done')
            page.locator('.btn-primary').click()
            page.locator('.action-tile', has_text=L['withdraw']).click()
            page.fill('#to', OTHER)
            page.locator('.amount-box input').fill('3')
            page.get_by_role('button', name=L['continue'], exact=True).click()
            page.locator('.review').wait_for()
            STATE['sig_mode'] = 'fail'
            page.get_by_role('button', name=re.compile(L['send_re'])).click()
            page.locator('.status-ring.err').wait_for(timeout=15000)
            STATE['sig_mode'] = 'confirmed'
            snap('send-error')
            page.get_by_role('button', name=L['gohome'], exact=True).click()
            # history
            page.locator('.tab', has_text=L['history']).click()
            page.wait_for_timeout(1500)
            snap('history')
            page.get_by_role('tab', name=L['goals']).click()
            snap('history-goals')
            # settings
            page.get_by_role('button', name=L['settings'], exact=True).click()
            snap('settings')
            page.evaluate("document.querySelector('.scroll').scrollTop = 520")
            snap('settings-mid')
            page.evaluate("document.querySelector('.scroll').scrollTop = 3000")
            snap('settings-bottom')
            page.evaluate("document.querySelector('.scroll').scrollTop = 0")
            page.get_by_role('button', name=re.compile(L['secret'])).click()
            snap('reveal')
            page.fill('#rv-pw', 'Kopilka-2026!')
            page.get_by_role('button', name=L['show'], exact=True).click()
            page.locator('.seed-cover').wait_for(timeout=15000)
            page.locator('.seed-cover').click()
            snap('reveal-shown')
            page.get_by_role('button', name=L['back'], exact=True).click()
            page.get_by_role('button', name=L['changepw'], exact=True).click()
            page.fill('#cp-new', 'abc')
            snap('change-password')
            page.get_by_role('button', name=L['back'], exact=True).click()
            page.get_by_role('button', name=re.compile(L['rpc'])).click()
            snap('rpc')
            page.get_by_role('button', name=L['back'], exact=True).click()
            page.get_by_role('button', name=L['back'], exact=True).click()
            # goal done sheet: finish a small goal
            page.locator('.tab', has_text=L['goals']).click()
            page.locator('.jar-tile.new').first.click()
            page.fill('#g-name', L['flowers'])
            page.fill('#g-target', '5')
            page.locator('.btn-primary.block').last.click()
            page.get_by_role('button', name=L['put'], exact=True).first.click()
            page.locator('.sheet .chip').first.click()
            page.locator('.sheet .btn-coin').click()
            page.locator('.sheet .h1').wait_for(timeout=8000)
            page.wait_for_timeout(1200)
            snap('sheet-goal-done')
            page.locator('.sheet .btn-coin').click()
            page.get_by_role('button', name=L['edit'], exact=True).click()
            page.get_by_role('button', name=L['delete'], exact=True).click()
            page.locator('.sheet .btn-danger').click()
            # lock screen and sheets
            page.get_by_role('button', name=L['lock_app'], exact=True).click()
            page.locator('input[type=password]').wait_for()
            snap('unlock')
            page.locator('input[type=password]').fill('wrong-password')
            page.get_by_role('button', name=L['open'], exact=True).click()
            page.locator('.hint.err').wait_for(timeout=15000)
            snap('unlock-wrong')
            page.get_by_role('button', name=L['forgot'], exact=True).click()
            snap('sheet-forgot')
            page.locator('.sheet .btn-danger').click()
            snap('sheet-reset')
            page.locator('.sheet').get_by_role('button', name=L['close'], exact=True).first.click()
            page.locator('input[type=password]').fill('Kopilka-2026!')
            page.get_by_role('button', name=L['open'], exact=True).click()
            page.locator('.addr-chip').wait_for(timeout=15000)
            # onboarding screens in a tab (no wallet needed to look at them)
            tab = new_page(ctx, base + '?mode=tab', {'width': 1100, 'height': 760})
            tab.locator('.addr-chip').wait_for()
            tab.wait_for_timeout(800)
            snap('tab-home', tab)
            tab.close()
        page.close()
    except Exception:
        fail_shots(ctx, f'shoot-{lang}')
        raise
    finally:
        ctx.close()

def osnap(pg, d, name, lang, theme):
    pg.screenshot(path=str(d / f'{name}.png'))
    for o in pg.evaluate(OVERFLOW_JS):
        REPORT.append({'lang': lang, 'theme': theme, 'screen': name, **o})

def onboarding(p, lang):
    """Welcome and wallet creation screens, on a clean profile."""
    STATE.update(fresh_state())
    ctx, base = launch(p, lang)
    try:
        for theme in THEMES:
            d = OUT / f'{lang}-{theme}'
            d.mkdir(parents=True, exist_ok=True)
            page = new_page(ctx, base)
            page.evaluate("t => chrome.storage.local.set({ settings: { theme: t } })", theme)
            page.reload()
            page.locator('.onb-foot .btn-primary').wait_for()
            page.wait_for_timeout(900)
            osnap(page, d, 'o1-welcome', lang, theme)
            tab = new_page(ctx, base + '?mode=tab&start=create', {'width': 1100, 'height': 760})
            tab.locator('#pw1').wait_for()
            tab.fill('#pw1', 'Kopilka-2026!')
            tab.fill('#pw2', 'Kopilka-2026')
            tab.wait_for_timeout(400)
            osnap(tab, d, 'o2-password', lang, theme)
            tab.fill('#pw2', 'Kopilka-2026!')
            tab.locator('.onb-foot .btn-primary').click()
            tab.locator('.seed-cover').wait_for()
            osnap(tab, d, 'o3-seed-hidden', lang, theme)
            tab.locator('.seed-cover').click()
            tab.wait_for_timeout(400)
            osnap(tab, d, 'o4-seed', lang, theme)
            tab.locator('.onb-foot .btn-primary').click()
            tab.locator('.verify-q').first.wait_for()
            tab.locator('.verify-q').first.locator('.chip').first.click()
            tab.wait_for_timeout(400)
            osnap(tab, d, 'o5-verify', lang, theme)
            tab.close()
            tab = new_page(ctx, base + '?mode=tab&start=import', {'width': 1100, 'height': 760})
            tab.locator('textarea').fill(MNEMONIC)
            tab.locator('.banner.ok').wait_for()
            osnap(tab, d, 'o6-import', lang, theme)
            tab.close()
            page.close()
    finally:
        ctx.close()

with sync_playwright() as p:
    for lang in LANGS:
        onboarding(p, lang)
        run(p, lang)
bad = [e for e in errors if '503' not in e]
print('\n'.join(bad) if bad else 'no page errors')
(OUT / 'overflow.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=1))
spill = [r for r in REPORT if r['kind'] != 'cut']
print(f'overflow: {len(spill)} spilling, {len(REPORT) - len(spill)} cut with an ellipsis (see overflow.json)')
print('SHOTS OK')
