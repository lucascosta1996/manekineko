"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "./dialog";
import { Button } from "./button";

export type ConfirmOptions = {
  title?: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};
type Confirm = (options: ConfirmOptions | string) => Promise<boolean>;
const ConfirmContext = createContext<Confirm | null>(null);

/** One active confirmation per scope. A second request is safely cancelled. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = useCallback<Confirm>((next) => {
    if (pending.current) return Promise.resolve(false);
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOptions(typeof next === "string" ? { description: next } : next);
    return new Promise<boolean>((resolve) => { pending.current = resolve; });
  }, []);
  const settle = useCallback((confirmed: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setOptions(null);
    resolve?.(confirmed);
  }, []);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  return <ConfirmContext.Provider value={confirm}>
    {children}
    <Dialog.Root open={options !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-dialog-overlay" />
        <Dialog.Content className="ui-dialog-content" role="alertdialog"
          onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); if (origin.current?.isConnected) origin.current.focus(); }}>
          <Dialog.Title className="ui-dialog-title">{options?.title ?? "Confirm action"}</Dialog.Title>
          <Dialog.Description className="ui-dialog-description">{options?.description}</Dialog.Description>
          <div className="ui-dialog-actions">
            <Button ref={cancel} variant="secondary" onClick={() => settle(false)}>{options?.cancelLabel ?? "Cancel"}</Button>
            <Button variant={options?.destructive ? "destructive" : "primary"} onClick={() => settle(true)}>{options?.confirmLabel ?? "Confirm"}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </ConfirmContext.Provider>;
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used within ConfirmProvider");
  return confirm;
}
