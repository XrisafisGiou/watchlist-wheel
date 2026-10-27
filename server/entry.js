import {watchlistUrl,filmUrl,parsePage,parseMetadata} from './parse.js';
import {assets} from './assets.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff','cache-control':'no-store'}});
async function remote(url,image=false){
 for(let redirect=0;redirect<4;redirect++){
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{Accept:image?'image/*':'text/html','User-Agent':'Mozilla/5.0 (compatible; WatchlistWheel/1.1; public watchlist reader)'}});
  if(response.status>=300&&response.status<400){const next=new URL(response.headers.get('location'),url);if(image?!['https://a.ltrbxd.com','https://s.ltrbxd.com'].includes(next.origin):next.origin!=='https://letterboxd.com')throw Error('Unexpected redirect.');url=next.href;continue;}
  if(!response.ok)throw Error([403,429].includes(response.status)?'Letterboxd is limiting requests. Try again later or import CSV.':response.status===404?'Watchlist or movie not found.':`Letterboxd returned ${response.status}.`);
  return response;
 }
 throw Error('Too many redirects.');
}
async function html(url){const value=await(await remote(url)).text();if(/Just a moment|cf-chl-|Verify you are human/i.test(value))throw Error('Letterboxd requires verification. Try later or import CSV.');return value;}
const movieCache=new Map();const movieRequests=new Map();
async function movieMetadata(film){
 const saved=movieCache.get(film);if(saved&&saved.expires>Date.now())return saved.value;
 if(movieRequests.has(film))return movieRequests.get(film);
 const request=html(film).then(source=>{const value=parseMetadata(source);movieCache.delete(film);movieCache.set(film,{value,expires:Date.now()+86400000});if(movieCache.size>1024)movieCache.delete(movieCache.keys().next().value);return value;}).finally(()=>movieRequests.delete(film));
 movieRequests.set(film,request);return request;
}
async function api(request,ctx){
 const url=new URL(request.url);

 let response,ttl=300;
 if(url.pathname==='/api/watchlist'){
  const base=watchlistUrl(url.searchParams.get('url')||'');const page=Number(url.searchParams.get('page')||1);
  if(!Number.isInteger(page)||page<1||page>1000)throw Error('Invalid page.');
  const parsed=parsePage(await html(page===1?base:base+'page/'+page+'/'));
  response=json({...parsed,username:new URL(base).pathname.split('/')[1],url:base});
 }else if(url.pathname==='/api/poster'||url.pathname==='/api/metadata'){
  const film=filmUrl(url.searchParams.get('url')||'');const metadata=await movieMetadata(film);if(url.pathname==='/api/poster'&&!metadata.url)throw Error('No poster available.');response=json(metadata);ttl=86400;
 }else if(url.pathname==='/api/runtime'){
  const film=filmUrl(url.searchParams.get('url')||'');response=json(await movieMetadata(film));ttl=86400;
 }else if(url.pathname==='/api/image'){
  const image=new URL(url.searchParams.get('url')||'');
  if(image.origin!=='https://a.ltrbxd.com'||image.username||image.password||!image.pathname.startsWith('/resized/')||!/\.(jpe?g|png|webp)$/i.test(image.pathname))throw Error('Invalid poster URL.');
  const source=await remote(image.href,true);const type=source.headers.get('content-type');
  if(!type?.startsWith('image/')||Number(source.headers.get('content-length'))>8*1024*1024)throw Error('Invalid poster.');
  const bytes=await source.arrayBuffer();if(bytes.byteLength>8*1024*1024)throw Error('Poster is too large.');
  response=new Response(bytes,{headers:{'content-type':type,'x-content-type-options':'nosniff'}});ttl=2592000;
 }else return json({error:'Not found.'},404);
 response.headers.set('cache-control','public, max-age='+ttl+(ttl>=86400?', s-maxage='+ttl+', stale-while-revalidate=3600':''));

 return response;
}
export default{async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(request.method!=='GET')return json({error:'Method not allowed.'},405);
 if(url.pathname.startsWith('/api/'))try{return await api(request,ctx);}catch(error){return json({error:error.message||'Could not load Letterboxd.'},502);}
 const asset=assets[url.pathname==='/'?'/index.html':url.pathname];if(!asset)return new Response('Not found',{status:404});
 return new Response(asset.body,{headers:{'content-type':asset.type,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
}};
