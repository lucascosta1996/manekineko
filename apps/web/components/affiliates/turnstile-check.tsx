"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (container: HTMLElement, options: { sitekey: string; action: string; cData: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void; theme: "light" }) => string;
  remove: (id: string) => void;
};

export function TurnstileCheck({ siteKey, challengeId, onToken }: { siteKey: string; challengeId: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);
  useEffect(() => {
    const turnstile = (window as Window & { turnstile?: Turnstile }).turnstile;
    if (!loaded || !container.current || !turnstile) return;
    const widget = turnstile.render(container.current, {
      sitekey: siteKey, action: "affiliate_enrollment", cData: challengeId, theme: "light",
      callback: (token) => { setError(""); onTokenRef.current(token); },
      "expired-callback": () => { onTokenRef.current(""); setError("The verification expired. Complete the check again."); },
      "error-callback": () => { onTokenRef.current(""); setError("The verification could not load. Refresh and try again."); },
    });
    return () => { turnstile.remove(widget); };
  }, [loaded, siteKey, challengeId]);
  return <div className="affiliate-verification">
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setLoaded(true)} onError={() => setError("The verification service could not load. Refresh and try again.")} />
    <div ref={container} />
    {error && <p role="alert">{error}</p>}
  </div>;
}
