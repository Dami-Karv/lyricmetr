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

  const fetchSongId = async (query) => {
    try {
      console.log(`fetchSongId - Searching for song with query: ${query}`);
      const response = await axios.get(`https://lyricmetrproxy.onrender.com/search`, {
        params: { q: query }
      });
      console.log(`fetchSongId - API Response:`, response);
      const song = response.data.response.hits[0].result;
      console.log(`fetchSongId - Found song: ${song.full_title} with ID: ${song.id}`);
      return song.id;
    } catch (error) {
      console.error('fetchSongId - Error fetching song ID from Genius API', error);
      throw new Error('Error fetching song ID');
    }
  };

  const fetchSongLyrics = async () => {
    setIsLoading(true);
    setError('');
    try {
      console.log('fetchSongLyrics - Song URL:', songUrl); // Log the song URL
      const songTitle = songUrl.split('genius.com/')[1].replace(/-/g, ' ').replace(' lyrics', '');
      console.log('fetchSongLyrics - Parsed song title:', songTitle); // Log the parsed song title
      const songId = await fetchSongId(songTitle);
      console.log('fetchSongLyrics - Extracted song ID:', songId);
  
      const response = await axios.get(`https://lyricmetrproxy.onrender.com/songs/${songId}`);
      console.log('fetchSongLyrics - Proxy API response:', response);
  
      const songPath = response.data.response.song.path;
      console.log('fetchSongLyrics - Song path:', songPath);
      const lyricsPageResponse = await axios.get(`https://lyricmetrproxy.onrender.com/lyrics?path=${encodeURIComponent(songPath)}`);
      console.log('fetchSongLyrics - Lyrics page response:', lyricsPageResponse);
  
      const parser = new DOMParser();
      const doc = parser.parseFromString(lyricsPageResponse.data, 'text/html');
      console.log('fetchSongLyrics - Parsed HTML document:', doc);
  
      // Try different selectors to find the lyrics element
      let lyricsElement = doc.querySelector('.lyrics') || doc.querySelector('.Lyrics__Container') || doc.querySelector('[class*="Lyrics__Container"]');
      console.log('fetchSongLyrics - Lyrics element:', lyricsElement);
  
      // Handle case if lyrics are still not found
      if (!lyricsElement) {
        throw new Error('Lyrics element not found');
      }
  
      const lyrics = lyricsElement ? lyricsElement.innerText : '';
      console.log('fetchSongLyrics - Extracted lyrics:', lyrics);
  
      const count = countOccurrences(lyrics, word);
      console.log(`fetchSongLyrics - The word "${word}" appears ${count} times in the song.`);
      setResult(count);
      setSongDetails(response.data.response.song);
    } catch (error) {
      console.error('fetchSongLyrics - Error fetching data from Genius API', error);
      setError('Error fetching song data');
      setResult('Error fetching song data');
    } finally {
      setIsLoading(false);
    }
  };
  

  const countOccurrences = (text, searchTerm) => {
    console.log(`countOccurrences - Counting occurrences of the word "${searchTerm}"`);
    const regex = new RegExp(searchTerm, 'gi');
    const matches = text.match(regex) || [];
    console.log(`countOccurrences - Found ${matches.length} matches`);
    return matches.length;
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
        {isLoading && <p>Loading...</p>}
        {result && !error && <p>The word "{word}" appears {result} times in the song.</p>}
        {error && <p className="error">{error}</p>}
      </header>
    </div>
  );
}

export default App;
