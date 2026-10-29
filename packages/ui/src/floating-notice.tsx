"use client";

import { Children, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton, Spinner } from "./button";
import { Icon } from "./icons";

let viewport: HTMLDivElement | null = null;
let subscribers = 0;

/** Shared viewport keeps simultaneous wallet and transaction feedback from overlapping. */
function useNoticeViewport() {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!viewport) {
      viewport = document.createElement("div");
      viewport.className = "ui-notice-viewport";
      document.body.appendChild(viewport);
    }
    subscribers++;
    setHost(viewport);
    return () => { if (--subscribers === 0) { viewport?.remove(); viewport = null; } };
  }, []);
  return host;
}

/** Persistent action feedback; dismissal never clears a pending transaction. */
export function FloatingNotice({ title, detail, busy = false, onDismiss, children, label = "Transaction updates", dismissLabel = "Dismiss transaction notification" }: {
  title: string; detail: string; busy?: boolean; onDismiss?: () => void; children?: ReactNode; label?: string; dismissLabel?: string;
}) {
  const host = useNoticeViewport();
  const content = Children.toArray(children);
  if (!host) return null;
  return createPortal(<aside className="ui-floating-notice" aria-label={label}>
    <div className="ui-floating-notice-heading">
      <div role="status" aria-live="polite" aria-atomic="true">
        <h2 className="ui-floating-notice-title">{busy && <Spinner />}{title}</h2>
        <p className="ui-floating-notice-detail">{detail}</p>
      </div>
      {onDismiss && <IconButton aria-label={dismissLabel} onClick={onDismiss}><Icon name="close" /></IconButton>}
    </div>
    {content.length > 0 && <div className="ui-floating-notice-actions">{content}</div>}
  </aside>, host);
}
