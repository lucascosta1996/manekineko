"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LaunchBrand } from "./brand";

export function LaunchLogin({
  destination = "/seasons",
}: {
  destination?: "/seasons" | "/launch";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/launch/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: data.get("username"),
          password: data.get("password"),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          result?.message ||
            result?.error ||
            "Sign-in is unavailable. Please try again."
        );
      router.replace(destination);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We could not sign you in. Please try again."
      );
      setPending(false);
    }
  }

  return (
    <main className="launch-login-shell">
      <div className="launch-login-brand">
        <LaunchBrand />
        <span className="launch-private-tag">Private workspace</span>
      </div>
      <div className="launch-login-grid">
        <section className="launch-login-intro">
          <span className="launch-eyebrow">THE LAUNCH WORKSPACE</span>
          <h1>
            Color, collected.
            <br />
            Carefully launched.
          </h1>
          <p>
            Build seasons, refine each collection and review every term before
            launch.
          </p>
          <div className="launch-login-steps">
            <span>
              <i>01</i> Shape the season
            </span>
            <span>
              <i>02</i> Set each collection’s terms
            </span>
            <span>
              <i>03</i> Review and prepare the launch
            </span>
          </div>
          <span className="launch-login-footnote">
            Tincta · Operator workspace
          </span>
        </section>
        <section className="launch-login-card">
          <span className="launch-lock" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect
                x="5"
                y="10"
                width="14"
                height="11"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <h2>Welcome back.</h2>
          <p>Sign in to your launch workspace.</p>
          <form onSubmit={login}>
            <label className="launch-field">
              <span>Username</span>
              <input
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={80}
                disabled={pending}
                autoFocus
              />
            </label>
            <label className="launch-field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
                disabled={pending}
              />
            </label>
            {error && (
              <p className="launch-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="launch-button launch-button-primary"
              type="submit"
              disabled={pending}
            >
              {pending ? "Signing in…" : "Sign in"}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <p className="launch-login-help">
            Access is reserved for provisioned operators. Contact your workspace
            administrator if you need access.
          </p>
        </section>
      </div>
    </main>
  );
}
