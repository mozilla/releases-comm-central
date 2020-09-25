/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Functions for extensions to use, so that we avoid repeating ourselves.

function assertDeepEqual(expected, actual) {
  if (expected === null) {
    browser.test.assertTrue(actual === null);
    return;
  }

  if (["boolean", "number", "string"].includes(typeof expected)) {
    browser.test.assertEq(typeof expected, typeof actual);
    browser.test.assertEq(expected, actual);
    return;
  }

  if (Array.isArray(expected)) {
    browser.test.assertTrue(Array.isArray(actual));
    browser.test.assertEq(expected.length, actual.length);
    for (let i = 0; i < expected.length; i++) {
      assertDeepEqual(expected[i], actual[i]);
    }
    return;
  }

  let expectedKeys = Object.keys(expected);
  let actualKeys = Object.keys(actual);
  // Ignore any extra keys on the actual object.
  browser.test.assertTrue(expectedKeys.length <= actualKeys.length);

  for (let key of expectedKeys) {
    browser.test.assertTrue(actualKeys.includes(key), `Key ${key} exists`);
    assertDeepEqual(expected[key], actual[key]);
  }
}

function waitForMessage() {
  return waitForEvent("test.onMessage");
}

function waitForEvent(eventName) {
  let [namespace, name] = eventName.split(".");
  return new Promise(resolve => {
    browser[namespace][name].addListener(function listener(...args) {
      browser[namespace][name].removeListener(listener);
      resolve(args);
    });
  });
}

function sendMessage(...args) {
  let replyPromise = waitForMessage();
  browser.test.sendMessage(...args);
  return replyPromise;
}
