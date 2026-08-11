/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
const { GraphCalendar } = ChromeUtils.importESModule("resource:///modules/GraphCalendar.sys.mjs");

let graphServer;
let incomingServer;

add_setup(async function () {
  [graphServer, incomingServer] = setupBasicGraphTestServer();
});

add_task(async function test_refresh() {
  const calendar = new GraphCalendar();

  calendar.id = "AAMkAGI2TGuLAAA=";
  calendar.username = "user";
  calendar.location = "localhost";

  const op = calendar.refresh();

  await TestUtils.waitForCondition(() => !op.isPending, "Wait for refresh to complete");

  Assert.equal(op.status, Cr.NS_OK, "Should have completed successfully.");
});
