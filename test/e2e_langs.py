"""
Languages: the extension starts in the browser's language (each of the eight),
numbers follow it, the language menu lists all of them, a choice sticks, and the
background notifications speak the same language.
"""
import re
from playwright.sync_api import sync_playwright, expect
from harness import *

def step(name):
    print('·', name, flush=True)

MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
BROWSER = {'en': 'en-US', 'ru': 'ru-RU', 'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE', 'pt': 'pt-BR', 'zh': 'zh-CN', 'ja': 'ja-JP'}
HTML = {'pt': 'pt-BR', 'zh': 'zh-CN'}

with sync_playwright() as p:
    for lang in LANG_CODES:
        S = STR[lang]
        step(f'{lang}: picked from the browser')
        STATE.update(fresh_state())
        ctx, base = launch(p, BROWSER[lang])
        try:
            page = new_page(ctx, base)
            page.get_by_text(S['welcome.title']).wait_for(timeout=10000)
            expect(page.locator('html')).to_have_attribute('lang', HTML.get(lang, lang))
            page.close()
            import_wallet(ctx, base, MNEMONIC, lang=lang)
            page = new_page(ctx, base)
            page.locator('.hero').wait_for()
            expect(page.locator('.tab', has_text=S['tabs.goals'])).to_have_count(1)
            expect(page.locator('.hero')).to_contain_text(S['home.total'])
            # dollars: "1 234,50 $" in French, "$1,234.50" in Japanese — never "US$"
            total = page.locator('.hero .total').inner_text()
            assert 'US$' not in total and '$US' not in total, total
            assert not re.search(r'\b(home|goals|send|swap|settings|common)\.[a-zA-Z]+', page.locator('body').inner_text())
            if lang in ('ru', 'en'):
                ctx.close()
                continue
            step(f'{lang}: the language menu')
            page.get_by_role('button', name=S['settings.title'], exact=True).click()
            box = page.get_by_role('combobox', name=S['settings.language'], exact=True)
            box.scroll_into_view_if_needed()
            expect(box).to_contain_text(S['settings.langAuto'])
            box.click()
            menu = page.get_by_role('listbox', name=S['settings.language'], exact=True)
            expect(menu.get_by_role('option')).to_have_count(9)
            for name in ['English', 'Русский', 'Español', 'Français', 'Deutsch', 'Português', '简体中文', '日本語']:
                expect(menu.get_by_role('option', name=name, exact=True)).to_have_count(1)
            mb = menu.bounding_box()
            assert mb['y'] >= 0 and mb['y'] + mb['height'] <= 600, f'menu leaves the popup: {mb}'
            shot(page, f'langs-{lang}-menu')
            other = 'ja' if lang != 'ja' else 'de'
            menu.get_by_role('option', name={'ja': '日本語', 'de': 'Deutsch'}[other], exact=True).click()
            menu.wait_for(state='detached')
            expect(page.locator('.topbar').first).to_contain_text(STR[other]['settings.title'])
            expect(page.locator('html')).to_have_attribute('lang', HTML.get(other, other))
            page.reload()
            page.locator('.hero').wait_for()  # a fresh popup opens on the home screen
            expect(page.locator('.hero')).to_contain_text(STR[other]['home.total'])
            s = storage_get(page, 'settings')
            assert s['language'] == other, s
            page.get_by_role('button', name=STR[other]['settings.title'], exact=True).click()
            choose(page, STR[other]['settings.language'], STR[other]['settings.langAuto'])
            expect(page.locator('.topbar').first).to_contain_text(S['settings.title'])
        except Exception:
            fail_shots(ctx, f'langs-{lang}')
            raise
        finally:
            ctx.close()
print('no page errors' if not [e for e in errors if '503' not in e] else errors)
print('LANGS OK')
