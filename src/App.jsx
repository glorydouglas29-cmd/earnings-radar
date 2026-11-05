1import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, BarChart3, CalendarDays, CheckCircle2,
  CircleAlert, ExternalLink, Filter, LoaderCircle, Radar, RefreshCw,
  Search, TrendingUp, WalletCards
} from "lucide-react";

const API_BASE = "https://gamma-api.polymarket.com/events";

const PAGE_SIZE = 100;
const PAGE_COUNT = 5;

const TERMS = [
  "earnings", "eps", "revenue", "quarterly results", "quarterly earnings",
  "financial results", "guidance", "net income", "profit", "sales forecast",
  "earnings per share", "q1 results", "q2 results", "q3 results", "q4 results"
];

function textOf(event) {
  return [
    event?.title, event?.description, event?.slug,
    ...(event?.markets || []).flatMap((m) => [
      m?.question, m?.description, m?.slug
    ])
  ].filter(Boolean).join(" ").toLowerCase();
}

function isEarningsRelated(event) {
  const markets = Array.isArray(event?.markets)
    ? event.markets
    : [];

  // Only examine event titles and market questions.
  // Descriptions can contain unrelated financial keywords.
  const headlines = [
    event?.title,
    ...markets.map((market) => market?.question)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^\w\s$%.-]/g, " ");

  const patterns = [
    /\bearnings\b/,
    /\bearnings per share\b/,
    /\beps\b/,
    /\brevenue\b/,
    /\bquarterly results\b/,
    /\bquarterly earnings\b/,
    /\bfinancial results\b/,
    /\bnet income\b/,
    /\boperating income\b/,
    /\bgross profit\b/,
    /\bnet profit\b/,
    /\bearnings report\b/,
    /\bearnings call\b/,
    /\bearnings beat\b/,
    /\bearnings miss\b/,
    /\bbeat earnings\b/,
    /\bmiss earnings\b/,
    /\bbeat estimates\b/,
    /\bmiss estimates\b/,
    /\bq[1-4] earnings\b/,
    /\bq[1-4] results\b/,
    /\bquarterly revenue\b/,
    /\bquarterly profit\b/,
    /\bfiscal quarter\b/,
    /\bcompany earnings\b/,
    /\bcompany revenue\b/,
    /\b(?:report|post|announce|release)\w*.{0,30}\b(?:earnings|revenue|eps|financial results)\b/
  ];

  return patterns.some((pattern) => pattern.test(headlines));
}

