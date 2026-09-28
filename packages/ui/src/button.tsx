"use client";

import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";
import { buttonClassName, textActionClassName, type ButtonAppearance as Appearance, type TextAppearance } from "./button-styles";
export { buttonClassName, textActionClassName, type ButtonVariant } from "./button-styles";
type ActionContent = {
  children?: ReactNode;
  icon?: ReactNode;
  iconPosition?: "start" | "end";
  busy?: boolean;
  busyLabel?: string;
  /** Include every state label so a request never changes the button's width. */
  reserveLabels?: readonly string[];
};

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`ui-spinner ${className}`} aria-hidden="true" />;
}

function Content({ children, icon, iconPosition = "start", busy, busyLabel, reserveLabels = [] }: ActionContent) {
  const labels = [...new Set(busyLabel ? [...reserveLabels, busyLabel] : reserveLabels)];
  const slot = icon || busyLabel ? <span className="ui-button-icon">{busy ? <Spinner /> : icon}</span> : null;
  return <>
    {iconPosition === "start" && slot}
    <span className="ui-button-label">
      <span>{busy && busyLabel ? busyLabel : children}</span>
      {labels.map((label) => <span className="ui-button-reserve" aria-hidden="true" key={label}>{label}</span>)}
      {busyLabel && <span className="ui-button-reserve" aria-hidden="true">{children}</span>}
    </span>
    {iconPosition === "end" && slot}
  </>;
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & Appearance & ActionContent;
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant, className, fullWidth, busy = false, busyLabel, reserveLabels, icon, iconPosition,
  children, onClick, type = "button", disabled, ...props
}, ref) {
  return <button {...props} ref={ref} type={type} disabled={disabled}
    aria-busy={busy || undefined} aria-disabled={busy || props["aria-disabled"] || undefined}
    className={buttonClassName({ variant, className, fullWidth })}
    onClick={(event) => {
      if (busy || disabled || props["aria-disabled"] === true || props["aria-disabled"] === "true") { event.preventDefault(); return; }
      event.currentTarget.focus({ preventScroll: true });
      onClick?.(event);
    }}>
    <Content {...{ children, icon, iconPosition, busy, busyLabel, reserveLabels }} />
  </button>;
});

export type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & Appearance & ActionContent;
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton({
  variant, className, fullWidth, busy = false, busyLabel, reserveLabels, icon, iconPosition,
  children, onClick, ...props
}, ref) {
  return <a {...props} ref={ref} aria-busy={busy || undefined}
    aria-disabled={busy || props["aria-disabled"] || undefined}
    className={buttonClassName({ variant, className, fullWidth })}
    onClick={(event) => {
      if (busy || props["aria-disabled"] === true || props["aria-disabled"] === "true") { event.preventDefault(); return; }
      onClick?.(event);
    }}>
    <Content {...{ children, icon, iconPosition, busy, busyLabel, reserveLabels }} />
  </a>;
});

export type IconButtonProps = Omit<ButtonProps, "icon" | "iconPosition" | "busyLabel" | "reserveLabels"> & { "aria-label": string };
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  variant = "ghost", className = "", children, busy, ...props
}, ref) {
  return <Button {...props} ref={ref} variant={variant} busy={busy} className={`ui-icon-button ${className}`}>
    {busy ? <Spinner /> : children}
  </Button>;
});

export type TextActionProps = ButtonHTMLAttributes<HTMLButtonElement> & TextAppearance & ActionContent;
export const TextAction = forwardRef<HTMLButtonElement, TextActionProps>(function TextAction({
  inline, className, busy = false, busyLabel, reserveLabels, icon, iconPosition, children,
  onClick, type = "button", disabled, ...props
}, ref) {
  return <button {...props} ref={ref} type={type} disabled={disabled}
    aria-busy={busy || undefined} aria-disabled={busy || props["aria-disabled"] || undefined}
    className={textActionClassName({ inline, className })}
    onClick={(event) => {
      if (busy || disabled || props["aria-disabled"] === true || props["aria-disabled"] === "true") { event.preventDefault(); return; }
      event.currentTarget.focus({ preventScroll: true });
      onClick?.(event);
    }}><Content {...{ children, icon, iconPosition, busy, busyLabel, reserveLabels }} /></button>;
});
