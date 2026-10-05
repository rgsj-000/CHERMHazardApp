import test from 'node:test';
import assert from 'node:assert/strict';
import { appState } from '../js/state.js';
import { clampProgress } from '../js/ui.js';

test('state separates visible layers from internal model products', () => {
  assert.deepEqual(appState.rasters, {});
  assert.deepEqual(appState.mapLayers, {});
  assert.equal(appState.selection.municipality, null);
  assert.equal(appState.selection.barangay, null);
  assert.equal(appState.model.futureLandcover, null);
  assert.equal('futureLandcover' in appState.mapLayers, false);
});

test('progress is clamped from 0 through 100', () => {
  assert.equal(clampProgress(-15), 0);
  assert.equal(clampProgress(40.5), 40.5);
  assert.equal(clampProgress(140), 100);
  assert.equal(clampProgress(Number.NaN), 0);
});
