import test from 'node:test';
import assert from 'node:assert/strict';
import {decadeFor,eliminationTiming,randomSample,poolFor} from '../client/wheel.js';

test('shortlists sample without replacement and preserve the original pool',()=>{
 const movies=Object.freeze(Array.from({length:5},(_,id)=>({id:String(id)})));
 const cryptoSource={getRandomValues:array=>array.fill(0)};
 const picked=randomSample(movies,3,cryptoSource);
 assert.deepEqual(picked.map(movie=>movie.id),['0','1','2']);assert.equal(new Set(picked.map(movie=>movie.id)).size,3);assert.equal(movies.length,5);
 const selected=poolFor(movies,new Set(['1','3','4']));assert.deepEqual(randomSample(selected,3,cryptoSource).map(movie=>movie.id),['1','3','4']);
 assert.throws(()=>randomSample(movies,6,cryptoSource));assert.throws(()=>randomSample(movies,0,cryptoSource));
});

test('decades respect decade boundaries and do not guess missing years',()=>{
 for(const [year,expected] of [['1850',1850],['1859',1850],['1860',1860],['1979',1970],['1980',1980],[1999,1990],['2000',2000],['2026',2020],['',null],[null,null],['unknown',null],[0,null]])assert.equal(decadeFor({year}),expected);
});
test('elimination speeds remain ordered for first, middle and final rounds',()=>{
 for(const [round,remaining,total] of [[1,2,2],[1,531,531],[8,20,27],[530,2,531]]){
  const quick=eliminationTiming(round,remaining,total,'quick');const normal=eliminationTiming(round,remaining,total,'normal');const dramatic=eliminationTiming(round,remaining,total,'dramatic');
  assert.ok(quick.duration>0&&quick.pause>0);assert.ok(quick.duration<normal.duration&&normal.duration<dramatic.duration);assert.ok(quick.pause<normal.pause&&normal.pause<dramatic.pause);
 }
 assert.deepEqual(eliminationTiming(1,2,2),{duration:3200,pause:700});
 assert.deepEqual(eliminationTiming(1,2,2,'invalid'),eliminationTiming(1,2,2,'normal'));
});
