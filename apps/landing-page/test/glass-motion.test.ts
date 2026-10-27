import test from 'node:test';
import assert from 'node:assert/strict';
import { glassProgress, glassPose } from '../components/glass-motion';
import { projectGlass } from '../components/glass-geometry';

test('direct scroll mapping starts immediately and keeps lateral travel slower than the page', () => {
  for (const width of [320,390,1440,2560]) {
    const viewport=900, height=400, top=1000;
    const entry=glassProgress(100,top,height,width,viewport,false);
    assert.equal(entry,0);
    assert.ok(glassProgress(101,top,height,width,viewport,false)>entry);
    for(let scroll=100;scroll<3000;scroll+=25) {
      const current=glassPose(glassProgress(scroll,top,height,width,viewport,false),0,0).x*width;
      const next=glassPose(glassProgress(scroll+1,top,height,width,viewport,false),0,0).x*width;
      assert.ok(next-current>=0 && next-current<.5,'under half a pixel of lateral travel per scroll pixel');
    }
  }
});

test('scroll paths do not bob or rock sculptures vertically', () => {
  for (const index of [0, 1, 2]) for (const variant of [0, 1]) {
    const initial = glassPose(0, index, variant);
    for (const progress of [0, .25, .5, .75, 1]) {
      const pose = glassPose(progress, index, variant, 30);
      assert.equal(pose.y, 0);
      assert.equal(pose.rx, initial.rx);
      assert.equal(pose.rz, initial.rz);
    }
  }
});

test('idle sculptures complete a slow full 3D revolution without translating', () => {
  for (const index of [0, 1, 2]) {
    const duration = 64 + index * 16;
    const start = glassPose(.3, index, 0, 0);
    const quarter = glassPose(.3, index, 0, duration / 4);
    const end = glassPose(.3, index, 0, duration);
    assert.ok(Math.abs(Math.abs(end.ry - start.ry) - Math.PI * 2) < 1e-10);
    assert.deepEqual([end.x, end.y, end.z], [start.x, start.y, start.z]);
    const paths = (pose: typeof start) => projectGlass('monolith', false, pose).sort((a,b)=>Number(a.id)-Number(b.id)).map(face => face.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number));
    assert.notDeepEqual(paths(quarter), paths(start));
    const initial = paths(start), final = paths(end);
    initial.forEach((face,i)=>face.forEach((value,j)=>assert.ok(Math.abs(value-final[i][j]) < .01)));
  }
});

test('depth changes perspective between front and back faces, not just uniform SVG scale', () => {
  const pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  const far = projectGlass('monolith', false, pose);
  const near = projectGlass('monolith', false, { ...pose, z: 250 });
  const width = (faces: typeof far, id: string) => {
    const coordinates = faces.find(face => face.id === id)!.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const x = coordinates.filter((_, i) => i % 2 === 0);
    return Math.max(...x) - Math.min(...x);
  };
  const front = width(near, '5') / width(far, '5');
  const back = width(near, '4') / width(far, '4');
  assert.ok(front > 1.4 && back > 1.3);
  assert.ok(front - back > .04);
});

test('Ethereum diamond has lit facets and stays finite throughout a full rotation', () => {
  for(let seconds=0;seconds<=80;seconds+=5) {
    const faces=projectGlass('ethereum',true,glassPose(.4,1,0,seconds));
    assert.equal(faces.filter(face=>!face.bevel).length,14);
    assert.ok(new Set(faces.map(face=>face.opacity)).size>3);
    assert.ok(faces.every(face=>Number.isFinite(face.left)&&Number.isFinite(face.right)&&!face.path.includes('NaN')));
  }
});

// Validate the recognizable silhouette, including the empty V in the lower half.
test('Ethereum silhouette preserves the source proportions and open chevron split', () => {
  const pose = { x:0, y:0, z:0, rx:0, ry:0, rz:0 };
  const faces = projectGlass('ethereum', false, pose);
  const polygons = faces.map(face => {
    const values=face.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    return values.reduce<number[][]>((points, value, i) => {
      if(i%2===0) points.push([value, values[i+1]]);
      return points;
    }, []);
  });
  const xs=polygons.flatMap(p=>p.map(v=>v[0])), ys=polygons.flatMap(p=>p.map(v=>v[1]));
  assert.ok(Math.abs((Math.max(...xs)-Math.min(...xs))/(Math.max(...ys)-Math.min(...ys))-540/879.4)<.001);
  const filled = (x:number,y:number) => polygons.some(points => {
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const [xi,yi]=points[i], [xj,yj]=points[j];
      if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
    }
    return inside;
  });
  assert.ok(filled(8,-80), 'tall upper diamond');
  assert.ok(filled(-55,55) && filled(55,55), 'both arms of the lower chevron');
  assert.ok(filled(8,120), 'pointed lower tail');
  for(const x of [-60,-30,0,30,60]) {
    const gapY=67-Math.abs(x)*.591;
    assert.equal(filled(x,gapY),false,'continuous empty V-shaped separation');
  }
});
