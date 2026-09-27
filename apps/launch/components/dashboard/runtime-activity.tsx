"use client";
import { useEffect, useState } from "react";
import { Icon } from "@manekineko/ui/icons";
import type { RuntimeSnapshot } from "../../lib/season-runtime";
import type { LaunchChainId } from "../../lib/chain-policy";
import { launchDestination } from "../../lib/launch-navigation";
export function RuntimeActivity({
  chainId,
  automationId,
  name,
  compact = false,
}: {
  chainId: LaunchChainId;
  automationId: string;
  name: string;
  compact?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetch(`/api/launch/automations/${automationId}/runtime`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw Error("Activity unavailable. Refresh to retry.");
        const data: RuntimeSnapshot = await response.json();
        if (data.run && data.run.chainId !== chainId)
          throw Error("Activity network mismatch.");
        if (!controller.signal.aborted) setSnapshot(data);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [automationId, chainId, refresh]);
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible")
        setRefresh((value) => value + 1);
    };
    const id = setInterval(refreshVisible, 60_000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);
  const explorer =
    chainId === "1" ? "https://etherscan.io" : "https://sepolia.etherscan.io";
  const attention =
    snapshot?.actions.filter(
      (action) =>
        !!action.lastError ||
        ["failed", "pending", "submitted"].includes(action.status)
    ) ?? [];
  return (
    <article className="dashboard-section">
      <div className="dashboard-section-heading">
        <div>
          <h3>{name}</h3>
          <p className="dashboard-observation">
            Worker {snapshot?.run?.status ?? "unavailable"} · Heartbeat{" "}
            {snapshot?.run?.heartbeatAt ?? "unavailable"}
          </p>
        </div>
        <button
          className="launch-button launch-button-secondary"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <Icon name="refresh" /> Refresh activity
        </button>
      </div>
      {error && (
        <p className="dashboard-alert" role="alert">
          {error} Previous records may be stale.
        </p>
      )}
      {loading && <p role="status">Reading activity…</p>}
      {snapshot?.run?.lastError && (
        <p className="dashboard-alert">{snapshot.run.lastError}</p>
      )}
      {snapshot && (
        <p className="dashboard-observation">
          {attention.length} recorded actions need review.{" "}
          <a href={launchDestination("/seasons", chainId, automationId)}>
            Open season controls <Icon name="arrow" />
          </a>
        </p>
      )}
      {!compact && (
        <>
          <details className="launch-advanced">
            <summary>
              Transactions and X outbox · {snapshot?.actions.length ?? "—"}{" "}
              records <Icon name="chevron" className="ui-disclosure-icon" />
            </summary>
            <div className="dashboard-table-scroll">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Status</th>
                    <th>Evidence / next action</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot?.actions.map((action) => (
                    <tr key={action.id}>
                      <td>
                        {action.actionKey}
                        <p className="dashboard-observation">
                          {action.updatedAt}
                        </p>
                      </td>
                      <td>{action.status}</td>
                      <td>
                        {action.lastError && <p>{action.lastError}</p>}
                        {action.txHash && (
                          <a
                            href={`${explorer}/tx/${action.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Transaction <Icon name="diagonal" />
                          </a>
                        )}
                        {action.postId && (
                          <a
                            href={`https://x.com/i/status/${action.postId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Confirmed post <Icon name="diagonal" />
                          </a>
                        )}
                        {action.delivery && (
                          <p className="dashboard-observation">
                            {action.delivery.nextAction} · Observation{" "}
                            {action.delivery.observedAt ?? "unavailable"}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details className="launch-advanced">
            <summary>
              Worker event history{" "}
              <Icon name="chevron" className="ui-disclosure-icon" />
            </summary>
            {snapshot?.events.map((event) => (
              <p className="dashboard-observation" key={event.id}>
                {event.createdAt} · {event.event} · {event.message}
              </p>
            ))}
          </details>
        </>
      )}
    </article>
  );
}
