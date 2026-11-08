export function abortableDelay(milliseconds,signal){
 signal?.throwIfAborted();return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason);};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},milliseconds);signal?.addEventListener('abort',abort,{once:true});});
}
// Two concurrent requests, with breathing room between small batches. A rate-limit
// response pauses the whole queue, including work already waiting to start.
export function createBatchedJson({fetchFn=(...args)=>fetch(...args),concurrency=2,batchSize=6,pauseMs=1200,spacingMs=250,maxRetries=3,retryBaseMs=3000,report=()=>{}}={}){
 let queue=[],running=0,started=0,lastStart=0,notBefore=0,rateUntil=0,timer=null;
 function pump(){
  if(timer)return;
  if(!running&&started>=batchSize){started=0;notBefore=Math.max(notBefore,Date.now()+pauseMs);if(queue.length&&pauseMs)report({stage:'batch-wait'});}
  if(!queue.length||running>=concurrency||started>=batchSize)return;
  const now=Date.now(),delay=Math.max(0,notBefore-now,rateUntil-now,lastStart+spacingMs-now);
  if(delay){if(rateUntil>now)report({stage:'cooldown',seconds:Math.ceil((rateUntil-now)/1000)});timer=setTimeout(()=>{timer=null;pump();},Math.min(delay,1000));return;}
  const job=queue.shift();if(job.signal?.aborted){job.reject(job.signal.reason);pump();return;}
  started++;running++;lastStart=Date.now();
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
    if(error.retryable&&attempt<maxRetries){const retryAfter=Number(response.headers.get('retry-after')||data.retryAfter);const delay=Math.max(retryBaseMs*2**attempt,Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter,120)*1000:0);rateUntil=Math.max(rateUntil,Date.now()+delay);report({stage:'cooldown',seconds:Math.ceil(delay/1000)});}
    throw error;
   },signal);}catch(error){signal?.throwIfAborted();if(!error.retryable||attempt>=maxRetries)throw error;}
  }
 };
}
