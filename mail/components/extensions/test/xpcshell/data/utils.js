/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Functions for extensions to use, so that we avoid repeating ourselves.

function assertDeepEqual(
  expected,
  actual,
  description = "Values should be equal",
  options = {}
) {
  let ok;
  const strict = !!options?.strict;
  try {
    ok = assertDeepEqualNested(expected, actual, strict);
  } catch (e) {
    ok = false;
  }
  if (!ok) {
    browser.test.fail(
      `Deep equal test. \n Expected value: ${JSON.stringify(
        expected
      )} \n Actual value: ${JSON.stringify(actual)},
      ${description}`
    );
  }
}

function assertDeepEqualNested(expected, actual, strict) {
  if (expected === null) {
    browser.test.assertTrue(actual === null);
    return actual === null;
  }

  if (expected === undefined) {
    browser.test.assertTrue(actual === undefined);
    return actual === undefined;
  }

  if (["boolean", "number", "string"].includes(typeof expected)) {
    browser.test.assertEq(typeof expected, typeof actual);
    browser.test.assertEq(expected, actual);
    return typeof expected == typeof actual && expected == actual;
  }

  if (Array.isArray(expected)) {
    browser.test.assertTrue(Array.isArray(actual));
    browser.test.assertEq(expected.length, actual.length);
    let ok = 0;
    let all = 0;
    for (let i = 0; i < expected.length; i++) {
      all++;
      if (assertDeepEqualNested(expected[i], actual[i], strict)) {
        ok++;
      }
    }
    return (
      Array.isArray(actual) && expected.length == actual.length && all == ok
    );
  }

  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual);
  // Ignore any extra keys on the actual object in non-strict mode (default).
  const lengthOk = strict
    ? expectedKeys.length == actualKeys.length
    : expectedKeys.length <= actualKeys.length;
  browser.test.assertTrue(lengthOk);

  let ok = 0;
  let all = 0;
  for (const key of expectedKeys) {
    all++;
    browser.test.assertTrue(actualKeys.includes(key), `Key ${key} exists`);
    if (assertDeepEqualNested(expected[key], actual[key], strict)) {
      ok++;
    }
  }
  return all == ok && lengthOk;
}

function waitForMessage() {
  return waitForEvent("test.onMessage");
}

function waitForEvent(eventName) {
  const [namespace, name] = eventName.split(".");
  return new Promise(resolve => {
    browser[namespace][name].addListener(function listener(...args) {
      browser[namespace][name].removeListener(listener);
      resolve(args);
    });
  });
}

async function waitForCondition(condition, msg, interval = 100, maxTries = 50) {
  let conditionPassed = false;
  let tries = 0;
  for (; tries < maxTries && !conditionPassed; tries++) {
    await new Promise(resolve =>
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      window.setTimeout(resolve, interval)
    );
    try {
      conditionPassed = await condition();
    } catch (e) {
      throw Error(`${msg} - threw exception: ${e}`);
    }
  }
  if (conditionPassed) {
    browser.test.succeed(
      `waitForCondition succeeded after ${tries} retries - ${msg}`
    );
  } else {
    browser.test.fail(`${msg} - timed out after ${maxTries} retries`);
  }
}

function sendMessage(...args) {
  const replyPromise = waitForMessage();
  browser.test.sendMessage(...args);
  return replyPromise;
}
