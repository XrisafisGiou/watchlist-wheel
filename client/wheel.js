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
