"""Shared pieces of the browser tests: a mocked Solana RPC, launching the built
extension in Chromium, and small page helpers."""
import base64, json, os, re, struct, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright, expect

# Route the background service worker's requests through the mock RPC too.
os.environ.setdefault('PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS', '1')

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = str(ROOT / 'dist')
SHOTS = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'test' / 'shots')
SHOTS.mkdir(parents=True, exist_ok=True)

ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58(b: bytes) -> str:
    n = int.from_bytes(b, 'big'); s = ''
    while n: n, r = divmod(n, 58); s = ALPH[r] + s
    return '1' * (len(b) - len(b.lstrip(b'\0'))) + s
def rnd(n=32): return b58(os.urandom(n))
def node(*args):
    return json.loads(subprocess.check_output(['node', 'test/helpers.mjs', *args], cwd=str(ROOT), stderr=subprocess.DEVNULL))

USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
USDC_DEV = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
STREAMFLOW = 'strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m'
JUP_LOCK = 'LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn'
DISC = {
    'jup-create': bytes([181, 155, 104, 183, 182, 128, 35, 47]),
    'jup-claim': bytes([229, 87, 46, 162, 21, 157, 231, 114]),
    'jup-close': bytes([221, 185, 95, 135, 136, 67, 252, 87]),
}
OTHER = node('keypair')['pubkey']

def fresh_state():
    return {
        'SOL': 1_500_000_000, 'USDC': 250_000_000, 'USDT': 120_500_000,
        'ata': {USDC: rnd(), USDT: rnd()}, 'sent': [], 'owner': None, 'fail_rpc': False,
        'streams': {},  # Streamflow lockId -> base64 account data
        'escrows': {},  # Jupiter escrow -> bytearray account data
        'kinds': [],  # what each sent transaction was
        'methods': [],
        'sig_mode': 'confirmed',  # how getSignatureStatuses answers: confirmed | pending | fail
        'sig_status': {},  # per-signature override of sig_mode
        'send_error': None,  # a JSON-RPC error message for the next sendTransaction (preflight failure)
        'hosts': [],  # RPC host of every call
        'devnet_has_jup': False,  # whether Jupiter Lock is deployed on devnet
        'host': '',
        # Jupiter swap API: ok | busy (429) | noroute | down (500) | evil-setup | evil-out | slippage
        'jup_mode': 'ok',
        'jup_rate': 0.998,  # what a dollar in gets out, before slippage
        'jup_calls': [],  # query parameters of every /build call
        'jup_last': None,  # the last route handed out
        'fee_accounts': None,  # fee wallet token accounts that exist (None: all of them)
        'swaps': {},  # signature -> what the swap moved
        'swap_sent': [],  # raw swap transactions
    }

GENESIS = {'mainnet': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', 'devnet': 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'}
# extra RPC hosts used by the custom-RPC tests: host -> network it pretends to be
CUSTOM_HOSTS = {'good-node.example.com': 'mainnet', 'devnet-node.example.com': 'devnet'}

class RpcErr(Exception):
    def __init__(self, code, message, data=None):
        self.code, self.message, self.data = code, message, data

def tx_signature(raw_b64):
    raw = base64.b64decode(raw_b64)
    return b58(raw[1:65])  # compact-u16 count (< 128) then the first signature
STATE = fresh_state()
SIG_IN = rnd(64); SIG_IN2 = rnd(64); SIG_DUST = rnd(64)

def mint_b64(decimals=6):
    # Mint layout: option u32, authority 32, supply u64, decimals u8, initialized u8, option u32, freeze 32
    data = struct.pack('<I32sQBBI32s', 0, b'\0' * 32, 10**12, decimals, 1, 0, b'\0' * 32)
    return base64.b64encode(data).decode()

def b64_account(data_b64, owner, lamports=2039280):
    return {'data': [data_b64, 'base64'], 'owner': owner, 'lamports': lamports, 'executable': False, 'rentEpoch': 0, 'space': len(base64.b64decode(data_b64))}

FEE_WALLET = 'D52FHmr9jZF7TQT26VpDoZcu77qtSWPmPGcb36c8ThmQ'
SOL_MINT = 'So11111111111111111111111111111111111111112'
JUP6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
SYSTEM = '11111111111111111111111111111111'
COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111'
_swapkeys = {}
def swapkeys():
    owner = STATE['owner']
    if owner not in _swapkeys:
        _swapkeys[owner] = node('swapkeys', owner, FEE_WALLET)
    return _swapkeys[owner]

