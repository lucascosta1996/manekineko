"use client";

import { Button } from "@manekineko/ui/button";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (container: HTMLElement, options: { sitekey: string; action: string; cData: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": (code: string) => void; theme: "light" }) => string;
  remove: (id: string) => void;
};

export function TurnstileCheck({ siteKey, challengeId, onToken }: { siteKey: string; challengeId: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [attempt,setAttempt] = useState(0);
  useEffect(() => { onTokenRef.current = onToken; }, [onToken]);
  useEffect(() => {
    const turnstile = (window as Window & { turnstile?: Turnstile }).turnstile;
    if (!loaded || !container.current || !turnstile) return;
    let active = true;
    onTokenRef.current("");
    setError("");
    const widget = turnstile.render(container.current, {
      sitekey: siteKey, action: "affiliate_enrollment", cData: challengeId, theme: "light",
      callback: (token) => { if(!active)return; setError(""); onTokenRef.current(token); },
      "expired-callback": () => { if(!active)return; onTokenRef.current(""); setError("The verification expired. Complete the check again."); },
      "error-callback": (code) => { if(!active)return; onTokenRef.current(""); setError(code === "110200" ? "Verification is not configured for this website. The operator needs to allow this hostname in Cloudflare." : "Human verification could not complete. Retry the check."); },
    });
    return () => { active=false; onTokenRef.current(""); turnstile.remove(widget); };
  }, [loaded, siteKey, challengeId, attempt]);
  return <div className="affiliate-verification">
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setLoaded(true)} onError={() => setError("The verification service could not load. Refresh and try again.")} />
    <div ref={container} />
    {error && <><p role="alert">{error}</p><Button type="button" variant="secondary" onClick={()=>loaded?setAttempt(value=>value+1):location.reload()}>Retry verification</Button></>}
  </div>;
}
