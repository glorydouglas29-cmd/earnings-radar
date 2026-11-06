import { useEffect, useMemo, useState } from "react";

import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Filter,
  LoaderCircle,
  Radar,
  RefreshCw,
  Search,
  TrendingUp,
  WalletCards,
} from "lucide-react";

const API_BASE = "https://gamma-api.polymarket.com/events";

const PAGE_SIZE = 100;
const PAGE_COUNT = 5;

function textOf(event) {
  return [
    event?.title,
    event?.description,
    event?.slug,
    ...(event?.markets || []).flatMap((market) => [
      market?.question,
      market?.description,
      market?.slug,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isEarningsRelated(event) {
  const headlines = [
    event?.title,
    ...(event?.markets || []).map((market) => market?.question),
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
    /\bfinancial performance\b/,
    /\bquarterly revenue\b/,
    /\bearnings per share\b/,
    /\bprofit forecast\b/,
    /\brevenue forecast\b/,
    /\bearnings forecast\b/,
    /\bfinancial results\b/,
  ];

  return patterns.some((pattern) => pattern.test(headlines));
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  const n = number(value);

  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}m`;
  }

  if (n >= 1_000) {
    return `$${(n / 1_000).toFixed(1)}k`;
  }

  return `$${Math.round(n).toLocaleString()}`;
}

function getVolume(event) {
  const direct = number(event?.volume24hr);

  if (direct) return direct;

  return (event?.markets || []).reduce(
    (sum, market) => sum + number(market?.volume24hr),
    0
  );
}

function marketCount(event) {
  return Array.isArray(event?.markets)
    ? event.markets.length
    : 0;
}

function marketUrl(event) {
  if (event?.slug) {
    return `https://polymarket.com/event/${event.slug}`;
  }

  const market = event?.markets?.[0];

  if (market?.slug) {
    return `https://polymarket.com/market/${market.slug}`;
  }

  return "https://polymarket.com";
}

function eventDate(event) {
  const date = event?.endDate || event?.startDate;

  if (!date) return "Date not listed";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Date not listed";
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function fetchEventPage(offset, signal) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });

  const response = await fetch(
    `${API_BASE}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal,
    }
  );

  if (!response.ok) {
    let details = "";

    try {
      details = await response.text();
    } catch {
      details = "Could not read the API error response.";
    }

    throw new Error(
      `Polymarket API HTTP ${response.status}. ${details.slice(0, 700)}`
    );
  }

  const payload = await response.json();

  if (!Array.isArray(payload)) {
    throw new Error(
      "The Polymarket API returned data in an unexpected format."
    );
  }

  return payload;
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
    }, 45000);

    try {
      // Request several pages of public event data.
      // Using limit and offset avoids relying on server-side
      // active/closed filters that may cause request errors.
      const requests = Array.from(
        { length: PAGE_COUNT },
        (_, index) =>
          fetchEventPage(
            index * PAGE_SIZE,
            controller.signal
          )
      );

      const pages = await Promise.all(requests);

      const uniqueEvents = new Map();

      pages.flat().forEach((event) => {
        const key = event?.id || event?.slug;

        if (key) {
          uniqueEvents.set(key, event);
        }
      });

      const allEvents = [...uniqueEvents.values()];

      setEventsScanned(allEvents.length);

      // Keep active, open events where those properties exist.
      const openEvents = allEvents.filter(
        (event) =>
          event.active !== false &&
          event.closed !== true
      );

      const matchingEvents = openEvents.filter(
        isEarningsRelated
      );

            setError(message);
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

    if (query.trim()) {
      const searchTerm = query.toLowerCase();

      result = result.filter((event) =>
        textOf(event).includes(searchTerm)
      );
    }

    if (filter === "high-volume") {
      result = result.filter(
        (event) => getVolume(event) >= 10000
      );
    }

    if (filter === "multiple-markets") {
      result = result.filter(
        (event) => marketCount(event) > 1
      );
    }

    result.sort((a, b) => {
      if (sort === "volume") {
        return getVolume(b) - getVolume(a);
      }

      if (sort === "newest") {
        return (
          new Date(b.startDate || 0).getTime() -
          new Date(a.startDate || 0).getTime()
        );
      }

      return a.title?.localeCompare(b.title || "") || 0;
    });

    return result;
  }, [events, query, filter, sort]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-cyan-400">
              <Radar size={24} />
              <span className="font-semibold tracking-widest">
                EARNINGS RADAR
              </span>
            </div>

            <h1 className="text-3xl font-bold sm:text-4xl">
              Earnings Market Scanner
            </h1>

            <p className="mt-2 text-slate-400">
              Discover prediction markets related to company earnings,
              EPS, revenue and financial performance.
            </p>
          </div>

          <button
            onClick={loadEvents}
            disabled={status === "loading"}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50"
          >
            <RefreshCw
              size={18}
              className={
                status === "loading" ? "animate-spin" : ""
              }
            />
            Refresh markets
          </button>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <Activity className="mb-3 text-cyan-400" />
            <p className="text-sm text-slate-400">
              Events scanned
            </p>
            <p className="mt-1 text-3xl font-bold">
              {eventsScanned}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <BarChart3 className="mb-3 text-emerald-400" />
            <p className="text-sm text-slate-400">
              Earnings matches
            </p>
            <p className="mt-1 text-3xl font-bold">
              {events.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <CheckCircle2 className="mb-3 text-purple-400" />
            <p className="text-sm text-slate-400">
              Connection status
            </p>
            <p className="mt-1 text-xl font-bold">
              {status === "loading"
                ? "Loading..."
                : status === "ready"
                  ? "Connected"
                  : "Needs attention"}
            </p>
            {lastUpdated && (
              <p className="mt-1 text-xs text-slate-500">
                Updated {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
        </section>

        {error && (
          <div className="mb-6 flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            <CircleAlert className="shrink-0" size={20} />
            <div>
              <p className="font-semibold">
                Could not load market data
              </p>
              <p className="mt-1 break-words text-sm">
                {error}
              </p>
            </div>
          </div>
        )}

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-3.5 text-slate-500"
              size={18}
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search companies or markets..."
              className="w-full rounded-xl border border-slate-800 bg-slate-900 py-3 pl-10 pr-3 outline-none focus:border-cyan-500"
            />
          </div>

          <div className="relative">
            <Filter
              className="absolute left-3 top-3.5 text-slate-500"
              size={18}
            />
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 py-3 pl-10 pr-3 outline-none focus:border-cyan-500"
            >
              <option value="all">All earnings markets</option>
              <option value="high-volume">
                High volume ($10k+)
              </option>
              <option value="multiple-markets">
                Multiple markets
              </option>
            </select>
          </div>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 outline-none focus:border-cyan-500"
          >
            <option value="volume">Sort by trading volume</option>
            <option value="newest">Sort by start date</option>
            <option value="title">Sort alphabetically</option>
          </select>
        </section>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            Earnings markets
          </h2>
          <span className="text-sm text-slate-400">
            {filteredEvents.length} results
          </span>
        </div>

        {status === "loading" && events.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
            <LoaderCircle
              className="mx-auto mb-4 animate-spin text-cyan-400"
              size={32}
            />
            <p className="font-semibold">
              Scanning Polymarket...
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Searching public event data for earnings-related markets.
            </p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
            <Search
              className="mx-auto mb-4 text-slate-500"
              size={32}
            />
            <p className="font-semibold">
              No matching markets found
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Try another search term or refresh the data.
              The scanner currently checks up to 500 events.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredEvents.map((event) => (
              <article
                key={event.id || event.slug}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-cyan-500/50"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-cyan-400">
                    <TrendingUp size={15} />
                    EARNINGS MARKET
                  </div>

                  <span className="whitespace-nowrap text-xs text-slate-400">
                    {eventDate(event)}
                  </span>
                </div>

                <h3 className="text-lg font-semibold leading-snug">
                  {event.title || "Untitled market"}
                </h3>

                {event.description && (
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-400">
                    {event.description}
                  </p>
                )}

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-800/70 p-3">
                    <p className="text-xs text-slate-400">
                      Trading volume
                    </p>
                    <p className="mt-1 font-bold">
                      {money(getVolume(event))}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-800/70 p-3">
                    <p className="text-xs text-slate-400">
                      Markets in event
                    </p>
                    <p className="mt-1 font-bold">
                      {marketCount(event)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                  <span className="flex items-center gap-2 text-xs text-slate-400">
                    <CalendarDays size={14} />
                    {eventDate(event)}
                  </span>

                  <a
                    href={marketUrl(event)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950"
                  >
                    View on Polymarket
                    <ArrowUpRight size={16} />
                    <ExternalLink size={14} />
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="mt-10 border-t border-slate-800 pt-5 text-xs leading-relaxed text-slate-500">
          <p>
            Data is retrieved from Polymarket's public event API.
            Markets are identified using earnings-related keywords;
            this does not guarantee that every result is an earnings
            market or that every earnings market will be found.
          </p>
          <p className="mt-2 flex items-center gap-2">
            <WalletCards size={14} />
            Always open the original market to verify its question,
            resolution criteria and current trading activity.
          </p>
        </footer>
      </div>
    </main>
  );
}