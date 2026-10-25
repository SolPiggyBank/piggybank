# PiggyBank

**A piggy bank wallet for Solana, as a Chrome extension.** Give every goal its own jar, put money aside toward it, and lock it until you get there. Holds SOL, USDC and USDT. Your keys never leave your browser.

[Chrome Web Store](https://chromewebstore.google.com/detail/piggybank/keijhgciggnmkpocaadohnknkeacgonp) · [Website](https://solpiggybank.com) · [X](https://x.com/PiggyBankWallet)

## Features

- **Wallet.** Create a new wallet with a standard 12-word recovery phrase (it also opens in Phantom and Solflare), or import one with a recovery phrase or a private key. The secret is encrypted with your password (PBKDF2-SHA256, 600,000 iterations, then AES-256-GCM) and stays in the browser.
- **Balance** of SOL, USDC and USDT in dollars, split into what is set aside in goals, what is free, and what is locked in a smart contract.
- **Goals** with a target, a date and progress in percent. PiggyBank tells you how much to put aside each week, or each day when a month or less is left. A small celebration at 25, 50 and 75%, confetti at 100%.
- **Two levels of protection for a goal:**
  - **Lock until reached.** Until the goal is reached, its money can't be taken out in PiggyBank, the goal can't be deleted or unlocked, and its target can't be lowered. The lock comes off by itself once the amount is reached. This is a promise to yourself: the money stays in your own wallet, and your recovery phrase opens it in any Solana wallet.
  - **Smart-contract lock.** The money goes into a smart contract until the date you choose, and nobody can take it out early: not you, not PiggyBank, not Jupiter, not another wallet.
- **Top-ups** by address or QR code, with notifications when money arrives and optional saving reminders. Transfers under 1 USDC, 1 USDT or 0.01 SOL arrive silently: such dust is almost always address-poisoning spam.
- **Look-alike address guard.** If a recipient only resembles an address you've used before, PiggyBank shows the difference and asks you to confirm. Senders that only ever send dust are flagged.
- **Withdrawals** to any Solana address, with address and token-account checks and the network fee shown upfront. "Paste" understands both plain addresses and Solana Pay links (address, amount and token fill in by themselves). The clipboard is read only when you press the button.
- **Swaps** between SOL, USDC and USDT at the best rate Jupiter finds (mainnet only). PiggyBank's fee is 0.7% of the amount, shown before you confirm.
- **History** of transfers, swaps, locks and goal top-ups, with links to Solscan.
- **8 languages:** English, Russian, Spanish, French, German, Portuguese (Brazil), Chinese (Simplified) and Japanese. The language follows the browser and can be changed in Settings. Numbers, amounts and dates follow the browser's regional format.
- **Light and dark themes**, or automatic.

## How the smart-contract lock works

The lock is held by [Jupiter Lock](https://lock.jup.ag), Jupiter's open-source token-lock program on Solana (program `LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn`, audited by OtterSec and Sec3). PiggyBank creates an escrow where the sender and the recipient are your own wallet and the whole amount unlocks on the chosen date. Cancelling and changing the recipient are disabled for good, so until the date nobody can take the money out.

- USDC and USDT can be locked. Each lock creates its own escrow with the goal's date.
- **No protocol fee.** The Solana network holds a storage deposit of about 0.005 SOL (about 0.003 SOL for the escrow and 0.002 SOL for its token account) plus the usual network fee of about 0.00002 SOL. The deposit comes back: after you withdraw, PiggyBank closes the empty escrow and the SOL returns to your wallet. The exact figures are read from the network and shown before you confirm.
- After the unlock date you get a notification, and the goal shows a "Take out" button. The money returns to your wallet and stays set aside in that goal.
- Every escrow can be opened in Solscan right from the goal.
- Locks created through Streamflow by earlier development builds keep working: they show up in their goal and can be taken out after their date the same way.

To try it without real money, switch to the test network: **Settings → Network → Devnet (test)**, then "Top up" → "Get 1 SOL", and test USDC from [faucet.circle.com](https://faucet.circle.com). If the Jupiter Lock program is not available on Devnet, PiggyBank says so, and regular goals work as usual.

## Swaps and the PiggyBank fee

"Swap" on the home screen exchanges SOL, USDC and USDT at the best rate from [Jupiter](https://jup.ag) (`GET https://api.jup.ag/swap/v2/build`). Swaps work on mainnet only and only with free money: what is set aside in goals is never touched.

- **A 0.7% fee** is taken from the amount you pay and sent, as a separate instruction in the same transaction, to the fee wallet `D52FHmr9jZF7TQT26VpDoZcu77qtSWPmPGcb36c8ThmQ`: SOL as a plain transfer, USDC and USDT to that wallet's token account. The remaining 99.3% is swapped. Jupiter takes no fee on this route. The fee, the minimum you'll receive (0.5% slippage) and the network fee are shown before you confirm.
- **Checked before signing.** The extension builds the transaction itself, not the API. Only these Jupiter setup instructions are allowed: opening your own token accounts, wrapping SOL into your own wSOL account, and unwrapping it. The transaction is then simulated, and it is signed only if:
  - the token you pay decreased by exactly the swap amount;
  - you receive at least the minimum;
  - no other account changed;
  - no account got a delegate, a close authority or a new owner.

  A rate more than 5% away from the market is rejected.
- **Settings** live in `src/lib/config.js`, in the `SWAP` object: the fee wallet, the fee (`feeBps: 70` = 0.7%), slippage and minimum amounts. Without an API key Jupiter allows 30 quote requests a minute per user. If you need more, get a key at [developers.jup.ag](https://developers.jup.ag/portal) and put it in `apiKey`, but keep in mind that it will be visible in the build.
- **If you run your own build**, set your own fee wallet and fund it once: a little SOL (0.001 or more) and 0.01 USDC and USDT, so that it has token accounts.
  - While the wallet holds less than 0.00089 SOL (the minimum for any Solana account), small swaps from SOL are rejected upfront with a clear message: the network would not accept a tiny fee transfer to an empty wallet.
  - Without a token account, the first person who pays the fee in that token pays for opening it (about 0.002 SOL). PiggyBank shows this as a separate line.

## RPC

PiggyBank talks to Solana through free public nodes, with no keys in the build:

| Node | Address |
|---|---|
| PublicNode | `solana-rpc.publicnode.com` |
| Solana Vibe Station | `public.rpc.solanavibestation.com` |
| Solana Foundation | `api.mainnet-beta.solana.com` |
| Solana Labs | `api.mainnet.solana.com` |
| Tatum | `solana-mainnet.gateway.tatum.io` |
| Pocket Network | `solana.api.pocket.network` |

- **Choosing a node.** When PiggyBank opens (at most once every 20 minutes), all nodes are pinged; requests go to the fastest one that answered, and the ones that didn't move to the end of the queue. If a node fails or asks to slow down (HTTP 429), the request goes to the next one; if all are busy, there is a short pause and another try.
- **Rate limits** are counted per IP address, that is, separately for each person.
- **The Solana Foundation and Solana Labs nodes** reject browser requests by their `Origin` header, so the extension removes that header for them only (`public/rpc_rules.json`, a declarativeNetRequest rule scoped to these hosts). Node addresses are listed in `host_permissions`, so CORS does not get in the way.
- **Settings → RPC address** lists every node with its response time and marks the one in use. You can also add your own node there (Helius, QuickNode and Alchemy offer free keys): it is checked (https, the right network, a valid answer) and goes first, with the public nodes kept as fallbacks.

## Security model

- **Non-custodial.** There are no PiggyBank servers. Keys, password and money never leave your device, and nobody but you can move them.
- **Encryption.** The secret is encrypted with a key derived from your password (PBKDF2-SHA256, 600,000 iterations, AES-256-GCM). While unlocked, the decrypted key lives only in memory and in `chrome.storage.session`.
- **Auto-lock** after 5 or 15 minutes, 1 or 4 hours of inactivity, your choice (it can also be turned off).
- **Network access** is limited to Solana RPC nodes, SOL price APIs (CoinGecko, with Coinbase and Jupiter as fallbacks) and, for swaps, Jupiter. The content security policy allows no remote code: everything the extension runs ships inside it.
- **Every transfer** checks the address and the recipient's token account and shows the network fee before you sign.

Found a vulnerability? See [SECURITY.md](SECURITY.md).

## Build and test

```bash
npm install
npm run build   # output in dist/
npm run pack    # build and piggybank-extension.zip for the Chrome Web Store
                # (without the _metadata folder Chrome creates when it loads dist/)
npm test        # keys, encryption, amounts and formats in every language, translation completeness,
                # Jupiter Lock and Streamflow instructions, swaps, RPC node selection
npm run e2e     # the extension in Chromium against a mocked Solana network: the main flow, checks of the
                # signed transactions, drag scrolling, security (passwords, auto-lock, import, removal),
                # money and failures (network and transaction errors, SOL reserve, devnet, custom RPC,
                # notifications), swaps (quote, 0.7% fee, rejection of unsafe answers, checks of signed swaps)
                # and languages (browser detection, the language menu, remembering the choice)
python3 test/shoot_all.py out/ de,ja light   # screenshots of every screen in the given languages and themes;
                                             # out/overflow.json lists text that doesn't fit its box
```

The end-to-end tests need Python 3 with [Playwright](https://playwright.dev/python/) and Chromium.

To load a local build: open `chrome://extensions`, turn on "Developer mode", click "Load unpacked" and choose the `dist/` folder.

## Translations

Russian and English live in `src/locales/strings.jsx`, the other languages in `src/locales/<code>.jsx` with the same keys. `npm test` checks that every language has every key, the same `{placeholders}` and plural forms for numbers (`unit.days`: `['{n} día', '{n} días']`). A string missing from a language falls back to English.

The extension's name and description shown in `chrome://extensions` and in the Chrome Web Store are in `public/_locales/<code>/messages.json` (`appDesc`, up to 132 characters). Chrome shows them in the browser's language and falls back to English (`default_locale: en`). Besides the eight interface languages, `pt_PT` and `zh_TW` are included there too.

## Project structure

```
public/            manifest, icons, store name and description in each language, RPC header rule
src/
  main.jsx         popup entry point
  App.jsx          screens and navigation
  background.js    service worker: deposits, reminders, unlock notifications, auto-lock
  actions.js       wallet actions: create, unlock, send, swap, lock
  screens/         the popup's screens
  components/      the pig, jars, sheets and other UI pieces
  lib/             keys, vault encryption, Solana, RPC, Jupiter swap and lock, formatting
  locales/         interface translations
test/              unit tests (Node) and end-to-end tests (Playwright, against a mocked Solana RPC)
scripts/           translation check and icon generation
```

## License

PiggyBank's code is released under the [MIT license](LICENSE).

Third-party parts keep their own licenses: the Onest and Unbounded fonts in `src/fonts/` are under the SIL Open Font License 1.1 (see `src/fonts/OFL-*.txt`), and npm dependencies are under the licenses listed in their packages.
