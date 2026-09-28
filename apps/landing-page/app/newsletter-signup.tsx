"use client";
import { Button } from "@manekineko/ui/button";
import { Icon } from "@manekineko/ui/icons";

import { useRef, useState, type FormEvent } from "react";

export function NewsletterSignup() {
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const inFlight = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || status === "success") return;
    if (!emailInput.current?.validity.valid) {
      setStatus("error"); setInvalid(true); setMessage("Please enter a valid email address.");
      emailInput.current?.focus(); return;
    }
    setInvalid(false);
    inFlight.current = true;
    const data = new FormData(event.currentTarget);
    setStatus("pending");
    setMessage("");
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), website: data.get("website") }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (response.status === 400) { setInvalid(true); emailInput.current?.focus(); }
        setStatus("error");
        setMessage(response.status === 429
          ? "Too many attempts. Please try again in a little while."
          : response.status === 400
            ? "Please enter a valid email address."
            : "We couldn’t save your email right now. Please try again.");
        return;
      }
      const result = await response.json();
      if (result.success !== true) throw new Error("Signup was not confirmed");
      setStatus("success");
      setMessage("You’re on the list. We’ll email you when minting opens.");
    } catch {
      setStatus("error");
      setMessage("We couldn’t confirm your signup. Please try again.");
    } finally { inFlight.current = false; }
  }

  return (
    <form noValidate className="newsletter" onSubmit={submit} aria-label="Launch notifications" aria-describedby="launch-description" aria-busy={status === "pending"}>
      <label className="visually-hidden" htmlFor="launch-email">Email address</label>
      <div className="newsletter-field">
        <input
          ref={emailInput}
          className="ui-input"
          aria-invalid={invalid || undefined}
          onChange={() => { if (invalid) { setInvalid(false); setMessage(""); setStatus("idle"); } }}
          id="launch-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Email address"
          required
          maxLength={254}
          readOnly={status === "pending" || status === "success"}
          aria-describedby="newsletter-status"
        />
        <Button type="submit" busy={status === "pending"} busyLabel="Joining…" disabled={status === "success"} reserveLabels={["Join the launch list", "Joining…", "You’re in"]} icon={<Icon name="arrow" />}>
          {status === "pending" ? "Joining…" : status === "success" ? "You’re in" : "Join the launch list"}
        </Button>
      </div>
      <div className="newsletter-trap" aria-hidden="true" inert>
        <label htmlFor="launch-website">Website</label>
        <input id="launch-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <p id="newsletter-status" className={`newsletter-status${status === "error" ? " newsletter-error" : ""}`} role="status" aria-live="polite" aria-atomic="true">{message}</p>
    </form>
  );
}
