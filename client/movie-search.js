export function moviesFromEntities(ids,entities){
 const movies=new Map();
 for(const id of ids){
  const entity=entities[id];if(!entity)continue;
  const slugs=(entity.claims?.P6127||[]).filter(value=>value.rank!=='deprecated').map(value=>value.mainsnak?.datavalue?.value);
  const slug=slugs.find(value=>typeof value==='string'&&/^[\w-]+$/.test(value));if(!slug)continue;
  const url='https://letterboxd.com/film/'+slug+'/';const title=entity.labels?.en?.value||entity.labels?.mul?.value;if(!title)continue;
  const years=(entity.claims?.P577||[]).filter(value=>value.rank!=='deprecated').map(value=>value.mainsnak?.datavalue?.value?.time?.match(/^\+(\d{4})-/)?.[1]).filter(Boolean).sort();
  movies.set(url,{id:url,url,title:String(title).slice(0,300),year:years[0]||'',poster:''});
 }
 return[...movies.values()];
}
export async function searchMappedMovies(input,signal){
 const query=String(input||'').trim();if(query.length<2||query.length>100)throw Error('Enter a movie title between 2 and 100 characters.');
 async function request(params){
  const url=new URL('https://www.wikidata.org/w/api.php');url.search=new URLSearchParams({...params,format:'json',origin:'*'});
  for(let attempt=0;attempt<3;attempt++){
   signal?.throwIfAborted();let delay=400*(attempt+1);
   try{
    const response=await fetch(url,{signal,credentials:'omit',cache:attempt?'no-store':'default',headers:{Accept:'application/json'}});
    if(!response.ok){const error=new Error('Movie search is unavailable. Try again.');error.retryable=[403,408,425,429].includes(response.status)||response.status>=500;const seconds=Number(response.headers.get('retry-after'));if(seconds>0)delay=Math.min(seconds*1000,3000);throw error;}
    const data=await response.json();if(data.error){const error=new Error('Movie search is unavailable. Try again.');error.retryable=['maxlag','ratelimited','readonly','internal_api_error'].some(code=>String(data.error.code).startsWith(code));throw error;}return data;
   }catch(error){
    signal?.throwIfAborted();if(attempt===2||error.retryable===false)throw Error('Movie search is unavailable. Try again.');
    await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},delay);signal?.addEventListener('abort',abort,{once:true});});
   }
  }
 }
 const data=await request({action:'query',list:'search',srsearch:'haswbstatement:P6127 '+query,srnamespace:'0',srlimit:'12'});
 const ids=(data.query?.search||[]).map(item=>item.title).filter(id=>/^Q\d+$/.test(id));if(!ids.length)return{movies:[],source:'wikidata'};
 const details=await request({action:'wbgetentities',ids:ids.join('|'),props:'labels|claims',languages:'en|mul'});
 return{movies:moviesFromEntities(ids,details.entities||{}),source:'wikidata'};
}
