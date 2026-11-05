# Earnings Radar

A responsive React + Vite dashboard that scans public Polymarket event data for markets that may relate to company earnings, EPS, revenue, financial results, and guidance.

## Features

- Public Polymarket Gamma API integration (no API key required for this endpoint).
- Keyword-based event matching.
- Search, volume filters, and sorting.
- 24-hour volume summary cards.
- Direct links to the original Polymarket events.
- Mobile-friendly layout.
- No wallet connection and no trading functionality.

## Run locally

Requirements: Node.js 18+.

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy to Vercel

1. Upload these project files to the root of your GitHub repository.
2. In Vercel, import the `earnings-radar` GitHub repository.
3. Use the Vite defaults:
   - Framework preset: Vite
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy.

No environment variables are required for this first version.

## Important limitations

This is an early research prototype, not a verified earnings-market feed. It requests a limited batch of the most active events and uses keywords to identify possible matches. It can miss relevant events or include unrelated ones. Before relying on a market, open it on Polymarket and inspect its exact question, resolution source, cutoff time, and rules.

The public API or browser/network conditions may prevent requests from succeeding at some times. Volume is not a prediction of probability or profitability. This tool does not place trades or connect to wallets.
