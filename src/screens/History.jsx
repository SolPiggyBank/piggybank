import { useEffect, useState } from 'preact/hooks';
import { TabBar, Empty } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { MainHeader } from './Home.jsx';
import { Pig } from '../components/Pig.jsx';
import { useAppState, navigate } from '../store.js';
import { loadHistory } from '../actions.js';
import { explorerTx } from '../lib/config.js';
import { worthAnnouncing } from '../lib/deposits.js';
import { fmtToken, shortAddr, dayLabel, fmtTime } from '../lib/format.js';
import { t } from '../i18n.js';
import { useGlider } from '../components/useGlider.js';
import { useFlip, useSpin } from '../components/motion.js';

export function History() {
  const s = useAppState();
  const net = s.settings.network;
  const [filter, setFilter] = useState('all');
  const filterSeg = useGlider();
  const listRef = useFlip();
  const hide = s.settings.hideBalances;
  const busy = s.historyStatus === 'loading';
  const spinRef = useSpin(busy);

  useEffect(() => {
    if (!s.history || s.history.network !== net || s.history.stale) loadHistory();
  }, [net]);

  const chain = s.history?.network === net ? s.history.entries : [];
  const chainSigs = new Set(chain.map((e) => e.signature));
  // Transactions the piggy bank made itself get friendlier names.
  const ownTx = new Map();
  for (const a of s.activity) {
    if (a.signature && a.network === net) ownTx.set(a.signature, a);
  }
  const items = [];

  for (const p of s.pendingTxs.filter((x) => x.network === net)) {
    items.push({ kind: 'pending', ts: p.ts, key: 'p' + p.signature, data: p });
  }
  if (filter !== 'goals') {
    for (const e of chain) items.push({ kind: 'chain', ts: e.ts, key: e.signature, data: e, own: ownTx.get(e.signature) });
    for (const a of s.activity) {
      if (a.type === 'send' && a.network === net && !chainSigs.has(a.signature)) {
        items.push({ kind: 'local-send', ts: a.ts, key: a.id, data: a });
      }
      if (a.type === 'swap' && a.network === net && !chainSigs.has(a.signature)) {
        items.push({ kind: 'local-swap', ts: a.ts, key: a.id, data: a });
      }
    }
  }
  if (filter !== 'transfers') {
    for (const a of s.activity) {
      if (a.network && a.network !== net && a.type !== 'goal-created') continue;
      if (a.type === 'send' || a.type === 'deposit-back' || a.type === 'swap') continue;
      // Lock/unlock already appear as a transfer when the chain list is shown.
      if ((a.type === 'lock' || a.type === 'unlock') && filter === 'all' && chainSigs.has(a.signature)) continue;
      items.push({ kind: 'goal', ts: a.ts, key: a.id, data: a });
    }
  }
  items.sort((a, b) => b.ts - a.ts);

  const groups = [];
  for (const it of items) {
    const label = dayLabel(it.ts);
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(it);
  }

  // the very first load (nothing cached yet): placeholders only, so rows don't reshuffle when it lands
  const loading = filter !== 'goals' && s.history?.network !== net && s.historyStatus !== 'error';

  return (
    <div class="screen">
      <MainHeader />
      <div class="scroll">
        <div class="pad" style={{ paddingBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div class="seg" ref={filterSeg} style={{ flex: 1 }} role="tablist">
              {[
                ['all', t('common.all')],
                ['transfers', t('history.transfers')],
                ['goals', t('tabs.goals')],
              ].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={filter === id} class={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <button class={`icon-btn refresh-btn${busy ? ' busy' : ''}`} onClick={loadHistory} disabled={busy} aria-label={t('history.refresh')}>
              <span class="refresh-ico" ref={spinRef}>
                <Icon name="refresh" />
              </span>
            </button>
          </div>

          {s.historyStatus === 'error' && filter !== 'goals' && (
            <div class="banner danger pop-in" style={{ marginTop: 12 }}>
              <Icon name="globe" />
              <div>{t('history.error')}</div>
            </div>
          )}

          {loading && (
            <div class="list history-skeleton" style={{ marginTop: 14 }} aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div class="list-row" key={i} style={{ '--i': i }}>
                  <span class="glyph skeleton" />
                  <div class="grow">
                    <div class="t skeleton" style={{ width: '60%' }}>
                      .
                    </div>
                    <div class="s skeleton" style={{ width: '35%', marginTop: 4 }}>
                      .
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && items.length === 0 && (
            <Empty
              art={
                <div style={{ width: 110, margin: '0 auto' }}>
                  <Pig level={0} mood="sleeping" />
                </div>
              }
              title={t('history.emptyTitle')}
              text={filter === 'goals' ? t('history.emptyGoals') : t('history.emptyTransfers')}
              action={
                filter !== 'goals' && (
                  <button class="btn btn-primary" onClick={() => navigate('deposit')}>
                    <Icon name="down" />
                    {t('home.deposit')}
                  </button>
                )
              }
            />
          )}

          <div ref={listRef}>
            {!loading &&
              groups.map((g, gi) => (
                <div key={g.label}>
                  <div class="list-group-title" data-flip={`t:${g.label}`}>
                    {g.label}
                  </div>
                  <div class="list" data-flip={`l:${g.label}`}>
                    {g.items.map((it, i) => (
                      <Row key={it.key} item={it} net={net} hide={hide} order={Math.min(12, gi * 3 + i)} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
      <TabBar active="history" />
    </div>
  );
}

function Row({ item, net, hide, order = 0 }) {
  const { kind, data, own } = item;
  const rise = { '--i': order }; // rows slide in one after another
  const amt = (v, sym) => (hide ? '••••' : `${fmtToken(Math.abs(v), sym)} ${sym}`);

  if (kind === 'pending' && data.kind === 'swap') {
    return (
      <a class="list-row rise" data-flip={item.key} href={explorerTx(data.signature, net)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', ...rise }}>
        <span class="glyph">
          <div class="spinner" style={{ width: 18, height: 18, borderWidth: 2.5 }} />
        </span>
        <div class="grow">
          <div class="t">{t('history.swapPending')}</div>
          <div class="s">{t('history.swapSub', { from: data.from, to: data.toToken })}</div>
        </div>
        <div class="val num">−{amt(data.amount, data.from)}</div>
      </a>
    );
  }

  if (kind === 'local-swap' || (kind === 'chain' && own?.type === 'swap')) {
    const sw = kind === 'chain' ? own : data;
    const got = kind === 'chain' ? data.changes.find((c) => c.token === sw.to && c.delta > 0)?.delta ?? sw.outAmount : sw.outAmount;
    const failed = kind === 'chain' && data.err;
    return (
      <a
        class="list-row rise" data-flip={item.key}
        href={explorerTx(sw.signature, net)}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: 'none', ...rise }}
        title={t('history.openSolscan')}
      >
        <span class="glyph swap-glyph">
          <Icon name="swap" />
        </span>
        <div class="grow">
          <div class="t">{failed ? t('history.swapFailed') : t('history.swap')}</div>
          <div class="s">
            {fmtTime(item.ts)}, {t('history.swapSub', { from: sw.from, to: sw.to })}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {!failed && <div class="val num in">+{amt(got, sw.to)}</div>}
          <div class={failed ? 'val num' : 's num'}>−{amt(sw.amount, sw.from)}</div>
        </div>
      </a>
    );
  }

  if (kind === 'pending') {
    return (
      <a class="list-row rise" data-flip={item.key} href={explorerTx(data.signature, net)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', ...rise }}>
        <span class="glyph">
          <div class="spinner" style={{ width: 18, height: 18, borderWidth: 2.5 }} />
        </span>
        <div class="grow">
          <div class="t">{t('history.pending')}</div>
          <div class="s">{t('history.to', { who: shortAddr(data.to) })}</div>
        </div>
        <div class="val num">−{amt(data.amount, data.token)}</div>
      </a>
    );
  }

  if (kind === 'chain' || kind === 'local-send') {
    const change = kind === 'chain' ? data.changes[0] : { token: data.token, delta: -Number(data.amount) };
    const incoming = change.delta > 0;
    const who = kind === 'chain' ? data.counterparty : data.to;
    const extra = kind === 'chain' && data.changes.length > 1 ? data.changes.slice(1) : [];
    let title = data.err ? t('history.failed') : incoming ? t('history.in') : t('history.out');
    let sub = who ? (incoming ? t('history.from', { who: shortAddr(who) }) : t('history.to', { who: shortAddr(who) })) : '';
    let glyph = incoming ? 'arrowIn' : 'arrowOut';
    // tiny amounts from strangers are usually address-poisoning spam: say so, and don't celebrate them
    const spam =
      kind === 'chain' && incoming && !own && !data.err && data.changes.every((c) => c.delta > 0 && !worthAnnouncing(c.token, c.delta));
    if (own?.type === 'lock') {
      title = t('history.locked');
      sub = t('q', { x: own.goalName });
      glyph = 'lock';
    } else if (own?.type === 'unlock') {
      title = t('history.unlocked');
      sub = t('q', { x: own.goalName });
      glyph = 'unlock';
    } else if (own?.type === 'deposit-back') {
      title = t('history.depositBack');
      sub = t('q', { x: own.goalName });
      glyph = 'arrowIn';
    }
    return (
      <a
        class="list-row rise" data-flip={item.key}
        href={explorerTx(data.signature, net)}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: 'none', ...rise }}
        title={spam ? t('history.spamHint') : t('history.openSolscan')}
        data-spam={spam ? '' : undefined}
      >
        <span class={`glyph${incoming && !spam ? ' in' : ''}`}>
          <Icon name={glyph} />
        </span>
        <div class="grow">
          <div class="t">
            {title}
            {spam && <span class="spam-tag">{t('history.spam')}</span>}
          </div>
          <div class="s">
            {fmtTime(item.ts)}
            {sub ? `, ${sub}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div class={`val num${incoming && !spam ? ' in' : ''}`}>
            {incoming ? '+' : '−'}
            {amt(change.delta, change.token)}
          </div>
          {extra.map((c) => (
            <div class="s num" key={c.token}>
              {c.delta > 0 ? '+' : '−'}
              {amt(c.delta, c.token)}
            </div>
          ))}
        </div>
      </a>
    );
  }

  // local goal activity
  const titles = {
    allocate: t('history.allocate', { goal: data.goalName }),
    release: t('history.release', { goal: data.goalName }),
    'goal-created': t('history.goalCreated', { goal: data.goalName }),
    'goal-completed': t('history.goalCompleted', { goal: data.goalName }),
    lock: t('history.lockGoal', { goal: data.goalName }),
    unlock: t('history.unlockGoal', { goal: data.goalName }),
  };
  const go = () => data.goalId && navigate('goal', { id: data.goalId });
  // unlocking brings money back to the wallet but it stays in the goal: no sign
  const signed = { allocate: '+', lock: '+', release: '−', unlock: '' }[data.type];
  return (
    <button class="list-row rise" data-flip={item.key} style={rise} onClick={go}>
      <span class="glyph" aria-hidden="true">
        {data.type === 'goal-completed' ? '🎉' : data.type === 'lock' ? '🔒' : data.type === 'unlock' ? '🔓' : data.emoji || '🎯'}
      </span>
      <div class="grow">
        <div class="t two-lines">{titles[data.type] || data.type}</div>
        <div class="s">{fmtTime(item.ts)}</div>
      </div>
      {signed != null && data.amount != null && (
        <div class="val num">
          {signed}
          {amt(data.amount, data.token)}
        </div>
      )}
    </button>
  );
}
