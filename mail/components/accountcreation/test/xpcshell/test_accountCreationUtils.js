/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AccountCreationUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);

const { BrowserTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/BrowserTestUtils.sys.mjs"
);

add_task(async function test_promiseFirstSuccessful_success() {
  const firstPromise = Promise.withResolvers();
  const secondPromise = Promise.withResolvers();
  const thirdPromise = Promise.withResolvers();
  const queue = [
    firstPromise.promise,
    secondPromise.promise,
    thirdPromise.promise,
  ];
  const controller = new AbortController();
  const promise = AccountCreationUtils.promiseFirstSuccessful(
    queue,
    controller
  );

  firstPromise.reject(new Error("first failed"));
  secondPromise.resolve("second ftw");
  // never touching the third promise.

  const result = await promise;
  Assert.deepEqual(
    result,
    { value: "second ftw", index: 1 },
    "Should get the result from the second promise"
  );

  Assert.ok(controller.signal.aborted, "Should have aborted the signal");
});

add_task(async function test_promiseFirstSuccessful_allFailed() {
  const firstPromise = Promise.withResolvers();
  const secondPromise = Promise.withResolvers();
  const queue = [firstPromise.promise, secondPromise.promise];
  const controller = new AbortController();
  const promise = AccountCreationUtils.promiseFirstSuccessful(
    queue,
    controller
  );

  const firstError = new Error("first");
  const secondError = new Error("second");
  secondPromise.reject(secondError);
  firstPromise.reject(firstError);

  await Assert.rejects(
    promise,
    error => error.errors[0] === firstError && error.errors[1] === secondError,
    "Should reject with an aggregate error of all rejections"
  );
});

add_task(async function test_abortSignalTimeout() {
  const start = Date.now();
  const signal = AccountCreationUtils.abortSignalTimeout(100);
  await BrowserTestUtils.waitForEvent(signal, "abort");
  const end = Date.now();
  Assert.ok(signal.aborted, "Should have aborted signal");
  Assert.ok(Error.isError(signal.reason), "Should abort with an error");
  Assert.equal(
    signal.reason.message,
    "100ms timeout",
    "Error message should contain the timeout"
  );
  Assert.greaterOrEqual(
    end,
    start + 100,
    "Should have aborted after the timeout expired"
  );
});

add_task(async function test_abortableTimeout() {
  const abortController = new AbortController();
  const start = Date.now();
  await AccountCreationUtils.abortableTimeout(10, abortController.signal);
  Assert.greaterOrEqual(
    Date.now(),
    start + 10,
    "At least the amount of time specified for the timeout should have passed"
  );

  const abortError = new Error("test abort");
  // eslint-disable-next-line mozilla/rejects-requires-await
  const rejection = Assert.rejects(
    AccountCreationUtils.abortableTimeout(100, abortController.signal),
    error => error == abortError,
    "Should abort from the signal"
  );
  abortController.abort(abortError);
  await rejection;
});
