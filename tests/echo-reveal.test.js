import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { echo } from '../src/echo.js';

const V = x => new THREE.Vector3(x, 0, 0);
const pulse = (speed = 13) => {
  echo.clear();
  echo.emit(V(0), { radius: 10, speed, strength: 1, decay: 1 });
};

test('the area fades in together underneath the travelling line', () => {
  pulse();
  assert.equal(echo.litAt(V(2)), 0);
  assert.equal(echo.litAt(V(8)), 0);
  echo.update(0.05);
  assert.ok(echo.litAt(V(2)) > echo.litAt(V(8)));
  assert.ok(echo.litAt(V(8)) > 0);
  assert.equal(echo.litAt(V(11)), 0);
});

test('the travelling line adds a subtle highlight without overpowering the fade', () => {
  pulse(100);
  echo.update(0.3);
  const background = echo.litAt(V(3.9));
  pulse(13);
  echo.update(0.3);
  const withLine = echo.litAt(V(3.9));
  assert.ok(withLine > background * 1.3);
  assert.ok(withLine < background * 1.5);
});

test('illumination rises gently, then fades without a second bright peak', () => {
  pulse();
  echo.update(0.05);
  const early = echo.litAt(V(2));
  echo.update(0.45);
  let previous = echo.litAt(V(2));
  assert.ok(previous > early);
  for (let i = 0; i < 20; i++) {
    echo.update(0.2);
    const current = echo.litAt(V(2));
    assert.ok(current < previous);
    previous = current;
  }
});

test('the travelling line fades away before reaching the outer boundary', () => {
  const excess = (distance) => {
    const age = distance / 13;
    pulse(100);
    echo.update(age);
    const background = echo.litAt(V(distance));
    pulse(13);
    echo.update(age);
    return (echo.litAt(V(distance)) - background) / (1 - THREE.MathUtils.smoothstep(distance, 0, 10));
  };
  const middle = excess(4);
  const outer = excess(9);
  assert.ok(middle > outer);
  assert.ok(outer > 0);
  assert.ok(outer < middle * 0.2);
});

test('the outer edge feathers to black without a sharp brightness cutoff', () => {
  pulse();
  echo.update(0.5);
  const beforeEdge = echo.litAt(V(9.9));
  const atEdge = echo.litAt(V(9.95));
  assert.ok(atEdge > 0);
  assert.ok(atEdge < beforeEdge - atEdge);
  assert.equal(echo.litAt(V(10)), 0);
});

test('fade-in joins the fade-out without a sudden change at peak brightness', () => {
  pulse();
  echo.update(0.45);
  const peak = echo.litAt(V(2));
  echo.update(0.001);
  const nextFrame = echo.litAt(V(2));
  assert.ok(nextFrame <= peak);
  assert.ok(peak - nextFrame < peak * 1e-5);
});
