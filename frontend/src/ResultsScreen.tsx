import { useState, useEffect } from "react";
import * as Sentry from "@sentry/react";
import type { RecommendationResult, Team } from "./types";
import { API_BASE_URL } from "./api/config";
import { logoUrl } from "./teamLogo";
import "./ResultsScreen.css";

function formatPrice(price: number | null): string {
  if (price === null) return "price unknown";
  return price === 0 ? "Free" : `$${price.toFixed(2)}/mo`;
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
          <div className="results-stats">
            <div className="stat-tile">
              <div className="stat-tile-value">{result.total_games}</div>
              <div className="stat-tile-label">Total games</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-value">{result.coverable_games}</div>
              <div className="stat-tile-label">Coverable via streaming</div>
            </div>
          </div>

          {result.in_market_local_only_games > 0 && (
            <p className="results-note results-note-warning">
              {result.in_market_local_only_games} game(s) are local broadcasts only in your
              market - not available on any streaming service, you'll need local TV/cable.
            </p>
          )}

          {result.best_single_service && (
            <div className="results-card">
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

          {result.best_two_service_combo && (
            <div className="results-card">
              <p className="results-card-label">Best combo</p>
              <div className="results-card-title">
                <span>{result.best_two_service_combo.services.join(" + ")}</span>
                <span className="price-badge">
                  {formatPrice(result.best_two_service_combo.total_monthly_price)} total
                </span>
              </div>
              <p className="results-card-meta">
                Covers {result.best_two_service_combo.games_covered} games ({result.best_two_service_combo.pct_of_coverable}%)
              </p>
              <p className="results-card-meta">
                <strong>{result.best_two_service_combo.services[0]}</strong> gets you{" "}
                {result.best_two_service_combo.unique_to_first} game(s){" "}
                <strong>{result.best_two_service_combo.services[1]}</strong> doesn't have, and vice versa
                for {result.best_two_service_combo.unique_to_second} game(s)
                {result.best_two_service_combo.overlap > 0 && (
                  <> ({result.best_two_service_combo.overlap} game(s) covered by both, no wasted overlap otherwise)</>
                )}.
              </p>
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