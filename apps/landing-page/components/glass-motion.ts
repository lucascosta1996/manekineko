export type GlassPose = { x: number; y: number; z: number; rx: number; ry: number; rz: number };

/** Direct scroll progress. Slow travel comes from distance, never a delayed timeline. */
export function glassProgress(scroll: number, top: number, height: number, width: number, viewport: number, hero: boolean) {
  const span = Math.max(height + viewport * 2, width * 2, viewport * 2);
  return (hero ? scroll : viewport - (top - scroll)) / span;
}

function curve(a: number, b: number, c: number, d: number, t: number) {
  const u = 1 - t;
  return u*u*u*a + 3*u*u*t*b + 3*u*t*t*c + t*t*t*d;
}

/** One continuous trajectory controls translation, depth and orientation together. */
export function glassPose(progress: number, index: number, variant: number, seconds = 0): GlassPose {
  const p = Math.max(0, Math.min(1, progress));
  const mirror = variant % 2 === 1;
  const poses: GlassPose[] = [
    { x: curve(.08,.28,.7,.87,p), y: 0, z: curve(-180,180,180,-140,p), rx: -.3, ry: -.65 + p*.4, rz: -.12 },
    { x: curve(.85,.72,.28,.06,p), y: 0, z: curve(140,-180,-140,120,p), rx: .28, ry: .55 - p*.35, rz: .15 },
    { x: curve(.22,.34,.66,.76,p), y: 0, z: curve(-240,-120,80,40,p), rx: -.2, ry: -.5 + p*.3, rz: -.15 },
  ];
  const pose = poses[index % poses.length];
  if (mirror) { pose.x = 1 - pose.x; pose.ry *= -1; pose.rz *= -1; }
  // Real mesh rotation continues independently of scroll, one turn every 64–96s.
  const turn = seconds * Math.PI * 2 / (64 + index * 16) * (index % 2 ? -1 : 1);
  pose.ry += turn;
  return pose;
}
