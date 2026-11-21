import { useState } from 'react';
import {
  MAX_QUERY_LENGTH, MAX_TERM_LENGTH, MAX_TERMS, MAX_YEAR_SPAN, MIN_YEAR,
  parseAnalysis, parseSearch
} from './analysis-input';

export default function AnalysisForm({
  search, analysis, onSearch, onSearchChange, onArtistChange, onAnalyze
}) {
  const currentYear = new Date().getFullYear();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [startYear, setStartYear] = useState(String(currentYear - 9));
  const [endYear, setEndYear] = useState(String(currentYear));
  const [words, setWords] = useState('');
  const [searchError, setSearchError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const artist = search.artists.find(item => item.id === selectedId);
  const searching = search.status === 'loading';
  const analyzing = analysis.status === 'loading';

  function submitSearch(event) {
    event.preventDefault();
    if (searching) return;
    try {
      const validQuery = parseSearch(query);
      setSearchError('');
      setAnalysisError('');
      setSelectedId(null);
      onSearch(validQuery);
    } catch (error) {
      setSearchError(error.message);
    }
  }

  function submitAnalysis(event) {
    event.preventDefault();
    if (analyzing) return;
    try {
      const request = parseAnalysis({ artistId: selectedId, startYear, endYear, words }, currentYear);
      setAnalysisError('');
      onAnalyze(artist, request);
    } catch (error) {
      setAnalysisError(error.message);
    }
  }

  return (
    <section className="analysis-controls" aria-label="Analysis settings">
      <form className="search-form" onSubmit={submitSearch} aria-busy={searching}>
        <label htmlFor="artist-query">Artist name</label>
        <div className="search-fields">
          <input
            id="artist-query"
            type="search"
            maxLength={MAX_QUERY_LENGTH}
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setSelectedId(null);
              setSearchError('');
              setAnalysisError('');
              onSearchChange();
            }}
          />
          <button type="submit" disabled={searching}>Search artists</button>
        </div>
      </form>
      {searching && <p role="status">Searching Genius…</p>}
      {(searchError || search.error) && <p className="error" role="alert">{searchError || search.error}</p>}
      {search.status === 'success' && !search.artists.length && <p role="status">No artists found.</p>}

      {search.artists.length > 0 && (
        <fieldset className="artist-options">
          <legend>Choose an artist</legend>
          {search.artists.map(item => (
            <label key={item.id} className="artist-option">
              <input
                type="radio"
                name="artist"
                checked={selectedId === item.id}
                onChange={() => {
                  setSelectedId(item.id);
                  setAnalysisError('');
                  onArtistChange();
                }}
              />
              <span>
                <strong>{item.name}</strong>
                <small>{item.exampleSong ? item.exampleSong + ' · ' : ''}Genius ID {item.id}</small>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {artist && (
        <>
          <form className="frequency-form" onSubmit={submitAnalysis} aria-busy={analyzing}>
            <div className="year-fields">
              <label htmlFor="start-year">Start year
                <input id="start-year" type="number" min={MIN_YEAR} max={currentYear} step="1"
                  value={startYear} onChange={event => { setStartYear(event.target.value); setAnalysisError(''); }} />
              </label>
              <label htmlFor="end-year">End year
                <input id="end-year" type="number" min={MIN_YEAR} max={currentYear} step="1"
                  value={endYear} onChange={event => { setEndYear(event.target.value); setAnalysisError(''); }} />
              </label>
            </div>
            <label htmlFor="search-terms">Words or phrases</label>
            <input id="search-terms" value={words} maxLength={MAX_TERMS * (MAX_TERM_LENGTH + 1)}
              aria-describedby="terms-help" placeholder="love, come back"
              onChange={event => { setWords(event.target.value); setAnalysisError(''); }} />
            <small id="terms-help">Use up to {MAX_TERMS} comma-separated terms and a range of up to {MAX_YEAR_SPAN} years.</small>
            <button type="submit" disabled={analyzing}>Analyze {artist.name}</button>
          </form>
          {analyzing && <p role="status">Analyzing {artist.name}’s lyrics. This may take a minute.</p>}
          {(analysisError || analysis.error) && <p className="error" role="alert">{analysisError || analysis.error}</p>}
        </>
      )}
    </section>
  );
}
