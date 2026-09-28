"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import * as Dialog from "./dialog";
import { Button, IconButton, type ButtonProps } from "./button";
import { Icon } from "./icons";

export function Feedback({ tone = "info", children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { tone?: "info" | "success" | "warning" | "danger" }) {
  return <div {...props} className={`ui-feedback ui-feedback-${tone} ${className}`}>{children}</div>;
}
export function Badge({ children, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "danger" }) {
  return <span {...props} className={`ui-badge ui-badge-${tone} ${props.className ?? ""}`}>{children}</span>;
}
export function Skeleton({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} aria-hidden="true" className={`ui-skeleton ${className}`} />;
}
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={`ui-card ${className}`} />; }
export function Disclosure({ title, children, open }: { title: ReactNode; children: ReactNode; open?: boolean }) {
  return <details className="ui-disclosure" open={open}>
    <summary><span>{title}</span><Icon name="chevron" className="ui-disclosure-icon" /></summary>
    <div className="ui-disclosure-content">{children}</div>
  </details>;
}

export function Modal({ open, onOpenChange, title, description, children, size = "default", drawer = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode;
  size?: "default" | "large"; drawer?: boolean;
}) {
  const origin = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => { if (open && document.activeElement instanceof HTMLElement) origin.current = document.activeElement; }, [open]);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="ui-dialog-overlay" />
      <Dialog.Content className={`ui-dialog-content${size === "large" ? " ui-dialog-large" : ""}${drawer ? " ui-drawer-content" : ""}`}
        {...(!description ? { "aria-describedby": undefined } : {})}
        onCloseAutoFocus={(event) => { event.preventDefault(); if (origin.current?.isConnected) origin.current.focus(); }}>
        <Dialog.Title className="ui-dialog-title">{title}</Dialog.Title>
        {description && <Dialog.Description className="ui-dialog-description">{description}</Dialog.Description>}
        {children}
        <Dialog.Close asChild><IconButton className="ui-dialog-close" aria-label={drawer ? "Close drawer" : "Close dialog"}><Icon name="close" /></IconButton></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

type Tab = { id: string; label: string; content: ReactNode; disabled?: boolean };
export function Tabs({ tabs, label, defaultValue }: { tabs: Tab[]; label: string; defaultValue?: string }) {
  const id = useId();
  const [selection, setValue] = useState(defaultValue);
  const enabled = tabs.filter((tab) => !tab.disabled);
  // Invalid defaults and later-disabled selections must still leave a keyboard entry.
  const value = enabled.some((tab) => tab.id === selection) ? selection : enabled[0]?.id;
  const container = useRef<HTMLDivElement>(null);
  return <div className="ui-tabs" ref={container}>
    <div className="ui-tab-list" role="tablist" aria-label={label} onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const index = enabled.findIndex((tab) => tab.id === value);
      const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length;
      if (!enabled[next]) return;
      event.preventDefault(); setValue(enabled[next].id);
      container.current?.querySelector<HTMLButtonElement>(`[data-tab-index="${next}"]`)?.focus();
    }}>
      {tabs.map((tab) => <button type="button" role="tab" className="ui-tab" key={tab.id}
        id={`${id}-${tab.id}-tab`} aria-controls={`${id}-${tab.id}-panel`} aria-selected={value === tab.id}
        disabled={tab.disabled} data-tab-index={enabled.findIndex((item) => item.id === tab.id)}
        tabIndex={value === tab.id ? 0 : -1} onClick={() => setValue(tab.id)}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div role="tabpanel" tabIndex={0} key={tab.id} hidden={value !== tab.id}
      id={`${id}-${tab.id}-panel`} aria-labelledby={`${id}-${tab.id}-tab`} className="ui-tab-panel">{tab.content}</div>)}
  </div>;
}

/** Popups stay in the owning DOM/focus scope, with viewport-relative collision handling. */
function usePopupPosition(open: boolean) {
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const box = trigger.current?.getBoundingClientRect(); const popup = content.current?.getBoundingClientRect();
      if (!box || !popup) return;
      const left = Math.max(16, Math.min(box.left, window.innerWidth - popup.width - 16));
      const below = box.bottom + 8;
      const top = below + popup.height <= window.innerHeight - 16 ? below : Math.max(16, box.top - popup.height - 8);
      setStyle({ left, top });
    };
    update(); window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open]);
  return { trigger, content, style };
}

export function Menu({ label, items, variant = "secondary" }: { label: string; items: { label: string; onSelect: () => void; disabled?: boolean }[]; variant?: ButtonProps["variant"] }) {
  const [open, setOpen] = useState(false); const id = useId();
  const { trigger, content, style } = usePopupPosition(open);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    if (style.visibility !== "hidden") content.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !content.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, content, trigger, style.visibility]);
  return <span className="ui-popup-owner">
    <Button ref={trigger} variant={variant} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(!open)} icon={<Icon name="chevron" />} iconPosition="end"
      onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}>{label}</Button>
    {open && <div id={id} role="menu" aria-label={label} className="ui-menu" ref={content} style={style}
      onKeyDown={(event) => {
        const buttons = Array.from(content.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key === "Tab") { setOpen(false); return; }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      {items.map((item) => <button className="ui-menu-item" role="menuitem" tabIndex={-1} type="button" key={item.label} disabled={item.disabled}
        onClick={() => { close(); item.onSelect(); }}>{item.label}</button>)}
    </div>}
  </span>;
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [hovered, setHovered] = useState(false); const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false); const id = useId();
  const open = hovered || focused;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enter = () => { clearTimeout(closeTimer.current); setHovered(true); };
  const leave = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setHovered(false), 160); };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => { if (!open) setDismissed(false); }, [open]);
  const { trigger, content, style } = usePopupPosition(open && !dismissed);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setDismissed(true); };
    document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape);
  }, [open]);
  return <span className="ui-tooltip-owner" onPointerEnter={enter} onPointerLeave={leave}>
    <IconButton ref={trigger} aria-label={label} aria-describedby={open && !dismissed ? id : undefined}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>{children}</IconButton>
    {open && !dismissed && <div ref={content} id={id} role="tooltip" className="ui-tooltip" style={style}>{label}</div>}
  </span>;
}
