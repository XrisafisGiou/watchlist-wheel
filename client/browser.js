import {searchMappedMovies} from './movie-search.js';
const listeners=new Set();let active=null;let blobUrls=[];let currentCollection=null;let movieSearch=null;
const progress=value=>listeners.forEach(listener=>listener(value));
const database=new Promise((resolve,reject)=>{const request=indexedDB.open('watchlist-wheel',1);request.onupgradeneeded=()=>{request.result.createObjectStore('profiles',{keyPath:'profileId'});request.result.createObjectStore('artwork',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Could not open browser storage.'));});
async function read(store,key){const db=await database;return new Promise((resolve,reject)=>{const transaction=db.transaction(store);const request=key===undefined?transaction.objectStore(store).getAll():transaction.objectStore(store).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function write(store,value){const db=await database;return new Promise((resolve,reject)=>{const transaction=db.transaction(store,'readwrite');transaction.objectStore(store).put(value);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);});}
async function removeProfile(id){const db=await database;return new Promise((resolve,reject)=>{const transaction=db.transaction('profiles','readwrite');transaction.objectStore('profiles').delete(id);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);});}
async function json(url,signal){const response=await fetch(url,{signal,cache:/^\/api\/(watchlist|list)\?/.test(url)?'no-store':'default'});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load Letterboxd.');return data;}
async function save(value){if(value.profileIds)return value;value.profileId||=value.url||'csv:'+value.importedAt;const stored=structuredClone(value);stored.movies=stored.movies.filter(movie=>!movie.sessionOnly);stored.movies.forEach(movie=>{movie.poster=movie.posterKey||'';});await write('profiles',stored);return value;}
async function prepare(value,signal){
 blobUrls.forEach(url=>URL.revokeObjectURL(url));blobUrls=[];
 currentCollection=value;
 value.movies.forEach(movie=>{movie.posterKey||=movie.poster;movie.poster='';});
 signal.throwIfAborted();return save(value);
}
async function preparePosters(value,signal){
 const cache=globalThis.caches?await caches.open('watchlist-posters-v1'):null;
 let next=0,done=0,missing=0;progress({stage:'posters',done,total:value.movies.length});
 await Promise.all(Array.from({length:Math.min(6,value.movies.length)},async()=>{
  while(next<value.movies.length){
   signal.throwIfAborted();const movie=value.movies[next++];let loaded=movie.poster?.startsWith('blob:');
   let src='';for(let attempt=0;attempt<3&&!loaded;attempt++){
    try{
     const saved=await read('artwork',movie.id);src=movie.posterKey||saved?.src||(!movie.poster?.startsWith('blob:')?movie.poster:'');
     if(movie.runtime===undefined&&saved?.runtime!==undefined)movie.runtime=saved.runtime;
     if(movie.genres===undefined&&saved?.genres!==undefined)movie.genres=saved.genres;
     if(!src||movie.runtime===undefined){try{const metadata=await json((src?'/api/metadata?url=':'/api/poster?url=')+encodeURIComponent(movie.url),signal);if(!src)src='/api/image?url='+encodeURIComponent(metadata.url);if(metadata.runtime!==undefined)movie.runtime=metadata.runtime;if(Array.isArray(metadata.genres))movie.genres=metadata.genres;}catch(error){signal.throwIfAborted();if(!src)throw error;}}
     let response=await cache?.match(src);
     if(!response){response=await fetch(src,{signal});if(!response.ok)throw Error('Could not load poster.');if(!response.headers.get('content-type')?.startsWith('image/'))throw Error('Invalid poster.');if(cache)try{await cache.put(src,response.clone());}catch{/* Storage quota: this image remains available for the current session. */}}
     const blob=await response.blob();signal.throwIfAborted();
     const objectUrl=URL.createObjectURL(blob);try{const image=new Image();image.src=objectUrl;await image.decode();}catch(error){URL.revokeObjectURL(objectUrl);throw error;}
     movie.poster=objectUrl;blobUrls.push(movie.poster);movie.posterKey=src;loaded=true;await write('artwork',{...saved,id:movie.id,src,...(movie.runtime!==undefined?{runtime:movie.runtime}:{}),...(movie.genres!==undefined?{genres:movie.genres}:{})});
    }catch(error){signal.throwIfAborted();if(src&&cache)await cache.delete(src);if(attempt<2)await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)));}
   }
   if(!loaded){movie.poster='';missing++;}progress({stage:'posters',done:++done,total:value.movies.length});
  }
 }));
 signal.throwIfAborted();value.missingPosters=missing;return value;
}
async function operation(fn){if(active)throw Error('A watchlist is loading.');active=new AbortController();try{return await fn(active.signal);}catch(error){active.abort();throw error;}finally{active=null;}}
async function fetchWatchlist(input,signal){
 const value=input.trim();let url;
 try{url=new URL(/^@?[\w-]+$/.test(value)?'https://letterboxd.com/'+value.replace(/^@/,'')+'/watchlist/':value);}catch{throw Error('Enter a Letterboxd username or watchlist URL.');}
 if(!['https://letterboxd.com','https://www.letterboxd.com'].includes(url.origin)||url.username||url.password||!/^\/[\w-]+\/watchlist\/?$/.test(url.pathname))throw Error('Enter a Letterboxd username or watchlist URL.');
 const base='https://letterboxd.com/'+url.pathname.split('/')[1].toLowerCase()+'/watchlist/';const movies=new Map();const seen=new Set();const refresh=crypto.randomUUID();let page=1,username='';
 while(page){signal.throwIfAborted();if(seen.has(page)||seen.size>=1000)throw Error('Unexpected watchlist pagination.');seen.add(page);const data=await json('/api/watchlist?url='+encodeURIComponent(base)+'&page='+page+'&refresh='+refresh,signal);data.movies.forEach(movie=>movies.set(movie.id,movie));username=data.username;progress({page:seen.size,pages:data.pages,count:movies.size,username});page=data.nextPage;}
 return{profileId:base,url:base,username,movies:[...movies.values()],importedAt:new Date().toISOString()};
}
async function importWatchlist(input){return operation(async signal=>prepare(await fetchWatchlist(input,signal),signal));}
async function fetchList(input,signal){
 let url;try{url=new URL(input.trim());}catch{throw Error('Enter a Letterboxd movie list URL.');}
 if(!['https://letterboxd.com','https://www.letterboxd.com'].includes(url.origin)||url.username||url.password||!/^\/[\w-]+\/list\/[\w-]+\/?$/.test(url.pathname))throw Error('Enter a Letterboxd movie list URL.');
 const base='https://letterboxd.com'+url.pathname.toLowerCase().replace(/\/?$/,'/');const movies=new Map(),seen=new Set();const refresh=crypto.randomUUID();let page=1,name='';
 while(page){signal.throwIfAborted();if(seen.has(page)||seen.size>=1000)throw Error('Unexpected list pagination.');seen.add(page);const data=await json('/api/list?url='+encodeURIComponent(base)+'&page='+page+'&refresh='+refresh,signal);data.movies.forEach(movie=>movies.set(movie.id,movie));name||=data.name;progress({page:seen.size,pages:data.pages,count:movies.size});page=data.nextPage;}
 return{profileId:base,url:base,kind:'list',username:name||url.pathname.split('/')[3].replace(/-/g,' '),movies:[...movies.values()],importedAt:new Date().toISOString()};
}
function applyListPreferences(value,saved){
 value.removeWinner=!!saved?.removeWinner;value.removedIds=saved?.removedIds||[];const removed=new Set(value.removedIds);value.movies=value.movies.filter(movie=>!removed.has(movie.id));return value;
}
async function freshProfile(id,signal){
 const saved=await read('profiles',id);if(!saved)throw Error('Profile not found.');
 if(!saved.url)return saved;
 try{return saved.kind==='list'?applyListPreferences(await fetchList(saved.url,signal),saved):await fetchWatchlist(saved.url,signal);}catch(error){signal.throwIfAborted();throw Error(`Could not refresh ${saved.username}: ${error.message}`);}
}
function parseCsv(text){
 const rows=[];let row=[],field='',quoted=false;text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n'||c==='\r')){row.push(field);field='';if(c!==','){if(row.some(Boolean))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}}else field+=c;}
 if(quoted)throw Error('Invalid CSV.');row.push(field);if(row.some(Boolean))rows.push(row);const header=rows.shift()||[];const movies=new Map();
 for(const cells of rows){const item=Object.fromEntries(header.map((name,i)=>[name.trim(),cells[i]||'']));const title=item.Name||item.Title;let url;try{url=new URL(item['Letterboxd URI']||item.URL);}catch{continue;}if(!title||url.origin!=='https://letterboxd.com'||!/^\/film\/[\w-]+\/$/.test(url.pathname))continue;movies.set(url.href,{id:url.href,url:url.href,title,year:item.Year||'',poster:''});}
 if(!movies.size)throw Error('Choose watchlist.csv from your Letterboxd export.');return[...movies.values()];
}
async function importCsv(){
 const file=await new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.csv';input.hidden=true;document.body.append(input);input.onchange=()=>{const file=input.files[0];input.remove();resolve(file);};input.oncancel=()=>{input.remove();resolve(null);};input.click();});
 if(!file)return null;if(file.size>20*1024*1024)throw Error('Choose a CSV smaller than 20 MB.');
 return operation(async signal=>prepare({profileId:'csv:'+file.name,username:file.name.replace(/\.csv$/i,''),url:'',movies:parseCsv(await file.text()),importedAt:new Date().toISOString()},signal));
}
const wrap=fn=>async(...args)=>{try{return{ok:true,value:await fn(...args)};}catch(error){return{ok:false,error:error.name==='AbortError'?'Loading cancelled.':error.message};}};
window.desktop={
 createManualProfile:wrap(name=>operation(async signal=>{name=String(name).trim().slice(0,80);if(!name)throw Error('Enter a profile name.');return prepare({profileId:'manual:'+crypto.randomUUID(),kind:'manual',username:name,url:'',movies:[],removeWinner:false,importedAt:new Date().toISOString()},signal);})),
 importList:wrap(input=>operation(async signal=>{const value=await fetchList(input,signal);return prepare(applyListPreferences(value,await read('profiles',value.profileId)),signal);})),
 setRemoveWinner:wrap(enabled=>operation(async()=>{if(!currentCollection||!['manual','list'].includes(currentCollection.kind)||currentCollection.profileIds)throw Error('Open a manual profile or list first.');const value={...currentCollection,removeWinner:!!enabled};await save(value);currentCollection.removeWinner=value.removeWinner;})),
 removeMovie:wrap((id,onlyWinner=false)=>operation(async()=>{
  if(!currentCollection)throw Error('Open a profile first.');
  if(!['manual','list'].includes(currentCollection.kind)||currentCollection.profileIds)throw Error('Open a manual profile or list first.');
  if(onlyWinner&&!currentCollection.removeWinner)return false;
  const movie=currentCollection.movies.find(movie=>movie.id===id);if(!movie)return false;
  const value={...currentCollection,movies:currentCollection.movies.filter(movie=>movie.id!==id)};
  if(value.kind==='list'&&!movie.sessionOnly)value.removedIds=[...new Set([...(value.removedIds||[]),id])];
  await save(value);Object.assign(currentCollection,value);return true;
 })),
 searchMovies:wrap(async query=>{movieSearch?.abort();const controller=new AbortController();movieSearch=controller;try{const results=await json('/api/search?q='+encodeURIComponent(query.trim()),controller.signal);return results.browserSearch?searchMappedMovies(query,controller.signal):results;}catch(error){controller.signal.throwIfAborted();return searchMappedMovies(query,controller.signal);}}),
 cancelMovieSearch:wrap(()=>movieSearch?.abort()),
 addSessionMovie:wrap(movie=>operation(async signal=>{
  if(!currentCollection)throw Error('Open a profile first.');const target=new URL(movie.url);
  if(target.origin!=='https://letterboxd.com'||target.username||target.password||!/^\/film\/[\w-]+\/$/.test(target.pathname))throw Error('Invalid movie URL.');
  const url=target.origin+target.pathname;const existing=currentCollection.movies.find(value=>value.id===url);if(existing)return{movie:existing,added:false};
  const metadata=await json('/api/metadata?url='+encodeURIComponent(url),signal);
  const added={id:url,url,title:String(movie.title||'').trim().slice(0,300),year:/^\d{4}$/.test(String(movie.year))?String(movie.year):'',poster:'',runtime:Number.isFinite(metadata.runtime)&&metadata.runtime>0?metadata.runtime:null,genres:Array.isArray(metadata.genres)?metadata.genres:[],sessionOnly:currentCollection.kind!=='manual'};
  if(!added.title)throw Error('Movie title is missing.');if(metadata.url)added.posterKey='/api/image?url='+encodeURIComponent(metadata.url);
  await preparePosters({movies:[added]},signal);signal.throwIfAborted();if(!added.poster)throw Error('Poster could not load. Try adding the movie again.');
  if(currentCollection.kind==='manual')await save({...currentCollection,movies:[...currentCollection.movies,added]});
  currentCollection.movies.push(added);return{movie:added,added:true};
 })),
 removeSessionMovie:wrap(id=>operation(async()=>{if(!currentCollection)throw Error('Open a profile first.');if(!currentCollection.movies.some(movie=>movie.id===id&&movie.sessionOnly))throw Error('Only temporary movies can be removed from the session.');currentCollection.movies=currentCollection.movies.filter(movie=>movie.id!==id);})),
 loadMetadata:wrap((needGenres,needRuntime=true)=>operation(async signal=>{
  if(!currentCollection)throw Error('Open a profile first.');let next=0,done=0,failed=0;
  const movies=currentCollection.movies;const stored=new Map((await read('artwork')).map(value=>[value.id,value]));
  await Promise.all(Array.from({length:Math.min(8,movies.length)},async()=>{while(next<movies.length){signal.throwIfAborted();const movie=movies[next++];try{
   const saved=stored.get(movie.id);if(movie.runtime===undefined&&saved?.runtime!==undefined)movie.runtime=saved.runtime;if(movie.genres===undefined&&saved?.genres!==undefined)movie.genres=saved.genres;
   if((needRuntime&&movie.runtime===undefined)||(needGenres&&movie.genres===undefined)){let metadata;for(let attempt=0;attempt<2;attempt++){try{metadata=await json('/api/metadata?url='+encodeURIComponent(movie.url),signal);break;}catch(error){signal.throwIfAborted();if(attempt)throw error;await new Promise(resolve=>setTimeout(resolve,500));}}
    movie.runtime=Number.isFinite(metadata.runtime)&&metadata.runtime>0?metadata.runtime:null;movie.genres=Array.isArray(metadata.genres)?metadata.genres:[];
    const src=metadata.url?'/api/image?url='+encodeURIComponent(metadata.url):saved?.src;movie.posterKey||=src;
    await write('artwork',{...saved,id:movie.id,src:movie.posterKey||src,runtime:movie.runtime,genres:movie.genres});
   }
  }catch(error){signal.throwIfAborted();failed++;}progress({stage:'metadata',done:++done,total:movies.length});}}));
  await save(currentCollection);if(failed)throw Error(`Could not load data for ${failed} movies. Apply again to retry.`);return movies.map(({id,runtime,genres})=>({id,runtime,genres}));
 })),
 loadPosters:wrap(ids=>operation(async signal=>{if(!currentCollection)throw Error('Open a profile first.');const movies=currentCollection.movies.filter(movie=>ids.includes(movie.id));const value=await preparePosters({movies},signal);await save(currentCollection);return value;})),
 importWatchlist:wrap(importWatchlist),cancelImport:wrap(()=>active?.abort()),importCsv:wrap(importCsv),
 load:wrap(async()=>(await read('profiles')).map(({profileId,username,url,kind,movies})=>({profileId,username,url,kind,count:movies.length}))),
 deleteProfile:wrap(id=>operation(async()=>{await removeProfile(id);if(currentCollection?.profileId===id)currentCollection=null;})),
 openProfile:wrap(id=>operation(async signal=>prepare(await freshProfile(id,signal),signal))),
 openProfiles:wrap(ids=>operation(async signal=>{
  const unique=[...new Set(ids)];if(unique.length<2)throw Error('Select at least two profiles.');
  const values=new Array(unique.length);let next=0;
  await Promise.all(Array.from({length:Math.min(2,unique.length)},async()=>{while(next<unique.length){signal.throwIfAborted();const index=next++;values[index]=await freshProfile(unique[index],signal);}}));
  signal.throwIfAborted();for(const value of values)await save(value);
  const otherMovies=values.slice(1).map(value=>new Set(value.movies.map(movie=>movie.id)));
  const movies=values[0].movies.filter(movie=>otherMovies.every(ids=>ids.has(movie.id)));
  return prepare({profileIds:unique,username:values.map(value=>value.username).join(' + '),url:'',movies},signal);
 })),
 openFilm:wrap(url=>{const target=new URL(url);if(target.origin!=='https://letterboxd.com'||!/^\/film\/[\w-]+\/$/.test(target.pathname))throw Error('Invalid film URL.');window.open(target.href,'_blank','noopener,noreferrer');}),
 onProgress:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}
};
