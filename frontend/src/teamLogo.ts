import type { Team } from "./types";

// Shared by TeamPickerScreen (3D carousel) and ResultsScreen (plain <img>) -
// same ESPN CDN URL pattern, one place to change it.
export function logoUrl(team: Team): string {
  if (!team.abbreviation) return "";
  return `https://a.espncdn.com/i/teamlogos/wnba/500/${team.abbreviation.toLowerCase()}.png`;
}
