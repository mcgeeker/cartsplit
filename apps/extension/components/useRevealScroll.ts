import {useEffect,useRef} from 'react';
import type {SyntheticEvent} from 'react';

/** Reveal the beginning of the new step, keeping its context before any action. */
export function scrollRevealedContent(element:HTMLElement|null){
 const reduced=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 element?.scrollIntoView?.({behavior:reduced?'instant':'smooth',block:'start',inline:'nearest'});
}

/** Runs after React commits new content, not on edits or background rerenders. */
export function useRevealScroll<T extends HTMLElement>(key:unknown){
 const ref=useRef<T>(null);
 useEffect(()=>{if(key)scrollRevealedContent(ref.current);},[key]);
 return ref;
}

export function scrollExpandedDetails(event:SyntheticEvent<HTMLDetailsElement>){
 if(event.target===event.currentTarget&&event.currentTarget.open)revealExpandedContent(event.currentTarget);
}

/** Keep visible expansions still. Reveal only the nearest edge when they fit;
 * for a long section reveal its first piece, leaving the rest to normal scrolling. */
export function revealExpandedContent(element:HTMLElement|null){
 if(!element)return;
 const height=element.ownerDocument.documentElement.clientHeight||window.innerHeight;
 let target=element,rect=target.getBoundingClientRect();
 if(rect.height>height){
  const content=element instanceof HTMLDetailsElement?Array.from(element.children).find(child=>child.tagName!=="SUMMARY"):element.lastElementChild;
  target=(content?.querySelector("p,textarea,input,select,button,li,dt")??content??element) as HTMLElement;
  rect=target.getBoundingClientRect();
 }
 // An oversized paragraph is read by scrolling normally once its beginning is
 // visible. Never move an already-visible toggle to the top to fit a long panel.
 if(rect.top>=0&&(rect.bottom<=height||rect.height>height&&rect.top<height))return;
 const reduced=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 target.scrollIntoView?.({behavior:reduced?'instant':'smooth',block:'nearest',inline:'nearest'});
}
