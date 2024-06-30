import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [word, setWord] = useState('');
  const [songUrl, setSongUrl] = useState('');
  const [result, setResult] = useState(null);
  const [songDetails, setSongDetails] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeButton, setActiveButton] = useState('');
  const [artistName, setArtistName] = useState('');
  const [artistsList, setArtistsList] = useState([]);
  const [selectedArtistId, setSelectedArtistId] = useState(null);
  const [artistSongs, setArtistSongs] = useState([]);
  const [startYear, setStartYear] = useState(2000);
  const [endYear, setEndYear] = useState(2020);

  const fetchSongId = async (query) => {
    try {
      const response = await axios.get('https://lyricmetrproxy.onrender.com/search', {
        params: { q: query }
      });
      const song = response.data[0];
      return song.id;
    } catch (error) {
      console.error('Error Fetching song ID from Genius API ', error);
      throw new Error('Error fetching song ID');
    }
  };

  const fetchSongLyrics = async () => {
    setIsLoading(true);
    setError('');
    try {
      if (!songUrl || !word) {
        throw new Error('Please enter both a song URL and a word to search for.');
      }
  
      const songTitle = songUrl.split('genius.com/')[1].replace(/-/g, ' ').replace(' lyrics', '');
      
      // First, search for the song
      const searchResponse = await axios.get(`/search?q=${encodeURIComponent(songTitle)}`);
      if (!searchResponse.data || searchResponse.data.length === 0) {
        throw new Error('Song not found');
      }
      
      const songId = searchResponse.data[0].id;
  
      // Then, get the song details
      const songResponse = await axios.get(`/songs/${songId}`);
      const songPath = songResponse.data.path;
  
      // Finally, get the lyrics
      const lyricsResponse = await axios.get(`/lyrics?path=${encodeURIComponent(songPath)}`);
      const lyrics = lyricsResponse.data;
  
      const count = countOccurrences(lyrics, word);
  
      setResult(count);
      setSongDetails(songResponse.data);
    } catch (error) {
      console.error('Error fetching song data:', error);
      setError(error.message || 'Error fetching song data');
    } finally {
      setIsLoading(false);
    }
  };

  const countOccurrences = (text, searchTerm) => {
    const regex = new RegExp(searchTerm, 'gi');
    const matches = text.match(regex) || [];
    return matches.length;
  };

  const fetchArtistId = async (query) => {
    try {
      const response = await axios.get('https://lyricmetrproxy.onrender.com/search-artist', {
        params: { q: query }
      });
      if (response.data.length === 0) {
        throw new Error('No artist found');
      }
      return response.data;
    } catch (error) {
      console.error('Error fetching artist ID from Genius API', error);
      throw new Error('Error fetching artist ID');
    }
  };

  const fetchArtistSongsByYear = async (artistId, startYear, endYear, word) => {
    setIsLoading(true);
    setError('');
    try {
      const response = await axios.get(`https://lyricmetrproxy.onrender.com/artist-songs`, {
        params: { artistId, startYear, endYear, word }
      });
      setResult(response.data);
    } catch (error) {
      console.error('Error fetching songs by year from Genius API', error);
      setError('Error fetching songs by year: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchArtistSongs = async (artistId) => {
    setIsLoading(true);
    setError('');
    try {
      const response = await axios.get(`https://lyricmetrproxy.onrender.com/artists/${artistId}/songs`);
      const filteredSongs = response.data.filter(song => song.primary_artist.id === artistId);
      setArtistSongs(filteredSongs);
    } catch (error) {
      console.error('Error fetching artist songs from Genius API', error);
      setError('Error fetching artist songs: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleArtistSelection = async (artistId) => {
    setSelectedArtistId(artistId);
    await fetchArtistSongs(artistId);
  };

  const searchArtists  = async () => {
    setIsLoading(true);
    setError('');
    try {
      const artists = await fetchArtistId(artistName);
      setArtistsList(artists);
    } catch (error) {
      console.error('Error searching for artists from Genius API', error);
      setError('Error searching for artists: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWordFrequency = () => {
    if (selectedArtistId && word) {
      fetchArtistSongsByYear(selectedArtistId, startYear, endYear, word);
    } else {
      setError('Please select an artist and enter a word.');
    }
  };

  const formatDate = (dateComponents) => {
    if (!dateComponents) return 'Unknown Date';
    const { year, month, day } = dateComponents;
    if (!year || !month || !day) return 'Unknown Date';
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  
  return (
    <div className="App">
      <header className="App-header">
        <h1>Lyricmetr</h1>
        <div className="button-container">
          <button onClick={() => setActiveButton('countWord')}>Count Word in Song</button>
          <button onClick={() => setActiveButton('wordFrequency')}>Word Frequency by Year</button>
          <button onClick={() => setActiveButton('listSongsByArtist')}>List Songs by Artist</button>
        </div>
        {activeButton === 'countWord' && (
          <div className="input-container">
            <input
              type="text"
              placeholder="Enter word to search"
              value={word}
              onChange={(e) => setWord(e.target.value)}
            />
            <input
              type="text"
              placeholder="Enter Genius song URL"
              value={songUrl}
              onChange={(e) => setSongUrl(e.target.value)}
            />
            <button onClick={fetchSongLyrics}>Fetch</button>
          </div>
        )}
        {activeButton === 'wordFrequency' && (
          <div className="input-container">
            <input
              type="text"
              placeholder="Enter artist name"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
            />
            <button onClick={searchArtists}>Search Artists</button>
            {artistsList.length > 0 && (
              <div className="artist-list">
                <h2>Select an Artist:</h2>
                <ul>
                  {artistsList.map(artist => (
                    <li key={artist.id} onClick={() => handleArtistSelection(artist.id)}>{artist.name}</li>
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
                  max="2024"
                  value={startYear}
                  onChange={(e) => setStartYear(e.target.value)}
                />
                <label>End Year: {endYear}</label>
                <input
                  type="range"
                  min="1950"
                  max="2024"
                  value={endYear}
                  onChange={(e) => setEndYear(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Enter word to search"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                />
                <button onClick={fetchWordFrequency}>Fetch Word Frequency</button>
              </div>
            )}
          </div>
        )}
        {activeButton === 'listSongsByArtist' && (
          <div className="input-container">
            <input
              type="text"
              placeholder="Enter artist Name"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
            />
            <button onClick={searchArtists}>Search Artists</button>
            {artistsList.length > 0 && (
              <div className="artist-list">
                <h2>Select an Artist:</h2>
                <ul>
                  {artistsList.map(artist => (
                    <li key={artist.id} onClick={() => handleArtistSelection(artist.id)}>{artist.name}</li>
                  ))}
                </ul>
              </div>
            )}
            {artistSongs.length > 0 && (
  <div className="artist-songs">
    <h2>Songs by {artistsList.find(artist => artist.id === selectedArtistId)?.name}:</h2>
    <ul>
      {artistSongs.map(song => (
        <li key={song.id}>
          {song.title} - {formatDate(song.release_date_components)}
          (Raw: {song.release_date_for_display})
        </li>
      ))}
    </ul>
  </div>
)}


          </div>
        )}
        {isLoading && <p>Loading...</p>}
        {result && (
          <div className="result">
            <h2>Word Frequency by Year</h2>
            {Object.entries(result).map(([year, frequency]) => (
              <p key={year}>{year}: {frequency}</p>
            ))}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </header>
    </div>
  );
}




export default App;
