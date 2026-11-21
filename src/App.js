import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import AnalysisForm from './AnalysisForm';
import AnalysisResults from './AnalysisResults';
import './App.css';

function requestError(error, fallback) {
  const message = error.response?.data?.error || fallback;
  const retryAfter = Number(error.response?.headers?.['retry-after']);
  return retryAfter > 0 ? message + ' Retry in about ' + retryAfter + ' seconds.' : message;
}

export default function App() {
  const [search, setSearch] = useState({ status: 'idle', artists: [], error: '' });
  const [analysis, setAnalysis] = useState({ status: 'idle', error: '' });
  const [result, setResult] = useState(null);
  const searchRequest = useRef(null);
  const analysisRequest = useRef(null);

  useEffect(() => () => {
    searchRequest.current?.abort();
    analysisRequest.current?.abort();
  }, []);

  function cancelAnalysis() {
    analysisRequest.current?.abort();
    analysisRequest.current = null;
    setAnalysis({ status: 'idle', error: '' });
  }

  function resetSearch() {
    searchRequest.current?.abort();
    searchRequest.current = null;
    setSearch({ status: 'idle', artists: [], error: '' });
    cancelAnalysis();
  }

  async function searchArtists(query) {
    if (searchRequest.current) return;
    cancelAnalysis();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearch({ status: 'loading', artists: [], error: '' });
    try {
      const { data } = await axios.get('/api/search-artist', {
        params: { q: query }, signal: controller.signal, timeout: 15_000
      });
      if (searchRequest.current === controller) {
        setSearch({ status: 'success', artists: data, error: '' });
      }
    } catch (error) {
      if (searchRequest.current === controller) {
        setSearch({ status: 'error', artists: [], error: requestError(error, 'Could not search for artists.') });
      }
    } finally {
      if (searchRequest.current === controller) searchRequest.current = null;
    }
  }

  async function analyzeArtist(artist, request) {
    if (analysisRequest.current) return;
    const controller = new AbortController();
    analysisRequest.current = controller;
    setAnalysis({ status: 'loading', error: '' });
    try {
      const { data } = await axios.get('/api/artist-songs-word-frequency', {
        params: {
          artistId: request.artistId,
          startYear: request.startYear,
          endYear: request.endYear,
          words: request.terms.map(term => term.label).join(',')
        },
        signal: controller.signal,
        timeout: 65_000
      });
      if (analysisRequest.current === controller) {
        setResult({ ...data, artistName: artist.name });
        setAnalysis({ status: 'success', error: '' });
      }
    } catch (error) {
      if (analysisRequest.current === controller) {
        setAnalysis({ status: 'error', error: requestError(error, 'Could not analyze these lyrics. Try again.') });
      }
    } finally {
      if (analysisRequest.current === controller) analysisRequest.current = null;
    }
  }

  return (
    <main className="lyricmetr">
      <header className="page-heading">
        <h1>Lyricmetr</h1>
        <p>Compare word and phrase frequencies in an artist’s lyrics by year.</p>
      </header>

      <AnalysisForm
        search={search}
        analysis={analysis}
        onSearch={searchArtists}
        onSearchChange={resetSearch}
        onArtistChange={cancelAnalysis}
        onAnalyze={analyzeArtist}
      />

      {result && <AnalysisResults result={result} />}
    </main>
  );
}
