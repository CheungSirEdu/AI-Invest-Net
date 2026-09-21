const $ = (id) => document.getElementById(id);
const fmt = (n, d = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const x = Number(n);
  const sign = x < 0 ? "-" : "";
  return sign + "$" + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};
const pct = (n, d = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const x = Number(n);
  const s = x > 0 ? "+" : "";
  return s + x.toFixed(d) + "%";
};
const clsPnL = (n) => (Number(n) > 0 ? "up" : Number(n) < 0 ? "down" : "");
const pillClass = (action) => {
  if (!action) return "wait";
  if (/不碰|暫不|不超配|等待|觀察/.test(action)) return "wait";
  if (/減|出/.test(action)) return "out";
  return "in";
};

let STATE = null;

function render(s) {
  STATE = s;
  const sess = s.session || {};
  $("hkClock").textContent = prettyTime(sess.hk);
  $("nyClock").textContent = prettyTime(sess.ny);
  const badge = $("sessBadge");
  badge.textContent = sess.label || "—";
  badge.className = "badge " + (sess.code || "");
  $("sessHint").textContent = sess.next_open_hint || "";

  const banner = $("startBanner");
  const pendingNow = (s.portfolio && s.portfolio.pending_count) || 0;
  if (banner) {
    if (!sess.can_trade) {
      banner.className = "banner";
      banner.innerHTML = "<b>此刻不可買賣。</b> 只可在美東正規盤（09:30–16:00）按即時公開價模擬成交。盤前、盤後、夜盤一律不得買賣。真正開始是 2026 年 9 月 21 日開市之後。現金仍為 1,000,000 美元，下列只是待成交委託。";
    } else {
      banner.className = "banner live";
      banner.innerHTML = "<b>正規盤進行中。</b> 只按即時公開價成交，不用隔夜價。盤前盤後仍然不得新開倉。跳空超過 2% 則暫停該標的。";
    }
  }

  const p = s.portfolio || {};
  const pendingN = p.pending_count || 0;
  $("stats").innerHTML = [
    stat("組合淨值", fmt(p.nav)),
    stat("開倉後盈虧", pendingN ? "尚未開倉" : `${fmt(p.pnl)}  ${pct(p.pnl_pct)}`, clsPnL(p.pnl)),
    stat("跑贏／跑輸 VOO", pendingN ? "開盤後起計" : (p.vs_voo == null ? "—" : fmt(p.vs_voo)), clsPnL(p.vs_voo)),
    stat("現金", `${fmt(p.cash)}  (${(p.cash_pct || 0).toFixed(1)}%)`),
    stat("股票市值", pendingN ? "尚未持有" : fmt(p.equity)),
    stat("待成交委託", pendingN ? pendingN + " 筆" : "無"),
  ].join("");

  const order = ["VOO", "GOOGL", "AMZN", "MSFT", "NVDA", "AAPL", "META", "TSLA"];
  $("tickers").innerHTML = order.map((sym) => tickCard(s, sym)).join("");

  const pos = p.positions || [];
  if (pendingN) {
    $("mtmNote").textContent = "模擬投資自 2026 年 9 月 21 日美東 09:30 正規盤開始。現時市未開，現金仍為 1,000,000 美元，股票尚未持有。下列委託只是委員會決議，不是成交。";
  } else {
    $("mtmNote").textContent = "市值隨公開報價更新。成本為 2026 年 9 月 21 日正規盤模擬成交價。";
  }
  $("posTable").innerHTML =
    "<thead><tr><th>標的</th><th class='num'>股數</th><th class='num'>成本</th><th class='num'>現價</th><th class='num'>市值</th><th class='num'>權重</th><th class='num'>浮盈虧</th></tr></thead><tbody>" +
    (pos.length
      ? pos.map((r) => `<tr>
      <td><span class="sym">${r.symbol}</span><div class="tiny">${esc(r.name)}</div></td>
      <td class="num">${r.qty.toLocaleString()}</td>
      <td class="num">${fmt(r.avg, 2)}</td>
      <td class="num">${fmt(r.price)}</td>
      <td class="num">${fmt(r.value)}</td>
      <td class="num">${r.weight.toFixed(2)}%</td>
      <td class="num ${clsPnL(r.pnl)}">${fmt(r.pnl)}<div class="tiny">${pct(r.pnl_pct)}</div></td>
    </tr>`).join("")
      : `<tr><td colspan="7" class="tiny">尚未持有股票。五筆買入委託等候 2026 年 9 月 21 日美東正規盤開市後，按當時公開價成交。</td></tr>`) +
    `<tr><td>現金</td><td></td><td></td><td></td><td class="num">${fmt(p.cash)}</td><td class="num">${(p.cash_pct || 0).toFixed(2)}%</td><td></td></tr>` +
    (pendingN ? `<tr><td>已預留（待成交參考）</td><td></td><td></td><td></td><td class="num">${fmt(p.reserved)}</td><td></td><td class="tiny">開盤後才扣賬</td></tr>` : "") +
    "</tbody>";

  const cons = s.consensus || [];
  $("consTable").innerHTML =
    "<thead><tr><th>標的</th><th>共識</th><th>信心</th><th>主動倉</th></tr></thead><tbody>" +
    cons.map((c) => `<tr>
      <td><span class="sym">${c.symbol}</span></td>
      <td><span class="pill ${pillClass(c.action)}">${esc(c.action)}</span>
        <div class="tiny">${esc(c.stance)} · ${esc(c.note || "")}</div></td>
      <td>${c.confidence}%</td>
      <td>${c.shares ? c.shares + " 股" : "0"}</td>
    </tr>`).join("") +
    "</tbody>";

  const sc = (s.debate && s.debate.scenarios) || [];
  $("scenarioBox").innerHTML = sc.map((x) => `<div class="card scenario">
    <div class="kicker">${esc(x.name)} · ${Math.round(x.prob * 100)}%</div>
    <div class="bar"><i style="width:${x.prob * 100}%"></i></div>
    <div class="tiny">${esc(x.text)}</div>
  </div>`).join("");

  renderExperts(s);
  renderTrades(s);
  renderDebate(s);
  renderLook(s);
  renderNews(s);
  renderRules(s);

  const extra = s.server || {};
  $("foot").innerHTML = `二十四小時儀表板 · 盤前／盤後／正規盤即時公開行情（Nasdaq 最新成交，CNBC 基本面）· 最近更新 ${extra.last_poll_at || "尚未"} · 成功 ${extra.poll_ok || 0}／失敗 ${extra.poll_fail || 0}${extra.last_poll_error ? " · " + extra.last_poll_error : ""}<br/>盤前盤後報價只供觀察，不得模擬成交。此為模擬委員會，並非投資建議，亦不會在券商代為落單。`;
}

