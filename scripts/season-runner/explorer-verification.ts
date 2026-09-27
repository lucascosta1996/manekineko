import { createHash } from "node:crypto";
export type VerificationJob = {
  address: string; chainId: number; contractName: string; compiler: string; sourceCode: string; constructorArguments: string;
  buildInfoId?: string; sourceHash?: string;
  fingerprint: string; state: "pending" | "verified" | "failed"; attempts: number; nextAttemptAt: number; guid?: string; reason?: string;
};
export function verificationJob(input: Pick<VerificationJob, "address" | "chainId" | "contractName" | "compiler" | "sourceCode" | "constructorArguments">): VerificationJob {
  if (![1,11155111].includes(input.chainId) || !/^0x[0-9a-f]{40}$/i.test(input.address) || !/^[0-9a-f]*$/i.test(input.constructorArguments)) throw new Error("Invalid verification identity");
  return {...input,fingerprint:createHash("sha256").update(JSON.stringify(input)).digest("hex"),state:"pending",attempts:0,nextAttemptAt:0};
}
/** One bounded API operation per invocation. Submission is not verified status. No deployment capability. */
export async function advanceVerification(job: VerificationJob, options: { apiKey?: string; now: number; fetcher?: typeof fetch; loadSource?: () => Promise<string>; save: () => Promise<void> }) {
  if (job.state === "verified" || job.state === "failed" || options.now < job.nextAttemptAt) return;
  if (!options.apiKey) { job.reason="explorer_key_missing"; job.nextAttemptAt=options.now+3600000; await options.save(); return; }
  if (job.attempts >= 8) { job.state="failed"; job.reason="retry_limit"; await options.save(); return; }
  job.attempts++; job.nextAttemptAt=options.now+Math.min(3600000,30000*2**(job.attempts-1)); await options.save();
  let sourceCode=job.sourceCode;
  if(!job.guid && !sourceCode) {
    try { sourceCode=await options.loadSource!(); if(createHash("sha256").update(sourceCode).digest("hex")!==job.sourceHash)throw new Error(); }
    catch {job.state="failed";job.reason="exact_build_input_unavailable";await options.save();return;}
  }
  const params = new URLSearchParams({chainid:String(job.chainId),module:"contract",apikey:options.apiKey});
  // A saved GUID resumes status polling rather than submitting another source job.
  if (job.guid) { params.set("action","checkverifystatus"); params.set("guid",job.guid); }
  else for (const [k,v] of Object.entries({action:"verifysourcecode",contractaddress:job.address,sourceCode,codeformat:"solidity-standard-json-input",contractname:job.contractName,compilerversion:job.compiler,constructorArguments:job.constructorArguments})) params.set(k,v);
  try {
    const response=await (options.fetcher??fetch)("https://api.etherscan.io/v2/api",{method:"POST",body:params,signal:AbortSignal.timeout(8000),redirect:"error"});
    if (!response.ok) { await response.body?.cancel(); job.reason=`explorer_http_${response.status}`; }
    else {
      const data=await response.json() as {status?:string;result?:unknown};
      const result=typeof data.result==="string"?data.result:"";
      if (/already verified|already been verified/i.test(result) || job.guid && data.status==="1" && /pass.*verified/i.test(result)) { job.state="verified"; delete job.reason; }
      else if (!job.guid && data.status==="1" && /^[a-z0-9-]{10,100}$/i.test(result)) {job.guid=result;job.reason="awaiting_explorer";}
      else if (/pending|queue|rate limit|temporarily/i.test(result)) job.reason="explorer_pending";
      else {job.state="failed";job.reason="explorer_rejected_review_build";}
    }
  } catch {job.reason="explorer_unavailable";}
  await options.save();
}

export function retryVerification(job: VerificationJob) {
  if (job.state === "verified") return;
  job.state="pending"; job.attempts=0; job.nextAttemptAt=0; delete job.reason;
  // A rejected GUID cannot become valid by polling it again.
  delete job.guid;
}
