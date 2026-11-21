function createCache(maxEntries, ttlMs) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      if (entry.expiresAt <= Date.now()) return undefined;
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      if (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    }
  };
}

function memoizeRequests(load, cache, maxPending) {
  const pending = new Map();
  return async (key, ...args) => {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= maxPending) {
      throw Object.assign(new Error('Lyricmetr is busy. Try again shortly.'), { code: 'BUSY' });
    }
    const request = Promise.resolve().then(() => load(key, ...args));
    pending.set(key, request);
    try {
      const value = await request;
      cache.set(key, value);
      return value;
    } finally {
      pending.delete(key);
    }
  };
}

module.exports = { createCache, memoizeRequests };
