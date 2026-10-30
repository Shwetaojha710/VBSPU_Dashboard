const fs = require('fs');
const path = require('path');

/** Cached results are also kept on disk (git-ignored), so a restart can answer at once. */
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache');

/**
 * All loads share one queue: the database is shared with other university systems, so the
 * dashboard runs at most one heavy query at a time.
 */
let queue = Promise.resolve();
const enqueue = (task) => {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
};

const readDisk = (file) => {
  try {
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    return entry && typeof entry.at === 'number' && 'value' in entry ? entry : null;
  } catch {
    return null;
  }
};

const writeDisk = (file, entry) => {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(entry));
    fs.renameSync(temp, file);
  } catch (err) {
    console.error('Could not save cache file:', err.message);
  }
};

/**
 * Wraps a slow async loader with a cache. Fresh values are returned as is; once a value is
 * older than `ttlMs` it is still returned immediately while a refresh runs in the background,
 * so only a load with nothing cached (not even on disk) waits. Concurrent calls share one load.
 * `name` keeps the value in .cache/<name>.json across restarts.
 */
const cached = (load, ttlMs, name) => {
  const file = name ? path.join(CACHE_DIR, `${name}.json`) : null;
  let entry = file ? readDisk(file) : null;
  let pending = null;

  const refresh = () => {
    if (!pending) {
      pending = enqueue(load)
        .then((value) => {
          entry = { at: Date.now(), value };
          if (file) writeDisk(file, entry);
          return value;
        })
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  };

  return () => {
    if (!entry) {
      return refresh();
    }
    if (Date.now() - entry.at >= ttlMs) {
      refresh().catch((err) => console.error('Background refresh failed:', err.message));
    }
    return Promise.resolve(entry.value);
  };
};

module.exports = cached;
