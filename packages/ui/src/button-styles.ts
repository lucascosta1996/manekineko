export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonAppearance = { variant?: ButtonVariant; className?: string; fullWidth?: boolean };
export function buttonClassName({ variant = "primary", className = "", fullWidth = false }: ButtonAppearance = {}) {
  return `ui-button ui-button-${variant}${fullWidth ? " ui-button-full" : ""}${className ? ` ${className}` : ""}`;
}
export type TextAppearance = { inline?: boolean; className?: string };
export function textActionClassName({ inline = false, className = "" }: TextAppearance = {}) {
  return `ui-text-action${inline ? " ui-text-action-inline" : ""}${className ? ` ${className}` : ""}`;
}
