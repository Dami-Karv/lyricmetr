import { act, fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import App from './App';

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('react-chartjs-2', () => ({
  Bar: ({ data, 'aria-label': label }) => <div role="img" aria-label={label}>{JSON.stringify(data)}</div>
}));

const artist = { id: 7, name: 'Example Artist', exampleSong: 'Example Track' };
const result = {
  startYear: 2020, endYear: 2021,
  terms: [{ key: 'love', label: 'Love' }],
  years: [{
    year: 2020, eligibleSongs: 2, selectedSongs: 1, analyzedSongs: 1, failedSongs: 0, skippedSongs: 0, analyzedWords: 20,
    terms: [{ count: 2, perThousand: 100 }]
  }, {
    year: 2021, eligibleSongs: 0, selectedSongs: 0, analyzedSongs: 0, failedSongs: 0, skippedSongs: 0, analyzedWords: 0,
    terms: [{ count: 0, perThousand: null }]
  }],
  meta: { partial: true, sampled: true, reasons: ['sampled'], songsPerYear: 8, maxSongs: 120, exclusions: { unknownYear: 0 } }
};

beforeEach(() => axios.get.mockReset());

function type(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function search(name) {
  type('Artist name', name);
  fireEvent.click(screen.getByRole('button', { name: 'Search artists' }));
}

async function selectArtist(name = artist.name) {
  fireEvent.click(await screen.findByRole('radio', { name: new RegExp(name) }));
}

function submitAnalysis(name = artist.name) {
  type('Start year', '2020');
  type('End year', '2021');
  type('Words or phrases', 'Love');
  fireEvent.click(screen.getByRole('button', { name: 'Analyze ' + name }));
}

test('opens directly to the artist search', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Lyricmetr' })).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: 'Artist name' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Count Word in Song' })).not.toBeInTheDocument();
});

test('moves from search to chart and table, preserves the submitted terms, and switches chart metrics', async () => {
  axios.get.mockResolvedValueOnce({ data: [artist] }).mockResolvedValueOnce({ data: result });
  render(<App />);
  search('Example');
  await selectArtist();
  submitAnalysis();
  expect(await screen.findByRole('heading', { name: /Example Artist · 2020–2021/ })).toBeInTheDocument();
  expect(axios.get).toHaveBeenLastCalledWith('/api/artist-songs-word-frequency', expect.objectContaining({
    params: { artistId: 7, startYear: 2020, endYear: 2021, words: 'Love' }
  }));
  expect(screen.getByRole('img', { name: /matches per 1,000 words/i })).toHaveTextContent('"data":[100,null]');
  expect(within(screen.getByRole('table')).getByText('2 · 100')).toBeInTheDocument();
  expect(within(screen.getByRole('table')).getByText('—')).toBeInTheDocument();
  expect(screen.getByText('Sampled results')).toBeInTheDocument();
  type('Words or phrases', 'glove');
  expect(within(screen.getByRole('table')).getByRole('columnheader', { name: /Love/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Chart measure'), { target: { value: 'count' } });
  expect(screen.getByRole('img', { name: /raw matches/i })).toHaveTextContent('"data":[2,null]');
});

test('ignores late search and analysis responses after the artist changes', async () => {
  let resolveOldSearch;
  let resolveOldAnalysis;
  axios.get
    .mockImplementationOnce(() => new Promise(resolve => { resolveOldSearch = resolve; }))
    .mockResolvedValueOnce({ data: [artist] })
    .mockImplementationOnce(() => new Promise(resolve => { resolveOldAnalysis = resolve; }))
    .mockResolvedValueOnce({ data: [{ id: 8, name: 'Different Artist' }] })
    .mockResolvedValueOnce({ data: result });
  render(<App />);
  search('Old');
  search('Example');
  await selectArtist();
  await act(async () => resolveOldSearch({ data: [{ id: 6, name: 'Old Artist' }] }));
  expect(screen.queryByRole('radio', { name: /Old Artist/ })).not.toBeInTheDocument();

  submitAnalysis();
  expect(screen.getByRole('button', { name: 'Analyze Example Artist' })).toBeDisabled();
  search('Different');
  expect(screen.queryByRole('button', { name: 'Analyze Example Artist' })).not.toBeInTheDocument();
  await selectArtist('Different Artist');
  submitAnalysis('Different Artist');
  expect(await screen.findByRole('heading', { name: /Different Artist · 2020–2021/ })).toBeInTheDocument();
  await act(async () => resolveOldAnalysis({ data: result }));
  expect(screen.queryByRole('heading', { name: /Example Artist · 2020–2021/ })).not.toBeInTheDocument();
});
