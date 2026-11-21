# Lyricmetr

Compare how often words and phrases appear in an artist’s lyrics by release year. The chart shows matches per 1,000 analyzed words by default and can switch to raw matches. The table includes the underlying counts and song coverage for each year.

## Run locally

1. Install Node.js 18.17 or newer and run `npm ci`.
2. Copy `.env.example` to `.env` and add a Genius API access token as `GENIUS_ACCESS_TOKEN`.
3. Run `npm run dev` and open http://localhost:3000. The development client proxies requests to the API on port 5000.

Run `npm run build` to create the production UI, then run `npm run server` with `NODE_ENV=production` to serve it with the API. The API listens on `API_PORT` or `PORT`, defaulting to 5000. `GET /api/health` checks that the server is running. A healthy server can still lack a Genius token.

## How the numbers are produced

- **Artist and dates.** Search suggests primary artists from Genius song search results and shows an example track and Genius ID. Analysis uses songs whose Genius primary artist matches the selected ID and whose release year is in the requested range. Tracks where the artist is only featured, undated tracks, and explicitly labeled alternate versions such as remixes, demos, and instrumentals are excluded. Song IDs are deduplicated. A date on Genius may differ from the original release date.
- **Counting.** Terms are matched case-insensitively on complete Unicode letter and number tokens. Internal apostrophes are kept, straight and curly apostrophes are equivalent, and accents remain significant. Other punctuation and whitespace separate words. A phrase matches consecutive tokens within a track and repeated occurrences of the same phrase are counted without overlap. Duplicate terms collapse to their first label. Recognized section headings are removed from scraped lyrics.
- **Sampling.** Lyricmetr follows Genius pagination and never assumes that seeing a requested year once exhausts that year. It selects up to eight songs per year and 120 overall from the tracks found, ranking them by annotation count plus pyong count and breaking ties by song ID. It gives each eligible year one slot before returning for another. This favors tracks with more Genius engagement and is not a random sample.
- **Coverage.** The table distinguishes eligible tracks found, selected tracks, analyzed tracks, failed fetches, and selected tracks that were skipped when work stopped. Sampling, catalog limits, fetch failures, and rate limits are reported as partial coverage. A dash means no usable lyrics were analyzed. A zero means lyrics were analyzed and the term had no matches. Lyricmetr calculates the rate as `raw matches × 1,000 ÷ analyzed words`.
- **Limits.** Enter 1–6 comma-separated terms, up to 60 characters and eight words each, and an inclusive year range of up to 30 years from 1950 onward. Catalog discovery may stop after 60 pages or roughly 22 seconds. The overall work budget is roughly 45 seconds, plus time for requests already in flight. A capped catalog only reports songs found before the cap.

## Verify

- `npm run test:server` runs deterministic tests for counting, pagination, sampling, partial coverage, cache behavior, the Genius client, and the real Express routes with test fixtures.
- `npm test -- --watchAll=false --runInBand` tests the artist-search-to-chart workflow and stale responses with mocked API calls.
- `npm run build` checks that the production client compiles.

For a live check, configure a Genius token and search for an artist with dated tracks. Run the same short analysis twice to compare uncached and cached timings. Verify the included years, counts, and coverage against the Genius catalog, then try a prolific artist to check the partial-coverage message. Live results depend on Genius metadata, rate limits, and lyric-page markup.
