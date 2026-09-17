import * as Sentry from "@sentry/react";

// DSNs are safe to embed in client-side code - they only let events be
// sent TO this project, not read anything back out. Kept deliberately
// minimal: error capture only, no performance tracing or session replay,
// since neither is needed to answer "did a real user hit a failed
// request" - the actual gap this is closing.
Sentry.init({
  dsn: "https://4a78d8f837739c16ae5490ba507ede8e@o4512099059630080.ingest.us.sentry.io/4512099098099712",
});
