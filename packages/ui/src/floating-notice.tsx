"use client";

import { Children, type ReactNode } from "react";
import { IconButton, Spinner } from "./button";
import { Icon } from "./icons";

/** Persistent action feedback; dismissal never clears a pending transaction. */
export function FloatingNotice({ title, detail, busy = false, onDismiss, children }: {
  title: string; detail: string; busy?: boolean; onDismiss?: () => void; children?: ReactNode;
}) {
  const content = Children.toArray(children);
  return <aside className="ui-floating-notice" aria-label="Transaction updates">
    <div className="ui-floating-notice-heading">
      <div role="status" aria-live="polite" aria-atomic="true">
        <h2 className="ui-floating-notice-title">{busy && <Spinner />}{title}</h2>
        <p className="ui-floating-notice-detail">{detail}</p>
      </div>
      {onDismiss && <IconButton aria-label="Dismiss transaction notification" onClick={onDismiss}><Icon name="close" /></IconButton>}
    </div>
    {content.length > 0 && <div className="ui-floating-notice-actions">{content}</div>}
  </aside>;
}
