"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = "", ...props }, ref) {
  return <input {...props} ref={ref} className={`ui-input ${className}`} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = "", ...props }, ref) {
  return <textarea {...props} ref={ref} className={`ui-textarea ${className}`} />;
});

/** Bind the returned field props to the semantic input/select to associate its label and feedback. */
export function Field({ label, hint, error, required, id: providedId, children }: {
  label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; id?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true; required?: boolean }) => ReactNode;
}) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return <div className="ui-field">
    <label className="ui-field-label" htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required })}
    {hint && <p className="ui-field-hint" id={`${id}-hint`}>{hint}</p>}
    {error && <p className="ui-field-error" id={`${id}-error`}>{error}</p>}
  </div>;
}

type ChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; hint?: ReactNode };
function Choice({ kind, label, hint, className = "", id: providedId, ...props }: ChoiceProps & { kind: "checkbox" | "radio" | "switch" }) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return <div className="ui-choice">
    <label className="ui-check-field" htmlFor={id}>
      <input {...props} id={id} type={kind === "radio" ? "radio" : "checkbox"} role={kind === "switch" ? "switch" : undefined}
        aria-describedby={[props["aria-describedby"], hint ? `${id}-hint` : ""].filter(Boolean).join(" ") || undefined}
        className={`ui-${kind} ${className}`} />
      <span>{label}</span>
    </label>
    {hint && <p className="ui-field-hint" id={`${id}-hint`}>{hint}</p>}
  </div>;
}
export function Checkbox(props: ChoiceProps) { return <Choice {...props} kind="checkbox" />; }
export function Radio(props: ChoiceProps) { return <Choice {...props} kind="radio" />; }
export function Switch(props: ChoiceProps) { return <Choice {...props} kind="switch" />; }
