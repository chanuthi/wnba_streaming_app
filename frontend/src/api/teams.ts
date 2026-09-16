import type { Team } from "../types/team";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function fetchTeams(): Promise<Team[]> {
  const response = await fetch(`${API_BASE_URL}/teams`);
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }
  return response.json();
}