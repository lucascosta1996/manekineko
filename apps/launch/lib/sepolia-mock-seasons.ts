import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { AutomationError, type AutomationPayload } from "./launch-automation.ts";
import type { LaunchActor } from "./launch-config-store.ts";
import { isCurrentSeason, requireCurrentSeason } from "./current-launch.ts";
import { catalogSeasonOrder } from "./season-catalog-order.ts";
import { defaultSeasonSocial } from "./season-timeline.ts";
import { withRuntimeTransaction } from "./season-runtime-store.ts";

const adjectives = ["Quiet", "Silver", "Hidden", "Velvet", "Wandering", "Gentle", "Distant", "Misty", "Paper", "Soft", "Drifting", "Lucent", "Hollow", "Still", "Ivory", "Willow", "Amber", "Opal", "Woven", "Lunar", "Frosted", "Wild", "Silent", "Clouded", "Airy", "Golden", "Secret", "Pale", "Faint", "Glass", "Wooden", "Satin"];
const nouns = ["Orchard", "Harbor", "Meadow", "Lantern", "Garden", "Window", "Passage", "Horizon", "Grove", "Valley", "Island", "Echo", "Voyage", "Archive", "Ribbon", "Terrace", "Canopy", "Field", "Brook", "Cove", "Petal", "Feather", "Tide", "Stone", "Shell", "Dune", "Bower", "Compass", "Vessel", "Notebook", "Bridge", "Courtyard"];

function freshName(used: Set<string>): string {
  for (let attempt = 0; attempt < 2048; attempt++) {
    const name = `${adjectives[randomInt(adjectives.length)]} ${nouns[randomInt(nouns.length)]}${attempt > 1024 ? ` ${randomBytes(3).toString("hex")}` : ""}`;
    if (!used.has(name.toLowerCase())) { used.add(name.toLowerCase()); return name; }
  }
  throw new AutomationError("mock_names", "Unable to allocate independent test names. Try again.");
}

/** Copy terms, not public identities or network authority. Never mutate the source. */
export function mockSepoliaSeason(source: AutomationPayload, used = new Set<string>()): AutomationPayload {
  if (source.chainId !== "1") throw new AutomationError("mock_source", "Choose a Mainnet season to create a Sepolia mock.");
  requireCurrentSeason(source);
  for (const name of [source.name, ...source.steps.flatMap(step => [step.label, step.payload.contract.name, step.payload.contract.symbol])]) used.add(name.toLowerCase());
  const plan = structuredClone(source);
  plan.chainId = "11155111";
  plan.seasonId = `0x${randomBytes(32).toString("hex")}`;
  plan.name = freshName(used);
  plan.startAt = null;
  // Custom Mainnet copy may contain production names, domains or handles.
  plan.social = { ...defaultSeasonSocial(), enabled: source.social?.enabled ?? false };
  for (const step of plan.steps) {
    step.id = randomUUID();
    step.label = freshName(used);
    step.deadline.at = null;
    const contract = step.payload.contract, operations = step.payload.operations;
    let symbol: string;
    do { symbol = `S${randomBytes(5).toString("hex").toUpperCase()}`; } while (used.has(symbol.toLowerCase()));
    used.add(symbol.toLowerCase());
    Object.assign(contract, { chainId: plan.chainId, seasonId: plan.seasonId, seasonName: plan.name, name: step.label, symbol, initialOwner: "", enrollmentSigner: "", saleStartAt: "0" });
    delete contract.vrfCoordinator; delete contract.keyHash;
    Object.assign(operations, { factoryMode: "new", factoryAddress: "", deployerAddress: "", factoryOwnerAddress: "", affiliateEligibilityAddress: "", winnerCreditsAddress: "", notes: "" });
  }
  return requireCurrentSeason(plan);
}

/** One saved copy per Mainnet plan; retries never rename or overwrite an existing rehearsal. */
export async function createSepoliaMockSeasons(db: Pick<Pool, "connect">, actor: LaunchActor) {
  return withRuntimeTransaction(db, async client => {
    const actorRow = await client.query("SELECT id FROM manekineko_launch_users WHERE id=$1 AND disabled_at IS NULL FOR SHARE", [actor.userId]);
    if (!actorRow.rowCount) throw new AutomationError("inactive_actor", "Sign in with an active operator account.", 403);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('sepolia-mock-seasons',0))");
    const rows = (await client.query<{ id: string; revision: number; plan: AutomationPayload; mock_source_id: string | null }>("SELECT id,revision,plan,mock_source_id FROM manekineko_launch_automations ORDER BY created_at,id FOR SHARE")).rows;
    const sources = rows.filter(row => row.plan.chainId === "1" && isCurrentSeason(row.plan));
    if (!sources.length) throw new AutomationError("mock_source", "Save a Mainnet season before creating Sepolia mocks.", 409);
    const used = new Set(rows.flatMap(row => [row.plan.name, ...row.plan.steps.flatMap(step => [step.label, step.payload.contract.name, step.payload.contract.symbol])]).map(value => value.toLowerCase()));
    const copied = new Set(rows.map(row => row.mock_source_id));
    let createdSeasons = 0, createdCollections = 0;
    for (const source of sources) {
      if (copied.has(source.id)) continue;
      const plan = mockSepoliaSeason(source.plan, used);
      await client.query(`INSERT INTO manekineko_launch_automations(id,plan,created_by,updated_by,mock_source_id,mock_source_revision,mock_catalog_order)
        VALUES($1,$2::jsonb,$3,$3,$4,$5,$6)`, [randomUUID(), JSON.stringify(plan), actor.userId, source.id, source.revision, catalogSeasonOrder(source.plan.seasonId)]);
      createdSeasons++; createdCollections += plan.steps.length;
    }
    return { createdSeasons, createdCollections, existingSeasons: sources.length - createdSeasons };
  });
}
