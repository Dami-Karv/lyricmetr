require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { getLyrics } = require("genius-lyrics-api");

const app = express();
const PORT = Number(process.env.API_PORT || process.env.PORT) || 5000;
const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;
const LYRICS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FREQUENCY_CACHE_TTL_MS = 30 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SEARCH_STALE_TTL_MS = 24 * 60 * 60 * 1000;
const ARTIST_SONGS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_GENIUS_COOLDOWN_MS = 90 * 1000;
const GENIUS_MIN_INTERVAL_MS = Number(process.env.GENIUS_MIN_INTERVAL_MS) || 650;
const lyricsCache = new Map();
const frequencyCache = new Map();
const artistSearchCache = new Map();
const artistSongsCache = new Map();
let geniusCooldownUntil = 0;
let geniusQueue = Promise.resolve();
let geniusNextRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error) {
  const status = error?.response?.status;
  const message = String(error?.message || "");
  return status === 429 || message.includes("429") || message.includes("1015");
}

function setGeniusCooldownFromError(error) {
  const retryAfterHeader = error?.response?.headers?.["retry-after"];
  const retryAfterSec = Number(retryAfterHeader);
  const cooldownMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
    ? retryAfterSec * 1000
    : DEFAULT_GENIUS_COOLDOWN_MS;
  const until = Date.now() + cooldownMs;
  geniusCooldownUntil = Math.max(geniusCooldownUntil, until);
}

async function runGeniusApiCall(operation) {
  const run = async () => {
    const now = Date.now();
    if (geniusCooldownUntil > now) {
      await sleep(geniusCooldownUntil - now);
    }

    const waitForIntervalMs = Math.max(0, geniusNextRequestAt - Date.now());
    if (waitForIntervalMs > 0) {
      await sleep(waitForIntervalMs);
    }

    geniusNextRequestAt = Date.now() + GENIUS_MIN_INTERVAL_MS;
    return operation();
  };

  const queued = geniusQueue.then(run, run);
  geniusQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

async function withRetries(operation, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : 4;
  const baseDelayMs = Number.isFinite(options.baseDelayMs) ? options.baseDelayMs : 700;

  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await operation();
    } catch (error) {
      if (isRateLimitError(error)) {
        setGeniusCooldownFromError(error);
      }

      if (attempt >= retries || !isRateLimitError(error)) {
        throw error;
      }

      const jitter = Math.floor(Math.random() * 250);
      const delayMs = baseDelayMs * Math.pow(2, attempt) + jitter;
      await sleep(delayMs);
      attempt += 1;
    }
  }

  return null;
}

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

function requireToken(res) {
  if (GENIUS_ACCESS_TOKEN) {
    return true;
  }

  res.status(500).json({
    error: "GENIUS_ACCESS_TOKEN is not configured. Add it to your .env file."
  });
  return false;
}

function countLiteralOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let fromIndex = 0;

  while (fromIndex < text.length) {
    const foundIndex = text.indexOf(needle, fromIndex);
    if (foundIndex === -1) break;
    count += 1;
    fromIndex = foundIndex + needle.length;
  }

  return count;
}

function getLyricsCacheKey(url) {
  return String(url || "").trim();
}

function readCache(cache, key) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function writeCache(cache, key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function readStaleCache(cache, key, maxStaleMs) {
  const cached = cache.get(key);
  if (!cached) return null;
  const staleAgeMs = Date.now() - cached.expiresAt;
  if (staleAgeMs > maxStaleMs) return null;
  return cached.value;
}

function normalizeQueryKey(value) {
  return String(value || "").trim().toLowerCase();
}

function createArtistSongsCacheEntry() {
  return {
    songs: [],
    songIds: new Set(),
    pagesFetched: 0,
    exhausted: false,
    oldestYearCovered: Number.POSITIVE_INFINITY,
    expiresAt: Date.now() + ARTIST_SONGS_CACHE_TTL_MS
  };
}

function getArtistSongsCacheEntry(artistId) {
  const key = String(artistId);
  const cached = artistSongsCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    const fresh = createArtistSongsCacheEntry();
    artistSongsCache.set(key, fresh);
    return fresh;
  }
  return cached;
}

