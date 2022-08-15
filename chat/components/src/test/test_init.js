/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { IMServices } = ChromeUtils.import("resource:///modules/IMServices.jsm");

// Modules that should only be loaded once a chat account exists.
var ACCOUNT_MODULES = new Set([
  "resource:///modules/matrixAccount.jsm",
  "resource:///modules/matrix-sdk.jsm",
  "resource:///modules/ircAccount.jsm",
  "resource:///modules/ircHandlers.jsm",
  "resource:///modules/xmpp-base.jsm",
  "resource:///modules/xmpp-session.jsm",
]);

add_task(function test_coreInitLoadedModules() {
  do_get_profile();
  // Make sure protocols are all loaded.
  IMServices.core.init();
  IMServices.core.getProtocols();

  const loadedModules = Cu.loadedModules;
  for (const module of loadedModules) {
    ok(!ACCOUNT_MODULES.has(module), `${module} should be loaded later`);
  }
});
