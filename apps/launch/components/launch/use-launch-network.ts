"use client";
import { useState } from "react";
import type { LaunchChainId } from "../../lib/chain-policy";
import { launchDestination } from "../../lib/launch-navigation";

/** Shared URL-backed network contract. Call only after the page's unsaved-edit guard accepts. */
export function useLaunchNetwork(initialChainId: LaunchChainId) {
  const [chainId, setChainId] = useState(initialChainId);
  function selectNetwork(next: LaunchChainId) {
    if (next === chainId) return;
    window.history.replaceState(null, "", launchDestination(window.location.pathname, next));
    setChainId(next);
  }
  return [chainId, selectNetwork] as const;
}
