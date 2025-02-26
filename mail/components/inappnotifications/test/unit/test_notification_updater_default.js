/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { NotificationUpdater } = ChromeUtils.importESModule(
  "resource:///modules/NotificationUpdater.sys.mjs"
);
const { clearInterval } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);
const { clearTimeout, setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

let notifications;
let serverUrl;

async function clear() {
  await new Promise(resolve => setTimeout(resolve));
  clearTimeout(NotificationUpdater._timeout);
  NotificationUpdater._timeout = null;
  NotificationUpdater._updateHistory = [];
}

add_setup(async () => {
  // FOG needs a profile directory to put its data in.
  do_get_profile();

  // FOG needs to be initialized in order for data to flow.
  Services.fog.initializeFOG();

  const server = new HttpServer();
  const raw = await IOUtils.readUTF8(
    do_get_file("files/notifications.json").path
  );

  server.registerPathHandler("/notifications.json", (request, response) => {
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "max-age=100");
    response.write(raw);
  });

  server.start(-1);

  serverUrl = `http://localhost:${server.identity.primaryPort}/notifications.json`;

  notifications = JSON.parse(raw);

  registerCleanupFunction(async () => {
    NotificationUpdater.onUpdate = null;

    await clear();
    NotificationUpdater._timeout = null;

    Services.prefs.clearUserPref(
      "datareporting.policy.dataSubmissionPolicyAcceptedVersion"
    );
    Services.prefs.clearUserPref("datareporting.policy.currentPolicyVersion");
    await new Promise(resolve => server.stop(resolve));
    await PlacesUtils.history.clear();
  });
});

add_task(async function test_DefaultUrlTelemetry() {
  Services.fog.testResetFOG();
  const getUrl = NotificationUpdater._getUrl;
  const { promise, resolve } = Promise.withResolvers();

  NotificationUpdater._getUrl = () => {
    return serverUrl;
  };

  NotificationUpdater.init();
  NotificationUpdater.onUpdate = resolve;

  await promise;

  Assert.ok(
    Glean.inappnotifications.preferences[
      "mail.inappnotifications.url"
    ].testGetValue(),
    "Telemetry should show notifications enabled based on url prefrence"
  );

  await clear();
  NotificationUpdater._getUrl = getUrl;
});
