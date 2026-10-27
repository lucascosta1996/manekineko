import { test } from "node:test";
import assert from "node:assert/strict";
import { arcPoint, machineFrame, MACHINE_DURATION, MACHINE_STEPS, stepTime } from "../components/rewards-machine-motion";

test("the draw follows sellout and all six equal claims empty only the illustrated prize pool", () => {
  assert.deepEqual(MACHINE_STEPS.map(({id}) => id), ["mint", "pool", "vrf", "winners", "claims"]);
  for (const {id} of MACHINE_STEPS) assert.equal(machineFrame(stepTime(id)).phase, id);
  assert.equal(machineFrame(0).prizeFill, 0);
  assert.equal(machineFrame(stepTime("pool")).prizeFill, 1);
  assert.equal(machineFrame(stepTime("winners")).prizeFill, 1);
  let previousFill = 1;
  const claimsStart = MACHINE_STEPS.find(({id}) => id === "claims")!.start;
  for (let time = claimsStart; time < MACHINE_DURATION; time += 50) {
    const frame = machineFrame(time);
    assert.ok(frame.prizeFill <= previousFill && frame.prizeFill >= 0);
    assert.ok(frame.claims.every(value => value >= 0 && value <= 1));
    assert.ok(Math.abs(frame.prizeFill + frame.claims.reduce((sum,value)=>sum+value,0)/6 - 1) < 1e-10);
    previousFill = frame.prizeFill;
  }
  const end = machineFrame(stepTime("claims"));
  assert.equal(end.prizeFill, 0);
  assert.deepEqual(end.claims, [1,1,1,1,1,1]);
  assert.deepEqual(machineFrame(MACHINE_DURATION), machineFrame(0));
});

test("claim flights arrive at each holder even after responsive geometry changes", () => {
  for (const [from, to] of [[{x:480,y:310},{x:980,y:230}], [{x:70,y:350},{x:220,y:680}]]) {
    assert.deepEqual(arcPoint(from,to,0,55),from);
    const end = arcPoint(from,to,1,55);
    assert.equal(end.x,to.x); assert.ok(Math.abs(end.y-to.y)<1e-10);
    assert.ok(arcPoint(from,to,.5,55).y < (from.y+to.y)/2);
  }
});
