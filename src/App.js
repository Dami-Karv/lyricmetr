import React, { useState, useEffect } from 'react';
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
  const [artistName, setArtistName] = useState('');
  const [artistAlbums, setArtistAlbums] = useState([]);
  const [selectedAlbumCover, setSelectedAlbumCover] = useState(null);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  const fetchSongId = async (query) => {
    try {
      const response = await axios.get('https://lyricmetrproxy.onrender.com/search', {
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

  const fetchArtistId = async (query) => {
    try {
      const response = await axios.get('https://lyricmetrproxy.onrender.com/search', {
        params: { q: query }
      });
      if (response.data.response.hits.length === 0) {
        throw new Error('No artist found');
      }
      const artist = response.data.response.hits[0].result.primary_artist;
      if (!artist) {
        throw new Error('Artist not found in the search results');
      }
      return artist.id;
    } catch (error) {
      console.error('Error fetching artist ID from Genius API', error);
      throw new Error('Error fetching artist ID');
    }
  };

  const fetchAlbumSongs = async () => {
    setIsLoading(true);
    setError('');
    try {
      const artistQuery = albumName.split(' ')[0];
      const artistId = await fetchArtistId(artistQuery);

      const artistAlbumsResponse = await axios.get(`https://lyricmetrproxy.onrender.com/artists/${artistId}/albums`);
      const albums = artistAlbumsResponse.data.response.albums;

      const album = albums.find(a => a.name.toLowerCase().includes(albumName.toLowerCase()));
      if (!album) {
        throw new Error('Album not found');
      }

      const albumId = album.id;
      const albumTracksResponse = await axios.get(`https://lyricmetrproxy.onrender.com/albums/${albumId}/tracks`);
      const songs = albumTracksResponse.data.response.tracks.map(track => track.song);

      setAlbumSongs(songs);
    } catch (error) {
      console.error('Error fetching album data from Genius API', error);
      setError('Error fetching album data: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchArtistAlbums = async () => {
    setIsLoading(true);
    setError('');
    try {
      const artistId = await fetchArtistId(artistName);

      const artistAlbumsResponse = await axios.get(`https://lyricmetrproxy.onrender.com/artists/${artistId}/albums`);
      const albums = artistAlbumsResponse.data.response.albums;

      setArtistAlbums(albums);
    } catch (error) {
      console.error('Error fetching artist albums from Genius API', error);
      setError('Error fetching artist albums: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAlbumClick = async (albumId) => {
    setIsLoading(true);
    setError('');
    try {
      const albumResponse = await axios.get(`https://lyricmetrproxy.onrender.com/albums/${albumId}`);
      setSelectedAlbumCover(albumResponse.data.response.album.cover_art_url);
    } catch (error) {
      console.error('Error fetching album cover from Genius API', error);
      setError('Error fetching album cover: ' + error.message);
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
          <button onClick={() => setActiveButton('listAlbums')}>List Albums by Artist</button>
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
        {activeButton === 'listAlbums' && (
          <div className="input-container">
            <input
              type="text"
              placeholder="Enter artist name"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
            />
            <button onClick={fetchArtistAlbums}>Fetch Artist Albums</button>
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
        {artistAlbums.length > 0 && (
          <div className="artist-albums">
            <h2>Albums by {artistName}:</h2>
            <ul>
              {artistAlbums.map(album => (
                <li key={album.id} onClick={() => handleAlbumClick(album.id)}>{album.name}</li>
              ))}
            </ul>
          </div>
        )}
        {selectedAlbumCover && (
          <div className="album-cover">
            <h2>Album Cover</h2>
            <img src={selectedAlbumCover} alt="Album Cover" />
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </header>
      <div className="toggle-switch">
        <label className="switch">
          <input type="checkbox" checked={darkMode} onChange={() => setDarkMode(!darkMode)} />
          <span className="slider"></span>
        </label>
      </div>
    </div>
  );
}

export default App;