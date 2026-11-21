const MIN_YEAR = 1950;
const MAX_YEAR_SPAN = 30;
const MAX_TERMS = 6;
const MAX_TERM_LENGTH = 60;
const MAX_QUERY_LENGTH = 100;

function tokenize(text) {
  return text.normalize('NFKC').toLowerCase().replace(/’/g, "'")
    .match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:'[\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu) || [];
}

function inputError(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function positiveInteger(value) {
  const number = typeof value === 'number' || /^\d+$/.test(typeof value === 'string' ? value : '')
    ? Number(value)
    : NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function parseSearch(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > MAX_QUERY_LENGTH) {
    throw inputError('Enter an artist name between 1 and ' + MAX_QUERY_LENGTH + ' characters.');
  }
  return value.trim().normalize('NFC');
}

function parseAnalysis(input, currentYear = new Date().getFullYear()) {
  const artistId = positiveInteger(input.artistId);
  const startYear = positiveInteger(input.startYear);
  const endYear = positiveInteger(input.endYear);

  if (!artistId) {
    throw inputError('Choose a valid artist.');
  }
  if (!startYear || !endYear || startYear < MIN_YEAR || endYear > currentYear || startYear > endYear) {
    throw inputError('Enter a year range from ' + MIN_YEAR + ' to ' + currentYear + ', earliest year first.');
  }
  if (endYear - startYear + 1 > MAX_YEAR_SPAN) {
    throw inputError('Choose a range of up to ' + MAX_YEAR_SPAN + ' years.');
  }

  const value = input.words ?? input.word;
  if (typeof value !== 'string' || value.length > MAX_TERMS * (MAX_TERM_LENGTH + 1)) {
    throw inputError('Enter up to ' + MAX_TERMS + ' comma-separated words or phrases.');
  }
  const labels = value.split(',').map(label => label.trim()).filter(Boolean);
  if (!labels.length || labels.length > MAX_TERMS) {
    throw inputError('Enter up to ' + MAX_TERMS + ' comma-separated words or phrases.');
  }

  const terms = new Map();
  for (const label of labels) {
    const tokens = tokenize(label);
    if (label.length > MAX_TERM_LENGTH || !tokens.length || tokens.length > 8) {
      throw inputError('Each term must contain 1–8 words and be at most ' + MAX_TERM_LENGTH + ' characters.');
    }
    const key = tokens.join(' ');
    if (!terms.has(key)) terms.set(key, { key, label, tokens });
  }
  return { artistId, startYear, endYear, terms: [...terms.values()] };
}

module.exports = {
  MIN_YEAR, MAX_YEAR_SPAN, MAX_TERMS, MAX_TERM_LENGTH, MAX_QUERY_LENGTH,
  tokenize, parseSearch, parseAnalysis
};
