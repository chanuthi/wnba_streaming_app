import { useState } from "react";
import ZipEntryScreen from "./ZipEntryScreen";
import TeamPickerScreen from "./TeamPickerScreen";
import ResultsScreen from "./ResultsScreen";
import type { Team } from "./types";

type Step = "zip" | "team" | "results";

function App() {
  const [step, setStep] = useState<Step>("zip");
  const [zipCode, setZipCode] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  function handleZipSubmit(zip: string) {
    setZipCode(zip);
    setStep("team");
  }

  function handleTeamSelect(team: Team) {
    setSelectedTeam(team);
    setStep("results");
  }

  function handleBackToZip() {
    setStep("zip");
  }

  function handleBackToTeam() {
    setStep("team");
  }

  // Called from inside ResultsScreen's slide-out editor - updates zip
  // without changing step, so the results screen just re-fetches in place.
  function handleZipChangeFromResults(newZip: string) {
    setZipCode(newZip);
  }

  return (
    <>
      {step === "zip" && (
        <ZipEntryScreen initialZip={zipCode} onSubmit={handleZipSubmit} />
      )}

      {step === "team" && (
        <TeamPickerScreen onSelect={handleTeamSelect} onBack={handleBackToZip} />
      )}

      {step === "results" && selectedTeam !== null && (
        <ResultsScreen
          team={selectedTeam}
          zipCode={zipCode}
          onZipChange={handleZipChangeFromResults}
          onBackToTeam={handleBackToTeam}
        />
      )}
    </>
  );
}

export default App;