"""
Wallet safety flows in the built extension: wrong passwords, changing the
password, revealing the secret, auto-lock, two open windows, key imports,
removing the wallet.
"""
import json, re, time
from playwright.sync_api import sync_playwright, expect
from harness import *

MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
PW = 'Kopilka-2026!'
PW2 = 'Новый-пароль-77'

def step(name):
    print('·', name, flush=True)

def unlock_with(page, pw):
    page.locator('input[type=password]').fill(pw)
    page.get_by_role('button', name='Открыть копилку').click()

with sync_playwright() as p:
    ctx, base = launch(p, 'ru')
    sw = ctx.service_workers[0]
    try:
        owner = import_wallet(ctx, base, MNEMONIC, PW)
        assert owner == 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk'
        page = new_page(ctx, base)
        page.locator('.addr-chip').wait_for()

        step('wrong password on the lock screen')
        page.get_by_role('button', name='Запереть копилку').click()
        page.get_by_text('С возвращением').wait_for()
        unlock_with(page, 'not-my-password')
        page.get_by_text('Неверный пароль').wait_for(timeout=15000)
        assert page.locator('.addr-chip').count() == 0
        assert page.evaluate("chrome.storage.session.get('unlocked').then(r => !!r.unlocked)") is False
        unlock_with(page, PW)
        page.locator('.addr-chip').wait_for(timeout=15000)

        step('session survives closing and reopening the popup')
        page.close()
        page = new_page(ctx, base)
        page.locator('.addr-chip').wait_for()

        step('change password')
        page.get_by_role('button', name='Настройки').click()
        page.get_by_role('button', name='Сменить пароль').click()
        page.fill('#cp-old', 'wrong-old-pass')
        page.fill('#cp-new', PW2)
        page.fill('#cp-new2', PW2 + 'x')
        page.get_by_text('Пароли не совпадают').wait_for()
        assert page.locator('.btn-primary', has_text='Сменить пароль').is_disabled()
        page.fill('#cp-new2', PW2)
        page.locator('.btn-primary', has_text='Сменить пароль').click()
        page.get_by_text('Текущий пароль не подходит').wait_for(timeout=15000)
        page.fill('#cp-old', PW)
        page.locator('.btn-primary', has_text='Сменить пароль').click()
        page.get_by_text('Пароль изменён').wait_for(timeout=15000)
        page.get_by_role('button', name='Назад').click()
        page.get_by_role('button', name='Запереть копилку').click()
        unlock_with(page, PW)
        page.get_by_text('Неверный пароль').wait_for(timeout=15000)
        unlock_with(page, PW2)
        page.locator('.addr-chip').wait_for(timeout=15000)

        step('reveal the secret phrase and key')
        page.get_by_role('button', name='Настройки').click()
        page.get_by_role('button', name=re.compile('Секретная фраза')).click()
        page.fill('#rv-pw', 'nope-nope')
        page.get_by_role('button', name='Показать', exact=True).click()
        page.get_by_text('Неверный пароль').wait_for(timeout=15000)
        page.fill('#rv-pw', PW2)
        page.get_by_role('button', name='Показать', exact=True).click()
        page.locator('.seed-grid.blurred').wait_for(timeout=15000)
        page.locator('.seed-cover').click()
        words = [w.inner_text() for w in page.locator('.seed-word span').all()]
        assert ' '.join(words) == MNEMONIC, words
        page.get_by_role('tab', name='Приватный ключ').click()
        page.locator('.seed-cover').click()
        key = page.locator('.field span').first.inner_text().strip()
        assert len(key) in (87, 88), key
        pub = json.loads(subprocess.check_output(['node', '-e', f"""
            const bs58 = require('bs58'); const {{ Keypair }} = require('@solana/web3.js');
            process.stdout.write(JSON.stringify(Keypair.fromSecretKey((bs58.default || bs58).decode('{key}')).publicKey.toBase58()))
        """], cwd=str(ROOT), stderr=subprocess.DEVNULL))
        assert pub == owner, 'revealed key belongs to this wallet'
        shot(page, 'sec-01-reveal')
        page.get_by_role('button', name='Назад').click()
        page.get_by_role('button', name='Назад').click()
        dump = page.evaluate("chrome.storage.local.get(null).then(JSON.stringify)")
        assert key not in dump and MNEMONIC not in dump, 'secret never stored in plain text'

        step('auto-lock after inactivity')
        page.get_by_role('button', name='Настройки').click()
        choose(page, 'Автоблокировка', '5 минут')
        page.get_by_role('button', name='Назад').click()
        page.evaluate("""chrome.storage.session.get('unlocked').then(r =>
            chrome.storage.session.set({ unlocked: { ...r.unlocked, lastActive: Date.now() - 6 * 60_000 } }))""")
        sw.evaluate("chrome.alarms.create('autolock', { when: Date.now() + 300 })")
        page.get_by_text('С возвращением').wait_for(timeout=15000)
        assert page.evaluate("chrome.storage.session.get('unlocked').then(r => !!r.unlocked)") is False
        sw.evaluate("chrome.alarms.create('autolock', { periodInMinutes: 1 })")
        unlock_with(page, PW2)
        page.locator('.addr-chip').wait_for(timeout=15000)

        step('locking in one window locks the other')
        other = new_page(ctx, base)
        other.locator('.addr-chip').wait_for()
        page.bring_to_front()
        page.get_by_role('button', name='Запереть копилку').click()
        other.get_by_text('С возвращением').wait_for(timeout=10000)
        other.close()
        unlock_with(page, PW2)
        page.locator('.addr-chip').wait_for(timeout=15000)

        step('a reopened popup after the timeout asks for the password')
        page.evaluate("""chrome.storage.session.get('unlocked').then(r =>
            chrome.storage.session.set({ unlocked: { ...r.unlocked, lastActive: Date.now() - 6 * 60_000 } }))""")
        page.close()
        page = new_page(ctx, base)
        page.get_by_text('С возвращением').wait_for()

        step('forgot password: remove the wallet from the extension')
        page.get_by_role('button', name='Забыли пароль?').click()
        page.locator('.sheet .btn-danger').click()
        page.locator('#reset-word').wait_for()
        assert page.locator('.sheet .btn-danger').is_disabled()
        page.fill('#reset-word', 'удали')
        assert page.locator('.sheet .btn-danger').is_disabled()
        page.fill('#reset-word', ' Удалить ')
        page.locator('.sheet .btn-danger').click()
        page.get_by_text('Копите на цели в долларах').wait_for()
        left = json.loads(page.evaluate("chrome.storage.local.get(null).then(JSON.stringify)"))
        assert 'vault' not in left and 'wallet' not in left and 'goals' not in left, sorted(left)
        assert page.evaluate("chrome.storage.session.get(null).then(r => Object.keys(r).length)") == 0
        shot(page, 'sec-02-after-reset')
        page.close()

        step('import: what the key field accepts and refuses')
        tab = new_page(ctx, base + '?mode=tab&start=import', {'width': 1100, 'height': 760})
        tab.locator('textarea').wait_for()
        tab.locator('textarea').fill(MNEMONIC.replace('about', 'abandon'))
        tab.get_by_text('Фраза не проходит проверку').wait_for()
        assert tab.locator('.onb-foot .btn-primary').is_disabled()
        tab.locator('textarea').fill('abandon abandon abandon')
        tab.get_by_text('Слов: 3').wait_for()
        tab.get_by_role('tab', name='Приватный ключ').click()
        tab.locator('textarea').fill('abc')
        expect(tab.locator('.hint.err')).to_be_visible()
        tab.locator('textarea').fill(MNEMONIC)
        expect(tab.locator('.hint.err')).to_contain_text('фраз')
        sec = node('secret')
        tab.locator('textarea').fill(sec['json'])
        tab.locator('.banner.ok').wait_for()
        expect(tab.locator('.banner.ok')).to_contain_text(sec['pubkey'][:6])
        tab.locator('textarea').fill(sec['base58'])
        tab.locator('.banner.ok').wait_for()
        tab.locator('.onb-foot .btn-primary').click()
        tab.fill('#pw1', 'short')
        tab.get_by_text('Нужно хотя бы 8 символов').wait_for()
        tab.fill('#pw1', PW)
        tab.fill('#pw2', PW)
        tab.locator('.onb-foot .btn-primary').click()
        tab.get_by_text('Копилка готова').wait_for()
        wallet = storage_get(tab, 'wallet')
        assert wallet['publicKey'] == sec['pubkey'] and wallet['type'] == 'privateKey'
        STATE['owner'] = wallet['publicKey']
        tab.close()
        page = new_page(ctx, base)
        page.locator('.addr-chip').wait_for()
        expect(page.locator('.addr-chip')).to_contain_text(sec['pubkey'][:4])
        page.get_by_role('button', name='Настройки').click()
        expect(page.locator('.set-row', has_text='Приватный ключ').first).to_be_visible()
        expect(page.get_by_text('Импортирован по приватному ключу')).to_be_visible()
    except Exception:
        fail_shots(ctx, 'sec')
        raise
    finally:
        ctx.close()

bad = [e for e in errors if '503' not in e]
print('\n'.join(bad) if bad else 'no page errors')
assert not bad, 'console errors'
print('SECURITY OK')
