import React, { useMemo, useRef, useState } from 'react';
import axios from 'axios';
import './App.css';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function App() {
  const latestYear = new Date().getFullYear();
  const [word, setWord] = useState('');
  const [songUrl, setSongUrl] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeButton, setActiveButton] = useState('');
  const [artistName, setArtistName] = useState('');
  const [artistsList, setArtistsList] = useState([]);
  const [selectedArtistId, setSelectedArtistId] = useState(null);
  const [startYear, setStartYear] = useState(2000);
  const [endYear, setEndYear] = useState(latestYear);
  const [words, setWords] = useState('');
  const [wordCounts, setWordCounts] = useState({});
  const [frequencyMeta, setFrequencyMeta] = useState(null);
  const artistSearchCacheRef = useRef(new Map());

  const chartColors = [
    'rgba(255, 99, 132, 0.6)',
    'rgba(54, 162, 235, 0.6)',
    'rgba(255, 206, 86, 0.6)',
    'rgba(75, 192, 192, 0.6)',
    'rgba(153, 102, 255, 0.6)',
    'rgba(255, 159, 64, 0.6)'
  ];

  const countOccurrences = (text, searchTerm) => {
    const regex = new RegExp(searchTerm, 'gi');
    const matches = text.match(regex) || [];
    return matches.length;
  };

  const fetchSongLyrics = async () => {
    setIsLoading(true);
    setError('');
    try {
      if (!songUrl || !word) {
        throw new Error('Please enter both a song URL and a word to search for.');
      }

      const response = await axios.get('/api/lyrics-by-url', {
        params: { url: songUrl }
      });

      if (!response.data || !response.data.lyrics) {
        throw new Error('No lyrics found');
      }

      const count = countOccurrences(response.data.lyrics, word);
      setResult(count);
    } catch (requestError) {
      console.error('Error fetching song data:', requestError);
      setError(requestError.message || 'Error fetching song data');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchArtistId = async (query) => {
    try {
      const response = await axios.get('/api/search-artist', {
        params: { q: query }
      });
      if (!response.data || response.data.length === 0) {
        throw new Error('No artist found');
      }
      return response.data;
    } catch (requestError) {
      console.error('Error fetching artist ID from Genius API', requestError);
      const details =
        requestError?.response?.data?.details ||
        requestError?.response?.data?.error ||
        requestError.message ||
        'Error fetching artist ID';
      throw new Error(details);
    }
  };

  const handleArtistSelection = (artistId) => {
    setSelectedArtistId(artistId);
  };

  const handleWordsChange = (event) => {
    setWords(event.target.value);
  };

  const handleStartYearChange = (event) => {
    const year = Number(event.target.value);
    setStartYear(year);
    if (year > endYear) {
      setEndYear(year);
    }
  };

  const handleEndYearChange = (event) => {
    const year = Number(event.target.value);
    setEndYear(year);
    if (year < startYear) {
      setStartYear(year);
    }
  };

  const searchArtists = async () => {
    const normalizedQuery = artistName.trim().toLowerCase();
    if (!normalizedQuery) {
      setError('Please enter an artist name.');
      return;
    }

    const cachedArtists = artistSearchCacheRef.current.get(normalizedQuery);
    if (cachedArtists) {
      setArtistsList(cachedArtists);
      setError('');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const artists = await fetchArtistId(artistName);
      artistSearchCacheRef.current.set(normalizedQuery, artists);
      setArtistsList(artists);
    } catch (requestError) {
      console.error('Error searching for artists from Genius API', requestError);
      setError('Error searching for artists: ' + requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWordFrequency = async () => {
    if (!selectedArtistId || !words.trim()) {
      setError('Please select an artist and enter at least one word.');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult(null);
    setWordCounts({});
    setFrequencyMeta(null);

    const wordList = words
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (wordList.length === 0) {
      setError('Please enter at least one valid word.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await axios.get('/api/artist-songs-word-frequency', {
        params: {
          artistId: selectedArtistId,
          startYear,
          endYear,
          words: wordList.join(','),
          speed: 'balanced',
          maxSongsPerYear: 8
        }
      });

      // New backend shape: { frequencies, totals }
      // Backward compatibility: single-word map by year.
      const combinedResults =
        response.data?.frequencies ||
        (wordList.length === 1 ? { [wordList[0]]: response.data || {} } : {});

      const totals = response.data?.totals || Object.entries(combinedResults).reduce((acc, [w, yearData]) => {
        acc[w] = Object.values(yearData || {}).reduce((sum, count) => sum + count, 0);
        return acc;
      }, {});

      setWordCounts(totals);
      setResult(combinedResults);
      setFrequencyMeta(response.data?.meta || null);
    } catch (requestError) {
      console.error('Error fetching songs by year from Genius API', requestError);
      const details =
        requestError?.response?.data?.error ||
        requestError?.response?.data?.details ||
        requestError.message;
      setError('Error fetching songs by year: ' + details);
    } finally {
      setIsLoading(false);
    }
  };

  const handleButtonClick = (buttonName) => {
    setActiveButton(buttonName);
    setResult(null);
    setError('');
    setFrequencyMeta(null);
  };

  const selectedArtist = artistsList.find((artist) => artist.id === selectedArtistId);

  const chartLabels = useMemo(() => {
    if (!result) return [];
    const labelSet = new Set();
    Object.values(result).forEach((yearMap) => {
      Object.keys(yearMap || {}).forEach((year) => labelSet.add(year));
    });
    return Array.from(labelSet).sort((a, b) => Number(a) - Number(b));
  }, [result]);

  const requestedWords = words
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Lyricmetr</h1>
        <div className="button-container">
          <button onClick={() => handleButtonClick('countWord')}>Count Word in Song</button>
          <button onClick={() => handleButtonClick('wordFrequency')}>Word Frequency by Year</button>
        </div>

        {activeButton === 'countWord' && (
          <div className="input-container">
            <input
              type="text"
              placeholder="Enter word to search"
              value={word}
              onChange={(event) => setWord(event.target.value)}
            />
            <input
              type="text"
              placeholder="Enter Genius song URL"
              value={songUrl}
              onChange={(event) => setSongUrl(event.target.value)}
            />
            <button onClick={fetchSongLyrics}>Fetch</button>
            {typeof result === 'number' && (
              <p>The word "{word}" appears {result} times in the lyrics.</p>
            )}
          </div>
        )}

        {activeButton === 'wordFrequency' && (
          <div className="input-container wide">
            <input
              type="text"
              placeholder="Enter artist name"
              value={artistName}
              onChange={(event) => setArtistName(event.target.value)}
            />
            <button onClick={searchArtists}>Search Artists</button>

            {artistsList.length > 0 && (
              <div className="artist-list">
                <h2>Select an Artist:</h2>
                <ul>
                  {artistsList.map((artist) => (
                    <li key={artist.id} onClick={() => handleArtistSelection(artist.id)}>
                      {artist.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedArtistId && (
              <div className="year-slider">
                <h2>Select Year Range</h2>
                <label>Start Year: {startYear}</label>
                <input
                  type="range"
                  min="1950"
                  max={latestYear}
                  value={startYear}
                  onChange={handleStartYearChange}
                />
                <label>End Year: {endYear}</label>
                <input
                  type="range"
                  min="1950"
                  max={latestYear}
                  value={endYear}
                  onChange={handleEndYearChange}
                />
                <input
                  type="text"
                  placeholder="Enter word(s) to search (comma-separated)"
                  value={words}
                  onChange={handleWordsChange}
                />
                <button onClick={fetchWordFrequency}>Fetch Word Frequency</button>
              </div>
            )}

            {result && (
              <div className="result">
                <h2>
                  Frequency for word(s){' '}
                  {requestedWords
                    .map((requestedWord) => `${requestedWord} (${wordCounts[requestedWord] || 0})`)
                    .join(', ')}{' '}
                  for the selected years for {selectedArtist?.name}
                </h2>

                {chartLabels.length > 0 ? (
                  <div className="chart-wrapper">
                    <Bar
                      data={{
                        labels: chartLabels,
                        datasets: Object.entries(result).map(([resultWord, data], index) => ({
                          label: resultWord,
                          data: chartLabels.map((year) => data?.[year] || 0),
                          backgroundColor: chartColors[index % chartColors.length]
                        }))
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'top'
                          }
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            stacked: true,
                            title: {
                              display: true,
                              text: 'Frequency'
                            }
                          },
                          x: {
                            stacked: true,
                            title: {
                              display: true,
                              text: 'Year'
                            }
                          }
                        }
                      }}
                    />
                  </div>
                ) : (
                  <p>No matches found for the selected years.</p>
                )}
                {frequencyMeta && frequencyMeta.scannedSongs > frequencyMeta.processedSongs && (
                  <p className="meta-note">
                    Fast mode sampled {frequencyMeta.processedSongs} of {frequencyMeta.scannedSongs} songs.
                  </p>
                )}
                {frequencyMeta?.partial && (
                  <p className="meta-note">
                    Some requests were rate-limited by Genius; showing partial results.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {isLoading && <p>Loading...</p>}
        {error && <p className="error">{error}</p>}
      </header>
    </div>
  );
}

export default App;
