"use client";

import { Children, cloneElement, isValidElement, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

const query = "(prefers-reduced-motion: no-preference)";
const subscribe = (notify: () => void) => {
  const preference = window.matchMedia(query);
  preference.addEventListener("change", notify);
  return () => preference.removeEventListener("change", notify);
};
const getSnapshot = () => window.matchMedia(query).matches;
const getServerSnapshot = () => false;

/** Actual text stays selectable and accessible; no duplicated display copy. */
export function MotionWords({ children }: { children: ReactNode }) {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  let index=0;
  const words=(nodes: ReactNode): ReactNode=>Children.map(nodes,node=>{
    if(typeof node==='string') return node.split(/(\s+)/).map((part,i)=> /^\s*$/.test(part) ? part : <span className="motion-word" key={i} style={{'--word-index':index++} as CSSProperties}>{part}</span>);
    if(isValidElement<{children?: ReactNode}>(node) && typeof node.type==='string' && !['br','svg'].includes(node.type)) return cloneElement(node,undefined,words(node.props.children));
    return node;
  });
  return <>{enabled ? words(children) : children}</>;
}
