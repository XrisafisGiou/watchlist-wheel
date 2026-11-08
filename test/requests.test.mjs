import test from 'node:test';import assert from 'node:assert/strict';
import {createBatchedJson,abortableDelay} from '../client/requests.js';
import {GET as watchlist} from '../api/watchlist.js';
test('requests cap concurrency and pause between batches',async()=>{
 let active=0,peak=0;const starts=[],ends=[];
 const request=createBatchedJson({concurrency:2,batchSize:3,pauseMs:35,spacingMs:0,fetchFn:async url=>{const i=Number(url);starts[i]=Date.now();peak=Math.max(peak,++active);await abortableDelay(12);active--;ends[i]=Date.now();return Response.json({i});}});
 const results=await Promise.all(Array.from({length:6},(_,i)=>request(String(i))));assert.equal(peak,2);assert.ok(starts[3]-Math.max(...ends.slice(0,3))>=30);assert.deepEqual(results.map(value=>value.i),[0,1,2,3,4,5]);
});
test('rate limits pause queued work, retry without cached errors and respect retry bounds',async()=>{
 const calls=[],events=[];let limited=true;
 const request=createBatchedJson({concurrency:1,pauseMs:0,spacingMs:0,retryBaseMs:35,maxRetries:2,report:value=>events.push(value),fetchFn:async(url,options)=>{calls.push({url,time:Date.now(),cache:options.cache});if(limited){limited=false;return Response.json({error:'Busy',retryable:true},{status:429});}return Response.json({url});}});
 await Promise.all([request('/api/metadata?url=a'),request('/api/metadata?url=b')]);assert.equal(calls.length,3);assert.ok(calls[1].time-calls[0].time>=30);assert.equal(calls.at(-1).cache,'no-store');assert.ok(events.some(value=>value.stage==='cooldown'));
 let attempts=0;const failed=createBatchedJson({spacingMs:0,pauseMs:0,retryBaseMs:1,maxRetries:2,fetchFn:async()=>{attempts++;return Response.json({error:'Busy'},{status:429});}});await assert.rejects(failed('/api/metadata?url=c'),/Busy/);assert.equal(attempts,3);
});
test('queued cancellation is prompt and does not send a request during cooldown',async()=>{
 let calls=0;const request=createBatchedJson({spacingMs:0,pauseMs:0,retryBaseMs:1000,fetchFn:async()=>{calls++;return Response.json({error:'Busy'},{status:429});}});const controller=new AbortController();const pending=request('/api/films?url=x',controller.signal);await abortableDelay(10);controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);
});
test('server forwards retryable upstream limits with cooldown, without recommending CSV',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:429,headers:{'retry-after':'7'}});
 try{const response=await watchlist(new Request('https://app.example/api/watchlist?url='+encodeURIComponent('https://letterboxd.com/test/watchlist/')));assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'7');const value=await response.json();assert.equal(value.retryable,true);assert.equal(value.retryAfter,7);assert.doesNotMatch(value.error,/CSV/);}finally{globalThis.fetch=original;}
});
