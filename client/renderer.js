import { randomIndex, randomSample, landingRotation, poolFor, decadeFor, eliminationTiming } from './wheel.js';
const $ = id => document.getElementById(id);
const desktop = window.desktop;
let collection = null;
let profiles = [];
let deletingProfile = false;
let pendingProfileDelete = null;
let lastSpinMode = null;
let lastSpinSpeed = 'normal';
const savedEliminationSpeed = localStorage.getItem('wheel-elimination-speed');
$('elimination-speed').value = ['quick','normal','dramatic'].includes(savedEliminationSpeed) ? savedEliminationSpeed : 'normal';
let lastSort = 'original';
let selectingProfiles = false;
const selectedProfiles = new Set();
let selected = new Set();
let busy = false;
let importing = false;
let sound = localStorage.getItem('wheel-sound') !== 'off';
let rotation = 0;
let wheelPool = [];
let stopped = false;
let generation = 0;
let winner = null;
let shortlist = [];
let movieSearchResults = [];
let movieSearchSource = '';
let movieSearchVersion = 0;
let addingMovie = false;
let eliminated = new Set();
let audio;
let lastTick = 0;
let persistTimer;
let toastTimer;
const pageSize = 36;
let pageNumber = 1;
let gridLoading = false;
let maxRuntime = null;
let filteringRuntime = false;
const genres = ['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Family','Fantasy','History','Horror','Music','Mystery','Romance','Science Fiction','Thriller','TV Movie','War','Western'];
const draftGenres = new Set();
let appliedGenres = new Set();
const draftExcludedGenres = new Set();
let appliedExcludedGenres = new Set();
const draftDecades = new Set();
let appliedDecades = new Set();
const draftExcludedDecades = new Set();
let appliedExcludedDecades = new Set();
function hasDraftFilters() { return $('enable-duration').checked || draftGenres.size || draftExcludedGenres.size || draftDecades.size || draftExcludedDecades.size; }
function hasAppliedFilters() { return maxRuntime !== null || appliedGenres.size || appliedExcludedGenres.size || appliedDecades.size || appliedExcludedDecades.size; }
function syncApplyVisibility() {
  $('apply-runtime').hidden = !hasDraftFilters() && !filteringRuntime;
}
function syncDraftFilters() {
  if (!hasDraftFilters() && hasAppliedFilters()) clearFilters(); else syncApplyVisibility();
}
function clearFilters() {
  if (busy || gridLoading) return;
  maxRuntime = null; appliedGenres.clear(); draftGenres.clear(); appliedExcludedGenres.clear(); draftExcludedGenres.clear(); renderGenres();
  draftDecades.clear(); appliedDecades.clear(); draftExcludedDecades.clear(); appliedExcludedDecades.clear(); renderDecades();
  $('enable-duration').checked = false; $('duration-slider').hidden = true;
  pageNumber = 1; $('clear-runtime').hidden = true; $('runtime-status').hidden = true;
  syncApplyVisibility(); resetRounds(); renderGrid();
}
function renderGenres() {
  $('genre-buttons').replaceChildren(...genres.map(genre => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'genre-button'; button.textContent = genre;
    function updateButton() {
      const state = draftGenres.has(genre) ? 'include' : draftExcludedGenres.has(genre) ? 'exclude' : 'neutral';
      button.dataset.state = state; button.setAttribute('aria-pressed', state === 'exclude' ? 'mixed' : String(state === 'include'));
      button.title = state === 'include' ? 'Included · click to exclude' : state === 'exclude' ? 'Excluded · click to reset' : 'Click to include';
      button.setAttribute('aria-description', button.title);
    }
    updateButton();
    button.addEventListener('click', () => {
      if (busy || gridLoading) return;
      if (draftGenres.has(genre)) { draftGenres.delete(genre); draftExcludedGenres.add(genre); }
      else if (draftExcludedGenres.has(genre)) draftExcludedGenres.delete(genre);
      else draftGenres.add(genre);
      updateButton();
      syncDraftFilters();
    });
    return button;
  }));
}
renderGenres();
function renderDecades() {
  const decades = Array.from({length:18}, (_,index) => 2020 - index * 10);
  $('decade-buttons').replaceChildren(...decades.map(decade => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'genre-button decade-button'; button.textContent = `${decade}s`;
    function updateButton() {
      const state = draftDecades.has(decade) ? 'include' : draftExcludedDecades.has(decade) ? 'exclude' : 'neutral';
      button.dataset.state = state; button.setAttribute('aria-pressed', state === 'exclude' ? 'mixed' : String(state === 'include'));
      button.title = state === 'include' ? 'Included · click to exclude' : state === 'exclude' ? 'Excluded · click to reset' : 'Click to include';
      button.setAttribute('aria-description', button.title);
    }
    updateButton();
    button.addEventListener('click', () => {
      if (busy || gridLoading) return;
      if (draftDecades.has(decade)) { draftDecades.delete(decade); draftExcludedDecades.add(decade); }
      else if (draftExcludedDecades.has(decade)) draftExcludedDecades.delete(decade);
      else draftDecades.add(decade);
      updateButton(); syncDraftFilters();
    });
    return button;
  }));
}
const palette = ['#c7a36a', '#45635c', '#b16f50', '#768776', '#877552', '#4b6168', '#bb9d78', '#6c7870'];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function invoke(method, ...args) {
  if (!desktop) throw new Error('Reload the page and try again.');
  const result = await desktop[method](...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
}
function setSound() {
  $('sound').setAttribute('aria-pressed', String(sound));
  $('sound').querySelector('span').textContent = sound ? 'Sound on' : 'Sound off';
  localStorage.setItem('wheel-sound', sound ? 'on' : 'off');
}
function initAudio() {
  if (!sound) return;
  audio ||= new AudioContext();
  audio.resume().catch(() => {});
}
function tone(frequency, duration = .04, delay = 0, type = 'sine', gain = .06) {
  if (!sound || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator(); const envelope = audio.createGain();
  oscillator.type = type; oscillator.frequency.value = frequency;
  const start = audio.currentTime + delay;
  envelope.gain.setValueAtTime(gain, start); envelope.gain.exponentialRampToValueAtTime(.001, start + duration);
  oscillator.connect(envelope); envelope.connect(audio.destination);
  oscillator.start(start); oscillator.stop(start + duration);
  oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
}
function tick() { const now = performance.now(); if (now - lastTick > 45) { tone(680, .025, 0, 'triangle', .045); lastTick = now; } }
function fanfare() { [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => tone(frequency, .45, i * .12, 'sine', .09)); }

function drawWheel(canvas, movies, angle = 0) {
  const ctx = canvas.getContext('2d'); const size = canvas.width; const center = size / 2; const radius = center - 12;
  ctx.clearRect(0, 0, size, size); ctx.save(); ctx.translate(center, center); ctx.rotate(angle);
  const count = movies.length || 1; const arc = Math.PI * 2 / count;
  // Paint broad color bands first for huge pools, avoiding subpixel seams
  // between hundreds of tiny wedges. Choice and landing still use every film.
  if (count > 60) for (let band = 0; band < 12; band++) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, band * Math.PI / 6, (band + 1) * Math.PI / 6); ctx.closePath();
    ctx.fillStyle = palette[band % palette.length]; ctx.fill();
  }
  for (let i = 0; i < count; i++) {
    if (count <= 60) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, i * arc, (i + 1) * arc); ctx.closePath();
      ctx.fillStyle = palette[i % palette.length]; ctx.fill(); ctx.strokeStyle = '#10171965'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (i % Math.ceil(count / (count > 60 ? 16 : 32)) === 0) {
      ctx.save(); ctx.rotate((i + .5) * arc); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = `${count > 60 ? 25 : count > 25 ? 17 : 22}px Arial`; ctx.fillStyle = '#fff5de';
      let label = movies[i]?.title || '';
      if (label.length > 23) label = label.slice(0, 22) + '…';
      ctx.fillText(label, radius - 27, 0, radius * .66); ctx.restore();
    }
  }
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.strokeStyle = '#d7bb87'; ctx.lineWidth = 6; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, radius - 10, 0, Math.PI * 2); ctx.strokeStyle = '#10171950'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

