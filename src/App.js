// App.js

import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [word, setWord] = useState('');
  const [songUrl, setSongUrl] = useState('');
  const [result, setResult] = useState(null);
  const [songDetails, setSongDetails] = useState(null);
  const [artistName, setArtistName] = useState('');
  const [albums, setAlbums] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
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

  const fetchArtistAlbums = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await axios.get(`https://lyricmetrproxy.onrender.com/search`, {
        params: { q: artistName }
      });
      const artist = response.data.response.hits[0].result.primary_artist;
      const artistId = artist.id;

      const albumsResponse = await axios.get(`https://lyricmetrproxy.onrender.com/artists/${artistId}/albums`);
      setAlbums(albumsResponse.data.response.albums);
    } catch (error) {
      console.error('Error fetching artist albums from Genius API', error);
      setError('Error fetching artist albums');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAlbumClick = (album) => {
    setSelectedAlbum(album);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Lyricmetr</h1>
        <div className="button-container">
          <button onClick={() => setActiveButton('countWord')}>Count Word in Song</button>
          <button onClick={() => setActiveButton('listSongs')}>List Songs in Album</button>
          <button onClick={() => setActiveButton('fetchAlbums')}>Fetch Artist Albums</button>
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
        {activeButton === 'fetchAlbums' && (
          <div className="input-container">
            <input
              type="text"
              placeholder="Enter artist name"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
            />
            <button onClick={fetchArtistAlbums}>Fetch Albums</button>
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
        {albums.length > 0 && (
          <div className="album-list">
            <h2>Albums:</h2>
            <ul>
              {albums.map(album => (
                <li key={album.id} onClick={() => handleAlbumClick(album)}>
                  {album.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        {selectedAlbum && (
          <div className="album-details">
            <h3>{selectedAlbum.name}</h3>
            <img src={selectedAlbum.cover_art_url} alt="Album Cover" />
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </header>
    </div>
  );
}

export default App;