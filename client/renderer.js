import { randomIndex, landingRotation, poolFor } from './wheel.js';
const $ = id => document.getElementById(id);
const desktop = window.desktop;
let collection = null;
let profiles = [];
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
function syncApplyVisibility() {
  $('apply-runtime').hidden = !$('enable-duration').checked && !draftGenres.size && !draftExcludedGenres.size && !filteringRuntime;
}
function clearFilters() {
  if (busy || gridLoading) return;
  maxRuntime = null; appliedGenres.clear(); draftGenres.clear(); appliedExcludedGenres.clear(); draftExcludedGenres.clear(); renderGenres();
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
      if (!$('enable-duration').checked && !draftGenres.size && !draftExcludedGenres.size && (maxRuntime !== null || appliedGenres.size || appliedExcludedGenres.size)) clearFilters(); else syncApplyVisibility();
    });
    return button;
  }));
}
renderGenres();
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
  return collection.movies.filter(movie => (maxRuntime === null || (Number.isFinite(movie.runtime) && movie.runtime > 0 && movie.runtime <= maxRuntime)) && (!appliedGenres.size || movie.genres?.some(genre => appliedGenres.has(genre))) && !movie.genres?.some(genre => appliedExcludedGenres.has(genre)));
}
function visibleMovies() {
  const query = $('search').value.toLocaleLowerCase().trim();
  const movies = eligibleMovies().filter(movie => `${movie.title} ${movie.year}`.toLocaleLowerCase().includes(query));
  if ($('sort').value === 'title') movies.sort((a,b) => a.title.localeCompare(b.title));
  if ($('sort').value === 'year') movies.sort((a,b) => Number(b.year) - Number(a.year) || a.title.localeCompare(b.title));
  return movies;
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
  $('previous-page').disabled = true; $('next-page').disabled = true;
  $('poster-warning').hidden = true;
  try {
  const artwork = await invoke('loadPosters', movies.map(movie => movie.id));
  artwork.movies.forEach(movie => Object.assign(collection.movies.find(item => item.id === movie.id), movie));
  const fragment = document.createDocumentFragment();
  for (const movie of movies) {
    const card = document.createElement('button'); card.className = 'movie-card'; card.dataset.id = movie.id;
    card.setAttribute('aria-pressed', String(selected.has(movie.id))); card.setAttribute('aria-label', `${movie.title}${movie.year ? ` (${movie.year})` : ''}`); card.title = `${movie.title} ${movie.year}`;
    if (eliminated.has(movie.id)) card.classList.add('eliminated');
    const poster = makePoster(movie); const check = document.createElement('span'); check.className = 'movie-check'; check.textContent = '✓'; poster.append(check);
    const title = document.createElement('span'); title.className = 'movie-title'; title.textContent = movie.title;
    const year = document.createElement('span'); year.className = 'movie-year'; year.textContent = movie.year || 'Year unknown';
    card.append(poster, title, year); fragment.append(card);
    card.addEventListener('click', () => {
      if (busy) return;
      if (selected.has(movie.id)) selected.delete(movie.id); else selected.add(movie.id);
      resetRounds(); updateSelection();
      card.setAttribute('aria-pressed', String(selected.has(movie.id)));
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
    $('previous-page').disabled = pageNumber <= 1; $('next-page').disabled = pageNumber >= pages;
    updateSelection();
    if (JSON.stringify(allMovies.map(movie=>movie.id)) !== JSON.stringify(visibleMovies().map(movie=>movie.id))) { pageNumber = 1; renderGrid(); }
  }
}
function updateSelection() {
  $('clear-selection').hidden = !selected.size;
  wheelPool = poolFor(eligibleMovies(), selected);
  $('pool-count').textContent = `${wheelPool.length} ${wheelPool.length === 1 ? 'movie' : 'movies'}`;
  $('pool-type').textContent = selected.size ? 'Selected' : maxRuntime !== null || appliedGenres.size || appliedExcludedGenres.size ? 'Filtered movies' : 'All movies';
  $('enable-duration').disabled = busy || gridLoading;
  $('apply-runtime').disabled = (busy && !filteringRuntime) || gridLoading;
  $('clear-runtime').disabled = busy || gridLoading;
  $('spin').disabled = !wheelPool.length || busy || gridLoading;
  drawWheel($('wheel'), wheelPool, rotation);
}
function resetRounds() {
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
  $('select-profiles').disabled = importing;
  $('select-profiles').textContent = selectingProfiles ? 'Cancel' : 'Select profiles';
  $('select-profiles').setAttribute('aria-pressed', String(selectingProfiles));
  $('open-common').hidden = !selectingProfiles;
  $('open-common').disabled = importing || selectedProfiles.size < 2;
  $('profile-list').replaceChildren(...profiles.map(profile => {
    const button = document.createElement('button'); button.className = 'profile-button'; button.disabled = importing;
    if (selectingProfiles) button.setAttribute('aria-pressed', String(selectedProfiles.has(profile.profileId)));
    const name = document.createElement('span'); name.textContent = profile.username;
    const count = document.createElement('span'); count.textContent = profile.count + ' movies';
    button.append(name, count); button.addEventListener('click', () => {
      if (!selectingProfiles) return loadCollection(() => invoke('openProfile', profile.profileId));
      if (selectedProfiles.has(profile.profileId)) selectedProfiles.delete(profile.profileId); else selectedProfiles.add(profile.profileId);
      renderProfiles();
    });
    return button;
  }));
}
async function openCollection(value) {
  collection = value; selected = new Set(); pageNumber = 1; maxRuntime = null;
  draftGenres.clear(); appliedGenres.clear(); draftExcludedGenres.clear(); appliedExcludedGenres.clear(); renderGenres();
  $('genre-section').open = false;
  $('enable-duration').checked = false; $('duration-slider').hidden = true;
  syncApplyVisibility();
  $('max-runtime').value = '180'; $('runtime-value').textContent = '180 min';
  $('runtime-status').hidden = true; $('clear-runtime').hidden = true;
  $('search').value = ''; $('sort').value = 'original';
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
  for (const button of $('profile-list').children) button.disabled = value;
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
  for (const card of $('movie-grid').children) card.disabled = value;
  $('previous-page').disabled = value || pageNumber <= 1;
  $('next-page').disabled = value || pageNumber >= Math.ceil(visibleMovies().length / pageSize);
  $('max-runtime').disabled = value;
  $('enable-duration').disabled = value;
  $('genre-filter').disabled = value;
  $('apply-runtime').disabled = value && !filteringRuntime;
  $('clear-runtime').disabled = value;
}
async function applyRuntime() {
  if (filteringRuntime) { await invoke('cancelImport'); return; }
  if (busy || gridLoading) return;
  const limit = $('enable-duration').checked ? Number($('max-runtime').value) : null;
  const chosenGenres = new Set(draftGenres);
  const excludedGenres = new Set(draftExcludedGenres);
  filteringRuntime = true; setBusy(true); $('apply-runtime').textContent = 'Cancel';
  $('runtime-status').hidden = false; $('runtime-status').textContent = 'Loading movie data…';
  try {
    const metadata = limit !== null || chosenGenres.size || excludedGenres.size ? await invoke('loadMetadata', chosenGenres.size > 0 || excludedGenres.size > 0, limit !== null) : [];
    const byId = new Map(metadata.map(movie => [movie.id, movie]));
    collection.movies.forEach(movie => Object.assign(movie, byId.get(movie.id)));
    maxRuntime = limit; appliedGenres = chosenGenres; appliedExcludedGenres = excludedGenres; pageNumber = 1;
    const allowed = new Set(eligibleMovies().map(movie => movie.id));
    selected = new Set([...selected].filter(id => allowed.has(id)));
    resetRounds(); $('clear-runtime').hidden = limit === null && !chosenGenres.size && !excludedGenres.size;
    await renderGrid();
  } catch (error) { toast(error.message); }
  finally {
    filteringRuntime = false; $('apply-runtime').textContent = 'Apply';
    $('runtime-status').hidden = maxRuntime === null && !appliedGenres.size && !appliedExcludedGenres.size;
    $('runtime-status').textContent = [maxRuntime !== null ? `Up to ${maxRuntime} min` : '', [...appliedGenres].join(', '), appliedExcludedGenres.size ? 'Exclude ' + [...appliedExcludedGenres].join(', ') : ''].filter(Boolean).join(' · ');
    setBusy(false); updateSelection();
  }
}
function modePrompt() {
  if (busy || gridLoading || !wheelPool.length) return;
  $('mode-description').textContent = `${wheelPool.length} ${wheelPool.length === 1 ? 'movie' : 'movies'}`;
  $('elimination').disabled = wheelPool.length < 2;
  const seconds = wheelPool.length > 30 ? (wheelPool.length - 1) * 1.05 + 5 : (wheelPool.length - 1) * 2.5 + 4;
  $('elimination-estimate').textContent = wheelPool.length > 1 ? `Elimination: ${wheelPool.length - 1} rounds · ~${seconds > 90 ? Math.ceil(seconds / 60) + ' min' : Math.ceil(seconds) + ' sec'}` : '';
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
async function startSpin(mode) {
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
    } else {
      $('eliminations').hidden = false;
      const total = contenders.length;
      while (contenders.length > 1 && !stopped && run === generation) {
        $('round-status').textContent = `Round ${++round} of ${total - 1} · ${contenders.length} films remain`;
        const index = randomIndex(contenders.length);
        const duration = round === 1 ? 3200 : contenders.length <= 3 ? 2600 : total > 30 ? 850 : 1800;
        await animateSpin(contenders, index, duration);
        if (stopped || run !== generation) break;
        const [movie] = contenders.splice(index, 1); eliminated.add(movie.id);
        for (const card of $('movie-grid').children) if (card.dataset.id === movie.id) card.classList.add('eliminated');
        const li = document.createElement('li'); const number = document.createElement('b'); number.textContent = String(round).padStart(2, '0'); const title = document.createElement('span'); title.textContent = movie.title;
        li.append(number, title); $('elimination-list').append(li); li.scrollIntoView({ block: 'nearest' });
        $('round-status').textContent = `${movie.title} is out · ${contenders.length} ${contenders.length === 1 ? 'film remains' : 'films remain'}`;
        tone(220, .15, 0, 'triangle', .05);
        await new Promise(resolve => setTimeout(resolve, reducedMotion ? 100 : total > 30 ? 200 : 700));
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
  $('winner-title').textContent = movie.title; $('winner-year').textContent = movie.year;
  $('winner-poster').replaceChildren(poster);
  for (const card of $('movie-grid').children) if (card.dataset.id === movie.id) card.classList.add('won');
  $('winner-dialog').showModal(); fanfare();
  } catch (error) { $('round-status').textContent = error.message; $('retry-winner').hidden = false; }
}

$('sound').addEventListener('click', () => { sound = !sound; setSound(); initAudio(); tone(660, .1); }); setSound();
$('home').addEventListener('click', event => { event.preventDefault(); goHome(); });
$('change').addEventListener('click', goHome);
$('max-runtime').addEventListener('input', () => { $('runtime-value').textContent = $('max-runtime').value + ' min'; });
$('enable-duration').addEventListener('change', () => { $('duration-slider').hidden = !$('enable-duration').checked; if (!$('enable-duration').checked && !draftGenres.size && !draftExcludedGenres.size && (maxRuntime !== null || appliedGenres.size || appliedExcludedGenres.size)) clearFilters(); else syncApplyVisibility(); });
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
$('search').addEventListener('input', () => { pageNumber = 1; renderGrid(); }); $('sort').addEventListener('change', () => { pageNumber = 1; renderGrid(); });
$('previous-page').addEventListener('click', () => { if (busy || gridLoading) return; pageNumber--; renderGrid(); });
$('next-page').addEventListener('click', () => { if (busy || gridLoading) return; pageNumber++; renderGrid(); });
$('retry-winner').addEventListener('click', async () => { if (busy || gridLoading) return; setBusy(true); try { await showWinner(winner); } finally { setBusy(false); } });
$('reset-search').addEventListener('click', () => { $('search').value = ''; renderGrid(); $('search').focus(); });
$('select-visible').addEventListener('click', () => { if (busy) return; visibleMovies().forEach(movie => selected.add(movie.id)); resetRounds(); renderGrid(); updateSelection(); });
$('clear-selection').addEventListener('click', () => { if (busy) return; selected.clear(); resetRounds(); renderGrid(); updateSelection(); });
$('spin').addEventListener('click', modePrompt);
$('close-mode').addEventListener('click', () => $('mode-dialog').close());
$('single').addEventListener('click', () => startSpin('single'));
$('elimination').addEventListener('click', () => startSpin('elimination'));
$('stop').addEventListener('click', () => { stopped = true; $('stop').disabled = true; $('stop').textContent = 'Stopping after this spin…'; setTimeout(() => { $('stop').disabled = false; $('stop').textContent = 'Stop elimination'; }, 3500); });
$('close-winner').addEventListener('click', () => $('winner-dialog').close());
$('again').addEventListener('click', () => { $('winner-dialog').close(); resetRounds(); updateSelection(); modePrompt(); });
$('open-winner').addEventListener('click', () => invoke('openFilm', winner.url).catch(error => toast(error.message)));
document.addEventListener('keydown', event => {
  if (event.key === '/' && !$('library').hidden && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !$('mode-dialog').open && !$('winner-dialog').open && !busy) { event.preventDefault(); $('search').focus(); }
});
if (desktop) loadProfiles().catch(error => toast(error.message));

setImportState(false);
document.documentElement.dataset.ready = 'true';
