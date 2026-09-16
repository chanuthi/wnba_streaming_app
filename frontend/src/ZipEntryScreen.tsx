import { useState } from "react";
import './ZipEntryScreen.css';
import githubIcon from './assets/social/github.svg';
import linkedinIcon from './assets/social/linkedin.svg';

declare module '*.css';
declare module '*.module.css';

interface ZipEntryScreenProps {
  initialZip: string;
  onSubmit: (zip: string) => void;
}

function ZipEntryScreen({ initialZip, onSubmit }: ZipEntryScreenProps) {
  const [zip, setZip] = useState(initialZip);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!/^\d{5}$/.test(zip)) {
      setValidationError("Enter a valid 5-digit zip code");
      return;
    }

    setValidationError(null);
    onSubmit(zip);
  }

  return (
    <div className="body">
      <div className="question-wrapper">
        <p className="question">
          Want to find your best subscription combo for the WNBA?
        </p>
      </div>

      <p className="notice">Enter your zip code below — we won't save it or any personal data.</p>

      <form onSubmit={handleSubmit} className="zipform">
        {/* Visually hidden but still read by screen readers - the visible
            instruction lives in the notice line above instead, so the
            input doesn't need its own on-screen label. */}
        <label htmlFor="zip-input" className="sr-only">Zip code</label>
        <input
          id="zip-input"
          type="text"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          placeholder="e.g 46201"
          maxLength={5}
        />
        <button type="submit" aria-label="Continue" />
      </form>

      {validationError && (
        <p style={{ color: "red" }}>{validationError}</p>
      )}

      <div className="social-links">
        <a href="https://www.linkedin.com/in/chanuthi/" target="_blank" rel="noopener noreferrer">
            <img src={linkedinIcon} alt="LinkedIn" />
        </a>
        <a href="https://github.com/chanuthi" target="_blank" rel="noopener noreferrer">
          <img src={githubIcon} alt="GitHub" />
        </a>
      </div>
    </div>
  );
}

export default ZipEntryScreen;