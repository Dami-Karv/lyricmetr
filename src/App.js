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
      const response = await axios.get(`https://lyricmetrproxy.onrender.com/search`, {
        params: { q: albumName }
      });
      const album = response.data.response.hits[0].result;
      const albumId = album.id;

      const albumResponse = await axios.get(`https://lyricmetrproxy.onrender.com/albums/${albumId}`);
      const songs = albumResponse.data.response.album.tracks.map(track => track.song);
      setAlbumSongs(songs);
    } catch (error) {
      console.error('Error fetching album data from Genius API', error);
      setError('Error fetching album data');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Lyricmetr</h1>
        <div className="button-container">
          <button onClick={fetchSongLyrics}>Count Word in Song</button>
          <button onClick={() => {
            const album = prompt("Enter the album name:");
            if (album) {
              setAlbumName(album);
              fetchAlbumSongs();
            }
          }}>List Songs in Album</button>
          <button>Button 3</button> {/* Placeholder for future functionality */}
        </div>
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
        </div>
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
