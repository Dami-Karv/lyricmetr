import { useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const COLORS = ['#126b5a', '#335cca', '#a33b65', '#a45610', '#6d46ab', '#3b6675'];
const REASONS = {
  page_limit: 'The catalog page limit was reached. Some eligible tracks may still be missing.',
  time_limit: 'The analysis reached its time limit. Some catalog pages or lyrics may be missing.',
  rate_limited: 'Genius limited requests. Some catalog pages or lyrics may be missing.',
  busy: 'The upstream request queue was busy. Some work could not be completed.',
  catalog_error: 'Genius returned an error while listing songs.',
  lyrics_failed: 'Some selected songs did not have usable lyrics or could not be retrieved.'
};
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export default function AnalysisResults({ result }) {
  const [metric, setMetric] = useState('perThousand');
  const { artistName, startYear, endYear, terms, years, meta } = result;
  const normalized = metric === 'perThousand';
  const notes = meta.reasons.filter(reason => reason !== 'sampled');
  const hasLyrics = years.some(row => row.analyzedWords > 0);

  return (
    <section className="analysis-results" aria-labelledby="result-title">
      <h2 id="result-title">{artistName} · {startYear}–{endYear}</h2>
      <p>{terms.map(term => term.label).join(', ')}</p>
      {meta.partial && (
        <div className="coverage-note" role="status">
          <strong>{notes.length ? 'Incomplete coverage' : 'Sampled results'}</strong>
          <ul>
            {meta.sampled && (
              <li>Sampled up to {meta.songsPerYear} songs per year and {meta.maxSongs} overall, ranking tracks by Genius engagement.</li>
            )}
            {notes.map(reason => <li key={reason}>{REASONS[reason]}</li>)}
            {meta.retryAfterSeconds && <li>Retry in about {meta.retryAfterSeconds} seconds.</li>}
          </ul>
        </div>
      )}
      {!hasLyrics && <p>No usable lyrics were analyzed for this range.</p>}
      {hasLyrics && (
        <>
          <label className="metric" htmlFor="chart-metric">
            Chart measure
            <select id="chart-metric" value={metric} onChange={event => setMetric(event.target.value)}>
              <option value="perThousand">Matches per 1,000 words</option>
              <option value="count">Raw matches</option>
            </select>
          </label>
          <div className="chart-wrapper">
            <Bar
              aria-label={'Yearly ' + (normalized ? 'matches per 1,000 words' : 'raw matches') + ' for ' + artistName}
              data={{
                labels: years.map(row => row.year),
                datasets: terms.map((term, index) => ({
                  label: term.label,
                  data: years.map(row => row.analyzedWords ? row.terms[index][metric] : null),
                  backgroundColor: COLORS[index]
                }))
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  y: {
                    beginAtZero: true,
                    title: { display: true, text: normalized ? 'Matches per 1,000 words' : 'Matches' },
                    ticks: normalized ? {} : { precision: 0 }
                  }
                }
              }}
            />
          </div>
        </>
      )}

      <div className="table-scroll" role="region" aria-label="Yearly results table" tabIndex={0}>
        <table>
          <caption>Yearly matches and coverage. A dash means no usable lyrics were analyzed.</caption>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Eligible found</th>
              <th scope="col">Selected</th>
              <th scope="col">Analyzed</th>
              <th scope="col">Failed</th>
              <th scope="col">Skipped</th>
              <th scope="col">Words analyzed</th>
              {terms.map(term => <th scope="col" key={term.key}>{term.label}<small>Matches · per 1,000</small></th>)}
            </tr>
          </thead>
          <tbody>
            {years.map(row => (
              <tr key={row.year}>
                <th scope="row">{row.year}</th>
                <td>{row.eligibleSongs}</td>
                <td>{row.selectedSongs}</td>
                <td>{row.analyzedSongs}</td>
                <td>{row.failedSongs}</td>
                <td>{row.skippedSongs}</td>
                <td>{number.format(row.analyzedWords)}</td>
                {row.terms.map(({ count, perThousand }, index) => (
                  <td key={terms[index].key}>
                    {perThousand === null ? '—' : number.format(count) + ' · ' + number.format(perThousand)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="method-note">
        Includes dated tracks that credit the selected artist as primary. Labeled alternate versions are excluded.
        {meta.exclusions.unknownYear > 0 && ' Undated tracks excluded from the catalog scan: ' + meta.exclusions.unknownYear + '.'}
      </p>
    </section>
  );
}
