import{cp,mkdir,readFile,writeFile}from'node:fs/promises';
await mkdir('public',{recursive:true});await cp('client','public',{recursive:true});
const files=['index.html','styles.css','tokens.css','renderer.js','wheel.js','browser.js'];const assets={};
for(const file of files)assets['/'+file]={body:await readFile('client/'+file,'utf8'),type:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'};
await writeFile('server/assets.js','export const assets='+JSON.stringify(assets)+';\n');
console.log('Vercel assets ready.');
