import type { LaunchChainId } from "./chain-policy.ts";

const destinations = new Set(["/dashboard", "/activity", "/settings", "/seasons", "/launch", "/earnings", "/active-collection", "/upcoming-collection"]);
export function launchNetwork(value: unknown, fallback: LaunchChainId = "1"): LaunchChainId {
  return value === "1" || value === "11155111" ? value : fallback;
}
export function launchDestination(path: string, chainId: LaunchChainId, automationId?: string): string {
  const target = destinations.has(path) ? path : "/dashboard";
  const query = new URLSearchParams({ chainId });
  if (target === "/seasons" && automationId && /^[0-9a-f-]{36}$/i.test(automationId)) query.set("automationId", automationId);
  return `${target}?${query}`;
}
/** Only explicit internal destinations and supported network/deep-link parameters survive login. */
export function safeLaunchDestination(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/dashboard";
  const [path, query = ""] = value.split("?");
  if (!destinations.has(path) || value.includes("#")) return "/dashboard";
  const params = new URLSearchParams(query);
  if ([...params.keys()].some(key => !["chainId", "automationId"].includes(key)) || params.getAll("chainId").length > 1 || params.getAll("automationId").length > 1) return "/dashboard";
  if (!query) return path;
  if (!["1", "11155111"].includes(params.get("chainId") ?? "")) return "/dashboard";
  const automation = params.get("automationId");
  if (automation && (path !== "/seasons" || !/^[0-9a-f-]{36}$/i.test(automation))) return "/dashboard";
  return launchDestination(path, params.get("chainId") as LaunchChainId, automation ?? undefined);
}

/** A request is scoped to both the selected chain and its generation; a late prior response is inert. */
export function currentLaunchResponse(chainId: string, expectedChainId: LaunchChainId, generation: number, currentGeneration: number): boolean {
  return chainId === expectedChainId && generation === currentGeneration;
}
