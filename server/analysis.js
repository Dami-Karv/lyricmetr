const { createCache } = require('./cache');

const DEFAULTS = {
  maxPages: 60,
  maxSongs: 120,
  songsPerYear: 8,
  catalogTimeMs: 22_000,
  workTimeMs: 45_000,
  workers: 4
};
const VERSION_SUFFIX = /(?:\(([^()]*)\)|\[([^\[\]]*)\]|\s[-–—]\s(.+))\s*$/;
const VERSION_LABEL = /^(?:(?:.+\s)?remix|demo(?: version)?|instrumental(?: version)?|a ?capp?ella|karaoke|clean(?: version)?|radio edit|live(?: (?:at|from|in) .+| version)?|sped up|slowed(?: down)?|alternate(?: version| take))$/i;

function isAlternateVersion(title) {
  const suffix = String(title || '').match(VERSION_SUFFIX);
  return Boolean(suffix && VERSION_LABEL.test((suffix[1] ?? suffix[2] ?? suffix[3]).trim()));
}

function countTerms(tokens, terms) {
  return terms.map(term => {
    let count = 0;
    for (let i = 0; i <= tokens.length - term.tokens.length;) {
      const matches = term.tokens.every((token, offset) => tokens[i + offset] === token);
      if (matches) count += 1;
      i += matches ? term.tokens.length : 1;
    }
    return count;
  });
}

function rankSongs(a, b) {
  const engagement = song => (Number(song.annotation_count) || 0) + (Number(song.pyongs_count) || 0);
  return engagement(b) - engagement(a) || a.id - b.id;
}

async function analyzeCatalog(genius, { artistId, startYear, endYear, terms }, limits) {
  const startedAt = Date.now();
  const deadline = startedAt + limits.workTimeMs;
  const catalogDeadline = Math.min(deadline, startedAt + limits.catalogTimeMs);
  const reasons = new Set();
  const years = Array.from({ length: endYear - startYear + 1 }, (_, offset) => ({
    year: startYear + offset,
    songs: [],
    eligibleSongs: 0,
    selectedSongs: 0,
    analyzedSongs: 0,
    failedSongs: 0,
    analyzedWords: 0,
    counts: terms.map(() => 0)
  }));
  const exclusions = { otherPrimaryArtist: 0, alternateVersion: 0, unknownYear: 0 };
  const seen = new Set();
  let nextPage = 1;
  let pagesScanned = 0;
  let retryAfterSeconds = null;

  function upstreamReason(error, fallback) {
    if (error.code === 'RATE_LIMIT') {
      retryAfterSeconds = Math.max(retryAfterSeconds || 0, error.retryAfterSeconds || 0) || null;
      return 'rate_limited';
    }
    if (error.code === 'CONFIG') throw error;
    return error.code === 'BUSY' ? 'busy' : fallback;
  }

  while (nextPage !== null) {
    if (pagesScanned >= limits.maxPages || Date.now() >= catalogDeadline) {
      reasons.add(pagesScanned >= limits.maxPages ? 'page_limit' : 'time_limit');
      break;
    }

    let page;
    try {
      page = await genius.songsPage(artistId, nextPage);
    } catch (error) {
      reasons.add(upstreamReason(error, 'catalog_error'));
      break;
    }
    pagesScanned += 1;
    nextPage = page.nextPage;
    for (const song of page.songs) {
      if (!Number.isSafeInteger(song?.id) || seen.has(song.id)) continue;
      seen.add(song.id);
      if (song.primary_artist?.id !== artistId) {
        exclusions.otherPrimaryArtist += 1;
        continue;
      }
      if (isAlternateVersion(song.title)) {
        exclusions.alternateVersion += 1;
        continue;
      }
      const year = song.release_date_components?.year;
      if (!Number.isInteger(year)) {
        exclusions.unknownYear += 1;
        continue;
      }
      if (year >= startYear && year <= endYear) years[year - startYear].songs.push(song);
    }
  }

  const catalogComplete = nextPage === null;
  for (const row of years) {
    row.eligibleSongs = row.songs.length;
    row.songs.sort(rankSongs);
  }
  // Take the best remaining candidate from each year before filling another slot.
  const selected = [];
  for (let rank = 0; rank < limits.songsPerYear && selected.length < limits.maxSongs; rank += 1) {
    for (const row of years) {
      if (selected.length === limits.maxSongs) break;
      if (row.songs[rank]) {
        selected.push({ row, song: row.songs[rank] });
        row.selectedSongs += 1;
      }
    }
  }
  const sampled = years.some(row => row.eligibleSongs > row.selectedSongs);
  if (sampled) reasons.add('sampled');

  let cursor = 0;
  let stop = false;
  async function worker() {
    while (!stop && cursor < selected.length) {
      if (Date.now() >= deadline) {
        reasons.add('time_limit');
        break;
      }
      const { row, song } = selected[cursor++];
      let tokens;
      try {
        tokens = await genius.lyricTokens(song.url);
        if (!tokens.length) throw new Error('No usable lyrics for this track.');
      } catch (error) {
        row.failedSongs += 1;
        reasons.add('lyrics_failed');
        const reason = upstreamReason(error, 'lyrics_failed');
        reasons.add(reason);
        if (reason === 'rate_limited' || reason === 'busy') stop = true;
        continue;
      }
      row.analyzedSongs += 1;
      row.analyzedWords += tokens.length;
      const counts = countTerms(tokens, terms);
      counts.forEach((count, index) => { row.counts[index] += count; });
    }
  }
  await Promise.all(Array.from({ length: Math.min(limits.workers, selected.length) }, worker));

  const resultYears = years.map(({ songs, ...row }) => ({
    ...row,
    skippedSongs: row.selectedSongs - row.analyzedSongs - row.failedSongs
  }));
  return {
    years: resultYears,
    meta: {
      partial: reasons.size > 0,
      reasons: [...reasons].sort(),
      catalogComplete,
      pagesScanned,
      sampled,
      songsPerYear: limits.songsPerYear,
      maxSongs: limits.maxSongs,
      exclusions,
      retryAfterSeconds
    }
  };
}

