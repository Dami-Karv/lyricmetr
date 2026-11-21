const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const { countTerms, createAnalysis } = require('./analysis');
const { createCache } = require('./cache');
const { createGenius, extractLyrics } = require('./genius');
const { createApp } = require('../server');
const { parseAnalysis, tokenize } = require('../src/analysis-input');

function query(input = {}) {
  return parseAnalysis({ artistId: 7, startYear: 2020, endYear: 2022, words: 'love', ...input }, 2026);
}

function song(id, year, extras = {}) {
  return {
    id, title: 'Song ' + id, primary_artist: { id: 7 }, url: 'https://genius.com/song-' + id + '-lyrics',
    release_date_components: { year }, ...extras
  };
}

function fixture(pages, getTokens = () => tokenize('love again')) {
  const requests = { pages: [], lyrics: [] };
  const genius = {
    async songsPage(_artistId, page) {
      requests.pages.push(page);
      return { songs: pages[page - 1], nextPage: page < pages.length ? page + 1 : null };
    },
    async lyricTokens(url) {
      const id = Number(url.match(/song-(\d+)-/)[1]);
      requests.lyrics.push(id);
      return getTokens(id);
    }
  };
  return { genius, requests };
}

test('matches whole words and phrases, normalizes case and apostrophes, and keeps accents distinct', () => {
  const { terms } = query({ words: "LOVE, love, don't, café, cafe, go go" });
  assert.deepEqual(terms.map(term => term.label), ['LOVE', "don't", 'café', 'cafe', 'go go']);
  const tokens = tokenize('Glove, LOVE! Love’s. Don’t stop. CAFÉ; cafe. Go, go go.');
  assert.deepEqual(countTerms(tokens, terms), [1, 1, 1, 1, 1]);
  assert.deepEqual(countTerms(tokenize('pre-order'), query({ words: 'Pre order' }).terms), [1]);
});

test('rejects invalid years, IDs and term limits', () => {
  for (const input of [
    { artistId: ['7'] }, { artistId: '4.3' }, { artistId: '0' },
    { startYear: 2023 }, { startYear: 1949 }, { endYear: 2027 },
    { startYear: 1980 }, { words: '!!!' }, { words: 'a,b,c,d,e,f,g' },
    { words: 'x'.repeat(61) }, { words: 'one two three four five six seven eight nine' }
  ]) {
    assert.throws(() => query(input), { status: 400 });
  }
});

test('follows the catalog cursor across the boundary year and preserves zero and missing years', async () => {
  const { genius, requests } = fixture([[song(1, 2020), song(2, 2022)], [song(3, 2020)]],
    id => tokenize(id === 2 ? 'another word' : 'love love again'));
  const result = await createAnalysis(genius)(query());
  assert.deepEqual(requests.pages, [1, 2]);
  assert.equal(result.meta.catalogComplete, true);
  assert.equal(result.meta.partial, false);
  assert.deepEqual(result.years.map(row => row.analyzedWords), [6, 0, 2]);
  assert.deepEqual(result.years.map(row => row.terms[0].count), [4, 0, 0]);
  assert.deepEqual(result.years.map(row => row.terms[0].perThousand), [4000 / 6, null, 0]);
});

test('samples by engagement, keeps legitimate titles, and counts excluded tracks', async () => {
  const { genius, requests } = fixture([[
    song(1, 2020, { title: 'Clean Slate', annotation_count: 8 }), song(2, 2020),
    song(3, 2020, { title: 'Song (Dance Remix)' }), song(4, null),
    song(5, 2020, { primary_artist: { id: 88 } }), song(6, 2021),
    song(7, 2020, { title: 'How I Live', annotation_count: 7 })
  ], [song(1, 2020)]]);
  const result = await createAnalysis(genius, { songsPerYear: 2, maxSongs: 3 })(query());
  assert.deepEqual(requests.lyrics, [1, 6, 7]);
  assert.deepEqual(result.years.map(row => row.eligibleSongs), [3, 1, 0]);
  assert.deepEqual(result.years.map(row => row.selectedSongs), [2, 1, 0]);
  assert.deepEqual(result.meta.exclusions, { otherPrimaryArtist: 1, alternateVersion: 1, unknownYear: 1 });
  assert.deepEqual(result.meta.reasons, ['sampled']);
  assert.equal(result.meta.partial, true);
});

test('reports a truncated catalog and lyric failures accurately', async () => {
  const { genius } = fixture([[song(1, 2020), song(2, 2020)], [song(3, 2020)]], id => {
    if (id === 2) throw new Error('No lyrics');
    return tokenize('love twice');
  });
  const { years, meta } = await createAnalysis(genius, { maxPages: 1 })(query());
  assert.equal(meta.catalogComplete, false);
  assert.equal(meta.partial, true);
  assert.deepEqual(meta.reasons, ['lyrics_failed', 'page_limit']);
  assert.equal(years[0].eligibleSongs, 2);
  assert.equal(years[0].selectedSongs, 2);
  assert.equal(years[0].analyzedSongs, 1);
  assert.equal(years[0].failedSongs, 1);
  assert.equal(years[0].skippedSongs, 0);
});