function stat(label, value, extraClass = "") {
  return `<div class="stat"><span>${label}</span><strong class="${extraClass}">${value}</strong></div>`;
}

function quoteSessLabel(q, sess) {
  if (q.price_label) return q.price_label;
  const raw = String(q.quote_session || q.status || (sess && sess.code) || "").toUpperCase();
  if (raw.includes("PRE")) return "盤前";
  if (raw.includes("POST")) return "盤後";
  if (raw.includes("REG") || raw.includes("OPEN")) return "正規盤";
  if (raw.includes("CLOSE")) return "收市";
  return (sess && sess.label) || "";
}

function tickCard(s, sym) {
  const q = (s.quotes || {})[sym] || {};
  const c = (s.consensus || []).find((x) => x.symbol === sym) || {};
  const sess = s.session || {};
  const kind = quoteSessLabel(q, sess);
  const stamp = q.asof_label || q.asof || "";
  return `<div class="tick">
    <div class="row1"><span class="sym">${sym}</span><span class="pill ${pillClass(c.action)}">${esc(c.action || "—")}</span></div>
    <div class="px ${clsPnL(q.change)}">${fmt(q.price)} <span style="font-size:12px">${pct(q.change_pct)}</span></div>
    <div class="meta">${esc(q.name || "")} · <span class="sess-tag">${esc(kind)}</span> ${esc(stamp)}<br/>PE ${q.pe ?? "—"} · 前瞻 ${q.fpe ?? "—"} · 52週 ${q.low52 ?? "—"} – ${q.high52 ?? "—"}</div>
  </div>`;
}

function statusLabel(t) {
  const st = t.status || "filled";
  if (st === "pending") return "待成交";
  if (st === "paused_gap") return "開盤跳空，已暫停";
  return "已成交";
}
function statusPill(t) {
  const st = t.status || "filled";
  if (st === "pending" || st === "paused_gap") return "wait";
  return "in";
}