function eligibleMovies() {
  return collection.movies.filter(movie => (maxRuntime === null || (Number.isFinite(movie.runtime) && movie.runtime > 0 && movie.runtime <= maxRuntime)) && (!appliedGenres.size || movie.genres?.some(genre => appliedGenres.has(genre))) && !movie.genres?.some(genre => appliedExcludedGenres.has(genre)) && (!appliedDecades.size || appliedDecades.has(decadeFor(movie))) && !appliedExcludedDecades.has(decadeFor(movie)));
}
function visibleMovies() {
  const query = $('search').value.toLocaleLowerCase().trim();
  const movies = eligibleMovies().filter(movie => `${movie.title} ${movie.year}`.toLocaleLowerCase().includes(query));
  if ($('sort').value === 'title') movies.sort((a,b) => a.title.localeCompare(b.title));
  if ($('sort').value === 'year') movies.sort((a,b) => Number(b.year) - Number(a.year) || a.title.localeCompare(b.title));
  if ($('sort').value === 'year-asc') movies.sort((a,b) => {
    const aYear = Number(a.year); const bYear = Number(b.year);
    if (!(aYear > 0) || !(bYear > 0)) return aYear > 0 ? -1 : bYear > 0 ? 1 : a.title.localeCompare(b.title);
    return aYear - bYear || a.title.localeCompare(b.title);
  });
  if ($('sort').value.startsWith('duration-')) movies.sort((a,b) => {
    const aKnown = Number.isFinite(a.runtime) && a.runtime > 0; const bKnown = Number.isFinite(b.runtime) && b.runtime > 0;
    if (!aKnown || !bKnown) return aKnown ? -1 : bKnown ? 1 : a.title.localeCompare(b.title);
    return (a.runtime - b.runtime) * ($('sort').value === 'duration-asc' ? 1 : -1) || a.title.localeCompare(b.title);
  });
  return movies;
}
function showFilterStatus() {
  $('runtime-status').hidden = !hasAppliedFilters();
  $('runtime-status').textContent = [maxRuntime !== null ? `Up to ${maxRuntime} min` : '', [...appliedGenres].join(', '), appliedExcludedGenres.size ? 'Exclude ' + [...appliedExcludedGenres].join(', ') : '', [...appliedDecades].sort((a,b)=>b-a).map(decade=>`${decade}s`).join(', '), appliedExcludedDecades.size ? 'Exclude ' + [...appliedExcludedDecades].sort((a,b)=>b-a).map(decade=>`${decade}s`).join(', ') : ''].filter(Boolean).join(' · ');
}
async function sortCollection() {
  if (busy || gridLoading) { $('sort').value = lastSort; return; }
  const order = $('sort').value;
  if (!order.startsWith('duration-')) { lastSort = order; pageNumber = 1; await renderGrid(); return; }
  filteringRuntime = true; setBusy(true); syncApplyVisibility(); $('apply-runtime').textContent = 'Cancel';
  $('runtime-status').hidden = false; $('runtime-status').textContent = 'Loading movie data…';
  try {
    const metadata = await invoke('loadMetadata', false, true);
    const byId = new Map(metadata.map(movie => [movie.id, movie]));
    collection.movies.forEach(movie => Object.assign(movie, byId.get(movie.id)));
    lastSort = order; pageNumber = 1; await renderGrid();
  } catch (error) { $('sort').value = lastSort; toast(error.message); }
  finally {
    filteringRuntime = false; $('apply-runtime').textContent = 'Apply'; syncApplyVisibility(); showFilterStatus(); setBusy(false); updateSelection();
  }
}
function movieDetails(movie) {
  const minutes = Number.isFinite(movie.runtime) && movie.runtime > 0 ? movie.runtime : 0;
  const duration = minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60}m` : minutes ? `${minutes}m` : '';
  return [movie.year, duration].filter(Boolean).join(' - ') || 'Year unknown';
}
function makePoster(movie) {
  const poster = document.createElement('div'); poster.className = 'poster';
  const fallback = document.createElement('span'); fallback.className = `poster-fallback${movie.title.length > 27 ? ' long-title' : ''}`; fallback.textContent = movie.title; poster.append(fallback);
  const year = document.createElement('span'); year.className = 'poster-year'; year.textContent = movie.year; poster.append(year);
  if (movie.poster) attachImage(poster, movie.poster);
  return poster;
}
const imageQueue = [];
const imageReady = new WeakMap();
let imageWorkers = 0;
function pumpImages() {
  while (imageWorkers < 8 && imageQueue.length) {
    const job = imageQueue.shift();
    if (!job.image.isConnected) { job.resolve(false); continue; }
    imageWorkers++;
    decodeImage(job.image, job.src).then(success => { if (!success) job.image.remove(); job.resolve(success); })
      .finally(() => { imageWorkers--; pumpImages(); });
  }
}
async function decodeImage(image, src) {
  for (let attempt = 0; attempt < 3; attempt++) {
    image.src = src;
    try { await image.decode(); return true; }
    catch {
      if (image.complete && image.naturalWidth > 0) return true;
      // Cold blob registration or decoder pressure can reject the first request.
      await new Promise(resolve => setTimeout(resolve, 120 * (attempt + 1)));
    }
  }
  return false;
}
function attachImage(poster, src) {
  if (poster.querySelector('img')) return;
  const image = document.createElement('img'); image.alt = ''; image.loading = 'eager'; image.decoding = 'async';
  poster.append(image);
  imageReady.set(image, new Promise(resolve => { imageQueue.push({ image, src, resolve }); }));
  queueMicrotask(pumpImages);
}
async function renderGrid() {
  if (gridLoading) return;
  const allMovies = visibleMovies();
  const pages = Math.max(1, Math.ceil(allMovies.length / pageSize));
  pageNumber = Math.max(1, Math.min(pageNumber, pages));
  const movies = allMovies.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
  gridLoading = true; updateSelection();
  $('movie-grid').hidden = true; $('grid-progress').hidden = false;
  $('pagination').hidden = pages <= 1;
  $('page-label').textContent = `${pageNumber} / ${pages}`;
  $('first-page').disabled = $('previous-page').disabled = true; $('last-page').disabled = $('next-page').disabled = true;
  $('poster-warning').hidden = true;
  try {
  const artwork = await invoke('loadPosters', movies.map(movie => movie.id));
  artwork.movies.forEach(movie => Object.assign(collection.movies.find(item => item.id === movie.id), movie));
  const fragment = document.createDocumentFragment();
  for (const movie of movies) {
    const card = document.createElement('article'); card.className = 'movie-card'; card.dataset.id = movie.id;
    const select = document.createElement('button'); select.className = 'poster-select'; select.disabled = busy;
    select.setAttribute('aria-pressed', String(selected.has(movie.id))); select.setAttribute('aria-label', `Select ${movie.title}${movie.year ? ` (${movie.year})` : ''}`); select.title = `${movie.title} ${movie.year}`;
    if (eliminated.has(movie.id)) card.classList.add('eliminated');
    const poster = makePoster(movie); const check = document.createElement('span'); check.className = 'movie-check'; check.textContent = '✓'; poster.append(check);
    const title = document.createElement('a'); title.className = 'movie-title'; title.textContent = movie.title; title.href = movie.url; title.target = '_blank'; title.rel = 'noopener noreferrer';
    const year = document.createElement('span'); year.className = 'movie-year'; year.textContent = movieDetails(movie);
    select.append(poster); card.append(select, title, year); fragment.append(card);
    if (movie.sessionOnly) {
      const remove = document.createElement('button'); remove.className = 'remove-session'; remove.textContent = '×'; remove.title = 'Remove from session'; remove.setAttribute('aria-label', `Remove ${movie.title} from session`); remove.disabled = busy;
      remove.addEventListener('click', () => removeTemporaryMovie(movie).catch(error => toast(error.message))); card.append(remove);
    }
    select.addEventListener('click', () => {
      if (busy || gridLoading) return;
      if (selected.has(movie.id)) selected.delete(movie.id); else selected.add(movie.id);
      resetRounds(); updateSelection();
      select.setAttribute('aria-pressed', String(selected.has(movie.id)));
    });
  }
  $('movie-grid').replaceChildren(fragment);
  const images = [...$('movie-grid').querySelectorAll('img')];
  const decoded = await Promise.all(images.map(image => imageReady.get(image)));
  const missing = artwork.missingPosters + decoded.filter(success => !success).length;
  $('poster-warning').hidden = !missing;
  $('poster-warning-text').textContent = `${missing} posters unavailable.`;
  $('showing').textContent = allMovies.length ? `${(pageNumber - 1) * pageSize + 1}–${(pageNumber - 1) * pageSize + movies.length} of ${allMovies.length}` : '0 movies';
  $('no-results').hidden = movies.length > 0 || !collection.movies.length;
  $('no-results').querySelector('p').textContent = maxRuntime !== null && !$('search').value.trim() ? 'No movies match these filters.' : 'No movies found.';
  $('reset-search').hidden = !$('search').value.trim();
  $('empty-watchlist').hidden = collection.movies.length > 0;
  $('select-visible').disabled = !movies.length;
  } catch (error) { toast(error.message); }
  finally {
    gridLoading = false; $('grid-progress').hidden = true; $('movie-grid').hidden = false;
    $('first-page').disabled = $('previous-page').disabled = busy || pageNumber <= 1; $('last-page').disabled = $('next-page').disabled = busy || pageNumber >= pages;
    updateSelection();
    if (JSON.stringify(allMovies.map(movie=>movie.id)) !== JSON.stringify(visibleMovies().map(movie=>movie.id))) { pageNumber = 1; renderGrid(); }
  }
}
function updateSelection() {
  $('clear-selection').hidden = !selected.size;
  wheelPool = poolFor(eligibleMovies(), selected);
  $('pool-count').textContent = `${wheelPool.length} ${wheelPool.length === 1 ? 'movie' : 'movies'}`;
  $('pool-type').textContent = selected.size ? 'Selected' : hasAppliedFilters() ? 'Filtered movies' : 'All movies';
  $('enable-duration').disabled = busy || gridLoading;
  $('apply-runtime').disabled = (busy && !filteringRuntime) || gridLoading;
  $('clear-runtime').disabled = busy || gridLoading;
  $('spin').disabled = !wheelPool.length || busy || gridLoading;
  drawWheel($('wheel'), wheelPool, rotation);
}
function resetRounds() {
  shortlist = []; $('retry-shortlist').hidden = true;
  $('retry-winner').hidden = true;
  eliminated.clear(); $('elimination-list').replaceChildren(); $('eliminations').hidden = true; $('round-status').hidden = true;
  for (const card of $('movie-grid').children) card.classList.remove('eliminated', 'won');
}
async function loadProfiles() {
  profiles = await invoke('load');
  for (const id of selectedProfiles) if (!profiles.some(profile => profile.profileId === id)) selectedProfiles.delete(id);
  if (profiles.length < 2) selectingProfiles = false;
  $('saved-profiles').hidden = !profiles.length;
  renderProfiles();
}
function renderProfiles() {
  $('select-profiles').hidden = profiles.length < 2;
  $('select-profiles').disabled = importing || deletingProfile;
  $('select-profiles').textContent = selectingProfiles ? 'Cancel' : 'Select profiles';
  $('select-profiles').setAttribute('aria-pressed', String(selectingProfiles));
  $('open-common').hidden = !selectingProfiles;
  $('open-common').disabled = importing || deletingProfile || selectedProfiles.size < 2;
  $('profile-list').replaceChildren(...profiles.map(profile => {
    const row = document.createElement('div'); row.className = 'profile-row';
    const button = document.createElement('button'); button.className = 'profile-button'; button.disabled = importing || deletingProfile;
    if (selectingProfiles) button.setAttribute('aria-pressed', String(selectedProfiles.has(profile.profileId)));
    const name = document.createElement('span'); name.textContent = profile.username;
    const count = document.createElement('span'); count.textContent = profile.count + ' movies';
    button.append(name, count); button.addEventListener('click', () => {
      if (importing || deletingProfile) return;
      if (!selectingProfiles) return loadCollection(() => invoke('openProfile', profile.profileId));
      if (selectedProfiles.has(profile.profileId)) selectedProfiles.delete(profile.profileId); else selectedProfiles.add(profile.profileId);
      renderProfiles();
    });
    const remove = document.createElement('button'); remove.className = 'delete-profile'; remove.textContent = '×'; remove.title = 'Delete profile'; remove.setAttribute('aria-label', `Delete ${profile.username} profile`); remove.disabled = importing || deletingProfile;
    remove.addEventListener('click', () => {
      if (importing || deletingProfile) return;
      pendingProfileDelete = profile;
      $('delete-profile-name').textContent = profile.username;
      $('delete-profile-dialog').showModal();
    });
    row.append(button, remove); return row;
  }));
}
async function openCollection(value) {
  movieSearchResults = []; movieSearchSource = ''; $('movie-query').value = ''; renderMovieSearch();
  lastSpinMode = null;
  collection = value; selected = new Set(); pageNumber = 1; maxRuntime = null;
  draftGenres.clear(); appliedGenres.clear(); draftExcludedGenres.clear(); appliedExcludedGenres.clear(); renderGenres();
  draftDecades.clear(); appliedDecades.clear(); draftExcludedDecades.clear(); appliedExcludedDecades.clear(); renderDecades(); $('decade-section').open = false;
  $('genre-section').open = false;
  $('enable-duration').checked = false; $('duration-slider').hidden = true;
  syncApplyVisibility();
  $('max-runtime').value = '180'; $('runtime-value').textContent = '180 min';
  $('runtime-status').hidden = true; $('clear-runtime').hidden = true;
  $('search').value = ''; $('sort').value = 'original'; lastSort = 'original';
  $('library-description').textContent = value.username;
  $('refresh').hidden = !value.url;
  $('empty-watchlist').textContent = value.profileIds ? 'No common movies.' : 'Watchlist is empty.';
  $('poster-warning').hidden = !value.missingPosters;
  $('poster-warning-text').textContent = value.missingPosters + ' posters unavailable.';
  resetRounds(); await renderGrid(); updateSelection();
  $('welcome').hidden = true; $('library').hidden = false; window.scrollTo(0,0);
}
function goHome() {
  if (busy || importing || gridLoading) return;
  $('library').hidden = true; $('welcome').hidden = false;
  window.scrollTo(0,0); loadProfiles().catch(error => toast(error.message));
}
function setImportState(value) {
  importing = value;
  for (const id of ['import-button', 'watchlist-url', 'csv']) $(id).disabled = value;
  for (const button of $('profile-list').querySelectorAll('button')) button.disabled = value;
  $('import-progress').hidden = !value;
  $('select-profiles').disabled = value;
  $('open-common').disabled = value || selectedProfiles.size < 2;
}
async function loadCollection(action) {
  if (importing) return;
  $('library').hidden = true; $('welcome').hidden = false;
  $('import-error').hidden = true; $('progress-text').textContent = 'Loading watchlist…'; setImportState(true);
  try { const value = await action(); if (value) await openCollection(value); await loadProfiles(); }
  catch (error) { $('import-error').textContent = error.message; $('import-error').hidden = false; }
  finally { setImportState(false); }
}
function setBusy(value) {
  busy = value; document.body.classList.toggle('busy', value); $('spin').disabled = value || !wheelPool.length;
  for (const button of $('movie-grid').querySelectorAll('button')) button.disabled = value;
  $('first-page').disabled = $('previous-page').disabled = value || gridLoading || pageNumber <= 1;
  $('last-page').disabled = $('next-page').disabled = value || gridLoading || pageNumber >= Math.ceil(visibleMovies().length / pageSize);
  $('max-runtime').disabled = value;
  $('enable-duration').disabled = value;
  $('genre-filter').disabled = value;
  $('decade-filter').disabled = value;
  $('apply-runtime').disabled = value && !filteringRuntime;
  $('clear-runtime').disabled = value;
}
async function applyRuntime() {
  if (filteringRuntime) { await invoke('cancelImport'); return; }
  if (busy || gridLoading) return;
  const limit = $('enable-duration').checked ? Number($('max-runtime').value) : null;
  const chosenGenres = new Set(draftGenres);
  const excludedGenres = new Set(draftExcludedGenres);
  const chosenDecades = new Set(draftDecades);
  const excludedDecades = new Set(draftExcludedDecades);
  filteringRuntime = true; setBusy(true); $('apply-runtime').textContent = 'Cancel';
  $('runtime-status').hidden = false; $('runtime-status').textContent = 'Loading movie data…';
  try {
    const metadata = limit !== null || chosenGenres.size || excludedGenres.size ? await invoke('loadMetadata', chosenGenres.size > 0 || excludedGenres.size > 0, limit !== null) : [];
    const byId = new Map(metadata.map(movie => [movie.id, movie]));
    collection.movies.forEach(movie => Object.assign(movie, byId.get(movie.id)));
    maxRuntime = limit; appliedGenres = chosenGenres; appliedExcludedGenres = excludedGenres; appliedDecades = chosenDecades; appliedExcludedDecades = excludedDecades; pageNumber = 1;
    const allowed = new Set(eligibleMovies().map(movie => movie.id));
    selected = new Set([...selected].filter(id => allowed.has(id)));
    resetRounds(); $('clear-runtime').hidden = !hasAppliedFilters();
    await renderGrid();
  } catch (error) { toast(error.message); }
  finally {
    filteringRuntime = false; $('apply-runtime').textContent = 'Apply';
    showFilterStatus();
    setBusy(false); updateSelection();
  }
}
function updateEliminationEstimate() {
  let milliseconds = 0;
  for (let remaining = wheelPool.length, round = 1; remaining > 1; remaining--, round++) {
    const timing = eliminationTiming(round, remaining, wheelPool.length, $('elimination-speed').value);
    milliseconds += reducedMotion ? 100 : timing.duration + timing.pause;
  }
  const seconds = milliseconds / 1000;
  $('elimination-estimate').textContent = wheelPool.length > 1 ? `Elimination: ${wheelPool.length - 1} rounds · ~${seconds > 90 ? Math.ceil(seconds / 60) + ' min' : Math.ceil(seconds) + ' sec'}` : '';
}
function modePrompt() {
  if (busy || gridLoading || !wheelPool.length) return;
  $('mode-description').textContent = `${wheelPool.length} ${wheelPool.length === 1 ? 'movie' : 'movies'}`;
  $('elimination').disabled = wheelPool.length < 2;
  $('shortlist').disabled = wheelPool.length < 3;
  $('shortlist-description').textContent = wheelPool.length < 3 ? 'Needs at least 3 movies.' : 'Draw three different movies.';
  $('elimination-speed-field').hidden = wheelPool.length < 2;
  updateEliminationEstimate();
  $('mode-dialog').showModal();
}
function animateSpin(movies, index, duration) {
  const start = rotation; const end = landingRotation(start, index, movies.length, duration > 2000 ? 5 : 2);
  if (reducedMotion) { rotation = end; drawWheel($('wheel'), movies, rotation); tone(680, .06); return Promise.resolve(); }
  return new Promise(resolve => {
    const startTime = performance.now(); let sector = -1;
    function frame(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      rotation = start + (end - start) * (1 - (1 - progress) ** 4);
      drawWheel($('wheel'), movies, rotation);
      const currentSector = Math.floor((rotation + Math.PI / 2) / (Math.PI * 2 / movies.length));
      if (currentSector !== sector) { sector = currentSector; tick(); }
      if (progress < 1) requestAnimationFrame(frame); else resolve();
    }
    requestAnimationFrame(frame);
  });
}
async function startSpin(mode, speed = $('elimination-speed').value) {
  if (busy || gridLoading || !wheelPool.length || !['single', 'elimination', 'shortlist'].includes(mode) || (mode === 'shortlist' && wheelPool.length < 3)) return;
  lastSpinMode = mode;
  if (mode === 'elimination') lastSpinSpeed = speed;
  $('mode-dialog').close(); initAudio(); resetRounds(); setBusy(true); stopped = false;
  const run = ++generation; const contenders = [...wheelPool]; let round = 0;
  $('round-status').hidden = false;
  $('stop').hidden = mode !== 'elimination';
  try {
    if (mode === 'single') {
      $('round-status').textContent = 'Spinning…';
      const index = randomIndex(contenders.length);
      await animateSpin(contenders, index, 5200);
      if (run === generation) await showWinner(contenders[index]);
    } else if (mode === 'shortlist') {
      const picks = randomSample(contenders, 3);
      for (let i = 0; i < picks.length && run === generation; i++) {
        $('round-status').textContent = `Picking ${i + 1} of 3…`;
        const index = contenders.findIndex(movie => movie.id === picks[i].id);
        await animateSpin(contenders, index, i === 0 ? 3000 : 1800);
        contenders.splice(index, 1);
      }
      if (run === generation) await showShortlist(picks);
    } else {
      $('eliminations').hidden = false;
      const total = contenders.length;
      while (contenders.length > 1 && !stopped && run === generation) {
        $('round-status').textContent = `Round ${++round} of ${total - 1} · ${contenders.length} films remain`;
        const index = randomIndex(contenders.length);
        const timing = eliminationTiming(round, contenders.length, total, speed);
        await animateSpin(contenders, index, timing.duration);
        if (stopped || run !== generation) break;
        const [movie] = contenders.splice(index, 1); eliminated.add(movie.id);
        for (const card of $('movie-grid').children) if (card.dataset.id === movie.id) card.classList.add('eliminated');
        const li = document.createElement('li'); const number = document.createElement('b'); number.textContent = String(round).padStart(2, '0'); const title = document.createElement('span'); title.textContent = movie.title;
        li.append(number, title); $('elimination-list').append(li); li.scrollIntoView({ block: 'nearest' });
        $('round-status').textContent = `${movie.title} is out · ${contenders.length} ${contenders.length === 1 ? 'film remains' : 'films remain'}`;
        tone(220, .15, 0, 'triangle', .05);
        await new Promise(resolve => setTimeout(resolve, reducedMotion ? 100 : timing.pause));
      }
      if (!stopped && run === generation && contenders.length === 1) { drawWheel($('wheel'), contenders, 0); await showWinner(contenders[0]); }
      else { $('round-status').textContent = 'Stopped.'; }
    }
  } catch (error) { toast(error.message); }
  finally { setBusy(false); $('stop').hidden = true; }
}
async function showWinner(movie) {
  winner = movie;
  $('retry-winner').hidden = true;
  $('round-status').textContent = 'Loading winner’s poster…';
  try {
  const artwork = await invoke('loadPosters', [movie.id]);
  Object.assign(movie, artwork.movies[0]);
  if (!movie.poster) throw Error('Winner’s poster could not load. Retry to reveal your movie.');
  const image = document.createElement('img'); image.alt = movie.title;
  if (!await decodeImage(image, movie.poster)) { movie.poster = ''; throw Error('Winner’s poster could not load. Retry to reveal your movie.'); }
  const poster = document.createElement('div'); poster.className = 'poster'; poster.append(image);
  $('round-status').textContent = `Tonight’s pick: ${movie.title}`;
  $('winner-title').textContent = movie.title; $('winner-title').href = movie.url; $('winner-year').textContent = movieDetails(movie);
  $('winner-poster').replaceChildren(poster);
  for (const card of $('movie-grid').children) card.classList.toggle('won', card.dataset.id === movie.id);
  $('winner-dialog').showModal(); fanfare();
  } catch (error) { $('round-status').textContent = error.message; $('retry-winner').hidden = false; }
}
async function showShortlist(movies) {
  shortlist = movies; $('retry-shortlist').hidden = true;
  $('round-status').textContent = 'Loading shortlist posters…';
  try {
    const artwork = await invoke('loadPosters', movies.map(movie => movie.id));
    const byId = new Map(artwork.movies.map(movie => [movie.id, movie]));
    const cards = await Promise.all(movies.map(async movie => {
      Object.assign(movie, byId.get(movie.id));
      if (!movie.poster) throw Error('Some shortlist posters could not load. Retry to reveal your movies.');
      const image = document.createElement('img'); image.alt = movie.title;
      if (!await decodeImage(image, movie.poster)) { movie.poster = ''; throw Error('Some shortlist posters could not load. Retry to reveal your movies.'); }
      const card = document.createElement('article'); card.className = 'shortlist-card'; card.dataset.id = movie.id;
      const poster = document.createElement('div'); poster.className = 'poster'; poster.append(image);
      const title = document.createElement('a'); title.className = 'movie-title'; title.textContent = movie.title; title.href = movie.url; title.target = '_blank'; title.rel = 'noopener noreferrer'; title.title = movie.title;
      const details = document.createElement('span'); details.className = 'movie-year'; details.textContent = movieDetails(movie);
      const choose = document.createElement('button'); choose.className = 'quiet'; choose.textContent = 'Choose'; choose.setAttribute('aria-label', `Choose ${movie.title}`);
      choose.addEventListener('click', async () => {
        if (busy || gridLoading) return;
        $('shortlist-dialog').close(); setBusy(true);
        try { await showWinner(movie); } finally { setBusy(false); }
      });
      card.append(poster, title, details, choose); return card;
    }));
    $('shortlist-grid').replaceChildren(...cards);
    const ids = new Set(movies.map(movie => movie.id));
    for (const card of $('movie-grid').children) card.classList.toggle('won', ids.has(card.dataset.id));
    $('round-status').textContent = 'Your shortlist is ready.';
    $('shortlist-dialog').showModal(); fanfare();
  } catch (error) { $('round-status').textContent = error.message; $('retry-shortlist').hidden = false; }
}
function renderMovieSearch() {
  $('movie-search-source').hidden = movieSearchSource !== 'wikidata';
  $('movie-search-results').replaceChildren(...movieSearchResults.map(movie => {
    const row = document.createElement('div'); row.className = 'movie-search-result';
    const info = document.createElement('div'); info.className = 'movie-search-info';
    const link = document.createElement('a'); link.textContent = movie.title; link.href = movie.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const year = document.createElement('span'); year.className = 'movie-year'; year.textContent = movie.year; info.append(link, year);
    const existing = collection?.movies.find(value => value.id === movie.id);
    const add = document.createElement('button'); add.className = 'quiet'; add.textContent = existing ? existing.sessionOnly ? 'Added' : 'In watchlist' : 'Add'; add.disabled = addingMovie || !!existing;
    add.setAttribute('aria-label', existing ? `${movie.title}: ${add.textContent}` : `Add ${movie.title} to session`);
    add.addEventListener('click', () => addTemporaryMovie(movie).catch(error => toast(error.message)));
    row.append(info, add); return row;
  }));
}
async function addTemporaryMovie(movie) {
  if (busy || gridLoading || addingMovie) return;
  addingMovie = true; setBusy(true); renderMovieSearch(); $('movie-query').disabled = true; $('movie-search-submit').disabled = true;
  $('movie-search-status').hidden = false; $('movie-search-status').textContent = 'Adding movie…';
  try {
    const result = await invoke('addSessionMovie', movie);
    if (!collection.movies.some(value => value.id === result.movie.id)) collection.movies.push(result.movie);
    const eligible = eligibleMovies().some(value => value.id === result.movie.id);
    if (selected.size && eligible) selected.add(result.movie.id);
    $('search').value = ''; resetRounds();
    const index = visibleMovies().findIndex(value => value.id === result.movie.id); pageNumber = index < 0 ? 1 : Math.floor(index / pageSize) + 1;
    await renderGrid(); $('movie-search-status').hidden = true;
    toast(eligible ? 'Added to this session.' : 'Added to session. Hidden by current filters.');
  } catch (error) { $('movie-search-status').hidden = false; $('movie-search-status').textContent = error.message; }
  finally { addingMovie = false; setBusy(false); updateSelection(); $('movie-query').disabled = false; $('movie-search-submit').disabled = false; renderMovieSearch(); }
}
async function removeTemporaryMovie(movie) {
  if (busy || gridLoading) return;
  setBusy(true);
  try { await invoke('removeSessionMovie', movie.id); collection.movies = collection.movies.filter(value => value.id !== movie.id); selected.delete(movie.id); resetRounds(); await renderGrid(); }
  finally { setBusy(false); updateSelection(); }
}

$('sound').addEventListener('click', () => { sound = !sound; setSound(); initAudio(); tone(660, .1); }); setSound();
$('home').addEventListener('click', event => { event.preventDefault(); goHome(); });
$('change').addEventListener('click', goHome);
$('add-movies').addEventListener('click', () => { if (busy || gridLoading || !collection) return; renderMovieSearch(); $('movie-search-status').hidden = true; $('movie-search-dialog').showModal(); $('movie-query').focus(); });
$('close-movie-search').addEventListener('click', () => $('movie-search-dialog').close());
$('movie-search-dialog').addEventListener('close', () => { movieSearchVersion++; invoke('cancelMovieSearch').catch(()=>{}); $('movie-search-submit').disabled = addingMovie; });
$('movie-search-form').addEventListener('submit', async event => {
  event.preventDefault(); if (addingMovie) return;
  const version = ++movieSearchVersion; movieSearchResults = []; movieSearchSource = ''; renderMovieSearch();
  $('movie-search-status').hidden = false; $('movie-search-status').textContent = 'Searching…'; $('movie-search-submit').disabled = true;
  try {
    const results = await invoke('searchMovies', $('movie-query').value);
    if (version !== movieSearchVersion || !$('movie-search-dialog').open) return;
    movieSearchResults = results.movies; movieSearchSource = results.source; renderMovieSearch();
    $('movie-search-status').hidden = !!results.movies.length; $('movie-search-status').textContent = results.movies.length ? '' : 'No movies found. Try another title.';
  } catch (error) { if (version === movieSearchVersion) $('movie-search-status').textContent = error.message; }
  finally { if (version === movieSearchVersion) $('movie-search-submit').disabled = false; }
});
$('cancel-delete-profile').addEventListener('click', () => $('delete-profile-dialog').close());
$('delete-profile-dialog').addEventListener('close', () => { pendingProfileDelete = null; });
$('confirm-delete-profile').addEventListener('click', async () => {
  if (!pendingProfileDelete || importing || deletingProfile) return;
  const profile = pendingProfileDelete; pendingProfileDelete = null;
  $('delete-profile-dialog').close(); deletingProfile = true; renderProfiles();
  try { await invoke('deleteProfile', profile.profileId); selectedProfiles.delete(profile.profileId); await loadProfiles(); }
  catch (error) { toast(error.message); }
  finally { deletingProfile = false; renderProfiles(); }
});
$('max-runtime').addEventListener('input', () => { $('runtime-value').textContent = $('max-runtime').value + ' min'; });
$('enable-duration').addEventListener('change', () => { $('duration-slider').hidden = !$('enable-duration').checked; syncDraftFilters(); });
$('apply-runtime').addEventListener('click', () => applyRuntime().catch(error => toast(error.message)));
$('clear-runtime').addEventListener('click', clearFilters);
$('select-profiles').addEventListener('click', () => { if (importing) return; selectingProfiles = !selectingProfiles; selectedProfiles.clear(); renderProfiles(); });
$('open-common').addEventListener('click', () => { if (selectedProfiles.size >= 2) loadCollection(() => invoke('openProfiles', [...selectedProfiles])); });
$('import-form').addEventListener('submit', event => { event.preventDefault(); loadCollection(() => invoke('importWatchlist', $('watchlist-url').value)); });
$('csv').addEventListener('click', () => loadCollection(() => invoke('importCsv')));
$('refresh').addEventListener('click', () => loadCollection(() => invoke('importWatchlist', collection.url)));
$('retry-posters').addEventListener('click', () => renderGrid());
$('cancel-import').addEventListener('click', () => invoke('cancelImport').catch(error => toast(error.message)));
desktop?.onProgress(value => {
  if (value.stage === 'metadata') { $('runtime-status').textContent = `Loading movie data ${value.done}/${value.total}`; return; }
  $('progress-text').textContent = value.stage === 'posters' ? 'Loading posters ' + value.done + '/' + value.total : 'Watchlist page ' + value.page + '/' + value.pages;
});
$('search').addEventListener('input', () => { pageNumber = 1; renderGrid(); }); $('sort').addEventListener('change', () => sortCollection().catch(error => toast(error.message)));
$('previous-page').addEventListener('click', () => { if (busy || gridLoading) return; pageNumber--; renderGrid(); });
$('next-page').addEventListener('click', () => { if (busy || gridLoading) return; pageNumber++; renderGrid(); });
$('first-page').addEventListener('click', () => { if (busy || gridLoading) return; pageNumber = 1; renderGrid(); });
$('last-page').addEventListener('click', () => { if (busy || gridLoading) return; pageNumber = Math.max(1, Math.ceil(visibleMovies().length / pageSize)); renderGrid(); });
$('retry-winner').addEventListener('click', async () => { if (busy || gridLoading) return; setBusy(true); try { await showWinner(winner); } finally { setBusy(false); } });
$('reset-search').addEventListener('click', () => { $('search').value = ''; renderGrid(); $('search').focus(); });
$('select-visible').addEventListener('click', () => { if (busy) return; visibleMovies().forEach(movie => selected.add(movie.id)); resetRounds(); renderGrid(); updateSelection(); });
$('clear-selection').addEventListener('click', () => { if (busy) return; selected.clear(); resetRounds(); renderGrid(); updateSelection(); });
$('spin').addEventListener('click', modePrompt);
$('close-mode').addEventListener('click', () => $('mode-dialog').close());
$('single').addEventListener('click', () => startSpin('single'));
$('elimination').addEventListener('click', () => startSpin('elimination'));
$('shortlist').addEventListener('click', () => startSpin('shortlist'));
$('close-shortlist').addEventListener('click', () => $('shortlist-dialog').close());
$('again-shortlist').addEventListener('click', () => { if (busy || gridLoading) return; $('shortlist-dialog').close(); updateSelection(); startSpin('shortlist'); });
$('retry-shortlist').addEventListener('click', async () => { if (busy || gridLoading || !shortlist.length) return; setBusy(true); try { await showShortlist(shortlist); } finally { setBusy(false); } });
$('elimination-speed').addEventListener('change', () => { localStorage.setItem('wheel-elimination-speed', $('elimination-speed').value); updateEliminationEstimate(); });
$('stop').addEventListener('click', () => { stopped = true; $('stop').disabled = true; $('stop').textContent = 'Stopping after this spin…'; setTimeout(() => { $('stop').disabled = false; $('stop').textContent = 'Stop elimination'; }, 3500); });
$('close-winner').addEventListener('click', () => $('winner-dialog').close());
$('again').addEventListener('click', () => { if (busy || gridLoading) return; $('winner-dialog').close(); updateSelection(); startSpin(lastSpinMode || 'single', lastSpinSpeed); });
$('open-winner').addEventListener('click', () => invoke('openFilm', winner.url).catch(error => toast(error.message)));
document.addEventListener('keydown', event => {
  if (event.key === '/' && !$('library').hidden && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !$('mode-dialog').open && !$('winner-dialog').open && !$('shortlist-dialog').open && !$('movie-search-dialog').open && !busy) { event.preventDefault(); $('search').focus(); }
});
if (desktop) loadProfiles().catch(error => toast(error.message));

setImportState(false);
document.documentElement.dataset.ready = 'true';
