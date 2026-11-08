export function parseFilmsCsv(text){
 const rows=[];let row=[],field='',quoted=false;text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n'||c==='\r')){row.push(field);field='';if(c!==','){if(row.some(Boolean))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}}else field+=c;}
 if(quoted)throw Error('Invalid CSV.');row.push(field);if(row.some(Boolean))rows.push(row);
 const header=(rows.shift()||[]).map(name=>name.trim());if(!header.some(name=>['Name','Title'].includes(name))||!header.some(name=>['Letterboxd URI','URL'].includes(name)))throw Error('Choose watched.csv or ratings.csv from your Letterboxd export.');
 const movies=new Map();for(const cells of rows){const item=Object.fromEntries(header.map((key,index)=>[key,cells[index]||'']));let target;try{target=new URL(item['Letterboxd URI']||item.URL);}catch{continue;}
  if(!['https://letterboxd.com','https://www.letterboxd.com'].includes(target.origin)||target.username||target.password||!/^\/film\/[\w-]+\/?$/.test(target.pathname))continue;
  const url='https://letterboxd.com'+target.pathname.replace(/\/?$/,'/'),title=(item.Name||item.Title||'').trim();if(!title)continue;
  const rating=Number(item.Rating);movies.set(url,{id:url,url,title,year:/^\d{4}$/.test(item.Year)?item.Year:'',rating:rating>=.5&&rating<=5&&Number.isInteger(rating*2)?rating:null,liked:false,poster:''});
 }
 if(rows.length&&!movies.size)throw Error('No valid movies found in this CSV.');return{movies:[...movies.values()],hasRatings:header.includes('Rating')};
}
export function combineFilmsCsv(files,existingMovies=[]){
 if(!files.length)throw Error('Choose a CSV file.');const parsed=files.map(file=>({...parseFilmsCsv(file.text),name:file.name}));
 const base=parsed.find(file=>/^watched\.csv$/i.test(file.name))||parsed.find(file=>!file.hasRatings)||(existingMovies.length?{movies:existingMovies}:parsed[0]);
 const ratings=new Map(parsed.filter(file=>file.hasRatings).flatMap(file=>file.movies.map(movie=>[movie.id,movie.rating])));
 return base.movies.map(movie=>({...movie,rating:ratings.has(movie.id)?ratings.get(movie.id):movie.rating}));
}
