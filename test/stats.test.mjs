import test from 'node:test';import assert from 'node:assert/strict';
import {buildStats} from '../client/stats.js';
import {filmsUrl,parsePage,parseFilmDetails} from '../server/parse.js';
import {GET as films} from '../api/films.js';
const fixture='<title>Films watched by Test • Letterboxd</title><ul class="grid -p70"><li class="griditem"><div data-component-class="LazyPoster" data-item-name="Alien (1979)" data-item-link="/film/alien/"></div><p><span class="rating rated-9">★★★★½</span><span class="like">♥</span></p></li><li class="griditem"><div data-film-slug="unrated"><img alt="Unrated"></div></li></ul><a class="next" href="/test/films/page/2/">Next</a><a href="/test/films/page/4/">4</a><aside><div data-film-slug="suggested"><img alt="Suggested"></div></aside>';
test('watched films retain half-star ratings and likes, exclude suggestions and follow films pages',()=>{
 const parsed=parsePage(fixture,false,false,true);assert.equal(parsed.movies.length,2);assert.equal(parsed.movies[0].rating,4.5);assert.equal(parsed.movies[0].liked,true);assert.equal(parsed.movies[1].rating,null);assert.equal(parsed.pages,4);assert.equal(parsed.nextPage,2);
 assert.equal(filmsUrl('https://www.letterboxd.com/TEST/films/'),'https://letterboxd.com/test/films/');
 for(const url of ['https://evil.com/test/films/','http://letterboxd.com/test/films/','https://test@letterboxd.com/test/films/','https://letterboxd.com/test/diary/'])assert.throws(()=>filmsUrl(url));
 assert.equal(parsePage('<title>Films watched by Empty</title><ul class="grid"></ul>',false,false,true).movies.length,0);
});
test('film details extract named stats categories and global ratings without crew',()=>{
 const html='<script type="application/ld+json">{"@type":"Movie","duration":"PT90M","countryOfOrigin":[{"name":"USA"}],"aggregateRating":{"ratingValue":4.1},"genre":["Drama"]}</script><a href="/director/test/">Test Director</a><a href="/director/test/">Test Director</a><a href="/actor/one/">Actor One</a><a href="/films/language/english/">English</a><a href="/films/theme/family/by/best-match/">Family</a><a href="/films/mini-theme/relationships/by/best-match/">Relationships</a><a href="/producer/not-cast/">Producer</a>';
 const parsed=parseFilmDetails(html);assert.equal(parsed.runtime,90);assert.equal(parsed.averageRating,4.1);assert.deepEqual(parsed.countries,['USA']);assert.deepEqual(parsed.languages,['English']);assert.equal(parsed.directors.length,1);assert.equal(parsed.cast.length,1);assert.deepEqual(parsed.themes,['Family']);assert.deepEqual(parsed.nanogenres,['Relationships']);assert.equal(parsed.detailsVersion,1);
});
test('stats count unique watched films and unique category credits, omit unknown values from averages',()=>{
 const a={id:'a',title:'A',url:'https://letterboxd.com/film/a/',year:'1999',runtime:90,rating:4.5,averageRating:4,liked:true,genres:['Drama','Drama'],countries:['USA'],languages:['English'],directors:[{name:'Director',url:'https://letterboxd.com/director/a/'}],cast:[{name:'Actor'},{name:'Actor'}]};
 const b={id:'b',title:'B',url:'https://letterboxd.com/film/b/',year:'2000',runtime:120,rating:2,averageRating:4,genres:['Drama'],countries:['USA','UK'],directors:[{name:'Director',url:'https://letterboxd.com/director/a/'}]};
 const c={id:'c',year:'',runtime:null,rating:null,genres:[]};const result=buildStats([a,b,c,a]);
 assert.equal(result.count,3);assert.equal(result.minutes,210);assert.equal(result.knownRuntime,2);assert.equal(result.averageRuntime,105);assert.equal(result.averageRating,3.25);assert.equal(result.unrated,1);assert.equal(result.liked,1);
 assert.equal(result.genres[0].count,2);assert.equal(result.directors[0].count,2);assert.equal(result.cast[0].count,1);assert.equal(result.highestDecades[0].name,'1990s');assert.equal(result.higher[0].id,'a');assert.equal(result.lower[0].id,'b');assert.equal(result.years.length,2);
 assert.equal(buildStats([]).averageRating,null);assert.equal(buildStats([]).count,0);
});
test('watched films API refreshes upstream without browser or CDN caches',async()=>{
 const original=globalThis.fetch;let requestUrl;globalThis.fetch=async(url,options)=>{requestUrl=String(url);assert.equal(options.cache,'no-store');return new Response(fixture);};
 try{const response=await films(new Request('https://app.example/api/films?url='+encodeURIComponent('https://letterboxd.com/test/films/')+'&page=2'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('cdn-cache-control'),'no-store');assert.equal((await response.json()).movies[0].rating,4.5);assert.equal(requestUrl,'https://letterboxd.com/test/films/page/2/');}finally{globalThis.fetch=original;}
});
