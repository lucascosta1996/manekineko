"use client";

import { useState, type FormEvent } from "react";

export function NewsletterSignup() {
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "pending" || status === "success") return;
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
    }
  }

  return (
    <form id="launch-list" className="newsletter" onSubmit={submit} aria-busy={status === "pending"}>
      <label htmlFor="launch-email">Be first to know when minting opens.</label>
      <div className="newsletter-field">
        <input
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
        <button className="button button-dark" type="submit" disabled={status === "pending" || status === "success"}>
          {status === "pending" ? "Joining…" : status === "success" ? "You’re in" : "Join the launch list"}
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={status === "success" ? "m5 12 4 4L19 6" : "M4 12h15m-6-6 6 6-6 6"} />
          </svg>
        </button>
      </div>
      <div className="newsletter-trap" aria-hidden="true" inert>
        <label htmlFor="launch-website">Website</label>
        <input id="launch-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <p id="newsletter-status" className={`newsletter-status${status === "error" ? " newsletter-error" : ""}`} role="status" aria-live="polite" aria-atomic="true">{message}</p>
    </form>
  );
}
