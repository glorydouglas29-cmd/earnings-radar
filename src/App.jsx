import { useEffect, useMemo, useState } from "react";
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

  const titleText = [
    event?.title,
    event?.slug,
    ...markets.flatMap((market) => [
      market?.question,
      market?.slug
    ])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[-_]/g, " ");

  const descriptionText = [
    event?.description,
    ...markets.map((market) => market?.description)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Strong indicators that the market concerns company financial results.
  const earningsTerms = [
    "earnings",
    "earnings per share",
    " eps ",
    "quarterly results",
    "quarterly earnings",
    "financial results",
    "net income",
    "revenue",
    "profit forecast",
    "earnings beat",
    "earnings miss",
    "beat estimates",
    "miss estimates",
    "q1 earnings",
    "q2 earnings",
    "q3 earnings",
    "q4 earnings",
    "q1 results",
    "q2 results",
    "q3 results",
    "q4 results",
    "quarterly revenue",
    "quarterly profit",
    "fiscal quarter",
    "company earnings",
    "company revenue",
    "earnings report",
    "earnings call"
  ];

  const hasEarningsTerm = earningsTerms.some((term) =>
    ` ${titleText} `.includes(term)
  );

  if (hasEarningsTerm) {
    return true;
  }

  // Use descriptions as a secondary signal to catch differently worded
  // markets, but require both a financial term and an earnings context.
  const financialTerms = [
    "revenue",
    "earnings",
    "eps",
    "net income",
    "operating income",
    "gross profit",
    "net profit",
    "sales",
    "profit"
  ];

  const earningsContext = [
    "quarter",
    "quarterly",
    "fiscal year",
    "financial results",
    "earnings report",
    "earnings call",
    "reported results"
  ];

  const hasFinancialTerm = financialTerms.some((term) =>
    descriptionText.includes(term)
  );

  const hasEarningsContext = earningsContext.some((term) =>
    descriptionText.includes(term)
  );

  return hasFinancialTerm && hasEarningsContext;
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("volume");

  async function loadEvents() {
  setStatus("loading");
  setError("");

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 30000);

  try {
    const pageSize = 100;
    const pageCount = 10;

    // Request 10 pages of 100 events.
    const requests = Array.from(
      { length: pageCount },
      (_, page) => {
        const params = new URLSearchParams({
          active: "true",
          closed: "false",
          limit: String(pageSize),
          offset: String(page * pageSize),
          order: "volume24hr",
          ascending: "false"
        });

        return fetch(
          `${API_BASE}?${params.toString()}`,
          {
            headers: {
              Accept: "application/json"
            },
            signal: controller.signal
          }
        );
      }
    );

    const responses = await Promise.all(requests);

    const failedResponse = responses.find(
      (response) => !response.ok
    );

    if (failedResponse) {
      throw new Error(
        `Polymarket returned HTTP ${failedResponse.status}`
      );
    }

    const pages = await Promise.all(
      responses.map((response) => response.json())
    );

    if (!pages.every(Array.isArray)) {
      throw new Error(
        "Unexpected response from the Polymarket API."
      );
    }

    // Remove duplicate events.
    const uniqueEvents = new Map();

    pages.flat().forEach((event) => {
      const key = event?.id || event?.slug;

      if (key) {
        uniqueEvents.set(key, event);
      }
    });

    const allEvents = [...uniqueEvents.values()];

    // Find earnings-related events.
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
        ? "The market-data request timed out. Please try again."
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
          <StatCard icon={<Radar size={18} />} label="MATCHING EVENTS" value={status === "ready" ? events.length.toString() : "—"} note="Keyword-matched events" />
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
