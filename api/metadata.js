import {handle} from '../server/vercel-handler.js';
export function GET(request){return handle(request,'/api/metadata');}