function renderExperts(s) {
  const box = $("expertGrid");
  if (!box) return;
  const experts = ((s.config || {}).experts || []);
  box.innerHTML = experts.map((e) => `<article class="expert">
    <div class="who">${esc(e.name)}</div>
    <div class="job">${esc(e.group || "席位")} · ${esc(e.seat)}（${esc(e.short)}）</div>
    <p>${esc(e.duty || "")}</p>
  </article>`).join("");
}

function renderTrades(s) {
  const trades = s.trades || [];
  $("tradeList").innerHTML = trades.map((t) => {
    const pending = (t.status || "filled") !== "filled";
    const px = pending ? (t.intended_price || t.price) : (t.fill_price || t.price);
    const amt = pending ? (t.intended_notional || t.notional) : t.notional;
    return `<article class="trade">
    <div class="trade-head">
      <div class="side-buy">${esc(t.side)}</div>
      <div>
        <h3>${t.symbol} ${t.qty.toLocaleString()} 股 · ${pending ? "參考價" : "成交價"} ${fmt(px)}</h3>
        <div class="tiny">${esc(t.session)} · ${pending ? "參考金額" : "成交金額"} ${fmt(amt)}${t.cash_after != null ? " · 成交後現金 " + fmt(t.cash_after) : ""}</div>
      </div>
      <div class="pill ${statusPill(t)}">${statusLabel(t)}</div>
    </div>
    <div class="trade-body">
      <p class="quote-block">${esc(t.headline)}</p>
      <div class="seat">買入理由</div>
      <ol>${(t.reasons || []).map((r) => `<li>${esc(r)}</li>`).join("")}</ol>
      <div class="against"><b>經質疑後仍然買入的原因：</b> ${esc(t.against || "")}</div>
      <div class="veto">${esc(t.veto || "")}</div>
      <p class="tiny" style="margin:12px 0 0">加倉線 ${t.add_below ?? "—"} · 減持檢討 ${t.trim_above ?? "—"} · ${esc(t.stop_review || "")}<br/>${esc(t.fill_note || "")}</p>
    </div>
  </article>`;
  }).join("");

  const nt = (s.config && s.config.no_trade) || {};
  $("noTrade").innerHTML = Object.entries(nt).map(([sym, r]) => `<div class="qa">
    <div class="seat">${sym} · ${esc(r.headline)}</div>
    <ol>${(r.why || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
    <div class="tiny">加倉線：${r.add_below ?? "不設（不碰）"}</div>
  </div>`).join("");
}

function renderDebate(s) {
  const d = s.debate || {};
  const experts = ((s.config || {}).experts || []);
  const nameOf = (id) => {
    const e = experts.find((x) => x.id === id);
    return e ? `${e.name}（${e.short}）` : id;
  };
  const rounds = d.rounds || [];
  $("debateBox").innerHTML = `<div class="card paper" style="margin-bottom:16px">
      <h2>${esc(d.title || "委員會")}</h2>
      <p class="tiny">${esc(d.price_basis || "")}<br/>${esc(d.mandate || "")}</p>
    </div>` +
    rounds.map((r) => {
      if (r.id === 2) {
        return `<div class="card paper" style="margin-bottom:16px">
          <h2>${esc(r.name)}</h2>
          ${(r.items || []).map((it) => `<div class="qa">
            <div class="seat">${nameOf(it.from)} → ${nameOf(it.to)}</div>
            <div class="q">問：${esc(it.q)}</div>
            <div class="a">答：${esc(it.a)}</div>
          </div>`).join("")}
        </div>`;
      }
      return `<div class="card paper" style="margin-bottom:16px">
        <h2>${esc(r.name)}</h2>
        ${(r.items || []).map((it) => `<div class="qa">
          <div class="seat">${nameOf(it.expert)}</div>
          <div class="q">${esc(it.text)}</div>
        </div>`).join("")}
      </div>`;
    }).join("");
}

