"use client";
import { Button } from "@manekineko/ui/button";

import { useState } from "react";
import { Icon } from "@manekineko/ui/icons";
import { CompactSelect } from "@manekineko/ui/select";
import { LaunchHeader } from "../launch/launch-header";
import { useLaunchNetwork } from "../launch/use-launch-network";
import { useLaunchQuery } from "../launch/use-launch-query";
import { launchDestination } from "../../lib/launch-navigation";
import {
  operationPresentation,
  operationSeasonSummaries,
  type OperationsReport,
} from "../../lib/collection-operations";
import type { EarningsReport } from "../../lib/creator-earnings";
import type { LaunchChainId } from "../../lib/chain-policy";
import { observationFresh } from "@manekineko/contract-abi/lifecycle";
import { fromScaled } from "../launch/form-values";
import { RuntimeActivity } from "./runtime-activity";

export function LaunchDashboard({
  username,
  initialChainId,
  activity = false,
}: {
  username: string;
  initialChainId: LaunchChainId;
  activity?: boolean;
}) {
  const [chainId, setChainId] = useLaunchNetwork(initialChainId);
  const query = useLaunchQuery<OperationsReport>(
    "/api/launch/collections/operations",
    chainId
  );
  const earnings = useLaunchQuery<EarningsReport>(
    "/api/launch/earnings",
    chainId
  );
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const now = query.observedNow;
  const rows = query.data?.collections ?? [];
  const current = rows.filter((row) => !row.superseded);
  const seasons = now !== null ? operationSeasonSummaries(rows, now) : [];
  const unpaid = seasons.filter((season) => !season.superseded);
  const unpaidKnown =
    !query.data?.partial &&
    unpaid.length > 0 &&
    unpaid.every(
      (season) => season.unpaidPrizes !== null && season.state !== "unavailable"
    );
  const upcoming =
    now !== null
      ? current
          .filter((row) => row.saleStartAt && Date.parse(row.saleStartAt) > now)
          .sort(
            (a, b) => Date.parse(a.saleStartAt!) - Date.parse(b.saleStartAt!)
          )[0]
      : undefined;
  const live =
    now !== null
      ? current.filter((row) => operationPresentation(row, now).live)
      : [];
  const issues =
    now !== null
      ? current.filter((row) => {
          const view = operationPresentation(row, now);
          return (
            view.stale ||
            view.missed ||
            !!row.lastError ||
            !!row.observationError
          );
        })
      : [];
  const funds = earnings.data;
  const fundsFresh =
    !!funds && observationFresh(funds.blockTime, earnings.observedNow ?? 0);
  const visible = current.filter(
    (row) =>
      `${row.season} ${row.name}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        (now !== null &&
          (filter === "attention"
            ? issues.includes(row)
            : filter === "complete" &&
              operationPresentation(row, now).lifecycle.terminal)))
  );
  async function logout() {
    try {
      const result = await fetch("/api/launch/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!result.ok) throw Error();
      window.location.replace("/login");
    } catch {
      setError("Sign out failed. Please retry.");
    }
  }
  const refresh = () => {
    query.refresh();
    earnings.refresh();
  };
  return (
    <div className="launch-shell">
      <LaunchHeader
        username={username}
        chainId={chainId}
        onNetworkChange={setChainId}
        active={activity ? "activity" : "dashboard"}
        onLogout={() => void logout()}
      />
      <main id="launch-main">
        <section className="launch-hero">
          <div>
            <span className="launch-eyebrow">
              {chainId === "1" ? "ETHEREUM MAINNET" : "SEPOLIA TESTNET"}
            </span>
            <h1>{activity ? "Activity" : "Dashboard"}</h1>
            <p>
              {activity
                ? "Worker runs, transactions and social delivery. Open a run for its recorded details."
                : "Collection progress, upcoming openings and funds at a glance."}
            </p>
          </div>
          {(!query.loading || query.data) && <Button icon={<Icon name="refresh" />} iconPosition="start" variant="secondary"

            onClick={refresh}
            disabled={query.loading || earnings.loading}
          >
             Refresh
          </Button>}
        </section>
        {(error || query.error) && (
          <p className="dashboard-alert" role="alert">
            {error || query.error}{" "}
            <a className="ui-text-action ui-text-action-inline" href={launchDestination("/dashboard", chainId)}>
              Retry dashboard
            </a>
          </p>
        )}
        {query.loading && (
          <p className="dashboard-observation" role="status">
            Refreshing collection observations…
          </p>
        )}
        {query.data?.partial && (
          <p className="dashboard-alert">
            Partial catalog: showing the latest 100 collection steps. Open
            Seasons for older plans.
          </p>
        )}
        {!activity && (
          <>
            <div className="dashboard-metrics">
              <article className="dashboard-metric">
                <h2>Minting now</h2>
                <strong>
                  {query.data &&
                  now !== null &&
                  current.every((row) => !operationPresentation(row, now).stale)
                    ? live.length
                    : "—"}
                </strong>
                <small>
                  {live.map((row) => row.name).join(", ") ||
                    "See observed collection states below"}
                </small>
              </article>
              <article className="dashboard-metric">
                <h2>Next scheduled opening</h2>
                <strong>
                  {upcoming
                    ? new Date(upcoming.saleStartAt!).toLocaleString(
                        undefined,
                        {
                          timeZone: "UTC",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )
                    : query.data && !query.data.partial
                    ? "None scheduled"
                    : "Unavailable"}
                </strong>
                <small>
                  {upcoming
                    ? `${upcoming.name} · UTC · activation unconfirmed`
                    : "Only saved future openings are shown"}
                </small>
              </article>
              <article className="dashboard-metric">
                <h2>Unpaid prizes</h2>
                <strong>
                  {unpaidKnown
                    ? unpaid.reduce(
                        (sum, season) => sum + season.unpaidPrizes!,
                        0
                      )
                    : "—"}
                </strong>
                <small>
                  {unpaidKnown
                    ? "From observed award state"
                    : "Awaiting complete current observations"}
                </small>
              </article>
              <article className="dashboard-metric">
                <h2>Creator funds available</h2>
                <strong>
                  {fundsFresh &&
                  funds &&
                  (funds.status === "available" || funds.status === "partial")
                    ? `${fromScaled(
                        String(
                          BigInt(funds.totals.withdrawableWei) +
                            BigInt(funds.totals.growthAvailableWei)
                        ),
                        18
                      )} ETH`
                    : "—"}
                </strong>
                <small>
                  {funds?.status === "partial"
                    ? "Partial total · some collections unavailable"
                    : funds?.status === "empty"
                    ? "No registered deployments"
                    : fundsFresh
                    ? `Block ${funds?.blockNumber}`
                    : "Current balance unavailable"}{" "}
                  ·{" "}
                  <a className="ui-text-action ui-text-action-inline" href={launchDestination("/earnings", chainId)}>
                    View earnings
                  </a>
                </small>
              </article>
            </div>
            {earnings.error && (
              <p className="dashboard-alert" role="status">
                Earnings: {earnings.error}
              </p>
            )}
            <section className="dashboard-section">
              <div className="dashboard-section-heading">
                <h2>Season progress</h2>
                <a className="ui-text-action" href={launchDestination("/seasons", chainId)}>
                  All seasons <Icon name="arrow" />
                </a>
              </div>
              <div className="dashboard-rows">
                {seasons
                  .filter((season) => !season.superseded)
                  .map((season) => (
                    <a
                      className="dashboard-row"
                      href={launchDestination(
                        "/seasons",
                        chainId,
                        season.automationId
                      )}
                      key={season.runId}
                    >
                      <div>
                        <h3>
                          {
                            rows.find((row) => row.runId === season.runId)
                              ?.season
                          }
                        </h3>
                        <p>
                          {season.state === "unavailable"
                            ? "Observation unavailable"
                            : `${season.completedCollections} / ${season.totalCollections} collections terminal`}{" "}
                          · Worker {season.workerStatus} · Artifact{" "}
                          {season.artifactStatus}
                        </p>
                      </div>
                      <span className="dashboard-status">{season.label}</span>
                    </a>
                  ))}
              </div>
              {!query.loading && !seasons.length && (
                <p className="dashboard-observation">
                  No prepared runs on this network.{" "}
                  <a className="ui-text-action ui-text-action-inline" href={launchDestination("/seasons", chainId)}>
                    Open Seasons
                  </a>{" "}
                  to view drafts.
                </p>
              )}
            </section>
            {issues.length > 0 && (
              <section className="dashboard-section">
                <h2>Needs attention</h2>
                {issues.map((row) => (
                  <p key={`${row.runId}:${row.id}`} className="dashboard-alert">
                    <strong>{row.name}</strong> ·{" "}
                    {row.observationError ||
                      row.lastError ||
                      operationPresentation(row, now ?? 0).label}{" "}
                    ·{" "}
                    <a className="ui-text-action ui-text-action-inline"
                      href={launchDestination(
                        "/seasons",
                        chainId,
                        row.automationId
                      )}
                    >
                      Review season
                    </a>
                  </p>
                ))}
              </section>
            )}
          </>
        )}
        {!activity && seasons.some((season) => !season.superseded) && (
          <section className="dashboard-section">
            <h2>Worker and social delivery</h2>
            {seasons
              .filter((season) => !season.superseded)
              .map((season) => (
                <RuntimeActivity
                  compact
                  key={`${chainId}:${season.automationId}`}
                  chainId={chainId}
                  automationId={season.automationId}
                  name={
                    rows.find((row) => row.runId === season.runId)?.season ??
                    "Season"
                  }
                />
              ))}
          </section>
        )}
        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <h2>{activity ? "Current runs" : "Collections"}</h2>
            <a className="ui-text-action"
              href={launchDestination(
                activity ? "/seasons" : "/active-collection",
                chainId
              )}
            >
              Open {activity ? "seasons" : "details"} <Icon name="arrow" />
            </a>
          </div>
          {activity ? (
            <>
              {seasons
                .filter((season) => !season.superseded)
                .map((season) => (
                  <RuntimeActivity
                    key={`${chainId}:${season.automationId}`}
                    chainId={chainId}
                    automationId={season.automationId}
                    name={
                      rows.find((row) => row.runId === season.runId)?.season ??
                      "Season"
                    }
                  />
                ))}
              {!query.loading && !seasons.length && (
                <p>No runs on this network.</p>
              )}
            </>
          ) : (
            <>
              <div className="dashboard-filters">
                <input className="ui-input"
                  type="search"
                  aria-label="Search collections"
                  placeholder="Search season or collection"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <CompactSelect
                  aria-label="Filter collections"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  <option value="all">All collections</option>
                  <option value="complete">Complete</option>
                  <option value="attention">Needs attention</option>
                </CompactSelect>
              </div>
              <div className="dashboard-rows">
                {visible.map((row) => {
                  const state = operationPresentation(row, now ?? 0);
                  return (
                    <a
                      key={`${row.runId}:${row.id}`}
                      className="dashboard-row"
                      href={`${launchDestination(
                        row.address
                          ? "/active-collection"
                          : "/upcoming-collection",
                        chainId
                      )}#collection-${row.id}`}
                    >
                      <div>
                        <h3>{row.name}</h3>
                        <p>
                          {row.season} · {row.minted ?? "Unknown"} /{" "}
                          {row.supply} primary mints
                        </p>
                        <p>
                          {row.blockNumber
                            ? `Observed block ${row.blockNumber} · ${row.blockTime}`
                            : "Chain observation unavailable"}
                        </p>
                      </div>
                      <span className="dashboard-status">{state.label}</span>
                    </a>
                  );
                })}
              </div>
              {!query.loading && !visible.length && (
                <p className="dashboard-observation">
                  No matching collections.
                </p>
              )}
            </>
          )}
        </section>
        {seasons.some((season) => season.superseded) && (
          <details className="ui-disclosure launch-advanced">
            <summary>
              Superseded audit history{" "}
              <Icon name="chevron" className="ui-disclosure-icon" />
            </summary>
            {seasons
              .filter((season) => season.superseded)
              .map((season) => (
                <p key={season.runId}>
                  <a className="ui-text-action ui-text-action-inline"
                    href={launchDestination(
                      "/seasons",
                      chainId,
                      season.automationId
                    )}
                  >
                    {season.totalCollections}-collection prepared sequence ·
                    Superseded history
                  </a>
                </p>
              ))}
          </details>
        )}
        <p className="dashboard-observation">
          {query.data
            ? `Operations checked ${query.data.checkedAt}. Canonical block and time are reported per collection.`
            : "No current operations snapshot."}{" "}
          <a className="ui-text-action ui-text-action-inline" href={launchDestination("/activity", chainId)}>
            Review social delivery and worker activity <Icon name="arrow" />
          </a>
        </p>
      </main>
    </div>
  );
}
