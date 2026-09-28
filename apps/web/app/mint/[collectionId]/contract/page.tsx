import { notFound } from "next/navigation";
import { ContractExperience } from "../../../../components/contract-experience";
import { getCollection } from "../../../../lib/collections/repository";
import { programRecord } from "../../../../lib/affiliates/repository";
import { AffiliateError } from "../../../../lib/affiliates/policy";

export const dynamic = "force-dynamic";

export default async function ContractPage({ params }: { params: Promise<{ collectionId: string }> }) {
  const { collectionId } = await params;
  const collection = await getCollection(collectionId);
  if (!collection) notFound();
  const program = process.env.DATABASE_URL ? await programRecord(collectionId).catch((error: unknown) => {
    if (error instanceof AffiliateError && error.code === "not_found") return null;
    throw error;
  }) : null;
  return <ContractExperience collection={collection} program={program} />;
}