function renderLook(s) {
  const rows = (s.portfolio && s.portfolio.lookthrough) || [];
  $("lookTable").innerHTML =
    "<thead><tr><th>公司</th><th class='num'>VOO 權重</th><th class='num'>來自 VOO</th><th class='num'>主動超配</th><th class='num'>總暴露</th><th class='num'>佔組合</th></tr></thead><tbody>" +
    rows.map((r) => `<tr>
      <td class="sym">${r.symbol}</td>
      <td class="num">${r.voo_weight.toFixed(2)}%</td>
      <td class="num">${fmt(r.from_voo)}</td>
      <td class="num">${fmt(r.active)}</td>
      <td class="num">${fmt(r.total)}</td>
      <td class="num">${r.pct_nav.toFixed(2)}%</td>
    </tr>`).join("") +
    "</tbody>";
  const mag = s.portfolio ? s.portfolio.mag7_pct_nav : 0;
  const pendingLook = (s.portfolio && s.portfolio.pending_count) ? "市未開，上表實際暴露為零。待 9 月 21 日正規盤成交後才計算真正持倉。" : "";
  $("lookSum").textContent = (pendingLook ? pendingLook + " " : "") + `MAG7 透視合計約佔組合 ${mag}%。全倉 VOO 的 MAG7 約為 33.5%。成交後因持有大量現金，總股票風險將低於全倉 VOO；超配傾向 Alphabet、Amazon、Microsoft，而非高位的 Apple 與 Tesla。`;
}

function renderNews(s) {
  $("newsList").innerHTML = (s.news || []).map((n) => `<div class="news-item">
    <div class="lvl ${esc(n.level)}">${esc(n.level)} · ${esc(n.time)}</div>
    <h3 style="margin:6px 0 6px;font-family:var(--serif);font-size:18px">${esc(n.title)}</h3>
    <div class="tiny">${esc(n.summary)}</div>
    <div class="tiny">影響：${(n.affects || []).join(" · ")}</div>
  </div>`).join("");
}

function renderRules(s) {
  const r = s.rules || {};
  const items = [
    `本金 ${fmt(r.capital)} ${r.currency || "USD"}。期限 ${r.horizon}。風格：${r.style}。`,
    `風險偏好：${r.risk}。分數線：${r.benchmark}。`,
    `現金至少約 ${(r.cash_min * 100).toFixed(0)}%。第一批股票不宜超過 ${(r.equity_first_tranche_max * 100).toFixed(0)}%。`,
    `單一主動股票上限 ${(r.single_active_cap * 100).toFixed(0)}%；NVDA 主動倉上限 ${(r.nvda_active_cap * 100).toFixed(0)}%。`,
    `組合離高位回撤 ≥ ${(r.drawdown_circuit * 100).toFixed(0)}%：熔斷所有 MAG7 新倉。`,
    `夜盤開新倉：${r.night_new_positions ? "可以" : "不可以"}。槓桿：${r.leverage ? "可以" : "不可以"}。期權：${r.options ? "可以" : "不可以"}。`,
    r.fill_policy,
    "重開委員會：" + (r.reopen_if || []).join("；"),
    r.disclaimer,
  ];
  $("rulesList").innerHTML = items.filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join("");
  const levels = r.add_levels || {};
  const cons = s.consensus || [];
  $("levelsTable").innerHTML =
    "<thead><tr><th>標的</th><th class='num'>加倉線</th><th class='num'>減持檢討</th></tr></thead><tbody>" +
    Object.keys(levels).map((sym) => {
      const c = cons.find((x) => x.symbol === sym) || {};
      return `<tr><td class="sym">${sym}</td><td class="num">${levels[sym]}</td><td class="num">${c.trim_above ?? "—"}</td></tr>`;
    }).join("") +
    "<tr><td class='sym'>TSLA</td><td class='num'>不設（不碰）</td><td class='num'>—</td></tr>" +
    "</tbody>";
}

function prettyTime(iso) {
  if (!iso) return "—";
  return iso.replace("T", " ").replace(/\+.*/, "").replace(/-\d{2}:\d{2}$/, "");
}
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function showPage(id) {
  if (!id) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.page === id));
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("on", p.id === "page-" + id));
  if (location.hash.replace("#", "") !== id) {
    history.replaceState(null, "", "#" + id);
  }
  if (id === "ask") {
    const input = $("chatInput");
    if (input) input.focus();
  }
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  showPage(btn.dataset.page);
});

window.addEventListener("hashchange", () => {
  const id = (location.hash || "").replace("#", "");
  if (id) showPage(id);
});
if (location.hash) showPage(location.hash.replace("#", ""));

