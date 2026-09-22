import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Private launch/artwork tooling only. Public teasers continue to use colors.
export async function loadNamedSeasonCatalog() {
  const [seasons, names] = await Promise.all([
    readFile(new URL("../seasons.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../collection-names.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.equal(names.length, seasons.length, "Every season needs a name catalog.");
  const seen = new Set();
  return seasons.map((season, index) => {
    const named = names[index];
    assert.equal(named.season, season.season, "Season order must match seasons.json.");
    assert.deepEqual(named.collections.map(item => item.color), season.collections, "Color order must match seasons.json.");
    for (const { name } of named.collections) {
      assert.equal(typeof name, "string");
      assert(name.trim() === name && name.length > 0 && Buffer.byteLength(name) <= 80, "Invalid collection name.");
      assert(!seen.has(name.toLowerCase()), `Duplicate collection name: ${name}`);
      seen.add(name.toLowerCase());
    }
    return { ...season, namedCollections: named.collections };
  });
}
