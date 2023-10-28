/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test setDefaultClient works for all supported types.
 */
add_task(function test_setDefaultClient() {
  const shellSvc = Cc["@mozilla.org/mail/shell-service;1"].getService(
    Ci.nsIShellService
  );

  const types = ["MAIL", "NEWS", "RSS", "CALENDAR"];

  for (const type of types) {
    shellSvc.setDefaultClient(false, shellSvc[type]);
    ok(
      shellSvc.isDefaultClient(false, shellSvc[type]),
      `setDefaultClient works for type ${type}`
    );
  }
});
