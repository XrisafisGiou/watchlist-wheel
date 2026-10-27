import test from 'node:test';
import assert from 'node:assert/strict';
import {decadeFor,eliminationTiming} from '../client/wheel.js';

test('decades respect decade boundaries and do not guess missing years',()=>{
 for(const [year,expected] of [['1979',1970],['1980',1980],[1999,1990],['2000',2000],['2026',2020],['',null],[null,null],['unknown',null],[0,null]])assert.equal(decadeFor({year}),expected);
});
test('elimination speeds remain ordered for first, middle and final rounds',()=>{
 for(const [round,remaining,total] of [[1,2,2],[1,531,531],[8,20,27],[530,2,531]]){
  const quick=eliminationTiming(round,remaining,total,'quick');const normal=eliminationTiming(round,remaining,total,'normal');const dramatic=eliminationTiming(round,remaining,total,'dramatic');
  assert.ok(quick.duration>0&&quick.pause>0);assert.ok(quick.duration<normal.duration&&normal.duration<dramatic.duration);assert.ok(quick.pause<normal.pause&&normal.pause<dramatic.pause);
 }
 assert.deepEqual(eliminationTiming(1,2,2),{duration:3200,pause:700});
 assert.deepEqual(eliminationTiming(1,2,2,'invalid'),eliminationTiming(1,2,2,'normal'));
});
