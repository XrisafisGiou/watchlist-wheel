import test from 'node:test';import assert from 'node:assert/strict';
import {moviesFromEntities,searchMovies} from '../server/search.js';
const claim=value=>({mainsnak:{datavalue:{value}}});
const entities={Q1:{labels:{en:{value:'Alien'}},claims:{P6127:[claim('alien')],P577:[claim({time:'+1979-05-25T00:00:00Z'})]}},Q2:{labels:{en:{value:'Unsafe'}},claims:{P6127:[claim('https://evil.example/film/a/')]}}};
test('search returns only safe, canonical Letterboxd film links',()=>{
 const movies=moviesFromEntities(['Q1','Q2','Q3'],entities);assert.deepEqual(movies,[{id:'https://letterboxd.com/film/alien/',url:'https://letterboxd.com/film/alien/',title:'Alien',year:'1979',poster:''}]);
});
test('direct Letterboxd results are used when available',async()=>{
 const result=await searchMovies('Alien',async url=>{assert.equal(url,'https://letterboxd.com/search/films/Alien/');return '<title>Search results</title><div data-film-slug="alien" data-film-release-year="1979"><img alt="Alien"></div>';});assert.equal(result.source,'letterboxd');assert.equal(result.movies[0].year,'1979');
});
test('blocked direct search falls back to mapped films and avoids repeated blocked requests',async()=>{
 const original=globalThis.fetch;let direct=0,calls=0;
 globalThis.fetch=async url=>{calls++;const target=new URL(url);assert.equal(target.origin,'https://www.wikidata.org');if(target.searchParams.get('action')==='query'){assert.match(target.searchParams.get('srsearch'),/^haswbstatement:P6127 /);return Response.json({query:{search:[{title:'Q1'},{title:'Q2'},{title:'not-an-id'}]}});}assert.equal(target.searchParams.get('ids'),'Q1|Q2');return Response.json({entities});};
 try{const blocked=async()=>{direct++;throw Error('Blocked');};const result=await searchMovies('Alien',blocked);assert.equal(result.source,'wikidata');assert.equal(result.movies.length,1);assert.equal(result.movies[0].title,'Alien');await searchMovies('Aliens',blocked);assert.equal(direct,1);assert.equal(calls,4);await assert.rejects(()=>searchMovies('a',blocked),/between 2 and 100/);assert.equal(calls,4);}finally{globalThis.fetch=original;}
});
