const axios = require('axios');
const cheerio = require('cheerio');
const { createCache, memoizeRequests } = require('./cache');
const { tokenize } = require('../src/analysis-input');

const PAGE_SIZE = 50;
const TIMEOUT_MS = 8000;
const QUEUE_WAIT_MS = 4000;
const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 300_000;
const DEFAULT_METADATA_INTERVAL_MS = 650;
const GENIUS_HOSTS = new Set(['genius.com', 'www.genius.com']);
const LYRICS_SELECTORS = '[data-lyrics-container="true"], div[class^="Lyrics__Container"]';
const SECTION_HEADING = /^\s*\[(?:intro|verse|pre[- ]chorus|chorus|post[- ]chorus|bridge|outro|hook|refrain|interlude|instrumental|breakdown|spoken)(?=[\s:\]\d])[^]*\]\s*$/i;

function rateLimit(retryAfterSeconds) {
  return Object.assign(new Error('Genius is rate-limiting requests. Try again shortly.'), {
    code: 'RATE_LIMIT', retryAfterSeconds
  });
}

function cooldownFromHeader(header) {
  if (!header) return DEFAULT_COOLDOWN_MS;
  const seconds = Number(header);
  const parsed = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_COOLDOWN_MS) : DEFAULT_COOLDOWN_MS;
}

function createScheduler({ concurrency, intervalMs, maxQueue }) {
  const queue = [];
  let active = 0;
  let nextStart = 0;
  let cooldownUntil = 0;
  let timer;

  function pump() {
    if (!queue.length || active >= concurrency || timer) return;
    if (Date.now() < cooldownUntil) {
      const error = rateLimit(Math.ceil((cooldownUntil - Date.now()) / 1000));
      for (const item of queue.splice(0)) {
        clearTimeout(item.expiry);
        item.reject(error);
      }
      return;
    }
    const delay = nextStart - Date.now();
    if (delay > 0) {
      timer = setTimeout(() => { timer = undefined; pump(); }, delay);
      return;
    }
    const item = queue.shift();
    clearTimeout(item.expiry);
    active += 1;
    nextStart = Date.now() + intervalMs;
    Promise.resolve().then(item.work).then(item.resolve, error => {
      if (error.response?.status === 429 || (error.response?.status === 403
        && typeof error.response.data === 'string' && /\b(?:error\s+)?1015\b/i.test(error.response.data))) {
        const cooldown = cooldownFromHeader(error.response.headers?.['retry-after']);
        cooldownUntil = Date.now() + cooldown;
        item.reject(rateLimit(Math.ceil(cooldown / 1000)));
      } else {
        item.reject(error);
      }
    }).finally(() => { active -= 1; pump(); });
    pump();
  }

  return work => new Promise((resolve, reject) => {
    if (Date.now() < cooldownUntil) {
      reject(rateLimit(Math.ceil((cooldownUntil - Date.now()) / 1000)));
      return;
    }
    if (queue.length >= maxQueue) {
      reject(Object.assign(new Error('Lyricmetr is busy. Try again shortly.'), { code: 'BUSY' }));
      return;
    }
    const item = { work, resolve, reject };
    item.expiry = setTimeout(() => {
      const position = queue.indexOf(item);
      if (position < 0) return;
      queue.splice(position, 1);
      reject(Object.assign(new Error('The Genius request queue is busy.'), { code: 'BUSY' }));
    }, QUEUE_WAIT_MS);
    queue.push(item);
    pump();
  });
}

function songUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Genius supplied an invalid song URL.');
  }
  if (url.protocol !== 'https:' || !GENIUS_HOSTS.has(url.hostname) || url.port || url.username || url.password) {
    throw new Error('Genius supplied an unsupported song URL.');
  }
  return 'https://genius.com' + url.pathname;
}

function extractLyrics(html) {
  const $ = cheerio.load(html);
  const containers = $(LYRICS_SELECTORS);
  const blocks = containers.length
    ? containers.filter((_, block) => !$(block).parents(LYRICS_SELECTORS).length)
    : $('div.lyrics');
  blocks.find('script, style, [data-exclude-from-selection="true"]').remove();
  blocks.find('br').replaceWith('\n');
  return blocks.map((_, block) => $(block).text()).get().join('\n')
    .split(/\r?\n/).filter(line => !SECTION_HEADING.test(line)).join('\n').trim();
}

function createGenius({ token, http = axios, metadataIntervalMs = DEFAULT_METADATA_INTERVAL_MS } = {}) {
  const metadata = createScheduler({ concurrency: 1, intervalMs: metadataIntervalMs, maxQueue: 16 });
  const lyrics = createScheduler({ concurrency: 2, intervalMs: 150, maxQueue: 20 });
  const requestOptions = { timeout: TIMEOUT_MS, maxRedirects: 0, maxContentLength: 2 * 1024 * 1024 };
  const apiGet = (path, params) => metadata(async () => {
    if (!token) {
      throw Object.assign(new Error('Genius is not configured on this server.'), { code: 'CONFIG' });
    }
    const result = await http.get('https://api.genius.com' + path, {
      ...requestOptions, params, headers: { Authorization: 'Bearer ' + token }
    });
    if (!result.data?.response) throw new Error('Genius returned an unexpected response.');
    return result.data.response;
  });

  const search = memoizeRequests(async (_key, query) => {
    const { hits } = await apiGet('/search', { q: query });
    if (!Array.isArray(hits)) throw new Error('Genius returned invalid search results.');
    const artists = new Map();
    for (const { result } of hits) {
      const artist = result?.primary_artist;
      if (!Number.isSafeInteger(artist?.id) || typeof artist.name !== 'string' || artists.has(artist.id)) continue;
      artists.set(artist.id, { id: artist.id, name: artist.name, exampleSong: result.title || null });
    }
    return [...artists.values()];
  }, createCache(250, 6 * 60 * 60_000), 16);

  const page = memoizeRequests(async (_key, artistId, pageNumber) => {
    const response = await apiGet('/artists/' + artistId + '/songs', {
      page: pageNumber, sort: 'release_date', per_page: PAGE_SIZE
    });
    if (!Array.isArray(response.songs)) throw new Error('Genius returned an invalid song catalog.');
    const next = response.next_page === undefined && response.songs.length === PAGE_SIZE
      ? pageNumber + 1
      : response.next_page;
    if (next != null && (!Number.isSafeInteger(next) || next <= pageNumber)) {
      throw new Error('Genius returned an invalid next page.');
    }
    return { songs: response.songs, nextPage: next ?? null };
  }, createCache(400, 60 * 60_000), 16);

  const lyricTokens = memoizeRequests(url => lyrics(async () => {
    const { data } = await http.get(url, { ...requestOptions, responseType: 'text' });
    const tokens = tokenize(extractLyrics(data));
    if (!tokens.length || tokens.length > 15_000) throw new Error('No usable lyrics on the Genius page.');
    return tokens;
  }), createCache(500, 12 * 60 * 60_000), 24);

  return {
    search: query => search(query.toLowerCase(), query),
    songsPage: (artistId, pageNumber) => page(artistId + ':' + pageNumber, artistId, pageNumber),
    lyricTokens: url => lyricTokens(songUrl(url))
  };
}

module.exports = { createGenius, extractLyrics };
