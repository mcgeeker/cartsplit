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
 if(event.target===event.currentTarget&&event.currentTarget.open)scrollRevealedContent(event.currentTarget);
}
