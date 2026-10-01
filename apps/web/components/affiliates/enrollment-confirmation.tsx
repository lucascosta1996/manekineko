"use client";
import { Button } from "@manekineko/ui/button";
import { Icon } from "@manekineko/ui/icons";
import { TurnstileCheck } from "./turnstile-check";

export function EnrollmentConfirmation({ siteKey, challengeId, onToken, onConfirm, busy, disabled }: {
  siteKey: string; challengeId: string; onToken: (token: string) => void; onConfirm: () => void; busy: boolean; disabled: boolean;
}) {
  return <><TurnstileCheck siteKey={siteKey} challengeId={challengeId} onToken={onToken} />
    <div className="affiliate-enrollment-submit"><Button reserveLabels={["Registering your position…", "Confirm on-chain enrollment"]} busy={busy} icon={<Icon name="diagonal" />} iconPosition="end" variant="primary" onClick={onConfirm} disabled={disabled}><span>{busy ? "Registering your position…" : "Confirm on-chain enrollment"}</span></Button></div>
  </>;
}
