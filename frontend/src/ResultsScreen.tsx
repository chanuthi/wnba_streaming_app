import { useState, useEffect } from "react";
import * as Sentry from "@sentry/react";
import type { RecommendationResult, Team, Game } from "./types";
import { API_BASE_URL } from "./api/config";
import { logoUrl } from "./teamLogo";
import "./ResultsScreen.css";

function formatPrice(price: number | null): string {
  if (price === null) return "price unknown";
  return price === 0 ? "Free" : `$${price.toFixed(2)}/mo`;
}

function formatGameDate(iso: string): { day: string; date: string; time: string } {
  // The backend returns naive timestamps ("2026-04-29T23:00:00") that are
  // actually UTC (sourced from ESPN's API) but carry no timezone marker.
  // Without one, JS's Date parser assumes the string is already in the
  // viewer's local time and does no conversion at all - appending "Z"
  // marks it as UTC so it converts to whatever timezone this device is
  // actually in, instead of just echoing back the raw UTC hour.
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return {
    day: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
    date: d.toLocaleDateString(undefined, { day: "2-digit" }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

interface ResultsScreenProps {
  team: Team;
  zipCode: string;
  onZipChange: (newZip: string) => void;
  onBackToTeam: () => void;
}

function ResultsScreen({ team, zipCode, onZipChange, onBackToTeam }: ResultsScreenProps) {
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upcomingGames, setUpcomingGames] = useState<Game[]>([]);

  // Local state just for the slide-out editor bar itself
  const [editorOpen, setEditorOpen] = useState(false);
  const [zipDraft, setZipDraft] = useState(zipCode);

  // Re-fetches every time team OR zipCode changes - this is what makes
  // "change your zip" actually update the results without a page reload.
  useEffect(() => {
    setResult(null); // show "Loading..." again while the new fetch is in flight
    fetch(`${API_BASE_URL}/recommend?team_id=${team.id}&zip_code=${zipCode}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }
        return response.json();
      })
      .then((data: RecommendationResult) => setResult(data))
      .catch((err) => {
        Sentry.captureException(err);
        setError(err.message);
      });
  }, [team.id, zipCode]);

  // Separate fetch from /recommend - this just lists the next handful of
  // games on the schedule, not coverage math, so it only needs to re-run
  // when the team changes (not on every zip edit).
  useEffect(() => {
    setUpcomingGames([]);
    const startDate = new Date().toISOString();
    fetch(`${API_BASE_URL}/games?team_id=${team.id}&start_date=${startDate}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`Server responded with ${response.status}`))))
      .then((data: Game[]) => setUpcomingGames(data.slice(0, 6)))
      .catch((err) => Sentry.captureException(err));
  }, [team.id]);

  function handleZipUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{5}$/.test(zipDraft)) return; // silently ignore invalid input for now
    onZipChange(zipDraft);
    setEditorOpen(false);
  }

  if (error) {
    return <div className="results-body">Failed to load recommendation: {error}</div>;
  }

  return (
    <div className="results-body">
      <div className="results-topbar">
        <button className="pill-button" onClick={onBackToTeam}>&larr; Change team</button>

        {/* The small arrow button that reveals the zip-editing bar */}
        <button className="pill-button" onClick={() => setEditorOpen(!editorOpen)}>
          {editorOpen ? "▲" : "▼"} Zip: {zipCode}
        </button>
      </div>

      {editorOpen && (
        <div className="zip-editor">
          <form onSubmit={handleZipUpdate}>
            <input
              type="text"
              value={zipDraft}
              onChange={(e) => setZipDraft(e.target.value)}
              maxLength={5}
            />
            <button type="submit">Update</button>
          </form>
        </div>
      )}

      <div className="results-content">
        <div className="results-header">
          <img className="results-team-logo" src={logoUrl(team)} alt={`${team.name} logo`} />
          <div className="results-header-text">
            <h1>{team.name}</h1>
            <p className="results-note">
              {result
                ? result.in_market
                  ? "You're in this team's home market."
                  : "You're outside this team's home market."
                : "Loading recommendation..."}
            </p>
          </div>
        </div>

        {result && (
          <>
          <div className="bento-stats">
            <div className="stat-tile">
              <div className="stat-tile-value">{result.total_games}</div>
              <div className="stat-tile-label">Games this season</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-value">{result.coverable_games}</div>
              <div className="stat-tile-label">Coverable via streaming</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-value">
                {result.not_listed_games + result.in_market_local_only_games}
              </div>
              <div className="stat-tile-label">Not available anywhere</div>
            </div>
          </div>

          {result.in_market_local_only_games > 0 && (
            <p className="results-note results-note-warning">
              {result.in_market_local_only_games} game(s) are local broadcasts only in your
              market - not available on any streaming service, you'll need local TV/cable.
            </p>
          )}

          <div className="bento-grid">
            {result.best_two_service_combo ? (
              <div className="combo-hero">
                <p className="combo-hero-label">Best fit for your watchlist</p>
                <h3 className="combo-hero-title">{result.best_two_service_combo.services.join(" + ")}</h3>
                <p className="combo-hero-meta">
                  Covers {result.best_two_service_combo.games_covered} of {result.coverable_games} coverable games
                  without asking you to pay for two subscriptions that overlap —{" "}
                  <strong>{result.best_two_service_combo.services[0]}</strong> gets you{" "}
                  {result.best_two_service_combo.unique_to_first} game(s) the other doesn't, and vice versa for{" "}
                  {result.best_two_service_combo.unique_to_second}.
                </p>
                <div className="combo-hero-figures">
                  <div>
                    <div className="combo-hero-figure-value">
                      {formatPrice(result.best_two_service_combo.total_monthly_price)}
                    </div>
                    <div className="combo-hero-figure-label">per month</div>
                  </div>
                  <div>
                    <div className="combo-hero-figure-value">{result.best_two_service_combo.games_covered}</div>
                    <div className="combo-hero-figure-label">games covered</div>
                  </div>
                  <div>
                    <div className="combo-hero-figure-value">{result.best_two_service_combo.pct_of_coverable}%</div>
                    <div className="combo-hero-figure-label">coverage</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="combo-hero combo-hero-empty">
                <p className="combo-hero-label">Best fit for your watchlist</p>
                <p className="combo-hero-meta">
                  A single subscription already covers everything worth combining here — see the pick alongside this card.
                </p>
              </div>
            )}

            {result.best_single_service && (
              <div className="single-card">
                <p className="results-card-label">Best single subscription</p>
                <div className="results-card-title">
                  <span>{result.best_single_service.service}</span>
                  <span className="price-badge">{formatPrice(result.best_single_service.monthly_price)}</span>
                </div>
                <p className="results-card-meta">
                  Covers {result.best_single_service.games_covered} games ({result.best_single_service.pct_of_coverable}%)
                  {result.best_single_service.monthly_price !== null &&
                    result.best_single_service.monthly_price > 0 &&
                    result.best_single_service.cost_per_game !== null && (
                      <> — ${result.best_single_service.cost_per_game.toFixed(2)}/game</>
                  )}
                </p>
              </div>
            )}
          </div>

          {upcomingGames.length > 0 && (
            <div className="coming-up-card">
              <div className="coming-up-header">
                <h2>Coming up</h2>
              </div>
              <ul className="coming-up-list">
                {(() => {
                  // What's actually being recommended above - a game whose only
                  // way to watch isn't one of these would contradict the "Best
                  // fit" card if badged with that other service as if it were
                  // just as good a match.
                  const recommendedServices =
                    result.best_two_service_combo?.services ??
                    (result.best_single_service ? [result.best_single_service.service] : []);

                  return upcomingGames.map((g) => {
                    const opponent = g.home_team === team.name ? g.away_team : g.home_team;
                    const { day, date, time } = formatGameDate(g.game_datetime);
                    // Prefer showing whichever recommended service covers this
                    // game (if any) over an arbitrary first entry, so the label
                    // agrees with the "Best fit" card above it.
                    const inPlan = g.streaming_services.find((s) => recommendedServices.includes(s));
                    const badgeText =
                      inPlan ??
                      (g.status === "streaming"
                        ? g.streaming_services[0]
                        : g.status === "local_broadcast"
                        ? "Local TV"
                        : g.network ?? "Not listed");

                    return (
                      <li key={g.id} className="coming-up-row">
                        <div className="coming-up-row-top">
                          <div className="coming-up-date">
                            <span className="coming-up-month">{day}</span>
                            <span className="coming-up-day">{date}</span>
                          </div>
                          <div className="coming-up-time">{time}</div>
                        </div>
                        <div className="coming-up-matchup">
                          @ {opponent}
                        </div>
                        <span className={`coming-up-badge coming-up-badge-${g.status}`}>{badgeText}</span>
                      </li>
                    );
                  });
                })()}
              </ul>
            </div>
          )}

          <h2>Full breakdown</h2>
          <ul className="breakdown-list">
            {result.service_breakdown.map((s) => (
              <li key={s.service} className="breakdown-row">
                <div className="breakdown-row-top">
                  <span className="breakdown-service">{s.service}</span>
                  <span className="breakdown-price">
                    {formatPrice(s.monthly_price)}
                    {s.monthly_price !== null && s.monthly_price > 0 && s.cost_per_game !== null && (
                      <> · ${s.cost_per_game.toFixed(2)}/game</>
                    )}
                  </span>
                </div>
                <div className="breakdown-meta">
                  {s.games_covered} games ({s.pct_of_coverable}%)
                </div>
                <div className="breakdown-bar-track">
                  <div className="breakdown-bar-fill" style={{ width: `${s.pct_of_coverable}%` }} />
                </div>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>
    </div>
  );
}

export default ResultsScreen;