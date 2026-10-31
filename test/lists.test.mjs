import test from 'node:test';
import assert from 'node:assert/strict';
import {listUrl,parsePage} from '../server/parse.js';
import {GET as list} from '../api/list.js';

const fixture=`<title>Movie night, a list of films by Alice • Letterboxd</title>
<meta property="og:title" content="Movie night"><h1 class="site-logo">Letterboxd</h1>
<ul class="poster-list -p125 -grid"><li><div data-component-class="LazyPoster" data-item-link="/film/alien/" data-item-name="Alien (1979)"><img alt="Alien"></div></li></ul>
<a class="next" href="/alice/list/movie-night/page/2/">Next</a><a href="/alice/list/movie-night/page/3/">3</a>
<aside><ul class="posterlist"><li><div data-component-class="LazyPoster" data-item-link="/film/unrelated/" data-item-name="Unrelated (2020)"></div></li></ul></aside>`;

test('list URLs are canonical and reject arbitrary upstreams and subpages',()=>{
 assert.equal(listUrl('https://www.letterboxd.com/Alice/list/Movie-Night/?foo=1'),'https://letterboxd.com/alice/list/movie-night/');
 for(const url of ['https://example.com/alice/list/test/','http://letterboxd.com/alice/list/test/','https://alice@letterboxd.com/alice/list/test/','https://letterboxd.com/alice/list/test/page/2/','https://letterboxd.com/alice/watchlist/'])assert.throws(()=>listUrl(url));
});
test('list parsing reads list name, films and pagination without sidebar suggestions',()=>{
 const parsed=parsePage(fixture,false,true);
 assert.equal(parsed.name,'Movie night');assert.equal(parsed.pages,3);assert.equal(parsed.nextPage,2);
 assert.deepEqual(parsed.movies.map(({title,year})=>({title,year})),[{title:'Alien',year:'1979'}]);
 assert.deepEqual(parsePage('<title>Empty, a list of films by Alice</title><meta property="og:title" content="Empty"><ul class="poster-list"></ul>',false,true).movies,[]);
 assert.throws(()=>parsePage('<title>Sign in</title>',false,true));
});
test('list handler loads each requested page fresh and disallows invalid destinations',async()=>{
 const original=globalThis.fetch;const requests=[];
 globalThis.fetch=async(url,options)=>{requests.push(String(url));assert.equal(options.cache,'no-store');return new Response(fixture);};
 try{
  const response=await list(new Request('https://app.example/api/list?url='+encodeURIComponent('https://letterboxd.com/alice/list/movie-night/')+'&page=2'));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('vercel-cdn-cache-control'),'no-store');assert.equal((await response.json()).name,'Movie night');
  assert.deepEqual(requests,['https://letterboxd.com/alice/list/movie-night/page/2/']);
  const denied=await list(new Request('https://app.example/api/list?url='+encodeURIComponent('https://example.com/alice/list/test/')));assert.equal(denied.status,502);assert.equal(requests.length,1);
 }finally{globalThis.fetch=original;}
});
