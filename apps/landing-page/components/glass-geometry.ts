import type { GlassPose } from "./glass-motion";

type Point = [number, number, number];
type Box = [number, number, number, number, number, number];
type Plane = { points: Point[]; normal: Point; bevel: boolean };
const frame = (z = 0): Box[] => [[0,-.88,z,2.2,.48,.58],[0,.88,z,2.2,.48,.58],[-.86,0,z,.48,1.28,.58],[.86,0,z,.48,1.28,.58]];
const shapes = {
  portal: frame(),
  monolith: [[0,0,0,.88,1.75,.75]],
  steps: [[-.9,.65,0,.72,.72,.72],[0,.2,0,.72,1.62,.72],[.9,-.25,0,.72,2.52,.72]],
  cross: [[0,0,0,.68,2.3,.68],[0,0,0,2.3,.68,.68],[0,0,0,.68,.68,2.3]],
  link: [...frame(-.35).map(([x,y,z,w,h,d]) => [x-.65,y,z,w,h,d] as Box), ...frame(.35).map(([x,y,z,w,h,d]) => [x+.65,y,z,w,h,d] as Box)],
  arch: [[-.82,.2,0,.55,2.1,.65],[.82,.2,0,.55,2.1,.65],[0,-.8,0,1.1,.55,.65]],
  stack: [[-.43,.43,0,.8,.8,.8],[.43,.43,0,.8,.8,.8],[-.43,-.43,0,.8,.8,.8],[.43,-.43,-.86,.8,.8,.8]],
} satisfies Record<string, Box[]>;
export type GlassShape = keyof typeof shapes | "ethereum";

