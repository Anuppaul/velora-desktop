import assert from 'node:assert/strict';
import {frameDue} from '../gnome-shell/velora@wonderer.tech/frameBudget.js';

// First paint is always due, including on a newly mapped glass actor.
assert.equal(frameDue(1000000, 0, 24), true);
// Stationary panel skips redundant per-frame transform reads under 24 FPS.
assert.equal(frameDue(1010000, 1000000, 24), false);
assert.equal(frameDue(1040000, 1000000, 24), false);
assert.equal(frameDue(1042000, 1000000, 24), true);
// An expanded Orb page never waits longer than its 30 FPS region budget.
assert.equal(frameDue(1020000, 1000000, 30), false);
assert.equal(frameDue(1034000, 1000000, 30), true);
// A monotonic clock reset must not stall a visible glass surface.
assert.equal(frameDue(10, 1000000, 24), true);
console.log('Compositor frame budget tests passed.');
