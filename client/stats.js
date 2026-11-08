export const statsVersion=1;
const rated=value=>Number.isFinite(value)&&value>=.5&&value<=5;
export function buildStats(input){
 const movies=[...new Map(input.map(movie=>[movie.id,movie])).values()];
 const groups={years:new Map(),decades:new Map(),genres:new Map(),countries:new Map(),languages:new Map(),themes:new Map(),nanogenres:new Map(),cast:new Map(),directors:new Map()};
 function add(key,items,movie){for(const item of new Map(items.filter(Boolean).map(item=>[typeof item==='string'?item:item.url||item.name,item])).values()){
  const name=typeof item==='string'?item:item.name,identity=item.url||name;if(!name)continue;let row=groups[key].get(identity);if(!row){row={name,count:0,rated:0,total:0,...(item.url?{url:item.url}:{})};groups[key].set(identity,row);}row.count++;if(rated(movie.rating)){row.rated++;row.total+=movie.rating;}
 }}
 const ratings=Array.from({length:10},(_,i)=>({rating:(i+1)/2,count:0}));let minutes=0,knownRuntime=0,ratingTotal=0,ratingCount=0,liked=0;const differences=[];
 for(const movie of movies){
  const year=Number(movie.year);if(Number.isInteger(year)&&year>=1850&&year<=2200){add('years',[String(year)],movie);add('decades',[String(Math.floor(year/10)*10)+'s'],movie);}
  for(const key of ['genres','countries','languages','themes','nanogenres','cast','directors'])add(key,movie[key]||[],movie);
  if(Number.isFinite(movie.runtime)&&movie.runtime>0){minutes+=movie.runtime;knownRuntime++;}
  if(movie.liked)liked++;
  if(rated(movie.rating)){ratings[Math.round(movie.rating*2)-1].count++;ratingTotal+=movie.rating;ratingCount++;
   if(rated(movie.averageRating))differences.push({id:movie.id,url:movie.url,title:movie.title,year:movie.year,rating:movie.rating,averageRating:movie.averageRating,difference:movie.rating-movie.averageRating});
  }
 }
 const result={version:statsVersion,count:movies.length,minutes,knownRuntime,averageRuntime:knownRuntime?minutes/knownRuntime:null,averageRating:ratingCount?ratingTotal/ratingCount:null,ratingCount,unrated:movies.length-ratingCount,liked,ratings};
 for(const [key,rows]of Object.entries(groups))result[key]=[...rows.values()].map(({total,...row})=>({...row,average:row.rated?total/row.rated:null})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
 result.years.sort((a,b)=>Number(a.name)-Number(b.name));
 result.highestDecades=[...result.decades].filter(row=>row.rated).sort((a,b)=>b.average-a.average||b.rated-a.rated);
 result.higher=differences.filter(row=>row.difference>0).sort((a,b)=>b.difference-a.difference).slice(0,12);
 result.lower=differences.filter(row=>row.difference<0).sort((a,b)=>a.difference-b.difference).slice(0,12);
 return result;
}