function addSongsToArtistCache(entry, songs) {
  for (const song of songs) {
    if (!song || !song.id || entry.songIds.has(song.id)) continue;
    entry.songIds.add(song.id);
    entry.songs.push(song);
  }

  const years = songs
    .map((song) => song?.release_date_components?.year)
    .filter((year) => typeof year === "number");
  if (years.length > 0) {
    entry.oldestYearCovered = Math.min(entry.oldestYearCovered, ...years);
  }
  entry.expiresAt = Date.now() + ARTIST_SONGS_CACHE_TTL_MS;
}

async function geniusApiGet(url, params, retryOptions = {}) {
  return withRetries(
    () =>
      runGeniusApiCall(() =>
        axios.get(url, {
          params,
          headers: { Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}` }
        })
      ),
    retryOptions
  );
}

function readCachedLyrics(url) {
  const key = getLyricsCacheKey(url);
  return readCache(lyricsCache, key);
}

function writeCachedLyrics(url, lyrics) {
  const key = getLyricsCacheKey(url);
  writeCache(lyricsCache, key, lyrics, LYRICS_CACHE_TTL_MS);

  // Keep memory bounded.
  if (lyricsCache.size > 5000) {
    const oldestKey = lyricsCache.keys().next().value;
    if (oldestKey) lyricsCache.delete(oldestKey);
  }
}

async function getLyricsCached(url) {
  const cached = readCachedLyrics(url);
  if (cached) return cached;

  const lyrics = await withRetries(() => getLyrics(url), {
    retries: 3,
    baseDelayMs: 800
  });
  if (lyrics) {
    writeCachedLyrics(url, lyrics);
  }

  return lyrics;
}

function isAuxiliaryVersion(song) {
  const title = (song?.title || "").toLowerCase();
  const url = (song?.url || "").toLowerCase();
  const flags = [
    "instrumental",
    "acapella",
    "clean",
    "slowed",
    "sped up",
    "karaoke",
    "annotated",
    "reference track",
    "demo",
    "interlude",
    "skit",
    "speech"
  ];

  return flags.some((flag) => title.includes(flag) || url.includes(flag));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/lyrics-by-url", async (req, res) => {
  const songUrl = req.query.url;
  if (!songUrl) {
    return res.status(400).json({ error: "Song URL is required" });
  }

  try {
    const lyrics = await getLyricsCached(songUrl);
    if (!lyrics) {
      return res.status(404).json({ error: "Lyrics not found" });
    }

    res.json({ lyrics });
  } catch (error) {
    console.error("Error fetching lyrics by URL:", error.message);
    res.status(500).json({ error: "Error fetching lyrics", details: error.message });
  }
});

app.get("/api/search-artist", async (req, res) => {
  if (!requireToken(res)) return;
  const query = String(req.query.q || "").trim();
  const queryKey = normalizeQueryKey(query);

  if (!query) {
    return res.status(400).json({ error: "Missing q parameter" });
  }

  const cached = readCache(artistSearchCache, queryKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const response = await geniusApiGet(
      "https://api.genius.com/search",
      { q: query },
      { retries: 3, baseDelayMs: 700 }
    );

    const hits = response.data.response.hits;
    const artists = hits
      .filter((hit) => hit.result?.primary_artist?.url?.includes("/artists/"))
      .map((hit) => ({
        id: hit.result.primary_artist.id,
        name: hit.result.primary_artist.name,
        url: hit.result.primary_artist.url
      }));

    const uniqueArtists = Array.from(new Set(artists.map((a) => a.id))).map((id) =>
      artists.find((a) => a.id === id)
    );

    writeCache(artistSearchCache, queryKey, uniqueArtists, SEARCH_CACHE_TTL_MS);
    res.json(uniqueArtists);
  } catch (error) {
    if (isRateLimitError(error)) {
      const stale = readStaleCache(artistSearchCache, queryKey, SEARCH_STALE_TTL_MS);
      if (stale) {
        return res.json(stale);
      }
      return res.status(429).json({
        error: "Genius rate limit reached. Please retry in a minute.",
        details: "Artist search is temporarily rate-limited. Retry after about 60-90 seconds."
      });
    }

    console.error("Error searching artist:", error.message);
    res.status(500).json({ error: "Error searching artist", details: error.message });
  }
});

app.get("/api/artist-songs-word-frequency", async (req, res) => {
  if (!requireToken(res)) return;
  const artistId = req.query.artistId;
  const numericArtistId = Number(artistId);
  const startYear = Number(req.query.startYear);
  const endYear = Number(req.query.endYear);
  const singleWord = typeof req.query.word === "string" ? req.query.word.trim() : "";
  const wordsQuery = typeof req.query.words === "string" ? req.query.words : "";
  const speedModeRaw = typeof req.query.speed === "string" ? req.query.speed.toLowerCase() : "fast";
  const speedMode = ["fast", "balanced", "full"].includes(speedModeRaw) ? speedModeRaw : "fast";
  const requestedMaxPages = Number(req.query.maxPages);
  const defaultMaxPages = startYear <= 2010 ? 50 : startYear <= 2015 ? 35 : 20;
  const maxPages = Number.isFinite(requestedMaxPages)
    ? Math.min(Math.max(requestedMaxPages, 1), 100)
    : defaultMaxPages;
  const requestedBatchSize = Number(req.query.batchSize);
  const defaultBatchSize = speedMode === "full" ? 4 : speedMode === "balanced" ? 5 : 6;
  const batchSize = Number.isFinite(requestedBatchSize)
    ? Math.min(Math.max(requestedBatchSize, 1), 24)
    : defaultBatchSize;
  const requestedMaxSongsPerYear = Number(req.query.maxSongsPerYear);
  const defaultMaxSongsPerYear = speedMode === "full" ? 0 : speedMode === "balanced" ? 10 : 6;
  const maxSongsPerYear = Number.isFinite(requestedMaxSongsPerYear)
    ? Math.max(requestedMaxSongsPerYear, 0)
    : defaultMaxSongsPerYear;

  const requestedWords = wordsQuery
    ? wordsQuery
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : singleWord
      ? [singleWord]
      : [];
  const uniqueWords = [];
  const seenWords = new Set();
  for (const w of requestedWords) {
    const key = w.toLowerCase();
    if (!seenWords.has(key)) {
      seenWords.add(key);
      uniqueWords.push(w);
    }
  }
  const cacheKey = JSON.stringify({
    artistId: numericArtistId,
    startYear,
    endYear,
    words: uniqueWords.map((w) => w.toLowerCase()),
    speedMode,
    maxPages,
    batchSize,
    maxSongsPerYear
  });

  if (
    !artistId ||
    Number.isNaN(numericArtistId) ||
    Number.isNaN(startYear) ||
    Number.isNaN(endYear) ||
    uniqueWords.length === 0
  ) {
    return res.status(400).json({
      error: "artistId, startYear, endYear, and word(s) are required"
    });
  }

  const cachedPayload = readCache(frequencyCache, cacheKey);
  if (cachedPayload) {
    return res.json(cachedPayload);
  }

  const artistCacheEntry = getArtistSongsCacheEntry(numericArtistId);
  let allSongs = [];
  const frequencyByWord = Object.fromEntries(uniqueWords.map((w) => [w, {}]));
  const totalsByWord = Object.fromEntries(uniqueWords.map((w) => [w, 0]));
  const normalizedWords = uniqueWords.map((word) => word.toLowerCase());
  let partialDueToRateLimit = false;
  let rateLimitedLyricsFailures = 0;

  try {
    while (
      !artistCacheEntry.exhausted &&
      artistCacheEntry.oldestYearCovered > startYear &&
      artistCacheEntry.pagesFetched < maxPages
    ) {
      const nextPage = artistCacheEntry.pagesFetched + 1;
      let response;
      try {
        response = await geniusApiGet(
          `https://api.genius.com/artists/${artistId}/songs`,
          { page: nextPage, sort: "release_date", per_page: 50 },
          { retries: 3, baseDelayMs: 800 }
        );
      } catch (error) {
        if (isRateLimitError(error)) {
          partialDueToRateLimit = true;
          break;
        }
        throw error;
      }

      const songs = response.data.response.songs;
      if (!songs.length) {
        artistCacheEntry.exhausted = true;
        break;
      }

      addSongsToArtistCache(artistCacheEntry, songs);
      artistCacheEntry.pagesFetched = nextPage;
    }

    allSongs = artistCacheEntry.songs;

    const seenSongIds = new Set();
    const candidateSongs = allSongs.filter((song) => {
      if (song.primary_artist?.id !== numericArtistId) return false;
      if (isAuxiliaryVersion(song)) return false;

      const year = song.release_date_components?.year;
      if (typeof year !== "number" || year < startYear || year > endYear) return false;
      if (!song.url) return false;
      if (seenSongIds.has(song.id)) return false;

      seenSongIds.add(song.id);
      return true;
    });

    if (partialDueToRateLimit && candidateSongs.length === 0) {
      return res.status(429).json({
        error: "Genius rate limit reached. Please retry in a minute.",
        details: "No songs could be loaded before rate limiting started."
      });
    }

    const finalSongs =
      maxSongsPerYear > 0
        ? Object.values(
            candidateSongs.reduce((acc, song) => {
              const year = song.release_date_components.year;
              if (!acc[year]) acc[year] = [];
              acc[year].push(song);
              return acc;
            }, {})
          ).flatMap((songsForYear) =>
            songsForYear
              .sort((a, b) => {
                const aScore = (a.annotation_count || 0) + (a.pyongs_count || 0);
                const bScore = (b.annotation_count || 0) + (b.pyongs_count || 0);
                return bScore - aScore;
              })
              .slice(0, maxSongsPerYear)
          )
        : candidateSongs;

    for (let i = 0; i < finalSongs.length; i += batchSize) {
      const batch = finalSongs.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (song) => {
          const lyrics = await getLyricsCached(song.url);
          if (!lyrics) return null;

          return {
            year: song.release_date_components.year,
            lyrics
          };
        })
      );

      for (const result of batchResults) {
        if (result.status !== "fulfilled" || !result.value) {
          if (result.status === "rejected" && isRateLimitError(result.reason)) {
            rateLimitedLyricsFailures += 1;
            partialDueToRateLimit = true;
          }
          continue;
        }

        const { year, lyrics } = result.value;
        const normalizedLyrics = String(lyrics || "").toLowerCase();
        for (let wordIndex = 0; wordIndex < uniqueWords.length; wordIndex += 1) {
          const word = uniqueWords[wordIndex];
          const count = countLiteralOccurrences(normalizedLyrics, normalizedWords[wordIndex]);
          if (!count) continue;

          frequencyByWord[word][year] = (frequencyByWord[word][year] || 0) + count;
          totalsByWord[word] += count;
        }
      }
    }

    if (wordsQuery) {
      const payload = {
        frequencies: frequencyByWord,
        totals: totalsByWord,
        meta: {
          speed: speedMode,
          scannedSongs: candidateSongs.length,
          processedSongs: finalSongs.length,
          partial: partialDueToRateLimit,
          rateLimitedLyricsFailures,
          artistPagesCached: artistCacheEntry.pagesFetched,
          oldestYearCovered:
            Number.isFinite(artistCacheEntry.oldestYearCovered) ? artistCacheEntry.oldestYearCovered : null
        }
      };
      if (!partialDueToRateLimit) {
        writeCache(frequencyCache, cacheKey, payload, FREQUENCY_CACHE_TTL_MS);
      }
      return res.json(payload);
    }

    const singleResultWord = uniqueWords[0];
    const payload = frequencyByWord[singleResultWord] || {};
    if (!partialDueToRateLimit) {
      writeCache(frequencyCache, cacheKey, payload, FREQUENCY_CACHE_TTL_MS);
    }
    return res.json(payload);
  } catch (error) {
    console.error("Error fetching artist songs frequency:", error.message);
    res
      .status(500)
      .json({ error: "Error fetching artist songs frequency", details: error.message });
  }
});

if (process.env.NODE_ENV === "production") {
  const buildPath = path.join(__dirname, "build");
  app.use(express.static(buildPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(buildPath, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Server error", details: err.message });
});

app.listen(PORT, () => {
  console.log(`Lyricmetr server listening on port ${PORT}`);
});
