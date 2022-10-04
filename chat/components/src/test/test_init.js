/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);

// Modules that should only be loaded once a chat account exists.
var ACCOUNT_MODULES = new Set([
  "resource:///modules/matrixAccount.sys.mjs",
  "resource:///modules/matrix-sdk.sys.mjs",
  "resource:///modules/ircAccount.sys.mjs",
  "resource:///modules/ircHandlers.sys.mjs",
  "resource:///modules/xmpp-base.sys.mjs",
  "resource:///modules/xmpp-session.sys.mjs",
]);

add_task(function test_coreInitLoadedModules() {
  do_get_profile();
  // Make sure protocols are all loaded.
  IMServices.core.init();
  IMServices.core.getProtocols();

  for (const module of ACCOUNT_MODULES) {
    ok(!Cu.isESModuleLoaded(module), `${module} should be loaded later`);
  }
});
