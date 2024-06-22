import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [word, setWord] = useState('');
  const [songUrl, setSongUrl] = useState('');
  const [result, setResult] = useState(null);

  const fetchSongLyrics = async () => {
    try {
      // Extract the song ID from the provided URL
      const songId = songUrl.split('-').pop();
      // Fetch song details from Genius API
      const response = await axios.get(`https://api.genius.com/songs/${songId}`, {
        headers: {
          Authorization: `Bearer ${process.env.REACT_APP_GENIUS_ACCESS_TOKEN}`
        }
      });

      // Extract the song path from the response
      const songPath = response.data.response.song.path;
      // Fetch the song page HTML
      const lyricsPageResponse = await axios.get(`https://genius.com${songPath}`);

      // Use DOMParser to extract lyrics from the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(lyricsPageResponse.data, 'text/html');
      const lyricsElement = doc.querySelector('.lyrics') || doc.querySelector('.Lyrics__Container'); // Adapt as necessary
      const lyrics = lyricsElement ? lyricsElement.innerText : '';

      // Count the occurrences of the word in the lyrics
      const count = countOccurrences(lyrics, word);
      setResult(count);
    } catch (error) {
      console.error('Error fetching data from Genius API', error);
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
      </header>
    </div>
  );
}

export default App;
