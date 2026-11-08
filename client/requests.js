export function abortableDelay(milliseconds,signal){
 signal?.throwIfAborted();return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason);};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},milliseconds);signal?.addEventListener('abort',abort,{once:true});});
}
// Conservative defaults for large libraries. Quotas/cooldowns survive reloads;
// repeated limits reduce throughput instead of repeatedly sending the same burst.
export function createBatchedJson({fetchFn=(...args)=>fetch(...args),concurrency=1,batchSize=10,pauseMs=5000,spacingMs=1500,maxRetries=2,retryBaseMs=60000,report=()=>{},storage=globalThis.localStorage}={}){
 const storageKey='wheel-letterboxd-request-state';let queue=[],running=0,started=0,lastStart=0,notBefore=0,rateUntil=0,timer=null,currentSpacing=spacingMs,strikes=0,nextAllowedAt=0;
 function restore(){try{const saved=JSON.parse(storage?.getItem(storageKey)||'null');if(saved){currentSpacing=Math.max(currentSpacing,Math.min(spacingMs*8,Number(saved.spacing)||0));strikes=Math.max(strikes,Math.min(5,Number(saved.strikes)||0));rateUntil=Math.max(rateUntil,Number(saved.cooldownUntil)||0);nextAllowedAt=Math.max(nextAllowedAt,Number(saved.nextAllowedAt)||0);}}catch{}}
 function persist(){try{storage?.setItem(storageKey,JSON.stringify({spacing:currentSpacing,strikes,cooldownUntil:rateUntil,nextAllowedAt}));}catch{}}
 restore();
 function pump(){
  if(timer)return;
  if(!running&&started>=batchSize){started=0;notBefore=Math.max(notBefore,Date.now()+pauseMs);if(queue.length&&pauseMs)report({stage:'batch-wait'});}
  if(!queue.length||running>=concurrency||started>=batchSize)return;
  restore();const now=Date.now(),delay=Math.max(0,notBefore-now,rateUntil-now,nextAllowedAt-now,lastStart+currentSpacing-now);
  if(delay){if(rateUntil>now)report({stage:'cooldown',seconds:Math.ceil((rateUntil-now)/1000)});timer=setTimeout(()=>{timer=null;pump();},Math.min(delay,1000));return;}
  const job=queue.shift();if(job.signal?.aborted){job.reject(job.signal.reason);pump();return;}
  started++;running++;lastStart=Date.now();nextAllowedAt=lastStart+currentSpacing;persist();
  Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(()=>{job.signal?.removeEventListener('abort',job.abort);running--;pump();});pump();
 }
 function schedule(run,signal){signal?.throwIfAborted();return new Promise((resolve,reject)=>{const job={run,signal,resolve,reject};job.abort=()=>{if(queue.includes(job)){queue=queue.filter(item=>item!==job);reject(signal.reason);if(!queue.length&&timer){clearTimeout(timer);timer=null;}}};signal?.addEventListener('abort',job.abort,{once:true});queue.push(job);pump();});}
 return async function request(url,signal){
  for(let attempt=0;;attempt++){
   signal?.throwIfAborted();
   try{return await schedule(async()=>{
    signal?.throwIfAborted();const response=await fetchFn(url,{signal,cache:attempt||/^\/api\/(watchlist|list|films)\?/.test(url)?'no-store':'default'});
    let data;try{data=await response.json();}catch{throw Error('Could not read the response. Try again.');}
    if(response.ok)return data;
    const error=Error(data.error||'Could not load Letterboxd.');
    error.retryable=response.status===429||response.status===503||data.retryable===true||/limiting requests|rate.?limit/i.test(error.message);
    if(error.retryable){strikes=Math.min(5,strikes+1);currentSpacing=Math.min(spacingMs*8,Math.max(spacingMs,currentSpacing*2));const header=response.headers.get('retry-after');const seconds=Number(header||data.retryAfter);const retryAfter=Number.isFinite(seconds)?seconds:Math.max(0,(Date.parse(header)-Date.now())/1000);const delay=Math.max(retryBaseMs*2**(strikes-1),Number.isFinite(retryAfter)&&retryAfter>0?retryAfter*1000:0);rateUntil=Math.max(rateUntil,Date.now()+delay);persist();report({stage:'cooldown',seconds:Math.ceil(delay/1000)});}
    throw error;
   },signal);}catch(error){signal?.throwIfAborted();if(!error.retryable||attempt>=maxRetries)throw error;}
  }
 };
}
