/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test dragging recipient pills, both within one compose window and between
 * two compose windows (bug 1762167).
 */

"use strict";

var { close_compose_window, open_compose_new_mail, setup_msg_contents } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

/**
 * Control case: drag a pill onto another pill in the same window. This is
 * the supported single-window path and proves the synthesized drag works.
 */
add_task(async function test_pill_drag_same_window() {
  const cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "first@example.invalid, second@example.invalid",
    "Same-window pill drag",
    ""
  );

  const recipientsContainer = cwc.document.getElementById(
    "recipientsContainer"
  );
  const pills = recipientsContainer.getAllPills();
  Assert.equal(pills.length, 2, "Two pills should have been created");

  // Drag the second pill onto the first; it should be inserted before it.
  // The dragged pill is removed and recreated by the drop, so no dragend
  // can fire on it.
  await EventUtils.synthesizePlainDragAndDrop({
    srcElement: pills[1],
    destElement: pills[0],
    srcWindow: cwc,
    destWindow: cwc,
    expectSrcElementDisconnected: true,
  });

  Assert.deepEqual(
    [...recipientsContainer.getAllPills()].map(pill => pill.fullAddress),
    ["second@example.invalid", "first@example.invalid"],
    "Dragged pill should have moved before the target pill"
  );

  await close_compose_window(cwc);
});

/**
 * Bug 1762167: drag a pill from the To field of compose window A into the
 * To field of compose window B.
 */
add_task(async function test_pill_drag_cross_window() {
  const cwcA = await open_compose_new_mail();
  const cwcB = await open_compose_new_mail();
  await setup_msg_contents(
    cwcA,
    "person@example.invalid",
    "Cross-window pill drag",
    ""
  );

  const pill = cwcA.document.querySelector("mail-address-pill");
  Assert.ok(pill, "Pill should have been created in window A");

  const targetContainer = cwcB.document.getElementById("toAddrContainer");
  // Use a real drag session rather than synthesizeDrop's fabricated events;
  // only this reproduces actual cross-window dataTransfer behavior. The
  // dragged pill is removed from window A by the drop, so no dragend can
  // fire on it.
  await EventUtils.synthesizePlainDragAndDrop({
    srcElement: pill,
    destElement: targetContainer,
    srcWindow: cwcA,
    destWindow: cwcB,
    expectSrcElementDisconnected: true,
  });

  const pillsB = cwcB.document
    .getElementById("recipientsContainer")
    .getAllPills();
  Assert.equal(pillsB.length, 1, "Pill should have arrived in window B");
  Assert.equal(
    pillsB[0]?.fullAddress,
    "person@example.invalid",
    "Pill in window B should carry the dragged address"
  );
  Assert.equal(
    cwcA.document.getElementById("recipientsContainer").getAllPills().length,
    0,
    "Pill should have been removed from window A"
  );

  await close_compose_window(cwcB);
  await close_compose_window(cwcA);
});
