import { useState, useEffect, useRef } from "react";
import type { RecommendationResult } from "./types";
import "./ResultsScreen.css";

function formatPrice(price: number | null): string {
  if (price === null) return "price unknown";
  return price === 0 ? "Free" : `$${price.toFixed(2)}/mo`;
}


interface ResultsScreenProps {
  teamId: number;
  zipCode: string;
  onZipChange: (newZip: string) => void;
  onBackToTeam: () => void;
}

function ResultsScreen({ teamId, zipCode, onZipChange, onBackToTeam }: ResultsScreenProps) {
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Local state just for the slide-out editor bar itself
  const [editorOpen, setEditorOpen] = useState(false);
  const [zipDraft, setZipDraft] = useState(zipCode);

  // Re-fetches every time teamId OR zipCode changes - this is what makes
  // "change your zip" actually update the results without a page reload.
  useEffect(() => {
    setResult(null); // show "Loading..." again while the new fetch is in flight
    fetch(`http://127.0.0.1:8000/recommend?team_id=${teamId}&zip_code=${zipCode}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }
        return response.json();
      })
      .then((data: RecommendationResult) => setResult(data))
      .catch((err) => setError(err.message));
  }, [teamId, zipCode]);

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
    <div className="results-body" style={{ position: "relative" }}>
      <button onClick={onBackToTeam}>&larr; Change team</button>

      {/* The small arrow button that reveals the zip-editing bar */}
      <button onClick={() => setEditorOpen(!editorOpen)}>
        {editorOpen ? "▲" : "▼"} Zip: {zipCode}
      </button>

      {editorOpen && (
        <form onSubmit={handleZipUpdate} style={{ margin: "8px 0" }}>
          <input
            type="text"
            value={zipDraft}
            onChange={(e) => setZipDraft(e.target.value)}
            maxLength={5}
          />
          <button type="submit">Update</button>
        </form>
      )}

      {!result ? (
        <p>Loading recommendation...</p>
      ) : (
        <div>
          <h1>{result.team}</h1>
          <p>{result.in_market ? "You're in this team's home market." : "You're outside this team's home market."}</p>

          <p>Total games: {result.total_games}</p>
          <p>Coverable games (via any streaming service): {result.coverable_games}</p>
          {result.in_market_local_only_games > 0 && (
            <p>
              {result.in_market_local_only_games} game(s) are local broadcasts only in your
              market - not available on any streaming service, you'll need local TV/cable.
            </p>
          )}

          {result.best_single_service && (
            <p>
              Best single subscription: <strong>{result.best_single_service.service}</strong> covers{" "}
              {result.best_single_service.games_covered} games ({result.best_single_service.pct_of_coverable}%)
              {" — "}{formatPrice(result.best_single_service.monthly_price)}
              {result.best_single_service.monthly_price !== null &&
                result.best_single_service.monthly_price > 0 &&
                result.best_single_service.cost_per_game !== null && (
                  <> (${result.best_single_service.cost_per_game.toFixed(2)}/game)</>
              )}
            </p>
          )}

          {result.best_two_service_combo && (
            <>
              <p>
                Best combo: <strong>{result.best_two_service_combo.services.join(" + ")}</strong> covers{" "}
                {result.best_two_service_combo.games_covered} games ({result.best_two_service_combo.pct_of_coverable}%)
                {" — "}{formatPrice(result.best_two_service_combo.total_monthly_price)} total
              </p>
              <p>
                <strong>{result.best_two_service_combo.services[0]}</strong> gets you{" "}
                {result.best_two_service_combo.unique_to_first} game(s){" "}
                <strong>{result.best_two_service_combo.services[1]}</strong> doesn't have, and vice versa
                for {result.best_two_service_combo.unique_to_second} game(s)
                {result.best_two_service_combo.overlap > 0 && (
                  <> ({result.best_two_service_combo.overlap} game(s) covered by both, no wasted overlap otherwise)</>
                )}.
              </p>
            </>
          )}

          <h2>Full breakdown</h2>
          <ul>
            {result.service_breakdown.map((s) => (
              <li key={s.service}>
                {s.service}: {s.games_covered} games ({s.pct_of_coverable}%) — {formatPrice(s.monthly_price)}
                {s.monthly_price !== null && s.monthly_price > 0 && s.cost_per_game !== null && (
                  <> (${s.cost_per_game.toFixed(2)}/game)</>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ResultsScreen;