export function createStarRange(host,onChange){
 let value=null,anchor=null,dragging=false,previous=null;
 const buttons=[];const clamp=n=>Math.max(.5,Math.min(5,n));
 const set=next=>{value=next;if(!next)anchor=null;buttons.forEach((button,i)=>{const half=(i+1)/2;button.classList.toggle('rating-active',!!value&&half<=value.max&&half>=value.min-(Number.isInteger(value.min)? .5:0));button.setAttribute('aria-pressed',String(!!value&&half>=value.min&&half<=value.max));});};
 const update=point=>{set({min:Math.min(anchor,point),max:Math.max(anchor,point)});onChange({...value});};
 const point=event=>clamp(Math.ceil((event.clientX-host.getBoundingClientRect().left)/host.getBoundingClientRect().width*10)/2);
 for(let index=0;index<10;index++){
  const button=document.createElement('button');button.type='button';button.className='rating-half'+(index%2?' rating-right':'');button.setAttribute('aria-label',`${(index+1)/2} stars`);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','m12 1 3.35 6.8 7.5 1.1-5.43 5.3 1.28 7.48L12 18.15l-6.7 3.53 1.28-7.48-5.43-5.3 7.5-1.1Z');svg.append(path);button.append(svg);
  button.addEventListener('click',event=>{if(event.detail===0&&host.getAttribute('aria-disabled')!=='true'){anchor=event.shiftKey&&value?value.min:(index+1)/2;update((index+1)/2);}});
  button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||host.getAttribute('aria-disabled')==='true')return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?9:Math.max(0,Math.min(9,index+(event.key==='ArrowRight'?1:-1)));if(event.shiftKey){anchor??=(index+1)/2;update((next+1)/2);}buttons[next].focus();});
  buttons.push(button);host.append(button);
 }
 host.addEventListener('pointerdown',event=>{if(event.button!==0||host.getAttribute('aria-disabled')==='true')return;event.preventDefault();const start=point(event);previous=value;anchor=value&&Math.min(Math.abs(start-value.min),Math.abs(start-value.max))<=.5?(Math.abs(start-value.min)<Math.abs(start-value.max)?value.max:value.min):start;dragging=true;host.setPointerCapture(event.pointerId);update(start);});
 host.addEventListener('pointermove',event=>{if(dragging)update(point(event));});
 host.addEventListener('pointerup',event=>{if(!dragging)return;update(point(event));dragging=false;host.releasePointerCapture(event.pointerId);});
 host.addEventListener('pointercancel',()=>{dragging=false;set(previous);onChange(value?{...value}:null);});
 set(null);return{set,disable(disabled){host.setAttribute('aria-disabled',String(disabled));buttons.forEach(button=>{button.disabled=disabled;});}};
}
