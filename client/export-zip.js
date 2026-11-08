import {parseFilmsCsv} from './films-csv.js';
const limit=20*1024*1024;
function crc32(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
export async function readExportZip(buffer,signal){
 const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);const fail=()=>{throw Error('Choose a valid Letterboxd export ZIP.');};
 if(bytes.length<22||bytes.length>50*1024*1024)fail();let end=-1;
 for(let pos=bytes.length-22;pos>=Math.max(0,bytes.length-65557);pos--)if(view.getUint32(pos,true)===0x06054b50&&pos+22+view.getUint16(pos+20,true)===bytes.length){end=pos;break;}
 if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))fail();const count=view.getUint16(end+10,true),directorySize=view.getUint32(end+12,true),start=view.getUint32(end+16,true);if(count>5000||start+directorySize>end)fail();
 let pos=start;const entries=[];
 for(let index=0;index<count;index++){
  if(pos+46>end||view.getUint32(pos,true)!==0x02014b50)fail();const nameSize=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);if(pos+46+nameSize+extra+comment>start+directorySize)fail();
  const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+nameSize));if(!name.includes('\\')&&!name.split('/').includes('..'))entries.push({name,flags:view.getUint16(pos+8,true),method:view.getUint16(pos+10,true),crc:view.getUint32(pos+16,true),compressed:view.getUint32(pos+20,true),size:view.getUint32(pos+24,true),offset:view.getUint32(pos+42,true)});pos+=46+nameSize+extra+comment;
 }
 const watched=entries.find(entry=>entry.name==='watched.csv')||entries.find(entry=>/^[^/]+\/watched\.csv$/.test(entry.name));if(!watched)throw Error('This ZIP is missing watched.csv. Choose your Letterboxd data export.');
 const prefix=watched.name.slice(0,-'watched.csv'.length),chosen=[watched,...['ratings.csv','likes/films.csv'].map(name=>entries.find(entry=>entry.name===prefix+name)).filter(Boolean)];
 if(chosen.reduce((total,entry)=>total+entry.size,0)>limit)throw Error('This export is too large.');
 async function extract(entry){
  signal?.throwIfAborted();const at=entry.offset;if(entry.flags&1||![0,8].includes(entry.method)||entry.size>limit||at+30>start||view.getUint32(at,true)!==0x04034b50)fail();const dataStart=at+30+view.getUint16(at+26,true)+view.getUint16(at+28,true);if(dataStart+entry.compressed>start)fail();
  const compressed=bytes.subarray(dataStart,dataStart+entry.compressed);let output=compressed;
  if(entry.method===8){const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();const chunks=[];let length=0;try{for(;;){signal?.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>entry.size||length>limit)fail();chunks.push(chunk.value);}output=new Uint8Array(length);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}}finally{await reader.cancel().catch(()=>{});}}
  if(output.length!==entry.size||crc32(output)!==entry.crc)fail();return new TextDecoder('utf-8',{fatal:true}).decode(output);
 }
 const values=new Map();for(const entry of chosen)values.set(entry.name.slice(prefix.length),parseFilmsCsv(await extract(entry)).movies);
 const ratings=new Map((values.get('ratings.csv')||[]).map(movie=>[movie.id,movie.rating])),likes=new Set((values.get('likes/films.csv')||[]).map(movie=>movie.id));
 return values.get('watched.csv').map(movie=>({...movie,rating:ratings.get(movie.id)??null,liked:likes.has(movie.id)}));
}
