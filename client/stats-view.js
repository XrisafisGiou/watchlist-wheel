import {worldCountries} from './world-map.js';
const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
const svg=(tag,attributes={})=>{const element=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attributes))element.setAttribute(key,String(value));return element;};
const number=value=>new Intl.NumberFormat().format(value);
function section(title){const element=node('section','stats-card');element.append(node('h2','',title));return element;}
function histogram(title,rows,{ratings=false}={}){
 const card=section(title);card.dataset.chart=ratings?'ratings':'years';
 if(!rows.length){card.append(node('p','stats-empty','No data yet.'));return card;}
 const scroll=node('div',ratings?'stats-rating-chart':'stats-year-scroll');const width=ratings?500:Math.max(680,rows.length*13),chart=svg('svg',{viewBox:`0 0 ${width} 200`,role:'group','aria-label':title});const max=Math.max(...rows.map(row=>row.count),1),tooltip=node('p','stats-chart-tooltip');tooltip.hidden=true;tooltip.setAttribute('role','status');
 rows.forEach((row,index)=>{
  const x=10+index*(width-20)/rows.length,w=Math.max(3,(width-20)/rows.length-3),height=140*row.count/max,label=`${row.name}: ${number(row.count)} ${row.count===1?'film':'films'}`;
  const group=svg('g',{class:'stats-chart-column',tabindex:0,role:'img','aria-label':label,'data-count':row.count});
  group.append(svg('rect',{x,y:10,width:w,height:150,fill:'transparent',class:'stats-chart-hit'}),svg('rect',{x,y:160-height,width:w,height:Math.max(1,height),rx:2,class:ratings?'stats-bar stats-rating-bar':'stats-bar'}));
  const count=svg('text',{x:x+w/2,y:Math.max(12,153-height),'text-anchor':'middle',class:'stats-hover-count'});count.textContent=number(row.count);group.append(count);
  const tip=svg('title');tip.textContent=label;group.append(tip);group.addEventListener('pointerenter',()=>{tooltip.hidden=false;tooltip.textContent=label;});group.addEventListener('focus',()=>{tooltip.hidden=false;tooltip.textContent=label;});group.addEventListener('pointerleave',()=>{tooltip.hidden=true;});group.addEventListener('blur',()=>{tooltip.hidden=true;});chart.append(group);
  if(!ratings&&index%Math.max(1,Math.ceil(rows.length/14))===0){const axis=svg('text',{x,y:185,class:'stats-axis'});axis.textContent=row.name;chart.append(axis);}
 });
 if(ratings){for(const [x,anchor,text]of [[10,'start','★'],[width-10,'end','★★★★★']]){const axis=svg('text',{x,y:187,'text-anchor':anchor,class:'stats-rating-axis'});axis.textContent=text;chart.append(axis);}card.append(node('p','stats-rated-total',`${number(rows.reduce((sum,row)=>sum+row.count,0))} rated`));}
 scroll.append(chart);card.append(scroll,tooltip);return card;
}
function bars(title,rows,{rating=false,chronological=false}={}){
 if(chronological)return histogram(title,rows);
 const card=section(title);if(!rows.length){card.append(node('p','stats-empty','No data yet.'));return card;}
 const list=node('ol','stats-ranks');const max=rating?5:Math.max(...rows.map(row=>row.count),1);
 let shown=0;
 const more=node('button','text-button','Show more');more.type='button';
 function append(){for(const row of rows.slice(shown,shown+15)){
  const item=node('li','stats-rank');const name=node(row.url?'a':'span','stats-rank-name',row.name);if(row.url){name.href=row.url;name.target='_blank';name.rel='noopener noreferrer';}
  const values=node('span','stats-rank-value',rating?`${row.average.toFixed(2)} ★ · ${number(row.rated)} rated`:`${number(row.count)}${row.average!==null?` · ${row.average.toFixed(2)} ★`:''}`);
  const chart=svg('svg',{viewBox:'0 0 100 4',preserveAspectRatio:'none','aria-hidden':true});chart.append(svg('rect',{width:100*(rating?row.average:row.count)/max,height:4,rx:1,class:'stats-bar'}));
  item.append(name,values,chart);list.append(item);
 }shown+=15;more.hidden=shown>=rows.length;}
 more.addEventListener('click',append);append();card.append(list,more);return card;
}
function differences(title,rows){const card=section(title);if(!rows.length){card.append(node('p','stats-empty','No rated comparisons.'));return card;}
 const list=node('ol','stats-comparisons');for(const row of rows){const item=node('li');const link=node('a','',row.title);link.href=row.url;link.target='_blank';link.rel='noopener noreferrer';const values=node('span','',`${row.rating} ★ / ${row.averageRating.toFixed(2)} ★`);item.append(link,values);list.append(item);}card.append(node('p','stats-caption','Your rating / Letterboxd average'),list);return card;}
