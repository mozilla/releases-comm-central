/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { GraphProvider } = ChromeUtils.importESModule("resource:///modules/GraphProvider.sys.mjs");

let graphServer;
let incomingServer;

add_setup(async function () {
  [graphServer, incomingServer] = setupBasicGraphTestServer();
});

add_task(async function test_detectCalendars() {
  const serverUrl = incomingServer.getStringValue("ews_url");
  info(`Server URL: ${serverUrl}`);

  const calendars = await GraphProvider.detectCalendars("user", "password", "localhost", false, {});

  Assert.equal(calendars.length, 1, "Should be 1 calendar.");
  const calendar = calendars[0];
  Assert.equal(calendar.id, "AAMkAGI2TGuLAAA=", "Calendar ID should match.");
  Assert.equal(calendar.name, "Calendar", "Calendar name should match.");
  Assert.ok(!calendar.readOnly, "Calendar should not be readonly.");
});