def b58dec(s):
    n = 0
    for ch in s: n = n * 58 + ALPH.index(ch)
    raw = n.to_bytes((n.bit_length() + 7) // 8, 'big') if n else b''
    return b'\0' * (len(s) - len(s.lstrip('1'))) + raw

def token_account_b64(mint, owner, amount, delegate=None):
    data = b58dec(mint) + b58dec(owner) + struct.pack('<Q', amount)
    data += (struct.pack('<I', 1) + b58dec(delegate)) if delegate else (b'\0' * 36)
    data += bytes([1]) + b'\0' * 12 + struct.pack('<Q', 0) + b'\0' * 36  # state, isNative, delegatedAmount, closeAuthority
    assert len(data) == 165
    return base64.b64encode(data).decode()

def sym_of_mint(mint):
    return {USDC: 'USDC', USDT: 'USDT', SOL_MINT: 'SOL'}.get(mint)

def swap_account(addr, override=None):
    """The owner's wallet and token accounts as the swap code reads them (getMultipleAccounts / simulation)."""
    k = swapkeys()
    bal = override or STATE
    if addr == STATE['owner']:
        return {'data': ['', 'base64'], 'owner': SYSTEM, 'lamports': bal['SOL'], 'executable': False, 'rentEpoch': 0, 'space': 0}
    for sym in ('USDC', 'USDT'):
        if addr == k[sym]:
            if bal[sym] == 0 and sym not in STATE.get('has_ata', {'USDC', 'USDT'}):
                return None
            return b64_account(token_account_b64(USDC if sym == 'USDC' else USDT, STATE['owner'], bal[sym]), TOKEN_PROGRAM)
    for sym in ('USDC', 'USDT'):
        if addr == k['fee' + sym]:
            exists = STATE['fee_accounts'] is None or sym in STATE['fee_accounts']
            return b64_account(token_account_b64(USDC if sym == 'USDC' else USDT, FEE_WALLET, 0), TOKEN_PROGRAM) if exists else None
    return 'unknown'

def jup_ix(program, accounts, data):
    return {'programId': program, 'accounts': [{'pubkey': a[0], 'isWritable': a[1], 'isSigner': a[2]} for a in accounts], 'data': base64.b64encode(bytes(data)).decode()}

def jup_build(q):
    """A /swap/v2/build answer: the same instruction kinds Jupiter sends, a pretend swap instruction."""
    STATE['jup_calls'].append(q)
    me = q['taker']; k = swapkeys()
    inp, outp, amount = q['inputMint'], q['outputMint'], int(q['amount'])
    sin, sout = sym_of_mint(inp), sym_of_mint(outp)
    usd = amount / 1e9 * 172.4 if sin == 'SOL' else amount / 1e6
    usd *= STATE['jup_rate']
    out_raw = int(usd / 172.4 * 1e9) if sout == 'SOL' else int(usd * 1e6)
    setup, cleanup = [], None
    if sout != 'SOL':
        setup.append(jup_ix(ATA_PROGRAM, [(me, True, True), (k[sout], True, False), (me, False, False), (outp, False, False), (SYSTEM, False, False), (TOKEN_PROGRAM, False, False)], [1]))
    if 'SOL' in (sin, sout):
        setup.append(jup_ix(ATA_PROGRAM, [(me, True, True), (k['SOL'], True, False), (me, False, False), (SOL_MINT, False, False), (SYSTEM, False, False), (TOKEN_PROGRAM, False, False)], [1]))
        cleanup = jup_ix(TOKEN_PROGRAM, [(k['SOL'], True, False), (me, True, False), (me, False, True)], [9])
    if sin == 'SOL':
        to = rnd() if STATE['jup_mode'] == 'evil-setup' else k['SOL']
        setup.append(jup_ix(SYSTEM, [(me, True, True), (to, True, False)], struct.pack('<IQ', 2, amount)))
        setup.append(jup_ix(TOKEN_PROGRAM, [(k['SOL'], True, False)], [17]))
    STATE['jup_last'] = {'in': sin, 'out': sout, 'swap': amount, 'out_raw': out_raw}
    return {
        'inputMint': inp, 'outputMint': outp, 'inAmount': str(amount), 'outAmount': str(out_raw),
        'otherAmountThreshold': str(out_raw * 995 // 1000), 'swapMode': 'ExactIn', 'slippageBps': 50, 'priceImpactPct': '0.0003',
        'routePlan': [{'percent': 100, 'bps': 10000, 'swapInfo': {'ammKey': rnd(), 'label': 'Whirlpool', 'inputMint': inp, 'outputMint': outp, 'inAmount': str(amount), 'outAmount': str(out_raw)}}],
        'computeBudgetInstructions': [jup_ix(COMPUTE_BUDGET, [], bytes([3]) + struct.pack('<Q', 120000))],
        'setupInstructions': setup,
        'swapInstruction': jup_ix(JUP6, [(me, False, True), (k['SOL'] if sin == 'SOL' else k[sin], True, False), (k['SOL'] if sout == 'SOL' else k[sout], True, False), (rnd(), True, False)], bytes.fromhex('e517cb977ae3ad2a01')),
        'cleanupInstruction': cleanup, 'otherInstructions': [], 'addressesByLookupTableAddress': {}, 'transactionVersion': 0,
        'blockhashWithMetadata': {'blockhash': list(os.urandom(32)), 'lastValidBlockHeight': 5000},
    }

def fee_in_tx(raw_b64):
    """PiggyBank's fee as written in a swap transaction: the first TransferChecked or SOL transfer."""
    raw = base64.b64decode(raw_b64)
    m = re.search(rb'\x0a\x0c(.{8})\x06', raw, re.S)  # TransferChecked: len 10, tag 12, amount, decimals 6
    if m: return struct.unpack('<Q', m.group(1))[0]
    m = re.search(rb'\x0c\x02\x00\x00\x00(.{8})', raw, re.S)  # system Transfer: len 12, tag 2, lamports
    return struct.unpack('<Q', m.group(1))[0] if m else 0

def swap_after(raw_b64):
    """Balances after the last route runs (for the simulation and the pretend chain)."""
    last = STATE['jup_last']; fee = fee_in_tx(raw_b64)
    after = {'SOL': STATE['SOL'] - 5000 - 60000, 'USDC': STATE['USDC'], 'USDT': STATE['USDT']}
    after[last['in']] -= last['swap'] + fee
    delta_out = last['out_raw'] if STATE['jup_mode'] != 'evil-out' else 0
    after[last['out']] += delta_out
    return after, fee

def rpc_result(method, params):
    STATE['methods'].append(method)
    if method == 'simulateTransaction':
        cfg = params[1] or {}
        if STATE['jup_mode'] == 'slippage':
            return {'context': {'slot': 1}, 'value': {'err': {'InstructionError': [5, {'Custom': 6001}]}, 'logs': ['Program log: Error: SlippageToleranceExceeded'], 'accounts': None, 'unitsConsumed': 80000}}
        after, _ = swap_after(params[0])
        addrs = (cfg.get('accounts') or {}).get('addresses', [])
        accounts = []
        for a in addrs:
            acc = swap_account(a, after)
            accounts.append(None if acc == 'unknown' else acc)
        return {'context': {'slot': 1}, 'value': {'err': None, 'logs': [], 'accounts': accounts, 'unitsConsumed': 185000}}
    if method == 'getBalance':
        return {'context': {'slot': 1}, 'value': STATE['SOL']}
    if method == 'getTokenAccountsByOwner':
        mint = params[1]['mint']; sym = 'USDC' if mint in (USDC, USDC_DEV) else 'USDT'
        raw = STATE[sym]
        if raw == 0: return {'context': {'slot': 1}, 'value': []}
        return {'context': {'slot': 1}, 'value': [{'pubkey': STATE['ata'].setdefault(mint, rnd()), 'account': {'data': {'program': 'spl-token', 'parsed': {'type': 'account', 'info': {'mint': mint, 'owner': params[0], 'tokenAmount': {'amount': str(raw), 'decimals': 6, 'uiAmountString': str(raw / 1e6)}}}}}}]}
    if method == 'getLatestBlockhash':
        return {'context': {'slot': 1}, 'value': {'blockhash': rnd(), 'lastValidBlockHeight': 5000}}
    if method == 'sendTransaction':
        if (params[1] or {}).get('skipPreflight'):
            return tx_signature(params[0])  # a re-broadcast of something already sent
        if STATE['send_error']:
            msg, STATE['send_error'] = STATE['send_error'], None
            raise RpcErr(-32002, msg, {'err': {'InstructionError': [2, {'Custom': 1}]}, 'logs': []})
        STATE['sent'].append(params[0])
        raw = base64.b64decode(params[0])
        kind = next((k for k, d in DISC.items() if d in raw), 'other')
        if b58dec(JUP6) in raw:
            kind = 'swap'
            after, fee = swap_after(params[0])
            last = STATE['jup_last']
            sig = tx_signature(params[0])
            STATE['swaps'][sig] = {**last, 'fee': fee, 'before': {k: STATE[k] for k in ('SOL', 'USDC', 'USDT')}, 'after': after}
            STATE['swap_sent'].append(params[0])
            for k in ('SOL', 'USDC', 'USDT'): STATE[k] = after[k]
        STATE['kinds'].append(kind)
        # play the program's part: a claim empties the escrow, a close deletes it
        for addr, data in list(STATE['escrows'].items()):
            total = struct.unpack_from('<Q', data, 160)[0] + struct.unpack_from('<Q', data, 168)[0] * struct.unpack_from('<Q', data, 176)[0]
            if kind == 'jup-claim':
                struct.pack_into('<Q', data, 184, total)
            elif kind == 'jup-close' and struct.unpack_from('<Q', data, 184)[0] == total:
                del STATE['escrows'][addr]
        return tx_signature(params[0])
    if method == 'getSignatureStatuses':
        mode = STATE['sig_status'].get(params[0][0], STATE['sig_mode'])
        if mode == 'pending':
            return {'context': {'slot': 1}, 'value': [None]}
        if mode == 'fail':
            return {'context': {'slot': 1}, 'value': [{'slot': 1, 'confirmations': None, 'err': {'InstructionError': [2, {'Custom': 1}]}, 'confirmationStatus': 'confirmed'}]}
        return {'context': {'slot': 1}, 'value': [{'slot': 1, 'confirmations': None, 'err': None, 'confirmationStatus': 'confirmed'}]}
    if method == 'getAccountInfo':
        addr = params[0]
        enc = (params[1] or {}).get('encoding', 'base64') if len(params) > 1 else 'base64'
        if addr in (USDC, USDT, USDC_DEV) and enc == 'base64':
            return {'context': {'slot': 1}, 'value': b64_account(mint_b64(), TOKEN_PROGRAM, 1461600)}
        if addr == JUP_LOCK and 'devnet' in STATE['host'] and not STATE['devnet_has_jup']:
            return {'context': {'slot': 1}, 'value': None}
        if addr == JUP_LOCK:
            return {'context': {'slot': 1}, 'value': {'data': ['', 'base64'], 'owner': 'BPFLoaderUpgradeab1e11111111111111111111111', 'lamports': 1141440, 'executable': True, 'rentEpoch': 0, 'space': 36}}
        if addr in STATE['escrows']:
            return {'context': {'slot': 1}, 'value': b64_account(base64.b64encode(bytes(STATE['escrows'][addr])).decode(), JUP_LOCK, 2951040)}
        if addr in STATE['streams']:
            return {'context': {'slot': 1}, 'value': b64_account(STATE['streams'][addr], STREAMFLOW, 8574720)}
        if STATE['owner']:
            acc = swap_account(addr)
            if acc != 'unknown':
                return {'context': {'slot': 1}, 'value': acc}
        return {'context': {'slot': 1}, 'value': None}
    if method == 'getMultipleAccounts':
        token_acc = base64.b64encode(b'\0' * 165).decode()
        out = []
        for a in params[0]:
            acc = swap_account(a) if STATE['owner'] else 'unknown'
            out.append(b64_account(token_acc, TOKEN_PROGRAM) if acc == 'unknown' else acc)
        return {'context': {'slot': 1}, 'value': out}
    if method == 'getMinimumBalanceForRentExemption':
        return (int(params[0]) + 128) * 6960
    if method == 'getBlockHeight':
        return 100
    if method == 'getGenesisHash':
        net = CUSTOM_HOSTS.get(STATE['host'], 'devnet' if 'devnet' in STATE['host'] else 'mainnet')
        return GENESIS[net]
    if method == 'getSignaturesForAddress':
        if params[0] == STATE['owner']:
            swaps = [{'signature': s, 'blockTime': int(time.time()) - 5, 'err': None} for s in STATE['swaps']]
            dust = [{'signature': SIG_DUST, 'blockTime': int(time.time()) - 600, 'err': None}] if STATE.get('dust_from') else []
            return swaps + dust + [{'signature': SIG_IN, 'blockTime': int(time.time()) - 3600, 'err': None}]
        if params[0] == STATE['ata'][USDC]:
            return [{'signature': SIG_IN2, 'blockTime': int(time.time()) - 90000, 'err': None}]
        return []
    if method == 'getTransaction':
        owner = STATE['owner']
        if params[0] in STATE['swaps']:
            sw = STATE['swaps'][params[0]]; b, a = sw['before'], sw['after']
            def tb(state, idx, mint, sym): return {'accountIndex': idx, 'mint': mint, 'owner': owner, 'uiTokenAmount': {'uiAmountString': str(state[sym] / 1e6)}}
            return {'blockTime': int(time.time()) - 5, 'meta': {'fee': 5000, 'preBalances': [b['SOL'], 0, 0], 'postBalances': [a['SOL'], 0, 0],
                    'preTokenBalances': [tb(b, 1, USDC, 'USDC'), tb(b, 2, USDT, 'USDT')], 'postTokenBalances': [tb(a, 1, USDC, 'USDC'), tb(a, 2, USDT, 'USDT')]},
                    'transaction': {'message': {'accountKeys': [{'pubkey': owner}, {'pubkey': swapkeys()['USDC']}, {'pubkey': swapkeys()['USDT']}], 'instructions': []}}}
        if params[0] == SIG_DUST:  # address-poisoning style dust: 0.000001 SOL from a stranger
            src = STATE['dust_from']
            return {'blockTime': int(time.time()) - 600, 'meta': {'fee': 5000, 'preBalances': [1e9, 3e9], 'postBalances': [1e9 - 5000 - 1000, 3e9 + 1000], 'preTokenBalances': [], 'postTokenBalances': []},
                    'transaction': {'message': {'accountKeys': [{'pubkey': src}, {'pubkey': owner}], 'instructions': [{'program': 'system', 'parsed': {'type': 'transfer', 'info': {'source': src, 'destination': owner, 'lamports': 1000}}}]}}}
        if params[0] == SIG_IN:
            return {'blockTime': int(time.time()) - 3600, 'meta': {'fee': 5000, 'preBalances': [3e9, 1e9], 'postBalances': [3e9 - 5000 - 5e8, 1.5e9], 'preTokenBalances': [], 'postTokenBalances': []},
                    'transaction': {'message': {'accountKeys': [{'pubkey': OTHER}, {'pubkey': owner}], 'instructions': [{'program': 'system', 'parsed': {'type': 'transfer', 'info': {'source': OTHER, 'destination': owner, 'lamports': 500000000}}}]}}}
        return {'blockTime': int(time.time()) - 90000, 'meta': {'fee': 5000, 'preBalances': [1e9, 2e6, 2e6], 'postBalances': [1e9 - 5000, 2e6, 2e6],
                'preTokenBalances': [{'accountIndex': 1, 'mint': USDC, 'owner': OTHER, 'uiTokenAmount': {'uiAmountString': '1000'}}, {'accountIndex': 2, 'mint': USDC, 'owner': owner, 'uiTokenAmount': {'uiAmountString': '50'}}],
                'postTokenBalances': [{'accountIndex': 1, 'mint': USDC, 'owner': OTHER, 'uiTokenAmount': {'uiAmountString': '800'}}, {'accountIndex': 2, 'mint': USDC, 'owner': owner, 'uiTokenAmount': {'uiAmountString': '250'}}]},
                'transaction': {'message': {'accountKeys': [{'pubkey': OTHER}, {'pubkey': 'x'}, {'pubkey': STATE['ata'][USDC]}], 'instructions': []}}}
    if method == 'requestAirdrop':
        STATE['SOL'] += 1_000_000_000; return rnd(64)
    return None

RPC_HOSTS = ('mainnet.helius-rpc.com', 'api.mainnet-beta.solana.com', 'solana-rpc.publicnode.com', 'api.mainnet.solana.com', 'public.rpc.solanavibestation.com',
             'solana-mainnet.gateway.tatum.io', 'solana.api.pocket.network', 'api.devnet.solana.com', *CUSTOM_HOSTS)
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS'}

def handle(route):
    url = route.request.url
    if any(h in url for h in RPC_HOSTS):
        if route.request.method == 'OPTIONS':
            return route.fulfill(status=204, headers=CORS)
        if STATE['fail_rpc']:
            return route.fulfill(status=503, body='down', headers=CORS)
        body = json.loads(route.request.post_data or '{}')
        host = url.split('/')[2]
        STATE['host'] = host
        STATE['hosts'].append(host)
        def answer(b):
            try:
                return {'jsonrpc': '2.0', 'id': b.get('id'), 'result': rpc_result(b.get('method'), b.get('params', []))}
            except RpcErr as e:
                return {'jsonrpc': '2.0', 'id': b.get('id'), 'error': {'code': e.code, 'message': e.message, 'data': e.data}}
        res = [answer(b) for b in body] if isinstance(body, list) else answer(body)
        return route.fulfill(status=200, content_type='application/json', headers=CORS, body=json.dumps(res))
    if 'api.jup.ag/swap/v2/build' in url:
        mode = STATE['jup_mode']
        if mode == 'busy':
            return route.fulfill(status=429, body='Too Many Requests', headers=CORS)
        if mode == 'noroute':
            return route.fulfill(status=400, content_type='application/json', headers=CORS, body=json.dumps({'error': 'No routes found'}))
        if mode == 'down':
            return route.fulfill(status=500, body='oops', headers=CORS)
        from urllib.parse import urlparse, parse_qs
        q = {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}
        return route.fulfill(status=200, content_type='application/json', headers=CORS, body=json.dumps(jup_build(q)))
    if 'coingecko' in url:
        return route.fulfill(status=200, content_type='application/json', headers=CORS,
                             body=json.dumps({'solana': {'usd': 172.4, 'usd_24h_change': 2.1}, 'usd-coin': {'usd': 1.0}, 'tether': {'usd': 1.0}}))
    if url.startswith('http'):
        return route.fulfill(status=404, body='')
    return route.continue_()

errors = []
def watch(page):
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: m.type == 'error' and errors.append(f'console: {m.text}'))

def shot(page, name):
    page.wait_for_timeout(450)
    page.screenshot(path=str(SHOTS / f'{name}.png'))

def launch(p, lang):
    ctx = p.chromium.launch_persistent_context(
        '', channel='chromium', headless=True,
        args=[f'--disable-extensions-except={DIST}', f'--load-extension={DIST}', f'--lang={lang}'],
        viewport={'width': 380, 'height': 600}, color_scheme='light', locale=lang,
    )
    ctx.route('**/*', handle)
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker')
    ext_id = sw.url.split('/')[2]
    for _ in range(30):
        tabs = [pg for pg in ctx.pages if 'mode=tab' in pg.url]
        if tabs:
            for pg in tabs: pg.close()
            break
        time.sleep(0.2)
    return ctx, f'chrome-extension://{ext_id}/index.html'

def new_page(ctx, url, size=None):
    pg = ctx.new_page(); watch(pg); pg.bring_to_front()
    if size: pg.set_viewport_size(size)
    pg.goto(url)
    return pg

def storage_get(pg, key):
    return pg.evaluate(f"chrome.storage.local.get('{key}').then(r => r['{key}'])")

def storage_set(pg, key, value):
    pg.evaluate("([k, v]) => chrome.storage.local.set({ [k]: v })", [key, value])

def fail_shots(ctx, prefix):
    for i, pg in enumerate(ctx.pages):
        try: pg.screenshot(path=str(SHOTS / f'FAIL-{prefix}-{i}.png'))
        except Exception: pass


def _load_strings():
    """Every language's interface text, read from the translation files."""
    import subprocess
    root = pathlib.Path(__file__).resolve().parent.parent
    out = subprocess.check_output(['node', '--import', './test/register-jsx.mjs', 'test/strings_dump.mjs'], cwd=root)
    return json.loads(out)

STR = _load_strings()
LANG_CODES = list(STR.keys())
READY_TITLE = {l: STR[l]['ready.title'] for l in LANG_CODES}

# What text spills out of its box or off the popup. Rails that scroll on purpose
# don't count; text cut with an ellipsis is reported separately.
OVERFLOW_JS = r"""() => {
  const out = [];
  const vw = document.documentElement.clientWidth;
  const skip = (el) => el.closest('.jar-rail, .token-rail, .tpl-rail, .chips-rail, [data-rail], .qr-card, svg, .seed-grid .seed-word span, .addr-text');
  for (const el of document.querySelectorAll('body *')) {
    if (skip(el)) continue;
    // inside something that scrolls sideways on purpose (a rail of chips or goals)
    let rail = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && a.scrollWidth > a.clientWidth + 2) { rail = true; break; }
    }
    if (rail) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.display === 'inline' || cs.display === 'contents') continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (el.closest('.sheet-host .leaving, .toast.leaving')) continue;
    const text = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 70);
    const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    if (!scrolls && el.scrollWidth > el.clientWidth + 2) {
      out.push({ kind: cs.textOverflow === 'ellipsis' ? 'cut' : 'spill', text, cls: String(el.className), w: el.clientWidth, sw: el.scrollWidth });
    } else if (r.right > vw + 1 || r.left < -1) {
      out.push({ kind: 'offscreen', text, cls: String(el.className), right: Math.round(r.right) });
    }
  }
  // raw keys showing instead of text ("goals.edit")
  const raw = document.body.innerText.match(/\b(common|home|goals|send|swap|smart|settings|rpc|history|deposit|allocate|guard|release|unit|err)\.[a-zA-Z.]+\b/g);
  const keys = (raw || []).filter((k) => !/\.(com|org|io|net|dev|network|xyz|ai)$/.test(k));
  if (keys.length) out.push({ kind: 'raw-key', text: [...new Set(keys)].join(' ') });
  return out;
}"""

def import_wallet(ctx, base, secret, password='Kopilka-2026!', lang='ru', key=False):
    """Imports a wallet through the onboarding tab and returns its public key."""
    tab = new_page(ctx, base + '?mode=tab&start=import', {'width': 1100, 'height': 760})
    tab.locator('textarea').wait_for()
    if key:
        tab.get_by_role('tab').nth(1).click()
    tab.locator('textarea').fill(secret)
    tab.locator('.banner.ok').wait_for()
    tab.locator('.onb-foot .btn-primary').click()
    tab.locator('#pw1').wait_for(timeout=15000)
    tab.fill('#pw1', password)
    tab.fill('#pw2', password)
    tab.locator('.onb-foot .btn-primary').click()
    tab.get_by_text(READY_TITLE[lang]).wait_for()
    owner = storage_get(tab, 'wallet')['publicKey']
    tab.close()
    STATE['owner'] = owner
    # the wallet's token accounts are its associated ones, like on the real chain
    keys = swapkeys()
    STATE['ata'][USDC] = keys['USDC']
    STATE['ata'][USDT] = keys['USDT']
    return owner

def choose(page, label, option):
    """Picks an option in one of the piggy bank's dropdowns (components/Select.jsx)."""
    page.get_by_role('combobox', name=label, exact=True).click()
    menu = page.get_by_role('listbox', name=label, exact=True)
    menu.get_by_role('option', name=option, exact=True).click()
    menu.wait_for(state='detached')

def make_goals(pg, goals, net='mainnet'):
    """Writes goals straight into storage (for tests that need many of them)."""
    now = int(time.time() * 1000)
    out = []
    for i, g in enumerate(goals):
        out.append({'id': f'g{i}-{now}', 'name': g['name'], 'emoji': g.get('emoji', '🎯'), 'color': g.get('color', 'coin'),
                    'target': g.get('target', 100), 'deadline': g.get('deadline', ''), 'createdAt': now - i,
                    'locked': g.get('locked', False), 'allocations': {net: g.get('alloc', {'USDC': 0, 'USDT': 0, 'SOL': 0})},
                    **({'smart': g['smart']} if g.get('smart') else {})})
    storage_set(pg, 'goals', out)
    return out

def scroll_left(loc):
    return loc.evaluate('e => e.scrollLeft')

def drag(page, loc, dx, steps=12, from_x=None, pause=16):
    box = loc.bounding_box()
    x0 = box['x'] + (from_x if from_x is not None else (box['width'] - 30 if dx < 0 else 30))
    y0 = box['y'] + box['height'] / 2
    page.mouse.move(x0, y0)
    page.mouse.down()
    for i in range(1, steps + 1):
        page.mouse.move(x0 + dx * i / steps, y0)
        page.wait_for_timeout(pause)
    page.mouse.up()
