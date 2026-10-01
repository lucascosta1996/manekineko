/** Display grouping for Sepolia reviews whose refund requires an independent factory run.
 * Execution artifacts remain separate and immutable; every member has the same season identity. */
export type SeasonReviewGroup = {
  seasonId: string; seasonName: string;
  stages: { automationId: string; collectionId: string; name: string; color: string }[];
};
export function parseSeasonReviewGroup(input: unknown): SeasonReviewGroup {
  const g = input as SeasonReviewGroup;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!g || !/^0x[0-9a-f]{64}$/i.test(g.seasonId) || !g.seasonName || g.seasonName.length > 64 || g.stages?.length !== 3
    || g.stages.some(s => !uuid.test(s.automationId) || !uuid.test(s.collectionId) || !s.name || s.name.length > 160 || !/^#[0-9a-f]{6}$/i.test(s.color))
    || new Set(g.stages.map(s => s.automationId)).size !== 3 || new Set(g.stages.map(s => s.collectionId)).size !== 3) throw new Error("invalid_season_review_group");
  return { seasonId:g.seasonId.toLowerCase(), seasonName:g.seasonName, stages:g.stages.map(s=>({automationId:s.automationId,collectionId:s.collectionId,name:s.name,color:s.color.toUpperCase()})) };
}