function responseFor(result, request, sortedTerms) {
  const indexes = new Map(sortedTerms.map(({ key }, index) => [key, index]));
  const terms = request.terms.map(({ key, label }) => ({ key, label }));
  const years = result.years.map(({ counts, ...row }) => ({
    ...row,
    terms: terms.map(({ key }) => {
      const count = counts[indexes.get(key)];
      return {
        count,
        perThousand: row.analyzedWords ? count * 1000 / row.analyzedWords : null
      };
    })
  }));
  return {
    artistId: request.artistId,
    startYear: request.startYear,
    endYear: request.endYear,
    terms,
    years,
    frequencies: Object.fromEntries(terms.map(({ label }, i) => [label,
      Object.fromEntries(years.map(row => [row.year, row.analyzedWords ? row.terms[i].count : null]))
    ])),
    totals: Object.fromEntries(terms.map(({ label }, i) => [label,
      years.reduce((sum, row) => sum + row.terms[i].count, 0)
    ])),
    meta: result.meta
  };
}

function createAnalysis(genius, overrides = {}) {
  const limits = { ...DEFAULTS, ...overrides };
  const cache = createCache(150, 30 * 60_000);
  const pending = new Map();

  return async request => {
    const sortedTerms = [...request.terms].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    const key = JSON.stringify([request.artistId, request.startYear, request.endYear, sortedTerms.map(term => term.key)]);
    const saved = cache.get(key);
    if (saved) return responseFor(saved, request, sortedTerms);

    if (!pending.has(key)) {
      if (pending.size >= 3) {
        throw Object.assign(new Error('Lyricmetr is busy. Try again shortly.'), { code: 'BUSY' });
      }
      const job = analyzeCatalog(genius, { ...request, terms: sortedTerms }, limits);
      pending.set(key, job);
    }

    const job = pending.get(key);
    try {
      const result = await job;
      if (result.meta.reasons.every(reason => reason === 'sampled')) cache.set(key, result);
      return responseFor(result, request, sortedTerms);
    } finally {
      if (pending.get(key) === job) pending.delete(key);
    }
  };
}

module.exports = { countTerms, createAnalysis };
