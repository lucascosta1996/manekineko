"use client";
import {
  Children,
  isValidElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import * as Select from "@radix-ui/react-select";
import { Icon } from "./icons";

type Props = Pick<
  SelectHTMLAttributes<HTMLSelectElement>,
  | "id"
  | "name"
  | "disabled"
  | "required"
  | "className"
  | "aria-label"
  | "aria-labelledby"
  | "aria-describedby"
  | "aria-invalid"
> & {
  value: string;
  children: ReactNode;
  onChange: (event: { target: { value: string } }) => void;
};
type Option = { value: string; disabled?: boolean; children: ReactNode };
const EMPTY = "__tincta_empty_option__";
/** Retains option declarations and form values; the visible control is a keyboard-accessible listbox. */
export function CompactSelect({
  value,
  onChange,
  children,
  name,
  disabled,
  required,
  className = "",
  ...label
}: Props) {
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => (child as React.ReactElement<Option>).props);
  const selected = options.find((option) => String(option.value) === value);
  return (
    <Select.Root
      value={value}
      onValueChange={(next) =>
        onChange({ target: { value: next === EMPTY ? "" : next } })
      }
      name={name}
      disabled={disabled}
      required={required}
    >
      <Select.Trigger {...label} className={`ui-select ${className}`}>
        <Select.Value>{selected?.children ?? "Choose an option"}</Select.Value>
        <Select.Icon>
          <Icon name="chevron" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="ui-select-content"
          position="popper"
          sideOffset={5}
          collisionPadding={12}
        >
          <Select.ScrollUpButton className="ui-select-scroll">
            <Icon name="up" />
          </Select.ScrollUpButton>
          <Select.Viewport className="ui-select-viewport">
            {options.map((option) => (
              <Select.Item
                className="ui-select-item"
                key={option.value}
                value={option.value === "" ? EMPTY : String(option.value)}
                disabled={option.disabled}
              >
                <Select.ItemText>{option.children}</Select.ItemText>
                <Select.ItemIndicator>
                  <Icon name="check" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="ui-select-scroll">
            <Icon name="chevron" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
