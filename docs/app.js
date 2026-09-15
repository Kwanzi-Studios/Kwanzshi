/* Kwanzshi dashboard. Reads data.json, renders whatever page it is on. */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const kw = n => '₭₪' + Math.round(n).toLocaleString();
  const px = n => (Math.round(n * 10) / 10).toString();
  const when = t => { const d = new Date(t * 1000); return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const clock = t => new Date(t * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const ago = s => { if (s == null) return 'open'; if (s <= 0) return 'settling'; if (s < 90) return Math.floor(s) + 's'; const m = Math.floor(s / 60); if (m < 120) return m + ' min'; if (s < 172800) return Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; if (s < 1209600) return (s / 86400).toFixed(1) + ' days'; return (s / 604800).toFixed(1) + ' wk'; };
  const mk = id => 'market' + id;
  const page = document.body.dataset.page;
  const params = new URLSearchParams(location.search);

  fetch('data.json?_=' + Date.now()).then(r => r.json()).then(render).catch(() => {
    const m = $('#main'); if (m) m.innerHTML = '<p class="empty">exchange is offline. kwonks are still worth whatever you believe they are, which is the whole idea.</p>';
  });

  function header(d) {
    const el = $('#kwk'); if (!el) return;
    const h = d.kwk_history || [];
    const ref = h.length > 20 ? h[h.length - 21][1] : (h[0] ? h[0][1] : d.rate);
    el.className = 'kwk ' + (d.rate > ref + 1e-9 ? 'up' : d.rate < ref - 1e-9 ? 'down' : '');
    el.innerHTML = '<small>KWK</small>' + d.rate.toFixed(3) + (d.rate > ref + 1e-9 ? ' ▲' : d.rate < ref - 1e-9 ? ' ▼' : '');
    const st = $('#stamp'); if (st) st.textContent = 'last update ' + when(d.generated) + (d.live ? ' · exchange is live' : ' · exchange is offline (not streaming, or i forgot to start it)');
  }

  function lineChart(canvas, series, opts) {
    // series: [[t, v]], opts: {color, fmt, band}
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d'); c.scale(dpr, dpr);
    c.clearRect(0, 0, w, h);
    if (!series || series.length < 2) { c.fillStyle = '#7d8895'; c.font = '13px Consolas'; c.fillText('not enough history yet', 14, 24); return; }
    const pad = { l: 46, r: 12, t: 12, b: 24 };
    const xs = series.map(p => p[0]), ys = series.map(p => p[1]);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (opts.band) { lo = Math.min(lo, opts.band[0]); hi = Math.max(hi, opts.band[1]); }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const padY = (hi - lo) * 0.08; lo -= padY; hi += padY;
    const x0 = xs[0], x1 = xs[xs.length - 1];
    const X = t => pad.l + (t - x0) / (x1 - x0 || 1) * (w - pad.l - pad.r);
    const Y = v => pad.t + (hi - v) / (hi - lo) * (h - pad.t - pad.b);
    c.strokeStyle = '#1f2a36'; c.lineWidth = 1; c.fillStyle = '#7d8895'; c.font = '11px Consolas';
    for (let i = 0; i <= 4; i++) {
      const v = lo + (hi - lo) * i / 4, y = Y(v);
      c.beginPath(); c.moveTo(pad.l, y); c.lineTo(w - pad.r, y); c.stroke();
      c.fillText(opts.fmt(v), 6, y + 4);
    }
    for (let i = 0; i <= 3; i++) {
      const t = x0 + (x1 - x0) * i / 3;
      c.fillText(clock(t), X(t) - 18, h - 8);
    }
    if (opts.strike != null) {
      const y = Y(opts.strike); c.strokeStyle = '#f0b64f'; c.setLineDash([4, 4]);
      c.beginPath(); c.moveTo(pad.l, y); c.lineTo(w - pad.r, y); c.stroke(); c.setLineDash([]);
    }
    c.strokeStyle = opts.color; c.lineWidth = 2; c.beginPath();
    series.forEach((p, i) => { const x = X(p[0]), y = Y(p[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke();
    const lastP = series[series.length - 1];
    c.fillStyle = opts.color; c.beginPath(); c.arc(X(lastP[0]), Y(lastP[1]), 3.5, 0, Math.PI * 2); c.fill();
  }

  function statusTag(m) {
    if (m.status === 'resolved') return `<span class="tag ${m.outcome}">${m.outcome}</span>`;
    if (m.status === 'void') return '<span class="tag void">void</span>';
    if (m.status === 'closing') return '<span class="tag closing">closing</span>';
    return '<span class="tag open">open</span>';
  }

  function marketRows(ms, showStatus) {
    if (!ms.length) return '<p class="empty">nothing open. i\'m probably about to open one. probably. i forgot what i was doing.</p>';
    return `<div class="tw"><table><thead><tr><th>Market</th><th></th><th class="num">Yes</th><th class="num">No</th><th class="num">${showStatus ? 'Settled' : 'Settles'}</th></tr></thead><tbody>` +
      ms.map(m => `<tr><td class="mono muted"><a href="market.html?id=${m.id}">${mk(m.id)}</a></td><td><a href="market.html?id=${m.id}">${esc(m.title)}</a>${m.kind === 'kalshi' ? '<span class="tag">kalshi</span>' : ''}${showStatus ? statusTag(m) : ''}</td>` +
        `<td class="num yes">${m.status === 'resolved' ? (m.outcome === 'yes' ? 100 : 0) : (m.bid === 1 && m.ask === 99 ? '—' : m.yes)}</td><td class="num no">${m.status === 'resolved' ? (m.outcome === 'no' ? 100 : 0) : (m.bid === 1 && m.ask === 99 ? '—' : m.no)}</td>` +
        `<td class="num muted">${m.status === 'resolved' || m.status === 'void' ? when(m.resolved_at) : ago(m.left)}</td></tr>`).join('') + '</tbody></table></div>';
  }

  function tradeRows(ts, withMarket) {
    if (!ts.length) return '<p class="empty">no trades yet. be the first. be the legend. be the cautionary tale.</p>';
    return `<div class="tw"><table><thead><tr><th>When</th><th>Who</th><th>What</th>${withMarket ? '<th>Market</th>' : ''}<th class="num">Contracts</th><th class="num">Price</th><th class="num">Kwonks</th></tr></thead><tbody>` +
      ts.map(t => `<tr><td class="muted mono">${clock(t.at)}</td><td><a href="trader.html?name=${encodeURIComponent(t.name)}">${esc(t.name)}</a></td><td>${t.action === 'buy' ? 'bought' : 'sold'} <span class="${t.side}">${t.side === 'yes' ? 'Yes' : 'No'}</span>${t.credit ? ' <span class="tag">on the house</span>' : ''}</td>` +
        `${withMarket ? `<td class="mono muted"><a href="market.html?id=${t.market_id}">${mk(t.market_id)}</a></td>` : ''}<td class="num">${px(t.contracts)}</td><td class="num">${px(t.avg_price)}</td><td class="num">${kw(t.kwonks)}</td></tr>`).join('') + '</tbody></table></div>';
  }

  function render(d) {
    header(d);
    const main = $('#main'); if (!main) return;
    const open = d.markets.filter(m => m.status === 'open' || m.status === 'closing').sort((a, b) => (a.kind === 'kalshi') - (b.kind === 'kalshi') || (a.left == null) - (b.left == null) || (a.left ?? 0) - (b.left ?? 0) || a.id - b.id);

    if (page === 'home') {
      $('#tiles').innerHTML = [
        ['KWK', d.rate.toFixed(3)], ['In circulation', kw(d.circulation)], ['Open markets', open.length], ['Traders', d.leaderboard.length]
      ].map(([k, v]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
      lineChart($('#kwkchart'), d.kwk_history, { color: '#3ccf7f', fmt: v => v.toFixed(3) });
      $('#markets').innerHTML = marketRows(open, false);
      $('#trades').innerHTML = tradeRows(d.trades.slice(0, 15), true);
    }

    if (page === 'markets') {
      const past = d.markets.filter(m => m.status === 'resolved' || m.status === 'void');
      $('#open').innerHTML = marketRows(open, false);
      const PER = 25, pages = Math.max(1, Math.ceil(past.length / PER));
      let pg = Math.min(pages, Math.max(1, parseInt(params.get('p') || '1', 10) || 1));
      const drawPast = () => {
        const slice = past.slice((pg - 1) * PER, pg * PER);
        let nav = '';
        if (pages > 1) {
          const btn = (n, label, on) => `<button data-p="${n}" class="${on ? 'on' : ''}" ${n < 1 || n > pages ? 'disabled' : ''}>${label}</button>`;
          const nums = [];
          for (let n = 1; n <= pages; n++) if (n === 1 || n === pages || Math.abs(n - pg) <= 2) nums.push(n);
          let last = 0, parts = [];
          for (const n of nums) { if (n - last > 1) parts.push('<span class="muted">…</span>'); parts.push(btn(n, n, n === pg)); last = n; }
          nav = `<div class="pager">${btn(pg - 1, 'prev', false)}${parts.join('')}${btn(pg + 1, 'next', false)}<span class="muted">${past.length} settled</span></div>`;
        }
        $('#past').innerHTML = marketRows(slice, true) + nav;
        $('#past').querySelectorAll('.pager button').forEach(b => b.addEventListener('click', () => { pg = parseInt(b.dataset.p, 10); history.replaceState(null, '', 'markets.html?p=' + pg); drawPast(); window.scrollTo({ top: $('#past').offsetTop - 20 }); }));
      };
      drawPast();
    }

    if (page === 'market') {
      const m = d.markets.find(x => x.id === parseInt(params.get('id'), 10));
      if (m && m.slim) {
        document.title = mk(m.id) + ' · Kwanzshi';
        main.innerHTML = `<h1><span class="mono muted">${mk(m.id)}</span> ${esc(m.title)} ${statusTag(m)}</h1><p class="lede">settled ${m.outcome ? m.outcome.toUpperCase() : ''}${m.settle_rate != null ? ' with KWK at ' + m.settle_rate.toFixed(3) : ''} on ${when(m.resolved_at)}. this one is old enough that the chart and trades aren\'t kept on the site anymore.</p>`;
        return;
      }
      if (!m) { main.innerHTML = '<p class="empty">no such market. it might be from before the records started, which was recently, because this is new.</p>'; return; }
      document.title = mk(m.id) + ' · Kwanzshi';
      $('#title').innerHTML = `<span class="mono muted">${mk(m.id)}</span> ${esc(m.title)} ${statusTag(m)}`;
      let sub = m.kind === 'simulated' ? `Settles by checking KWK against ${m.strike.toFixed(2)} at ${clock(m.settle_at)}.` : m.kind === 'kalshi' ? 'Mirrors a real Kalshi market.' : 'Settles when Kwanzi calls it.';
      if (m.status === 'resolved') sub += ` Settled <b class="${m.outcome}">${m.outcome.toUpperCase()}</b>${m.settle_rate != null ? ' with KWK at ' + m.settle_rate.toFixed(3) : ''} on ${when(m.resolved_at)}.`;
      $('#sub').innerHTML = sub;
      $('#tiles').innerHTML = [['Yes', m.yes], ['No', m.no], ['Bid / Ask', m.bid + ' / ' + m.ask], [m.status === 'open' ? 'Settles in' : 'Status', m.status === 'open' ? ago(m.left) : m.status]]
        .map(([k, v]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
      lineChart($('#chart'), (m.history || []).map(p => [p[0], (p[1] + p[2]) / 2]), { color: '#3ccf7f', fmt: v => Math.round(v) + '¢', band: [0, 100] });
      if (m.kind === 'simulated' && m.kwk_history) lineChart($('#kwkchart'), m.kwk_history, { color: '#f2c14e', fmt: v => v.toFixed(3), strike: m.strike });
      else { const kc = $('#kwkwrap'); if (kc) kc.hidden = true; }
      $('#trades').innerHTML = tradeRows(m.trades || [], false);
      if (m.settlements && m.settlements.length) {
        $('#settle').innerHTML = `<div class="tw"><table><thead><tr><th>Who</th><th>Side</th><th class="num">Contracts</th><th class="num">Paid</th><th class="num">Got</th><th class="num">Net</th></tr></thead><tbody>` +
          m.settlements.map(s => { const n = s.payout - s.cost; return `<tr><td><a href="trader.html?name=${encodeURIComponent(s.name)}">${esc(s.name)}</a></td><td class="${s.side}">${s.side === 'yes' ? 'Yes' : 'No'}</td><td class="num">${px(s.contracts)}</td><td class="num">${kw(s.cost)}</td><td class="num">${kw(s.payout)}</td><td class="num ${n >= 0 ? 'pos' : 'neg'}">${n >= 0 ? '+' : ''}${kw(n)}</td></tr>`; }).join('') + '</tbody></table></div>';
      } else { const sw = $('#settlewrap'); if (sw) sw.hidden = true; }
      $('#cmd').innerHTML = m.status === 'open' ? `Get in: <span class="cmd">!buy ${mk(m.id)} yes 50</span> or <span class="cmd">!buy ${mk(m.id)} no 50</span>` : '';
    }

    if (page === 'leaderboard') {
      const rows = d.leaderboard;
      $('#board').innerHTML = rows.length ? `<div class="tw"><table><thead><tr><th class="rank">#</th><th>Trader</th><th class="num">Equity</th><th class="num">Balance</th><th class="num">Net P&amp;L</th><th class="num">Record</th></tr></thead><tbody>` +
        rows.map((r, i) => `<tr><td class="rank mono">${i + 1}</td><td><a href="trader.html?name=${encodeURIComponent(r.name)}">${esc(r.name)}</a>${r.gold ? ' <span class="gold">★</span>' : ''}</td><td class="num">${kw(r.equity)}</td><td class="num">${kw(r.balance)}</td><td class="num ${r.pnl >= 0 ? 'pos' : 'neg'}">${r.pnl >= 0 ? '+' : ''}${kw(r.pnl)}</td><td class="num muted">${r.wins}–${r.losses}</td></tr>`).join('') + '</tbody></table></div>'
        : '<p class="empty">nobody\'s traded yet. the top spot is wide open and honestly it\'s embarrassing for everyone.</p>';
    }

    if (page === 'trader') {
      const name = params.get('name') || '';
      const t = d.traders[name] || d.traders[Object.keys(d.traders).find(k => k.toLowerCase() === name.toLowerCase())];
      if (!t) { main.innerHTML = `<p class="empty">no trader called ${esc(name)}. say something in chat and you'll exist. that's how it works here.</p>`; return; }
      document.title = t.name + ' · Kwanzshi';
      $('#title').innerHTML = esc(t.name) + (t.gold ? ' <span class="gold">★ Gold Card holder</span>' : '');
      $('#tiles').innerHTML = [['Equity', kw(t.equity)], ['Balance', kw(t.balance)], ['Net P&L', (t.pnl >= 0 ? '+' : '') + kw(t.pnl)], ['Record', t.wins + '–' + t.losses]]
        .map(([k, v]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
      $('#positions').innerHTML = t.positions.length ? `<div class="tw"><table><thead><tr><th>Market</th><th>Side</th><th class="num">Contracts</th><th class="num">Avg cost</th><th class="num">Worth now</th><th class="num">Pays if right</th></tr></thead><tbody>` +
        t.positions.map(p => `<tr><td><a href="market.html?id=${p.market_id}">${mk(p.market_id)}</a> <span class="muted">${esc(p.title)}</span></td><td class="${p.side}">${p.side === 'yes' ? 'Yes' : 'No'}</td><td class="num">${px(p.contracts)}</td><td class="num">${px(p.avg_cost)}</td><td class="num">${kw(p.value)}</td><td class="num">${kw(p.contracts * 100)}</td></tr>`).join('') + '</tbody></table></div>'
        : '<p class="empty">no open positions.</p>';
      $('#trades').innerHTML = tradeRows(t.trades, true);
    }

    if (page === 'shop') {
      $('#items').innerHTML = d.shop.items.length ? d.shop.items.map(it => `<button class="item" type="button" data-cmd="!shop buy ${it.id}" title="click to copy the command">${it.image ? `<img class="pic" src="${esc(it.image)}" alt="">` : ''}<div><div class="name">${esc(it.name)}</div>${it.description ? `<div class="desc">${esc(it.description)}</div>` : ''}<div class="muted">click to copy <code>!shop buy ${it.id}</code>, then paste it in chat</div></div><div class="price">${kw(it.price)}</div></button>`).join('')
        : '<p class="empty">shelf is empty. restocking. allegedly.</p>';
      document.querySelectorAll('.item[data-cmd]').forEach(btn => btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd, hint = btn.querySelector('.muted'), was = hint.innerHTML;
        const done = () => { hint.textContent = 'copied. now go paste it in chat.'; btn.classList.add('copied'); setTimeout(() => { hint.innerHTML = was; btn.classList.remove('copied'); }, 2000); };
        const fallback = () => { const ta = document.createElement('textarea'); ta.value = cmd; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { hint.textContent = 'could not copy. type ' + cmd; } ta.remove(); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cmd).then(done, fallback); else fallback();
      }));
      $('#buys').innerHTML = d.shop.purchases.length ? `<div class="tw"><table><thead><tr><th>When</th><th>Who</th><th>Bought</th><th class="num">Paid</th></tr></thead><tbody>` +
        d.shop.purchases.map(p => `<tr><td class="muted mono">${when(p.at)}</td><td><a href="trader.html?name=${encodeURIComponent(p.name)}">${esc(p.name)}</a></td><td>${esc(p.item)}</td><td class="num">${kw(p.price)}</td></tr>`).join('') + '</tbody></table></div>'
        : '<p class="empty">nobody\'s bought anything yet. the gold card is still on the shelf. staring at you. it knows.</p>';
    }
  }
})();
