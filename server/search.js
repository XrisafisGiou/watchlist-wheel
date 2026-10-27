import {filmUrl,parsePage} from './parse.js';
let retryDirectAt=0;
const userAgent='WatchlistWheel/1.1 (https://watchlist-wheel.vercel.app)';
async function wikidata(params){
 const url=new URL('https://www.wikidata.org/w/api.php');url.search=new URLSearchParams({...params,format:'json'});
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(7000),headers:{Accept:'application/json','User-Agent':userAgent}});
 if(!response.ok)throw Error('Movie search is unavailable. Try again.');const data=await response.json();if(data.error)throw Error('Movie search is unavailable. Try again.');return data;
}
export function moviesFromEntities(ids,entities){
 const movies=new Map();
 for(const id of ids){
  const entity=entities[id];if(!entity)continue;
  const slugs=(entity.claims?.P6127||[]).filter(value=>value.rank!=='deprecated').map(value=>value.mainsnak?.datavalue?.value);
  const slug=slugs.find(value=>typeof value==='string'&&/^[\w-]+$/.test(value));if(!slug)continue;
  const url=filmUrl('/film/'+slug+'/');const title=entity.labels?.en?.value||entity.labels?.mul?.value;if(!title)continue;
  const years=(entity.claims?.P577||[]).filter(value=>value.rank!=='deprecated').map(value=>value.mainsnak?.datavalue?.value?.time?.match(/^\+(\d{4})-/)?.[1]).filter(Boolean).sort();
  movies.set(url,{id:url,url,title:String(title).slice(0,300),year:years[0]||'',poster:''});
 }
 return[...movies.values()];
}
export async function searchMovies(input,readLetterboxd){
 const query=String(input||'').trim();if(query.length<2||query.length>100)throw Error('Enter a movie title between 2 and 100 characters.');
 if(Date.now()>=retryDirectAt){try{
  const source=await readLetterboxd('https://letterboxd.com/search/films/'+encodeURIComponent(query)+'/');
  return{movies:parsePage(source,true).movies.slice(0,12),source:'letterboxd'};
 }catch{retryDirectAt=Date.now()+300000;}}
 const data=await wikidata({action:'query',list:'search',srsearch:'haswbstatement:P6127 '+query,srnamespace:'0',srlimit:'12'});
 const ids=(data.query?.search||[]).map(item=>item.title).filter(id=>/^Q\d+$/.test(id));if(!ids.length)return{movies:[],source:'wikidata'};
 const details=await wikidata({action:'wbgetentities',ids:ids.join('|'),props:'labels|claims',languages:'en|mul'});
 return{movies:moviesFromEntities(ids,details.entities||{}),source:'wikidata'};
}