function worldMap(rows){
 const aliases={'United States of America':'USA','United Kingdom':'UK','Czechia':'Czech Republic','Dem. Rep. Congo':'Democratic Republic of the Congo','Dominican Rep.':'Dominican Republic','Bosnia and Herz.':'Bosnia and Herzegovina','Central African Rep.':'Central African Republic','S. Sudan':'South Sudan','Eq. Guinea':'Equatorial Guinea','eSwatini':'Eswatini','N. Cyprus':'Northern Cyprus'};
 const counts=new Map(rows.map(row=>[row.name.toLowerCase(),row.count])),card=section('World map'),chart=svg('svg',{viewBox:'0 0 720 330',role:'group','aria-label':'Films by country of origin'}),max=Math.max(...rows.map(row=>row.count),1),status=node('p','stats-map-status','Countries of origin');
 for(const country of worldCountries){const name=aliases[country.name]||country.name,count=counts.get(name.toLowerCase())||0;const shape=svg('path',{d:country.d,class:count?'map-country map-watched':'map-country','data-count':count,...(count?{tabindex:0,role:'img','aria-label':`${name}: ${count} films`,'fill-opacity':.25+.75*Math.sqrt(count/max)}:{})});const tip=svg('title');tip.textContent=`${name}: ${number(count)} films`;shape.append(tip);shape.addEventListener('pointerenter',()=>{status.textContent=tip.textContent;});shape.addEventListener('focus',()=>{status.textContent=tip.textContent;});chart.append(shape);}
 card.append(chart,status);return card;
}
export function renderStats(host,stats){
 host.replaceChildren();const summary=node('div','stats-summary');
 const metrics=[['Films',number(stats.count)],['Hours',number(Math.round(stats.minutes/60))],['Directors',number(stats.directors.length)],['Countries',number(stats.countries.length)],['Average rating',stats.averageRating===null?'—':stats.averageRating.toFixed(2)+' ★'],['Rated',number(stats.ratingCount)],['Liked',number(stats.liked)],['Average length',stats.averageRuntime===null?'—':Math.round(stats.averageRuntime)+' min']];
 for(const [label,value]of metrics){const metric=node('div','stats-metric');metric.append(node('strong','',value),node('span','',label));summary.append(metric);}host.append(summary);
 const caption=node('p','stats-caption',`Unique watched films · ${stats.knownRuntime} of ${stats.count} runtimes available`);host.append(caption);
 const layout=node('div','stats-layout');layout.append(bars('By release year',stats.years,{chronological:true}),bars('Highest rated decades',stats.highestDecades,{rating:true}),histogram('Your ratings',stats.ratings.map(row=>({name:row.rating+' ★',count:row.count})),{ratings:true}),bars('Genres',stats.genres),bars('Countries',stats.countries),bars('Languages',stats.languages),bars('Themes',stats.themes),bars('Nanogenres',stats.nanogenres),bars('Cast',stats.cast),bars('Directors',stats.directors),differences('Rated higher than average',stats.higher),differences('Rated lower than average',stats.lower));
 const map=worldMap(stats.countries);map.classList.add('stats-wide');layout.append(map);host.append(layout);
}