function clientSession() {
  const hk = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Hong_Kong" }).replace(" ", "T") + "+08:00";
  const nyStr = new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" });
  const ny = new Date(nyStr.replace(" ", "T"));
  const wd = ny.getDay(); // 0 Sun
  const h = ny.getHours() + ny.getMinutes() / 60;
  let label = "休市", code = "CLOSED";
  if (wd === 0 || wd === 6) {
    label = "週末休市";
    code = "CLOSED";
  } else if (h >= 9.5 && h < 16) {
    label = "正規盤";
    code = "REGULAR";
  } else if (h >= 4 && h < 9.5) {
    label = "盤前";
    code = "PRE";
  } else if (h >= 16 && h < 20) {
    label = "盤後";
    code = "POST";
  }
  return {
    code,
    label,
    ny: nyStr.replace(" ", "T") + "-04:00",
    hk,
    twenty_three_from: "2026-12-06",
    twenty_three_live: false,
    next_open_hint: "下一個正規盤：星期一 美東 09:30（香港 21:30）",
    night_new_positions: false,
    can_trade: code === "REGULAR" && nyStr.slice(0, 10) >= "2026-09-21",
    trade_rule: "只可在美東正規盤按即時公開價模擬成交。盤前、盤後、夜盤不得買賣。",
  };
}

const LIVE_STATE_FEEDS = ["data.json", "quotes.json"];

async function overlayLiveQuotes(s) {
  if (s.server && s.server.mode !== "static" && s.server.last_poll_at) return s;
  for (const url of LIVE_STATE_FEEDS) {
    try {
      const res = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) continue;
      const payload = await res.json();
      if (payload.quotes && payload.quotes.VOO && payload.quotes.VOO.price != null && payload.trades) {
        if (!payload.session || !payload.session.code) payload.session = clientSession();
        payload.server = Object.assign({}, payload.server || {}, { live: true });
        return payload;
      }
      const q = payload.quotes || payload;
      if (!q || !q.VOO || q.VOO.price == null) continue;
      s.quotes = Object.assign({}, s.quotes || {}, q);
      s.server = Object.assign({}, s.server || {}, {
        last_poll_at: payload.asof || q.VOO.asof || s.server.last_poll_at,
        live: true,
      });
      if (payload.session && payload.session.code) s.session = payload.session;
      return s;
    } catch (e) {}
  }
  return s;
}

async function loadState() {
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (res.ok) {
      const s = await res.json();
      if (s.server && s.server.mode !== "static") return s;
    }
  } catch (e) {}
  const live = await overlayLiveQuotes({ server: { mode: "static" } });
  if (live && live.quotes && live.quotes.VOO) return live;
  const res = await fetch("data.json?" + Date.now(), { cache: "no-store" });
  const s = await res.json();
  s.session = clientSession();
  return overlayLiveQuotes(s);
}

let bootTimer = null;
function scheduleBoot(ms) {
  if (bootTimer) clearInterval(bootTimer);
  bootTimer = setInterval(boot, ms);
}

async function boot() {
  try {
    const s = await loadState();
    render(s);
    const code = (s.session && s.session.code) || clientSession().code;
    scheduleBoot(code === "REGULAR" || code === "PRE" || code === "POST" ? 10000 : 20000);
  } catch (err) {
    $("foot").textContent = "載入失敗：" + err;
    scheduleBoot(15000);
  }
}
boot();

function appendChat(html) {
  const log = $("chatLog");
  if (!log) return;
  const d = document.createElement("div");
  d.innerHTML = html;
  while (d.firstChild) log.appendChild(d.firstChild);
  log.scrollTop = log.scrollHeight;
}

