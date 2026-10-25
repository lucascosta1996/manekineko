import { keccak256, toUtf8Bytes } from 'ethers';
import type { DeploymentExpectation } from './verify-deployment.mts';
export function publicationCurrent(report: any, expected: DeploymentExpectation, count: number) {
  return report?.status === 'verified' && report.independentRpcAgreement === true && report.explorerSourcesPublished === true && report.deploymentHash === keccak256(toUtf8Bytes(JSON.stringify(expected))) && report.preparedCollections === count && report.publications?.length === 7 + count && report.publications.every((p: any) => p.published === true && ['etherscan-exact','sourcify-exact'].includes(p.verification));
}
