import { parseDocument } from 'htmlparser2';
import { getElementsByTagName, textContent } from 'domutils';
export function watchlistUrl(input) {
 const url=new URL(input);
 if(url.origin!=='https://letterboxd.com'&&url.origin!=='https://www.letterboxd.com')throw Error('Use a Letterboxd watchlist URL.');
 if(url.username||url.password||!/^\/[\w-]+\/watchlist\/?$/.test(url.pathname))throw Error('Use https://letterboxd.com/username/watchlist/');
 return 'https://letterboxd.com/'+url.pathname.split('/')[1].toLowerCase()+'/watchlist/';
}
export function filmUrl(input) {
 const url=new URL(input,'https://letterboxd.com');
 if(url.origin!=='https://letterboxd.com'||url.username||url.password||!/^\/film\/[\w-]+\/$/.test(url.pathname))throw Error('Invalid movie URL.');
 return url.origin+url.pathname;
}
export function listUrl(input) {
 const url=new URL(input);
 if(!['https://letterboxd.com','https://www.letterboxd.com'].includes(url.origin)||url.username||url.password||!/^\/[\w-]+\/list\/[\w-]+\/?$/.test(url.pathname))throw Error('Use a Letterboxd movie list URL.');
 return 'https://letterboxd.com'+url.pathname.toLowerCase().replace(/\/?$/,'/');
}
export function parsePage(html,search=false,list=false) {
 const root=parseDocument(html);const elements=getElementsByTagName('*',root,true);const movies=new Map();let pages=1,nextPage=null;
 for(const element of elements){
  const a=element.attribs||{};
  if((a['data-component-class']==='LazyPoster'&&a['data-item-link'])||a['data-film-slug']){
   if(list){let parent=element.parent;while(parent&&!/(^|\s)poster-list(\s|$)/.test(parent.attribs?.class||''))parent=parent.parent;if(!parent)continue;}
   let url;try{url=filmUrl(a['data-item-link']||'/film/'+a['data-film-slug']+'/');}catch{continue;}
   const image=getElementsByTagName('img',element,true)[0];const full=a['data-item-name']||a['data-film-name']||image?.attribs.alt||'';
   const year=full.match(/\((\d{4})\)$/)?.[1]||a['data-film-release-year']||'';
   movies.set(url,{id:url,url,title:full.replace(/\s*\(\d{4}\)$/,''),year,poster:''});
  }
  if(element.name==='a'&&a.href&&(list?/\/list\/[\w-]+\/page\//.test(a.href):a.href.includes('/watchlist/page/'))){
   const number=Number(a.href.match(/\/page\/(\d+)\//)?.[1]);if(number)pages=Math.max(pages,number);
   if((a.class||'').split(' ').includes('next'))nextPage=number;
  }
 }
 const title=textContent(getElementsByTagName('title',root,true)[0]||root);
 if(!movies.size&&!(list?/a list of films|list by/i:search?/search/i:/watchlist/i).test(title))throw Error('Letterboxd returned an unreadable page.');
 let name='';if(list){name=elements.find(element=>element.name==='meta'&&element.attribs?.property==='og:title')?.attribs.content||'';if(!name){const heading=elements.find(element=>element.name==='h1'&&/(^|\s)title(?:-1)?(\s|$)/.test(element.attribs?.class||''));name=(heading?textContent(heading):title.replace(/^‎/,'').split(', a list of films')[0]).trim();}}
 return{movies:[...movies.values()],pages,nextPage,...(list?{name}:{})};
}
export function parseRuntime(html){
 const root=typeof html==='string'?parseDocument(html):html;let minutes=null;
 function inspect(data){if(!data||typeof data!=='object')return;if(Array.isArray(data)){data.forEach(inspect);return;}const match=typeof data.duration==='string'&&data.duration.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i);if(match){const value=Number(match[1]||0)*60+Number(match[2]||0)+Number(match[3]||0)/60;if(value>0)minutes=Math.ceil(value);}if(data['@graph'])inspect(data['@graph']);}
 for(const node of getElementsByTagName('script',root,true))if(node.attribs.type==='application/ld+json')try{inspect(JSON.parse(textContent(node).replace(/\/\*[\s\S]*?\*\//g,'')));}catch{}
 return minutes;
}
export function parsePoster(html){
 const root=typeof html==='string'?parseDocument(html):html;let result='';
 const allowed=value=>typeof value==='string'&&/^https:\/\/a\.ltrbxd\.com\//.test(value)&&!/backdrop|empty-poster/.test(value);
 function inspect(data){if(!data||typeof data!=='object')return;if(Array.isArray(data)){data.forEach(inspect);return;}const image=typeof data.image==='string'?data.image:data.image?.url||data.image?.contentUrl;if(allowed(image))result||=image;if(data['@graph'])inspect(data['@graph']);}
 for(const node of getElementsByTagName('script',root,true))if(node.attribs.type==='application/ld+json')try{inspect(JSON.parse(textContent(node).replace(/\/\*[\s\S]*?\*\//g,'')));}catch{}
 if(!result)for(const node of getElementsByTagName('meta',root,true))if(node.attribs.property==='og:image'&&allowed(node.attribs.content))result=node.attribs.content;
 if(!result)throw Error('No poster available.');
 return result.replace(/-0-600-0-900-crop/,'-0-230-0-345-crop');
}
export function parseMetadata(html){
 const root=parseDocument(html);const genres=new Set();
 const labels=['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Family','Fantasy','History','Horror','Music','Mystery','Romance','Science Fiction','Thriller','TV Movie','War','Western'];
 const canonical=new Map(labels.map(label=>[label.toLowerCase(),label]));
 function add(value){if(typeof value==='string'){const label=canonical.get(value.trim().toLowerCase());if(label)genres.add(label);}}
 function inspect(value){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(inspect);return;}if(Array.isArray(value.genre))value.genre.forEach(add);else add(value.genre);if(value['@graph'])inspect(value['@graph']);}
 for(const node of getElementsByTagName('script',root,true))if(node.attribs.type==='application/ld+json')try{inspect(JSON.parse(textContent(node).replace(/\/\*[\s\S]*?\*\//g,'')));}catch{}
 for(const node of getElementsByTagName('a',root,true)){const match=node.attribs.href?.match(/^\/films\/genre\/([\w-]+)\/?$/);if(match)add(match[1].replace(/-/g,' '));}
 let url=null;try{url=parsePoster(root);}catch{}
 return{runtime:parseRuntime(root),genres:[...genres],url};
}
