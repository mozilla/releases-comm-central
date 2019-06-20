/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../shared-modules/test-account-manager-helpers.js */
/* import-globals-from ../shared-modules/test-content-tab-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-keyboard-helpers.js */
/* import-globals-from ../shared-modules/test-pref-window-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-account-port-setting";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
  "window-helpers",
  "account-manager-helpers",
  "keyboard-helpers",
  "content-tab-helpers",
  "pref-window-helpers",
];

var elib = ChromeUtils.import("chrome://mozmill/content/modules/elementslib.jsm");

var PORT_NUMBERS_TO_TEST =
  [
    "110", // The original port number. We don't input this though.
    "456", // Random port number.
    "995", // The SSL port number.
    "110", // Back to the original.
  ];

var gTestNumber;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
}

function subtest_check_set_port_number(aDontSet) {
  // This test expects the following POP account to exist by default
  // with port number 110 and no security.
  let server = MailServices.accounts
                           .FindServer("tinderbox", FAKE_SERVER_HOSTNAME, "pop3");
  let account = MailServices.accounts.FindAccountForServer(server);

  let tab = open_advanced_settings();
  let accountRow = get_account_tree_row(account.key, "am-server.xul", tab);
  click_account_tree_row(tab, accountRow);

  let iframe = content_tab_e(tab, "contentFrame");
  let portElem = iframe.contentDocument.getElementById("server.port");
  portElem.focus();

  if (portElem.value != PORT_NUMBERS_TO_TEST[gTestNumber - 1])
    throw new Error("Port Value is not " +
                    PORT_NUMBERS_TO_TEST[gTestNumber - 1] +
                    " as expected, it is: " + portElem.value);

  if (!aDontSet) {
    delete_all_existing(mc, new elib.Elem(portElem));
    input_value(mc, PORT_NUMBERS_TO_TEST[gTestNumber]);

    mc.sleep(0);
  }

  close_advanced_settings(tab);
}

function test_account_port_setting() {
  for (gTestNumber = 1; gTestNumber < PORT_NUMBERS_TO_TEST.length; ++gTestNumber) {
    subtest_check_set_port_number(false);
  }

  subtest_check_set_port_number(true);
}