test('marks unscheduled lyrics after rate limiting and does not cache operational partial results', async () => {
  let rateLimited = true;
  const { genius, requests } = fixture([[song(1, 2020), song(2, 2020)]], () => {
    if (rateLimited) throw Object.assign(new Error('Rate limited'), { code: 'RATE_LIMIT', retryAfterSeconds: 12 });
    return tokenize('love');
  });
  const analyze = createAnalysis(genius, { workers: 1 });
  const first = await analyze(query());
  assert.equal(first.meta.retryAfterSeconds, 12);
  assert.deepEqual(first.meta.reasons, ['lyrics_failed', 'rate_limited']);
  assert.deepEqual(first.years.slice(0, 1).map(row => [row.failedSongs, row.skippedSongs]), [[1, 1]]);
  rateLimited = false;
  const second = await analyze(query());
  assert.equal(second.meta.partial, false);
  assert.equal(second.years[0].analyzedSongs, 2);
  assert.deepEqual(requests.pages, [1, 1]);
});

test('deduplicates concurrent analyses and serves each request its original labels and order', async () => {
  const { genius, requests } = fixture([[song(1, 2020)]], () => tokenize('love again again'));
  const analyze = createAnalysis(genius);
  const [first, second] = await Promise.all([
    analyze(query({ words: 'Love, again' })), analyze(query({ words: 'AGAIN, love' }))
  ]);
  assert.deepEqual(requests.pages, [1]);
  assert.deepEqual(first.terms.map(term => term.label), ['Love', 'again']);
  assert.deepEqual(second.terms.map(term => term.label), ['AGAIN', 'love']);
  assert.deepEqual(second.years[0].terms.map(term => term.count), [2, 1]);
  assert.deepEqual(second.totals, { AGAIN: 2, love: 1 });
});

test('bounds cache entries and keeps recently accessed values', () => {
  const cache = createCache(2, 1000);
  cache.set('a', 1);
  cache.set('b', 2);
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
});

test('parses current and legacy lyric markup while removing Genius section headings', () => {
  assert.equal(extractLyrics('<div data-lyrics-container="true">[Verse 1: Artist]<br>Love&nbsp;again</div>'), 'Love\u00a0again');
  assert.equal(extractLyrics('<div class="lyrics">First<br />Second</div>'), 'First\nSecond');
  assert.equal(extractLyrics('<div data-lyrics-container="true"><div class="Lyrics__ContainerTwice">Love</div></div>'), 'Love');
});

test('Genius client deduplicates metadata and lyrics, sets timeouts, and surfaces retry-after', async () => {
  const calls = [];
  let limiting = false;
  const http = {
    async get(url, config) {
      calls.push({ url, config });
      if (limiting) {
        throw Object.assign(new Error('Rate limit'), { response: { status: 429, headers: { 'retry-after': '4' } } });
      }
      if (url.includes('api.genius.com')) return { data: { response: { hits: [{
        result: { title: 'Example', primary_artist: { id: 7, name: 'Example Artist' } }
      }] } } };
      return { data: '<div data-lyrics-container="true">Love again</div>' };
    }
  };
  const genius = createGenius({ token: 'fixture', http, metadataIntervalMs: 0 });
  const [a, b] = await Promise.all([genius.search('Example'), genius.search('example')]);
  assert.deepEqual(a, b);
  assert.equal(a[0].exampleSong, 'Example');
  const [first, second] = await Promise.all([
    genius.lyricTokens('https://genius.com/example-lyrics'),
    genius.lyricTokens('https://www.genius.com/example-lyrics?foo=bar')
  ]);
  assert.deepEqual(first, ['love', 'again']);
  assert.deepEqual(second, first);
  assert.equal(calls.length, 2);
  for (const { config } of calls) {
    assert.ok(config.timeout > 0);
    assert.equal(config.maxRedirects, 0);
  }
  limiting = true;
  await assert.rejects(genius.search('Another'), { code: 'RATE_LIMIT', retryAfterSeconds: 4 });
  await assert.rejects(genius.search('During cooldown'), { code: 'RATE_LIMIT' });
  assert.equal(calls.length, 3);
});

test('Express returns a consistent result for legacy and current queries and validates malformed input', async t => {
  const { genius } = fixture([[song(1, 2020)]]);
  const listener = createApp({ genius }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => listener.close(resolve)));
  await once(listener, 'listening');
  const base = 'http://127.0.0.1:' + listener.address().port;
  const url = base + '/api/artist-songs-word-frequency?artistId=7&startYear=2020&endYear=2021&';
  const [legacy, modern, invalid, removed] = await Promise.all([
    fetch(url + 'word=LOVE'), fetch(url + 'words=love'), fetch(url + 'words=%21'),
    fetch(base + '/api/lyrics-by-url')
  ]);
  assert.equal(legacy.status, 200);
  assert.equal(modern.status, 200);
  assert.equal(invalid.status, 400);
  assert.equal(removed.status, 404);
  const [first, second] = await Promise.all([legacy.json(), modern.json()]);
  assert.deepEqual(first.years, second.years);
  assert.deepEqual(first.totals, { LOVE: 1 });
  assert.deepEqual(second.totals, { love: 1 });
});
