#!/usr/bin/env python3
"""CNBC fundamentals + Nasdaq live last, including pre/post market."""
from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None  # type: ignore

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
SYMBOLS = ["VOO", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"]
CNBC_SYMS = SYMBOLS + [".SPX"]
NASDAQ_SYMS = [
    ("VOO", "etf"),
    ("AAPL", "stocks"),
    ("MSFT", "stocks"),
    ("NVDA", "stocks"),
    ("AMZN", "stocks"),
    ("GOOGL", "stocks"),
    ("META", "stocks"),
    ("TSLA", "stocks"),
    ("SPX", "index"),
]


def now_hk() -> datetime:
    if ZoneInfo:
        return datetime.now(ZoneInfo("Asia/Hong_Kong"))
    return datetime.now(timezone.utc)


def now_ny() -> datetime:
    if ZoneInfo:
        return datetime.now(ZoneInfo("America/New_York"))
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def http_json(url: str, headers=None, timeout=18):
    h = {"User-Agent": UA, "Accept": "application/json,text/plain,*/*"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def session_info():
    ny = now_ny()
    wd = ny.weekday()
    h = ny.hour + ny.minute / 60
    twenty_three = ny.date() >= datetime(2026, 12, 6).date()
    if wd >= 5:
        label, code = "週末休市", "CLOSED"
    elif twenty_three and 20 <= ny.hour < 21:
        label, code = "夜盤維修窗（20:00–21:00 美東）", "MAINT"
    elif 9.5 <= h < 16:
        label, code = "正規盤", "REGULAR"
    elif 4 <= h < 9.5:
        label, code = "盤前", "PRE"
    elif 16 <= h < 20:
        label, code = "盤後", "POST"
    elif twenty_three and (h >= 21 or h < 4):
        label, code = "夜盤", "NIGHT"
    else:
        label, code = "休市", "CLOSED"
    next_open = "下一個正規盤：美東週一至五 09:30（香港 21:30／22:30，視乎夏令時間）"
    if wd >= 5:
        next_open = "下一個正規盤：星期一 美東 09:30（香港 21:30）"
    can_trade = code == "REGULAR" and ny.date() >= datetime(2026, 9, 21).date()
    return {
        "code": code,
        "label": label,
        "ny": iso(ny),
        "hk": iso(now_hk()),
        "twenty_three_from": "2026-12-06",
        "twenty_three_live": twenty_three,
        "next_open_hint": next_open,
        "night_new_positions": False,
        "can_trade": can_trade,
        "trade_rule": "只可在美東正規盤（09:30–16:00）按即時公開價模擬成交。盤前、盤後、夜盤、週末一律不得買賣。",
    }


def _float(v):
    if v in (None, "", "N/A"):
        return None
    try:
        return float(str(v).replace(",", "").replace("+", "").replace("$", "").replace("%", ""))
    except Exception:
        return None


def _pct(v):
    x = _float(str(v).replace("%", "") if v is not None else None)
    return (x / 100.0) if x is not None and x > 1 else x


def _vol(v):
    if v in (None, "", "N/A"):
        return None
    s = str(v).replace(",", "")
    try:
        return int(float(s))
    except Exception:
        return None


def nasdaq_session(raw: str) -> str:
    s = (raw or "").strip().lower()
    if "pre" in s:
        return "PRE_MKT"
    if "after" in s or "post" in s:
        return "POST_MKT"
    if "open" in s or "regular" in s:
        return "REG_MKT"
    if "close" in s:
        return "CLOSED"
    return (raw or "").upper().replace(" ", "_") or "UNKNOWN"


def session_price_label(code: str) -> str:
    return {
        "PRE_MKT": "盤前",
        "POST_MKT": "盤後",
        "REG_MKT": "正規盤",
        "OPEN": "正規盤",
        "REGULAR": "正規盤",
        "CLOSED": "收市",
        "PRE": "盤前",
        "POST": "盤後",
    }.get((code or "").upper(), code or "")


def fetch_cnbc(symbols=None) -> dict:
    syms = symbols or CNBC_SYMS
    joined = urllib.parse.quote("|".join(syms))
    url = (
        "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol"
        f"?symbols={joined}&requestMethod=itv&noform=1&partnerId=2&fund=&ext=json"
    )
    data = http_json(
        url,
        headers={"Origin": "https://www.cnbc.com", "Referer": "https://www.cnbc.com/"},
    )
    rows = data.get("FormattedQuoteResult", {}).get("FormattedQuote") or []
    out = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        raw = row.get("symbol") or ""
        sym = "SPX" if raw in (".SPX", "SPX") else raw
        last = _float(row.get("last"))
        if last is None:
            continue
        chg = _float(str(row.get("change", "0")).replace(",", "").replace("+", ""))
        cp = _float(str(row.get("change_pct", "0")).replace("%", "").replace("+", ""))
        out[sym] = {
            "price": last,
            "open": _float(row.get("open")),
            "high": _float(row.get("high")),
            "low": _float(row.get("low")),
            "prev": _float(row.get("previous_day_closing")),
            "change": chg,
            "change_pct": cp,
            "volume": _vol(row.get("volume")),
            "pe": _float(row.get("pe")),
            "fpe": _float(row.get("fpe")),
            "yield": _pct(row.get("dividendyield")),
            "high52": _float(row.get("yrhiprice")),
            "low52": _float(row.get("yrloprice")),
            "status": row.get("curmktstatus"),
            "quote_session": row.get("curmktstatus"),
            "last_time": row.get("last_time"),
            "asof_label": row.get("last_timedate") or row.get("last_time"),
            "source": "CNBC 公開報價",
            "extended": False,
        }
    return out


def fetch_nasdaq(sym: str, asset: str):
    url = f"https://api.nasdaq.com/api/quote/{sym}/info?assetclass={asset}"
    data = http_json(
        url,
        headers={"Origin": "https://www.nasdaq.com", "Referer": "https://www.nasdaq.com/"},
    )
    d = (data or {}).get("data") or {}
    p = d.get("primaryData") or {}
    sec = d.get("secondaryData") or {}
    last = p.get("lastSalePrice") or ""
    px = _float(str(last).replace("$", ""))
    if px is None:
        return None
    mkt = d.get("marketStatus") or ""
    qsess = nasdaq_session(mkt)
    close_px = _float(str(sec.get("lastSalePrice") or "").replace("$", ""))
    return {
        "price": px,
        "change": _float(str(p.get("netChange", "")).replace("+", "")),
        "change_pct": _float(str(p.get("percentageChange", "")).replace("%", "").replace("+", "")),
        "volume": _vol(p.get("volume")),
        "asof_label": p.get("lastTradeTimestamp"),
        "status": qsess,
        "quote_session": qsess,
        "market_status_raw": mkt,
        "prev": close_px,
        "regular_close": close_px,
        "regular_close_label": sec.get("lastTradeTimestamp"),
        "bid": _float(str(p.get("bidPrice") or "").replace("$", "")),
        "ask": _float(str(p.get("askPrice") or "").replace("$", "")),
        "source": "Nasdaq 公開報價",
        "extended": qsess in ("PRE_MKT", "POST_MKT"),
        "price_label": session_price_label(qsess),
    }


def fetch_nasdaq_all() -> dict:
    out = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(fetch_nasdaq, sym, ac): sym for sym, ac in NASDAQ_SYMS}
        for fut in as_completed(futs):
            sym = futs[fut]
            try:
                row = fut.result()
                if row:
                    out[sym] = row
            except Exception:
                continue
    return out


def fetch_all_quotes() -> dict:
    """Nasdaq live last overlays CNBC last/fundamentals."""
    cnbc = {}
    try:
        cnbc = fetch_cnbc()
    except Exception:
        cnbc = {}
    nasdaq = {}
    try:
        nasdaq = fetch_nasdaq_all()
    except Exception:
        nasdaq = {}
    if not cnbc and not nasdaq:
        raise RuntimeError("CNBC and Nasdaq both failed")
    fresh = {}
    for sym in list(dict.fromkeys(SYMBOLS + ["SPX"] + list(cnbc) + list(nasdaq))):
        row = {}
        if sym in cnbc:
            row.update(cnbc[sym])
        nq = nasdaq.get(sym)
        if nq and nq.get("price") is not None:
            for k in (
                "price",
                "change",
                "change_pct",
                "volume",
                "asof_label",
                "status",
                "quote_session",
                "market_status_raw",
                "regular_close",
                "regular_close_label",
                "bid",
                "ask",
                "source",
                "extended",
                "price_label",
            ):
                if nq.get(k) is not None:
                    row[k] = nq[k]
            if nq.get("prev") is not None:
                row["prev"] = nq["prev"]
        if row.get("price") is not None:
            fresh[sym] = row
    if len(fresh) < 4:
        raise RuntimeError("too few symbols: %s" % list(fresh))
    return fresh


def live_quote(symbol: str, cached: dict | None = None) -> dict:
    cached = cached or {}
    base = dict(cached.get(symbol) or {"symbol": symbol, "name": symbol})
    ac = "etf" if symbol == "VOO" else ("index" if symbol in ("SPX", ".SPX") else "stocks")
    nq_sym = "SPX" if symbol in ("SPX", ".SPX") else symbol
    try:
        nq = fetch_nasdaq(nq_sym, ac)
    except Exception:
        nq = None
    if nq and nq.get("price") is not None:
        base.update(nq)
        base["symbol"] = symbol
        return base
    try:
        cnbc = fetch_cnbc([symbol if symbol != "SPX" else ".SPX"])
        row = cnbc.get(symbol) or cnbc.get("SPX")
        if row:
            base.update(row)
    except Exception:
        pass
    base["symbol"] = symbol
    return base


def write_quotes_payload(quotes: dict, path: Path) -> None:
    sess = session_info()
    payload = {
        "asof": iso(now_hk()),
        "session": sess,
        "quotes": quotes,
    }
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="quotes.json")
    ap.add_argument("--data", default="")
    args = ap.parse_args()
    fresh = fetch_all_quotes()
    ts = iso(now_hk())
    sess = session_info()
    quotes = {}
    for sym, patch in fresh.items():
        row = {"symbol": sym, "name": sym}
        row.update({k: v for k, v in patch.items() if v is not None})
        row["asof"] = ts
        row["clock_session"] = sess["code"]
        row["market_status"] = sess["code"]
        quotes[sym] = row
    out = Path(args.out)
    write_quotes_payload(quotes, out)
    if args.data:
        p = Path(args.data)
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            data = {}
        data["quotes"] = quotes
        data["session"] = sess
        extra = data.get("server") or {}
        extra.update({"mode": "static", "live": True, "last_poll_at": ts})
        data["server"] = extra
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        tmp.replace(p)
    voo = quotes.get("VOO") or {}
    print("ok VOO", voo.get("price"), voo.get("asof_label"), voo.get("quote_session"), "n", len(quotes))


if __name__ == "__main__":
    main()
