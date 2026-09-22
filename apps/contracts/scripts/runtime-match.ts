import { getBytes, hexlify } from "ethers";

type RuntimeArtifact = {
  deployedBytecode: string;
  immutableReferences?: Record<string, Array<{ start: number; length: number }>>;
};

/** Match all executable code against the local artifact. Check immutable values separately. */
export function matchesRuntime(code: string, artifact: RuntimeArtifact): boolean {
  const actual = getBytes(code);
  const expected = getBytes(artifact.deployedBytecode);
  if (actual.length === 0 || actual.length !== expected.length) return false;
  for (const references of Object.values(artifact.immutableReferences ?? {})) {
    for (const { start, length } of references) {
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 1 || start + length > actual.length) {
        throw new Error("Invalid artifact immutable reference.");
      }
      actual.fill(0, start, start + length);
      expected.fill(0, start, start + length);
    }
  }
  return hexlify(actual) === hexlify(expected);
}
