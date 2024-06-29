import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [word, setWord] = useState('');
  const [songUrl, setSongUrl] = useState('');
  const [result, setResult] = useState(null);
  const [songDetails, setSongDetails] = useState(null);
  const [albumName, setAlbumName] = useState('');
  const [albumSongs, setAlbumSongs] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeButton, setActiveButton] = useState('');

  const fetchSongId = async (query) => {
    try {
      const response = await axios.get(`https://lyricmetrproxy.onrender.com/search`, {
        params: { q: query }
      });
      const song = response.data.response.hits[0].result;
      return song.id;
    } catch (error) {
      console.error('Error fetching song ID from Genius API', error);
      throw new Error('Error fetching song ID');
    }
  };

  const fetchSongLyrics = async () => {
    setIsLoading(true);
    setError('');
    try {
      const songTitle = songUrl.split('genius.com/')[1].replace(/-/g, ' ').replace(' lyrics', '');
      const songId = await fetchSongId(songTitle);

      const response = await axios.get(`https://lyricmetrproxy.onrender.com/songs/${songId}`);
      const songPath = response.data.response.song.path;

      const lyricsPageResponse = await axios.get(`https://lyricmetrproxy.onrender.com/lyrics?path=${encodeURIComponent(songPath)}`);

      const parser = new DOMParser();
      const doc = parser.parseFromString(lyricsPageResponse.data, 'text/html');
      let lyricsElement = doc.querySelector('.lyrics') || doc.querySelector('.Lyrics__Container') || doc.querySelector('[class*="Lyrics__Container"]');

      if (!lyricsElement) {
        throw new Error('Lyrics element not found');
      }

      const lyrics = lyricsElement ? lyricsElement.innerText : '';
      const count = countOccurrences(lyrics, word);

      setResult(count);
      setSongDetails(response.data.response.song);
    } catch (error) {
      console.error('Error fetching data from Genius API', error);
      setError('Error fetching song data');
      setResult('Error fetching song data');
    } finally {
      setIsLoading(false);
    }
  };

  const countOccurrences = (text, searchTerm) => {
    const regex = new RegExp(searchTerm, 'gi');
    const matches = text.match(regex) || [];
    return matches.length;
  };

  const fetchAlbumSongs = async () => {
    setIsLoading(true);
    setError('');
    try {
      // Search for a known song from the album "DAMN."
      const response = await axios.get(`https://lyricmetrproxy.onrender.com/search`, {
        params: { q: `Kendrick Lamar HUMBLE` }
      });

      if (response.data.response.hits.length === 0) {
        throw new Error('No results found for the album name provided');
      }

      const song = response.data.response.hits[0].result;
      const albumId = song.album.id;
      console.log(`fetchAlbumSongs - Found album ID: ${albumId}`);

      // Fetch album tracks using album ID
      const albumResponse = await axios.get(`https://lyricmetrproxy.onrender.com/albums/${albumId}/tracks`);
      console.log('fetchAlbumSongs - Album API response:', albumResponse);

      const songs = albumResponse.data.response.tracks.map(track => track.song);
      console.log('fetchAlbumSongs - Songs in the album:', songs);
      setAlbumSongs(songs);
    } catch (error) {
      console.error('Error fetching album data from Genius API', error);
      setError('Error fetching album data: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Lyricmetr</h1>
        <div className="button-container">
          <button onClick={() => setActiveButton('countWord')}>Count Word in Song</button>
          <button onClick={() => setActiveButton('listSongs')}>List Songs in Album</button>
          <button>Button 3</button> {/* Placeholder for future functionality */}
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
        {activeButton === 'listSongs' && (
          <div className="input-container">
            <input
              type="text"
              placeholder="Enter album name"
              value={albumName}
              onChange={(e) => setAlbumName(e.target.value)}
            />
            <button onClick={fetchAlbumSongs}>Fetch Album Songs</button>
          </div>
        )}
        {isLoading && <p>Loading...</p>}
        {result && !error && <p>The word "{word}" appears {result} times in the song.</p>}
        {songDetails && (
          <div className="song-details">
            <img src={songDetails.song_art_image_thumbnail_url} alt="Album Cover" />
            <p>{songDetails.full_title}</p>
          </div>
        )}
        {albumSongs.length > 0 && (
          <div className="album-songs">
            <h2>Songs in Album:</h2>
            <ul>
              {albumSongs.map(song => (
                <li key={song.id}>{song.full_title}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </header>
    </div>
  );
}

export default App;
