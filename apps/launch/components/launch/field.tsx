"use client";

import { Children, cloneElement, isValidElement, useId, type ReactNode, type ReactElement } from "react";
import { CompactSelect } from "@manekineko/ui/select";

/** Associates nested unit/count fields with one visible label and optional hint. */
export function LaunchField({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  const id = useId();
  let assigned = false;
  function associate(nodes: ReactNode): ReactNode {
    return Children.map(nodes, child => {
      if (!isValidElement(child) || assigned) return child;
      const element = child as ReactElement<{ children?: ReactNode; id?: string; "aria-describedby"?: string }>;
      if (element.type === "input" || element.type === "textarea" || element.type === CompactSelect) {
        assigned = true;
        return cloneElement(element, { id, "aria-describedby": [element.props["aria-describedby"], hint ? `${id}-hint` : undefined].filter(Boolean).join(" ") || undefined });
      }
      return element.props.children ? cloneElement(element, { children: associate(element.props.children) }) : child;
    });
  }
  return <div className={`launch-field${wide ? " launch-field-wide" : ""}`}>
    <label htmlFor={id}>{label}</label>
    {associate(children)}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>;
}
