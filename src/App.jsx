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

      setEvents(matchingEvents);
      setLastUpdated(new Date());
      setStatus("ready");
    } catch (err) {
      console.error("Earnings Radar API error:", err);

      let message;

      if (err?.name === "AbortError") {
        message =
          "The request timed out after 45 seconds. Please try again.";
      } else {
        message =
          err?.message ||
          "An unknown error occurred while loading market data.";
      }

      set