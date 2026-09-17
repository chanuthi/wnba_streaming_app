import * as Sentry from "@sentry/react";

// DSNs are safe to embed in client-side code - they only let events be
// sent TO this project, not read anything back out. Kept deliberately
// minimal: error capture only, no performance tracing or session replay,
// since neither is needed to answer "did a real user hit a failed
// request" - the actual gap this is closing.
Sentry.init({
  dsn: "https://41c596dae9ac01b33323ad1fb4228448@o4512099059630080.ingest.us.sentry.io/4512099081125888",
});
