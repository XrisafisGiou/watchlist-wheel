import app from './entry.js';
export function handle(request,pathname){const url=new URL(request.url);url.pathname=pathname;return app.fetch(new Request(url,request),{},{});}
