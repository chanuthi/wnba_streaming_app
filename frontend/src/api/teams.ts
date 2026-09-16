import type { Team } from "../types/team";
import { API_BASE_URL } from "./config";

export async function fetchTeams(): Promise<Team[]> {
  const response = await fetch(`${API_BASE_URL}/teams`);
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }
  return response.json();
}