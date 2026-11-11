/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests queue order with plain event identities and controlled promises.
 * Resolving a test promise lets a paused callback continue. These callbacks do
 * not write calendar items; the Save tests cover provider transactions.
 */

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { queueCalendarEventEdit } = ChromeUtils.importESModule(
  "resource:///modules/calendar/CalendarEventEdit.sys.mjs"
);

add_task(async function test_calendarMoveQueueFailureAndCleanup() {
  // Establish a moved identity, fail a later request, then finish queued work.
  // Failure must preserve order; an idle queue must discard stored routes.
  const source = {
    calendarId: "source-calendar",
    eventId: Services.uuid.generateUUID().toString(),
    recurrenceId: null,
  };
  const moved = { ...source, calendarId: "destination-calendar" };
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const pending = [];
  registerCleanupFunction(async () => {
    finish.resolve();
    await Promise.allSettled(pending);
  });
  const moving = queueCalendarEventEdit(source, async () => moved);
  pending.push(moving);
  let olderFinished = false;
  const older = queueCalendarEventEdit(source, async identity => {
    Assert.equal(
      identity.calendarId,
      "destination-calendar",
      "Queued edits should follow the moved calendar."
    );

    started.resolve();
    await finish.promise;
    olderFinished = true;
    throw new Error("provider-failure");
  });
  pending.push(older);
  await moving;
  await started.promise;
  const newest = queueCalendarEventEdit(moved, async identity => {
    Assert.ok(
      olderFinished,
      "A failed older Save should still preserve queue order."
    );

    return identity;
  });
  pending.push(newest);
  finish.resolve();

  await Assert.rejects(
    older,
    /provider-failure/,
    "The older edit should report its provider failure."
  );
  Assert.deepEqual(
    await newest,
    moved,
    "The newest edit should keep the moved identity."
  );

  const sourceAgain = await queueCalendarEventEdit(
    source,
    async identity => identity
  );

  Assert.deepEqual(
    sourceAgain,
    source,
    "Idle queues should remove the old calendar alias."
  );

  const destinationAgain = await queueCalendarEventEdit(
    moved,
    async identity => identity
  );

  Assert.deepEqual(
    destinationAgain,
    moved,
    "Idle queues should remove the destination alias."
  );
});

add_task(async function test_destinationEditWaitsForMoveCompletion() {
  // A new destination route joins the same queue as two older source routes.
  // Keep both older operations pending to test each ordering constraint.
  const source = {
    calendarId: "source-calendar",
    eventId: Services.uuid.generateUUID().toString(),
    recurrenceId: null,
  };
  const moved = { ...source, calendarId: "destination-calendar" };
  const started = Promise.withResolvers();
  const finishMove = Promise.withResolvers();
  const olderStarted = Promise.withResolvers();
  const finishOlder = Promise.withResolvers();
  const pending = [];
  registerCleanupFunction(async () => {
    finishMove.resolve();
    finishOlder.resolve();
    await Promise.allSettled(pending);
  });
  let olderFinished = false;
  const moving = queueCalendarEventEdit(source, async () => {
    started.resolve();
    await finishMove.promise;
    return moved;
  });
  const older = queueCalendarEventEdit(source, async identity => {
    Assert.equal(
      identity.calendarId,
      "destination-calendar",
      "Queued edits should follow the moved calendar."
    );

    olderStarted.resolve();
    await finishOlder.promise;
    olderFinished = true;
    return identity;
  });
  pending.push(moving, older);
  await started.promise;
  let newestStarted = false;
  const newest = queueCalendarEventEdit(moved, async identity => {
    newestStarted = true;

    Assert.ok(
      olderFinished,
      "The new destination editor should wait for older requests."
    );

    return identity;
  });
  pending.push(newest);
  await TestUtils.waitForTick();

  Assert.ok(
    !newestStarted,
    "The destination edit should wait while the move is pending."
  );

  finishMove.resolve();

  Assert.deepEqual(
    await moving,
    moved,
    "The move should return the destination identity."
  );

  await olderStarted.promise;

  Assert.ok(
    !newestStarted,
    "The destination edit should also wait for the older Save."
  );
  finishOlder.resolve();
  await older;
  await newest;
});
