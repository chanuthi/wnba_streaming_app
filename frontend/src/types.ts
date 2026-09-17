// Shared shapes used across the zip -> team -> results flow.
// Keeping these in one file means every component agrees on what the data looks like.

export interface Team {
  id: number;
  name: string;
  abbreviation?: string;
}

export interface ServiceCoverage {
  service: string;
  games_covered: number;
  pct_of_coverable: number;
  monthly_price: number | null;
  cost_per_game: number | null;
}

export interface ComboCoverage {
  services: string[];
  games_covered: number;
  pct_of_coverable: number;
  unique_to_first: number;
  unique_to_second: number;
  overlap: number;
  total_monthly_price: number | null;
}

export interface Game {
  id: number;
  game_datetime: string;
  home_team: string;
  away_team: string;
  network: string | null;
  status: "streaming" | "local_broadcast" | "not_listed";
  streaming_services: string[];
}

export interface RecommendationResult {
  team: string;
  zip_code: string;
  in_market: boolean;
  total_games: number;
  not_listed_games: number;
  in_market_local_only_games: number;
  coverable_games: number;
  best_single_service: ServiceCoverage | null;
  best_two_service_combo: ComboCoverage | null;
  service_breakdown: ServiceCoverage[];
}