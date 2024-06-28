import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [word, setWord] = useState('');
  const [songUrl, setSongUrl] = useState('');
  const [result, setResult] = useState(null);
  const [songDetails, setSongDetails] = useState(null);
  const [error, setError] = useState('');

  const extractSongId = (url) => {
    const regex = /genius\.com\/.*-(\d+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const fetchSongLyrics = async () => {
    setError('');
    try {
      const songId = extractSongId(songUrl);
      if (!songId) {
        throw new Error('Invalid Genius song URL');
      }
      console.log(`Extracted song ID: ${songId}`);

      const response = await axios.get(`https://your-service.onrender.com/songs/${songId}`);

      console.log('Proxy API response:', response);

      const songPath = response.data.response.song.path;
      const lyricsPageResponse = await axios.get(`https://your-service.onrender.com/lyrics?path=${encodeURIComponent(songPath)}`);

      const parser = new DOMParser();
      const doc = parser.parseFromString(lyricsPageResponse.data, 'text/html');
      const lyricsElement = doc.querySelector('.lyrics') || doc.querySelector('.Lyrics__Container');
      const lyrics = lyricsElement ? lyricsElement.innerText : '';

      const count = countOccurrences(lyrics, word);
      setResult(count);
      setSongDetails(response.data.response.song);
    } catch (error) {
      console.error('Error fetching data from Genius API', error);
      setError('Error fetching song data');
      setResult('Error fetching song data');
    }
  };

  const countOccurrences = (text, searchTerm) => {
    const regex = new RegExp(searchTerm, 'gi');
    return (text.match(regex) || []).length;
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Lyricmetr</h1>
        {songDetails && (
          <div className="song-details">
            <img src={songDetails.song_art_image_thumbnail_url} alt="Album Cover" />
            <p>{songDetails.full_title}</p>
          </div>
        )}
        <div className="button-container">
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
        {result && <p>The word "{word}" appears {result} times in the song.</p>}
        {error && <p className="error">{error}</p>}
      </header>
    </div>
  );
}

export default App;
