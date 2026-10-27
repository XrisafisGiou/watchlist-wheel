export function randomIndex(length, cryptoSource = globalThis.crypto) {
  if (!Number.isInteger(length) || length < 1 || length > 0x100000000) throw new Error('The wheel needs at least one movie.');
  // Rejection sampling avoids bias when the pool does not divide 2^32 evenly.
  const limit = Math.floor(0x100000000 / length) * length;
  const data = new Uint32Array(1);
  do { cryptoSource.getRandomValues(data); } while (data[0] >= limit);
  return data[0] % length;
}

export function landingRotation(current, index, count, turns = 5) {
  const target = ((-Math.PI / 2 - (index + 0.5) * Math.PI * 2 / count) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const normalized = ((current % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return current + turns * Math.PI * 2 + (target - normalized + Math.PI * 2) % (Math.PI * 2);
}

export function poolFor(movies, selected) {
  return selected.size ? movies.filter(movie => selected.has(movie.id)) : [...movies];
}
export function randomSample(movies, count, cryptoSource = globalThis.crypto) {
  if (!Number.isInteger(count) || count < 1 || count > movies.length) throw new Error('Not enough movies for this draw.');
  const remaining = [...movies];
  return Array.from({length:count}, () => remaining.splice(randomIndex(remaining.length, cryptoSource), 1)[0]);
}
export function decadeFor(movie) {
  const year = Number(movie.year);
  return Number.isInteger(year) && year > 0 ? Math.floor(year / 10) * 10 : null;
}
export function eliminationTiming(round, remaining, total, speed = 'normal') {
  const factor = speed === 'quick' ? .45 : speed === 'dramatic' ? 1.8 : 1;
  const duration = round === 1 ? 3200 : remaining <= 3 ? 2600 : total > 30 ? 850 : 1800;
  return {duration:Math.round(duration * factor), pause:Math.round((total > 30 ? 200 : 700) * factor)};
}