/** Six faces, twelve polished edge bevels and eight cut corners per solid. */
function beveledBox([x,y,z,w,h,d]: Box): Plane[] {
  const half = [w*50,h*50,d*50];
  const center = [x*100,y*100,z*100];
  const bevel = Math.min(...half) * .12;
  const inner = half.map(value => value-bevel);
  const planes: Plane[] = [];
  const put = (points: Point[], normal: Point, edge: boolean) => planes.push({ points: points.map(p => p.map((value,i)=>value+center[i]) as Point), normal, bevel: edge });
  for (let axis=0; axis<3; axis++) {
    const u=(axis+1)%3, v=(axis+2)%3;
    for (const sign of [-1,1]) {
      const normal: Point=[0,0,0]; normal[axis]=sign;
      put([[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{
        const p: Point=[0,0,0];p[axis]=sign*half[axis];p[u]=a*inner[u];p[v]=b*inner[v];return p;
      }),normal,false);
    }
  }
  for (const [a,b,c] of [[0,1,2],[0,2,1],[1,2,0]]) for (const sa of [-1,1]) for(const sb of [-1,1]) {
    const normal: Point=[0,0,0];normal[a]=sa/Math.SQRT2;normal[b]=sb/Math.SQRT2;
    put([[0,-1],[1,-1],[1,1],[0,1]].map(([side,sc])=>{
      const p: Point=[0,0,0];p[a]=sa*(side?inner[a]:half[a]);p[b]=sb*(side?half[b]:inner[b]);p[c]=sc*inner[c];return p;
    }),normal,true);
  }
  for (const sx of [-1,1]) for(const sy of [-1,1]) for(const sz of [-1,1]) {
    const signs=[sx,sy,sz];
    put([0,1,2].map(axis=>signs.map((sign,i)=>sign*(i===axis?half[i]:inner[i])) as Point), signs.map(sign=>sign/Math.sqrt(3)) as Point,true);
  }
  return planes;
}
/** Faceted glass volumes built around Ethereum's diamond and concave lower chevron.
 * Outline proportions: ethereum.org's eth-diamond-black mark (540 × 879.4),
 * preserved at https://commons.wikimedia.org/wiki/File:Ethereum_logo.svg.
 */
function ethereumDiamond(): Plane[] {
  const planes: Plane[] = [];
  const scale = 305 / 879.4;
  const point = (x: number, y: number, z = 0): Point => [(x - 270) * scale, (y - 439.7) * scale, z];
  const facet = (points: Point[], interior: Point) => {
    const center = [0,1,2].map(axis=>points.reduce((sum,p)=>sum+p[axis],0)/points.length) as Point;
    const a=points[1].map((v,i)=>v-points[0][i]), b=points[2].map((v,i)=>v-points[0][i]);
    let normal: Point=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const length=Math.hypot(...normal);
    normal=normal.map(v=>v/length) as Point;
    if(normal.reduce((sum,v,i)=>sum+v*(center[i]-interior[i]),0)<0) normal=normal.map(v=>-v) as Point;
    const inset=points.map(p=>p.map((v,i)=>center[i]+(v-center[i])*.965) as Point);
    planes.push({points:inset,normal,bevel:false});
    points.forEach((p,i)=>{
      const next=(i+1)%points.length;
      planes.push({points:[p,points[next],inset[next],inset[i]],normal,bevel:true});
    });
  };
  // Keep the silhouette in one plane and raise the central facet ridges.
  // A mirrored back gives the mark real volume through a full revolution.
  const top = point(270, 0), left = point(0, 447.8), right = point(540, 447.8);
  const split = point(270, 607.4);
  for (const side of [-1, 1]) {
    const ridge = point(270, 325.2, side * 24);
    for (const edge of [[top, left], [left, split], [split, right], [right, top]]) {
      facet([edge[0], edge[1], ridge], point(270, 325.2));
    }
  }
  const lowerLeft = point(0, 499), lowerRight = point(540, 499), bottom = point(270, 879.4);
  const frontNotch = point(270, 658.5, 18), backNotch = point(270, 658.5, -18);
  const interior = point(270, 755);
  for (const notch of [frontNotch, backNotch]) {
    facet([lowerLeft, notch, bottom], interior);
    facet([notch, lowerRight, bottom], interior);
  }
  // Close only the two sloping notch edges. A horizontal cap fills the V
  // and incorrectly turns Ethereum's lower chevron into an ordinary triangle.
  facet([lowerLeft, backNotch, frontNotch], interior);
  facet([lowerRight, frontNotch, backNotch], interior);
  return planes;
}
const meshes = {
  ...Object.fromEntries(Object.entries(shapes).map(([shape,boxes])=>[shape,boxes.flatMap(beveledBox)])),
  ethereum: ethereumDiamond(),
} as Record<GlassShape, Plane[]>;

/** A lit, beveled 3D mesh projected to SVG, including back faces through the glass. */
export function projectGlass(shape: GlassShape, reverse = false, pose?: GlassPose) {
  const rx = pose?.rx ?? (reverse ? .36 : -.32);
  const ry = pose?.ry ?? (reverse ? .6 : -.52);
  const rz = pose?.rz ?? (reverse ? .2 : -.18);
  const depth = pose?.z ?? 0;
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const rotate = ([x,y,z]: Point): Point => {
    const y1=y*cx-z*sx, z1=y*sx+z*cx;
    const x2=x*cy+z1*sy, z2=-x*sy+z1*cy;
    return [x2*cz-y1*sz,x2*sz+y1*cz,z2];
  };
  return meshes[shape].map((plane,index)=>{
    const points=plane.points.map(rotate), normal=rotate(plane.normal);
    const light=Math.max(0,normal[0]*-.35+normal[1]*-.65+normal[2]*.68);
    // Translate along the camera Z axis before projection; near and far faces
    // change perspective individually instead of scaling a flat SVG afterward.
    const projected=points.map(([x,y,z])=>[x*800/(800-z-depth),y*800/(800-z-depth)]);
    const path=projected.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')+'Z';
    return {
      id:String(index),path,bevel:plane.bevel,
      left:Math.min(...projected.map(p=>p[0])),right:Math.max(...projected.map(p=>p[0])),
      depth:points.reduce((sum,p)=>sum+p[2],0)/points.length,
      opacity:normal[2]>0 ? (plane.bevel ? .55+light*.4 : .52+light*.28) : (plane.bevel ? .18 : .09),
    };
  }).sort((a,b)=>a.depth-b.depth);
}
