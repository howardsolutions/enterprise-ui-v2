# Exercise 3: Streaming & Suspense

## What You're Doing

The analytics dashboard makes three API calls at different speeds: summary stats (200ms), chart data (800ms), and activity table (2000ms). Right now, the entire page shows a single loading spinner until all three resolve. You're going to add Suspense boundaries around each section and implement `renderToPipeableStream` for streaming SSR so each section renders progressively as its data arrives.

## Why It Matters

Suspense boundaries are architectural decisions, not styling choices. Where you place them determines what the user sees while waiting, what streams in together versus independently, and how your loading states compose across package boundaries. In a monorepo with feature packages that each fetch their own data, getting this right means the difference between a responsive application and one that feels frozen for two seconds every page load.

## Prerequisites

- Node.js 20+
- pnpm 9+

## Setup

```bash
git checkout 02-streaming-start
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Step 1: Understand the Data Fetching Pattern

Start by reading how the analytics dashboard currently loads data.

### What to Look At

1. Open `packages/analytics/src/analytics-dashboard.tsx`. The component renders three children: `StatsBar`, `Chart`, and `BigTable`. Each child fetches its own data independently inside a `useEffect`.

2. Open `packages/analytics/src/stats-bar.tsx`. It fetches from `/api/analytics/summary`:

```typescript
useEffect(() => {
  apiClient<SummaryStats>("/api/analytics/summary").then(setData);
}, []);
```

This endpoint responds in 200ms.

3. Open `packages/analytics/src/chart.tsx`. It fetches from `/api/analytics/chart`:

```typescript
useEffect(() => {
  apiClient<ChartDataPoint[]>(`/api/analytics/chart?range=${range}`).then(setData);
}, [range]);
```

This endpoint responds in 800ms.

4. Open `packages/analytics/src/big-table.tsx`. It fetches from `/api/analytics/table`:

```typescript
useEffect(() => {
  apiClient<PaginatedResponse<TableRow>>("/api/analytics/table?page=1").then(setData);
}, []);
```

This endpoint responds in 2000ms.

> [!NOTE]
> **Why each component fetches its own data:** This is a deliberate architectural choice. The alternative — fetching all three datasets in the parent `AnalyticsDashboard` and passing them as props — would force the parent to wait for all three responses before rendering anything. By colocating data fetching with the component that needs it, each section can render independently as soon as its data arrives. This pattern is what makes Suspense boundaries useful: they give React the granularity to show partial results while other fetches are still in flight.

5. Open `mocks/src/handlers.ts` and find the three analytics endpoints. Note the `delay()` calls — 200ms, 800ms, and 2000ms. These are deterministic, not randomized.

### Checkpoint

You should see the dashboard loading at `http://localhost:5173`. Right now all three sections appear together after the slowest response (the table at ~2000ms). While waiting, the entire analytics area shows a single loading state.

---

## Step 2: Add Individual Suspense Boundaries

Wrap each analytics child component in its own `<Suspense>` boundary so they can render independently.

1. Open `packages/analytics/src/analytics-dashboard.tsx`. You should see the three components rendered together without individual Suspense boundaries:

```typescript
export function AnalyticsDashboard() {
  return (
    <div>
      <h1>Analytics</h1>
      <StatsBar />
      <Chart />
      <BigTable />
    </div>
  );
}
```

2. Import `Suspense` from React and `LoadingSkeleton` from `@pulse/ui`:

```typescript
import { Suspense } from "react";
import { LoadingSkeleton } from "@pulse/ui";
```

3. Wrap each child in its own Suspense boundary with a skeleton fallback:

```typescript
export function AnalyticsDashboard() {
  return (
    <div>
      <h1>Analytics</h1>
      <Suspense fallback={<LoadingSkeleton variant="card" />}>
        <StatsBar />
      </Suspense>
      <Suspense fallback={<LoadingSkeleton variant="chart" />}>
        <Chart />
      </Suspense>
      <Suspense fallback={<LoadingSkeleton variant="table" />}>
        <BigTable />
      </Suspense>
    </div>
  );
}
```

