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
  const [artistName, setArtistName] = useState('');
  const [artistAlbums, setArtistAlbums] = useState([]);
  const [selectedAlbumCover, setSelectedAlbumCover] = useState(null);
  const [artistsList, setArtistsList] = useState([]);
  const [selectedArtistId, setSelectedArtistId] = useState(null);
  const [artistSongs, setArtistSongs] = useState([]);

  const fetchSongId = async (query) => {
    try {
      const response = await axios.get('https://lyricmetrproxy.onrender.com/search', {
        params: { q: query }
      });
      const song = response.data[0];
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
      const songPath = response.data.url;

      const lyricsResponse = await axios.get(`https://lyricmetrproxy.onrender.com/lyrics?path=${encodeURIComponent(songPath)}`);
      const lyrics = lyricsResponse.data;
      const count = countOccurrences(lyrics, word);

      setResult(count);
      setSongDetails(response.data);
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

  const fetchAlbumSongs = async () => {
    setIsLoading(true);
    setError('');
    try {
      const artistId = await fetchArtistId(albumName.split(' ')[0]);

      const artistAlbumsResponse = await axios.get(`https://lyricmetrproxy.onrender.com/artists/${artistId}/albums`);
      const albums = artistAlbumsResponse.data;

      const album = albums.find(a => a.name.toLowerCase().includes(albumName.toLowerCase()));
      if (!album) {
        throw new Error('Album not found');
      }

      const albumId = album.id;
      const albumTracksResponse = await axios.get(`https://lyricmetrproxy.onrender.com/albums/${albumId}/tracks`);
      const songs = albumTracksResponse.data;

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
      const albums = artistAlbumsResponse.data;

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
      setSelectedAlbumCover(albumResponse.data.albumArt);
    } catch (error) {
      console.error('Error fetching album cover from Genius API', error);
      setError('Error fetching album cover: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchArtistSongs = async (artistId) => {
    setIsLoading(true);
    setError('');
    try {
      const response = await axios.get(`https://lyricmetrproxy.onrender.com/artists/${artistId}/songs`);
      setArtistSongs(response.data);
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

  const searchArtists = async () => {
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

  return (
    <div className="App">
      <header className="App-header">
        <h1>Lyricmetr</h1>
        <div className="button-container">
          <button onClick={() => setActiveButton('countWord')}>Count Word in Song</button>
          <button onClick={() => setActiveButton('listSongs')}>List Songs in Album</button>
          <button onClick={() => setActiveButton('listAlbums')}>List Albums by Artist</button>
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
        {activeButton === 'listSongsByArtist' && (
          <div className="input-container">
            <input
              type="text"
              placeholder="Enter artist name"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
            />
            <button onClick={searchArtists}>Search Artists</button>
          </div>
        )}
        {isLoading && <p>Loading...</p>}
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
            <h2>Songs by {artistName}:</h2>
            <ul>
              {artistSongs.map(song => (
                <li key={song.id}>{song.title}</li>
              ))}
            </ul>
          </div>
        )}
        {result && !error && <p>The word "{word}" appears {result} times in the song.</p>}
        {songDetails && (
          <div className="song-details">
            <img src={songDetails.albumArt} alt="Album Cover" />
            <p>{songDetails.title}</p>
          </div>
        )}
        {albumSongs.length > 0 && (
          <div className="album-songs">
            <h2>Songs in Album:</h2>
            <ul>
              {albumSongs.map(song => (
                <li key={song.id}>{song.title}</li>
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
    </div>
  );
}

export default App;
