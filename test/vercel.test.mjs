import test from 'node:test';import assert from 'node:assert/strict';
import {GET as watchlist}from'../api/watchlist.js';import{GET as poster}from'../api/poster.js';import{GET as image}from'../api/image.js';
import {GET as metadata} from '../api/metadata.js';
test('watchlists always read upstream and disable all app caching',async()=>{
 const original=globalThis.fetch;let requests=0;
 globalThis.fetch=async(url,options)=>{assert.equal(options.cache,'no-store');assert.equal(options.headers['Cache-Control'],'no-cache');requests++;return new Response(`<title>Test Watchlist</title><div data-film-slug="film-${requests}"><img alt="Movie ${requests}"></div>`);};
 try{const input=new Request('https://example.vercel.app/api/watchlist?url='+encodeURIComponent('https://letterboxd.com/fresh/watchlist/'));for(let i=1;i<=2;i++){const response=await watchlist(input);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('cdn-cache-control'),'no-store');assert.equal(response.headers.get('vercel-cdn-cache-control'),'no-store');assert.equal((await response.json()).movies[0].title,`Movie ${i}`);}assert.equal(requests,2);}finally{globalThis.fetch=original;}
});
test('Vercel handlers preserve query parameters and select the correct API route',async()=>{
 const original=globalThis.fetch;let filmRequests=0;
 globalThis.fetch=async url=>{
  if(String(url).includes('a.ltrbxd.com'))return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/jpeg'}});
  if(String(url).includes('/watchlist/'))return new Response('<title>Test Watchlist</title><div data-film-slug="alien" data-film-release-year="1979"><img alt="Alien"></div>');
  filmRequests++;return new Response('<script type="application/ld+json">{"@type":"Movie","duration":"PT117M","genre":["Horror","Science Fiction"],"image":"https://a.ltrbxd.com/resized/sm/upload/alien-0-600-0-900-crop.jpg"}</script>');
 };
 try{
  const result=await watchlist(new Request('https://example.vercel.app/api/watchlist?url='+encodeURIComponent('https://letterboxd.com/test/watchlist/')));assert.equal(result.status,200);assert.equal((await result.json()).movies[0].title,'Alien');
  const artwork=await poster(new Request('https://example.vercel.app/api/poster?url='+encodeURIComponent('https://letterboxd.com/film/alien/')));assert.equal(artwork.status,200);assert.match((await artwork.json()).url,/-230-0-345-/);
  const info=await metadata(new Request('https://example.vercel.app/api/metadata?url='+encodeURIComponent('https://letterboxd.com/film/alien/')));const details=await info.json();assert.equal(details.runtime,117);assert.deepEqual(details.genres,['Horror','Science Fiction']);assert.equal(filmRequests,1);assert.match(info.headers.get('cache-control'),/s-maxage=86400/);
  assert.equal((await metadata(new Request('https://example.vercel.app/api/metadata?url='+encodeURIComponent('https://example.com/film/alien/')))).status,502);
  const bytes=await image(new Request('https://example.vercel.app/api/image?url='+encodeURIComponent('https://a.ltrbxd.com/resized/sm/upload/alien.jpg')));assert.equal(bytes.headers.get('content-type'),'image/jpeg');assert.equal((await bytes.arrayBuffer()).byteLength,3);
  const denied=await image(new Request('https://example.vercel.app/api/image?url='+encodeURIComponent('https://example.com/image.jpg')));assert.equal(denied.status,502);
 }finally{globalThis.fetch=original;}
});