> [!IMPORTANT]
> **Suspense only works with suspending data sources.** A plain `useEffect` + `useState` fetch does not suspend — it returns `null` on the first render and updates state after the fetch completes. For these Suspense boundaries to actually work, the child components need to use a data source that throws a promise during loading (React's mechanism for signaling "not ready yet"). On this branch, the components use a `use()` hook or a suspense-compatible fetch wrapper that throws a promise while the data is in flight. If you see the skeletons flash and then all three sections still appear together, check that the data fetching approach actually suspends.

4. Save and reload the page. Watch the rendering sequence:
   - The page shell (sidebar, header) renders immediately
   - `StatsBar` appears after ~200ms with the skeleton disappearing
   - `Chart` appears after ~800ms
   - `BigTable` appears after ~2000ms

### Checkpoint

Each section of the analytics dashboard now loads independently. The stats bar with its four metric cards appears first, the chart follows about 600ms later, and the table arrives last. Each shows its own skeleton placeholder while loading.

---

## Step 3: Implement Streaming SSR with `renderToPipeableStream`

Now wire up server-side rendering so the initial HTML streams progressively, not just the client-side updates.

1. Open `apps/dashboard/src/entry-server.tsx`. You should see a TODO stub:

```typescript
// TODO: Exercise 3 — Implement streaming SSR
// Use renderToPipeableStream from react-dom/server
// Pipe the app through a Writable stream
// Add Suspense boundaries around AnalyticsDashboard components
```

2. Replace the stub with a streaming SSR implementation:

```typescript
import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { App } from "./app";
import type { Request, Response } from "express";

export function render(req: Request, res: Response) {
  const { pipe } = renderToPipeableStream(
    <StaticRouter location={req.url}>
      <App />
    </StaticRouter>,
    {
      bootstrapScripts: ["/src/main.tsx"],
      onShellReady() {
        res.setHeader("Content-Type", "text/html");
        pipe(res);
      },
      onError(error) {
        console.error("SSR error:", error);
        res.statusCode = 500;
      },
    },
  );
}
```

> [!NOTE]
> **`onShellReady` vs. `onAllReady`:** The `renderToPipeableStream` API gives you two callback options for when to start piping HTML to the client. `onShellReady` fires as soon as everything *outside* of Suspense boundaries has rendered — the app shell, navigation, and skeleton fallbacks. Content inside Suspense boundaries streams in later as each one resolves. `onAllReady` waits until everything has resolved, including all Suspense boundaries — this gives you the old "wait for everything" behavior. For progressive rendering, always use `onShellReady`. Use `onAllReady` only for static site generation or crawlers that need complete HTML.

3. The key insight: the Suspense boundaries you added in Step 2 serve double duty. On the client, they show skeleton fallbacks while data loads. On the server, they tell `renderToPipeableStream` where to split the HTML stream. The server sends the shell immediately (with skeleton placeholders embedded in the HTML), then sends replacement HTML for each Suspense boundary as it resolves.

> [!NOTE]
> **How streaming replacement works under the hood:** When `onShellReady` fires, React sends the complete HTML for the shell — including the fallback content of each Suspense boundary rendered as real HTML (the skeleton components). As each Suspense boundary resolves on the server, React sends a `<script>` tag containing the resolved HTML and a tiny function that swaps it into the right place in the DOM. The browser executes this inline script immediately, replacing the skeleton with the final content — no JavaScript framework needed for the swap. This is why the page appears to "fill in" progressively even before React hydrates on the client.

### Checkpoint

If you have a server-side setup (Express or Vite SSR middleware), the initial HTML response now streams progressively. View the page source — you should see skeleton HTML first, followed by `<script>` tags that inject the resolved content for each Suspense boundary.

---

## Step 4: Experiment with Boundary Placement

The placement of Suspense boundaries changes the user experience. Try different configurations to feel the trade-offs.

### Configuration A: One Boundary Around Everything

```typescript
<Suspense fallback={<LoadingSkeleton variant="page" />}>
  <StatsBar />
  <Chart />
  <BigTable />
</Suspense>
```

This is the "all or nothing" approach. The entire analytics area shows a single skeleton until the slowest component (BigTable at 2000ms) resolves. The fast StatsBar data sits unused for 1800ms.

### Configuration B: Individual Boundaries (Current)

```typescript
<Suspense fallback={<LoadingSkeleton variant="card" />}>
  <StatsBar />
</Suspense>
<Suspense fallback={<LoadingSkeleton variant="chart" />}>
  <Chart />
</Suspense>
<Suspense fallback={<LoadingSkeleton variant="table" />}>
  <BigTable />
</Suspense>
```

Each section renders as soon as its data is ready. Maximum progressiveness, but the page shifts layout three times as sections pop in.

### Configuration C: Grouped Boundaries

```typescript
<Suspense fallback={<LoadingSkeleton variant="card" />}>
  <StatsBar />
</Suspense>
<Suspense fallback={<LoadingSkeleton variant="content" />}>
  <Chart />
  <BigTable />
</Suspense>
```

Stats bar streams in first (fast feedback), then chart and table appear together when the table resolves. Two layout shifts instead of three. The chart data is ready at 800ms but waits until 2000ms to render because it shares a boundary with BigTable.

> [!IMPORTANT]
> **There is no universally correct placement.** Configuration B gives the fastest time-to-first-content, but causes three layout shifts. Configuration C reduces layout shifts but delays the chart by 1200ms. Configuration A has the worst time-to-first-content but zero layout shifts. The right choice depends on your product: a real-time dashboard benefits from progressive rendering (B), while a data-dense report might prefer the stability of grouped boundaries (C). This is why Suspense boundaries are architectural decisions — they encode product priorities into your component tree.

### Try Each One

Switch between configurations A, B, and C. Watch the network waterfall in DevTools and pay attention to how the page feels as a user. Settle on whichever approach you prefer and leave it in place.

### Checkpoint

You've tried at least two different Suspense boundary placements and observed how each changes the loading experience. You can articulate the trade-off between time-to-first-content and layout stability.

---

## Stretch Goals

- **Add error boundaries alongside Suspense boundaries:** Wrap each Suspense boundary in an `ErrorBoundary` from `@pulse/ui`. Stop the mock API for one endpoint (modify the MSW handler to return a 500) and verify the error boundary catches it without crashing the rest of the dashboard.
- **Nested Suspense:** Add a Suspense boundary inside `BigTable` around the pagination controls. When the user changes pages, the table header stays visible while only the rows show a loading state.
- **`useTransition` for navigation:** Wrap route changes in `useTransition` so the previous route stays visible while the next route's data loads, instead of showing a page-level skeleton.

---

## Solution

The completed implementation is on the next branch:

```bash
git checkout 03-monorepo-start
```

---

## What's Next

You've seen how Suspense boundaries control the loading experience across independently-fetching components. The dashboard now has multiple packages (analytics, ui, shared) but no build orchestration — `pnpm -r build` rebuilds everything every time. In the next exercise, you'll add Turborepo to get cached, dependency-aware builds and feel the difference when a second build takes near-zero time.
