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

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
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

add_task(async function test_promiseFirstSuccessful_cleanupRemainingFailures() {
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
  // This failure could be unhandled if not explicitly cleaned up after handling
  // the resolution of the second promise.
  thirdPromise.reject(new Error("third failed"));
  secondPromise.resolve("second ftw");

  const result = await promise;
  Assert.deepEqual(
    result,
    { value: "second ftw", index: 1 },
    "Should get the result from the second promise"
  );

  Assert.ok(controller.signal.aborted, "Should have aborted the signal");
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

add_task(function test_deepCopy() {
  const primitiveValues = [
    undefined,
    null,
    "string",
    0,
    1,
    NaN,
    true,
    () => {},
  ];
  for (const value of primitiveValues) {
    // Special case for NaN since NaN != NaN
    if (Number.isNaN(value)) {
      Assert.ok(Number.isNaN(value), "Should return NaN when passed NaN");
    } else {
      Assert.equal(
        AccountCreationUtils.deepCopy(value),
        value,
        "Should return the same value as passed in"
      );
    }
  }

  const obj = {
    foo: "bar",
    theAnswer: 42,
    isUseful: false,
    explicitlyUndefined: undefined,
    justNull: null,
    method: () => {},
    anArray: [1, "???", () => "profit"],
    subObject: {
      evenMore: true,
    },
    anInstance: new Error("test"),
  };

  const clone = AccountCreationUtils.deepCopy(obj);

  Assert.deepEqual(
    clone,
    obj,
    "deepCopy should create an identical looking clone"
  );
  Assert.notStrictEqual(
    clone,
    obj,
    "deepCopy should return a different object"
  );
  Assert.notStrictEqual(
    clone.anArray,
    obj.anArray,
    "deepCopy should  clone the array"
  );
  Assert.notStrictEqual(
    clone.subObject,
    obj.subObject,
    "deepCopy should clone nested objects"
  );

  Assert.throws(
    () => AccountCreationUtils.deepCopy(Symbol("test")),
    error =>
      Error.isError(error) &&
      error.message == "can't copy objects of type symbol yet",
    "Should throw when trying to copy a symbol"
  );
});

add_task(async function test_exceptions() {
  const exceptionTypes = [
    AccountCreationUtils.CancelledException,
    AccountCreationUtils.NotReached,
    AccountCreationUtils.UserCancelledException,
  ];

  for (const Exception of exceptionTypes) {
    const instance = new Exception("test");
    Assert.ok(Error.isError(instance));
    Assert.equal(instance.message, "test", "Message param is passed on");
  }

  Assert.equal(
    Object.getPrototypeOf(AccountCreationUtils.UserCancelledException),
    AccountCreationUtils.CancelledException,
    "UserCancelledException should extend CancelledException"
  );
  Assert.ok(
    new AccountCreationUtils.UserCancelledException().message,
    "UserCancelledException should have a message by default"
  );

  info("Checking that NotReached logs the error...");
  const consolePromise = TestUtils.consoleMessageObserved(
    message => message?.wrappedJSObject?.arguments[0]?.message == "foo"
  );
  new AccountCreationUtils.NotReached("foo");
  await consolePromise;
});

add_task(function test_assert() {
  Assert.throws(
    () => AccountCreationUtils.assert(false, "foo"),
    error => Error.isError(error) && error.message == "foo",
    "Should throw error with the given message if assertion fails"
  );
  Assert.throws(
    () => AccountCreationUtils.assert(false),
    error => Error.isError(error) && Boolean(error.message),
    "Should throw an error with a generic message if no assertion message is specified"
  );

  info("Making sure assertions that pass don't throw...");
  AccountCreationUtils.assert(true, "This shouldn't be thrown");
});

add_task(function test_standardPorts() {
  Assert.ok(
    Array.isArray(AccountCreationUtils.standardPorts),
    "Standard ports should be an array"
  );
  for (const port of AccountCreationUtils.standardPorts) {
    Assert.equal(typeof port, "number", `Port ${port} should be a number`);
    Assert.ok(Number.isInteger(port), `Port ${port} should be an integer`);
    Assert.greater(port, 0, `Port ${port} should be a positive number`);
    Assert.lessOrEqual(
      port,
      65535,
      `Port ${port} should fit in a 16 bit integer`
    );
  }
});