function renderAskResult(question, r) {
  const chair = r.chair || {};
  const quote = r.quote || {};
  const views = r.views || [];
  const news = r.headlines || [];
  const challenges = r.challenges || chair.challenges || [];
  const viewHtml = views.length
    ? `<div class="chat-experts">${views.map((v) =>
        `<article class="chat-expert"><div class="who">${esc(v.name || "")} · ${esc(v.short || v.seat || "")} · ${esc(v.stance || "")}</div><p>${esc(v.text || "")}</p></article>`
      ).join("")}</div>`
    : "";
  const newsHtml = news.length
    ? `<p class="tiny">已讀新聞</p><ul class="chat-news">${news.slice(0, 8).map((n) =>
        `<li>${esc(n.title || "")}${n.source ? " <span class='tiny'>（" + esc(n.source) + "）</span>" : ""}</li>`
      ).join("")}</ul>`
    : "";
  const chHtml = challenges.length
    ? `<div class="chat-challenges"><p class="tiny">互相質詢</p>${challenges.map((c) =>
        `<div class="qa"><div class="seat">${esc(c.from || "")} → ${esc(c.to || "")}</div><div class="q">問：${esc(c.q || "")}</div><div class="a">答：${esc(c.a || "")}</div></div>`
      ).join("")}</div>`
    : "";
  const exec = chair.execution || "";
  const execNote = chair.execution_note || "";
  appendChat(`<div class="bubble user"><div class="who">你</div>${esc(question)}</div>`);
  appendChat(`<div class="bubble bot">
    <div class="who">委員會 · ${esc(r.engine || "十一席")}</div>
    <div class="verdict">${esc(chair.action || r.summary || "")}</div>
    ${exec ? `<div class="exec-note">${esc(exec)}${execNote ? " · " + esc(execNote) : ""}</div>` : ""}
    <p>${esc(r.summary || chair.summary || "")}</p>
    <p class="tiny">${esc(quote.symbol || "")} 現價 ${quote.price != null ? fmt(quote.price) : "—"} · 時段 ${esc(quote.quote_session || quote.status || "")} · ${esc(quote.asof_label || "")}</p>
    ${newsHtml}
    ${viewHtml}
    ${chHtml}
    <p class="tiny">${esc(r.disclaimer || "")}</p>
  </div>`);
}

async function sendQuestion(question) {
  const btn = $("chatSend");
  const input = $("chatInput");
  const stripBtn = document.querySelector("#askStripForm button");
  if (btn) btn.disabled = true;
  if (stripBtn) stripBtn.disabled = true;
  showPage("ask");
  appendChat(`<div class="bubble bot" id="chatWait"><div class="who">委員會</div>十一席正在讀即時報價、新聞台與頭條，隨後互相質詢……</div>`);
  try {
    let res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) throw new Error("http " + res.status);
    const r = await res.json();
    const wait = document.getElementById("chatWait");
    if (wait) wait.remove();
    if (!r.ok && r.error) {
      appendChat(`<div class="bubble bot"><div class="who">委員會</div>${esc(r.error)}</div>`);
    } else {
      renderAskResult(question, r);
    }
  } catch (err) {
    const wait = document.getElementById("chatWait");
    if (wait) wait.remove();
    appendChat(`<div class="bubble bot"><div class="who">委員會</div>未能連到本機委員會引擎。請用 <code>http://127.0.0.1:8790/</code> 打開本站再問。公開網頁只能展示紀錄，即時十一席答問需要本機儀表板。${esc(String(err))}</div>`);
  } finally {
    if (btn) btn.disabled = false;
    if (stripBtn) stripBtn.disabled = false;
    if (input) input.focus();
  }
}

(function wireChat() {
  const form = $("chatForm");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "1";
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("chatInput");
    const q = (input && input.value || "").trim();
    if (!q) return;
    input.value = "";
    sendQuestion(q);
  });
  const hints = $("chatHints");
  if (hints) {
    hints.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-q]");
      if (!b) return;
      sendQuestion(b.getAttribute("data-q"));
    });
  }
  const strip = $("askStripForm");
  if (strip && !strip.dataset.wired) {
    strip.dataset.wired = "1";
    strip.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("askStripInput");
      const q = (input && input.value || "").trim();
      if (!q) return;
      input.value = "";
      sendQuestion(q);
    });
  }
  fetch("/api/chat", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const msgs = (d && d.messages) || [];
      if (!msgs.length) {
        appendChat(`<div class="bubble bot"><div class="who">委員會</div>輸入代號即可，例如 VOO。會讀報價與新聞，請十一席發言，回答現價值不值得買或賣。非正規盤即使看多也不得成交。</div>`);
        return;
      }
      msgs.forEach((m) => {
        appendChat(`<div class="bubble user"><div class="who">你</div>${esc(m.question || "")}</div>`);
        appendChat(`<div class="bubble bot"><div class="who">委員會紀錄</div><div class="verdict">${esc(m.action || "")}</div><p>${esc(m.summary || "")}</p></div>`);
      });
    })
    .catch(() => {
      appendChat(`<div class="bubble bot"><div class="who">委員會</div>輸入代號即可，例如 VOO。即時十一席答問請用本機 http://127.0.0.1:8790/</div>`);
    });
})();