function number(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function money(value) {
  const n = number(value);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function getVolume(event) {
  const direct = number(event?.volume24hr);
  if (direct) return direct;
  return (event?.markets || []).reduce((sum, market) => sum + number(market?.volume24hr), 0);
}

function marketCount(event) {
  return Array.isArray(event?.markets) ? event.markets.length : 0;
}

function marketUrl(event) {
  if (event?.slug) return `https://polymarket.com/event/${event.slug}`;
  const market = event?.markets?.[0];
  if (market?.slug) return `https://polymarket.com/market/${market.slug}`;
  return "https://polymarket.com";
}

function eventDate(event) {
  const date = event?.endDate || event?.startDate;
  if (!date) return "Date not listed";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Date not listed";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function App() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
const [eventsScanned, setEventsScanned] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("volume");

  async function loadEvents() {
  setStatus("loading");
  setError("");

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 20000);

  try {
    const response = await fetch(
      "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=500&order=volume24hr&ascending=false",
      {
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(
        `Polymarket returned HTTP ${response.status}`
      );
    }

    const payload = await response.json();

    if (!Array.isArray(payload)) {
      throw new Error(
        "Unexpected response from Polymarket."
      );
    }

    const uniqueEvents = new Map();

    payload.forEach((event) => {
      const key = event?.id || event?.slug;

      if (key) {
        uniqueEvents.set(key, event);
      }
    });

    const allEvents = [...uniqueEvents.values()];

    const matchingEvents = allEvents.filter(
      isEarningsRelated
    );

    setEventsScanned(allEvents.length);
    setEvents(matchingEvents);
    setLastUpdated(new Date());
    setStatus("ready");

  } catch (err) {
    setError(
      err?.name === "AbortError"
        ? "Request timed out. Please try again."
        : err?.message ||
          "Unable to connect to Polymarket."
    );

    setStatus("error");

  } finally {
    clearTimeout(timeout);
  }
}
  useEffect(() => {
    loadEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    let result = [...events];
    const q = query.trim().toLowerCase();
    if (q) result = result.filter((event) => textOf(event).includes(q));
    if (filter === "active") result = result.filter((event) => event.active !== false && event.closed !== true);
    if (filter === "volume") result = result.filter((event) => getVolume(event) >= 10_000);
    result.sort((a, b) => sort === "date"
      ? new Date(a.endDate || "2999-12-31") - new Date(b.endDate || "2999-12-31")
      : getVolume(b) - getVolume(a));
    return result;
  }, [events, query, filter, sort]);

  const totalVolume = events.reduce((sum, event) => sum + getVolume(event), 0);
  const highVolumeCount = events.filter((event) => getVolume(event) >= 10_000).length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Radar size={22} /></div>
          <div><span className="brand-name">Earnings Radar</span><span className="brand-sub">PREDICTION MARKET INTEL</span></div>
        </div>
        <div className="side-label">WORKSPACE</div>
        <div className="side-item active"><Activity size={17} /> Market scanner <span className="side-dot" /></div>
        <div className="side-item muted"><BarChart3 size={17} /> Market overview</div>
        <div className="side-item muted"><CalendarDays size={17} /> Earnings calendar <span className="soon">LATER</span></div>
        <div className="sidebar-bottom">
          <div className="connection-icon"><CheckCircle2 size={17} /></div>
          <div><strong>Read-only mode</strong><span>No wallet connected</span></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>Market scanner</strong></div>
          <div className={`live-pill ${status === "ready" ? "online" : ""}`}>
            <span className="pulse" /> {status === "ready" ? "DATA CONNECTION READY" : status === "error" ? "CONNECTION ISSUE" : "CONNECTING TO DATA"}
          </div>
        </header>

        <section className="page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> MARKET INTELLIGENCE</div>
            <h1>Earnings <span>Radar</span></h1>
            <p className="subtitle">Find prediction markets tied to company earnings, EPS and revenue.</p>
          </div>
          <button className="refresh-button" onClick={loadEvents} disabled={status === "loading"}>
            {status === "loading" ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
            Refresh data
          </button>
        </section>

        <section className="stats-grid">
          <StatCard
  icon={<Radar size={18} />}
  label="MATCHING EVENTS"
  value={status === "ready" ? events.length.toString() : "—"}
  note={
    status === "ready"
      ? `Scanned ${eventsScanned} events`
      : "Keyword-matched events"
  }
/>
          <StatCard icon={<TrendingUp size={18} />} label="MATCHED 24H VOLUME" value={status === "ready" ? money(totalVolume) : "—"} note="Sum of matched event volume" />
          <StatCard icon={<BarChart3 size={18} />} label="$10K+ VOLUME" value={status === "ready" ? highVolumeCount.toString() : "—"} note="Higher-volume opportunities" />
          <StatCard icon={<Activity size={18} />} label="DATA STATUS" value={status === "ready" ? "Online" : status === "error" ? "Issue" : "Loading"} note={lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for API response"} status={status} />
        </section>

        <section className="scanner-panel">
          <div className="panel-top">
            <div>
              <div className="section-title"><span className="section-icon"><Activity size={17} /></span> Earnings market scanner</div>
              <p className="panel-description">Markets are identified using keywords from public event data.</p>
            </div>
            <div className="result-count">{filteredEvents.length} <span>results</span></div>
          </div>

          <div className="toolbar">
            <label className="search-box">
              <Search size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company, ticker, EPS, revenue..." />
              {query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
            </label>
            <label className="sort-control"><span>Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="volume">24h volume</option>
                <option value="date">End date</option>
              </select>
            </label>
          </div>

          <div className="filter-row">
            <div className="filter-label"><Filter size={14} /> FILTER</div>
            {[
              ["all", "All matches"],
              ["active", "Active"],
              ["volume", "$10k+ volume"]
            ].map(([value, label]) => (
              <button key={value} className={`filter-chip ${filter === value ? "selected" : ""}`} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>

          {status === "loading" && (
            <div className="state-box"><LoaderCircle className="spin" size={25} /><strong>Scanning public markets…</strong><span>Fetching event data from Polymarket.</span></div>
          )}
          {status === "error" && (
            <div className="state-box error-state"><CircleAlert size={26} /><strong>We couldn't load market data</strong><span>{error}</span><button className="retry-button" onClick={loadEvents}>Try again</button></div>
          )}
          {status === "ready" && filteredEvents.length === 0 && (
            <div className="state-box"><Search size={24} /><strong>No matching markets found</strong><span>Try another search term or switch the filter to All matches.</span><button className="retry-button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button></div>
          )}
          {status === "ready" && filteredEvents.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>MARKET / EVENT</th><th>24H VOLUME</th><th>MARKETS</th><th>END DATE</th><th /></tr></thead>
                <tbody>
                  {filteredEvents.map((event, index) => (
                    <tr key={event.id || event.slug || index}>
                      <td>
                        <div className="event-cell">
                          <div className="event-icon">{(event.title || "E").trim().charAt(0).toUpperCase()}</div>
                          <div className="event-copy">
                            <a href={marketUrl(event)} target="_blank" rel="noreferrer">{event.title || "Untitled event"} <ExternalLink size={12} /></a>
                            <span>{event.slug ? event.slug.replaceAll("-", " ") : "Polymarket event"}</span>
                          </div>
                        </div>
                      </td>
                      <td><span className="volume-value">{money(getVolume(event))}</span></td>
                      <td><span className="market-count">{marketCount(event)}</span></td>
                      <td><span className="date-value">{eventDate(event)}</span></td>
                      <td><a className="open-link" href={marketUrl(event)} target="_blank" rel="noreferrer" aria-label="Open market"><ArrowUpRight size={17} /></a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="panel-footer"><span><span className="footer-dot" /> Public market data</span><span>Source: Polymarket Gamma API</span></div>
        </section>

        <section className="notice">
          <div className="notice-icon"><CircleAlert size={18} /></div>
          <div><strong>Research tool — not a verified earnings feed</strong><p>This first version searches a limited set of the most active public events and matches them by keywords. It can miss relevant markets or include false positives. Always open a market and read its resolution rules, source and deadline yourself. Volume is not a signal of probability or profitability.</p></div>
        </section>
        <footer className="footer"><span>EARINGS RADAR <span className="footer-sep">/</span> EARLY ACCESS</span><span><WalletCards size={14} /> No wallet connection · No trades placed</span></footer>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, note, status }) {
  return <div className="stat-card">
    <div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-label">{label}</span></div>
    <div className={`stat-value ${status === "error" ? "danger-text" : ""}`}>{value}</div>
    <div className="stat-note">{note}</div>
  </div>;
}
