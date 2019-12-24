/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var elib = ChromeUtils.import(
  "chrome://mozmill/content/modules/elementslib.jsm"
);

var {
  click_account_tree_row,
  get_account_tree_row,
  open_advanced_settings,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
);
var { FAKE_SERVER_HOSTNAME, mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { input_value, delete_all_existing } = ChromeUtils.import(
  "resource://testing-common/mozmill/KeyboardHelpers.jsm"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var PORT_NUMBERS_TO_TEST = [
  "110", // The original port number. We don't input this though.
  "456", // Random port number.
  "995", // The SSL port number.
  "110", // Back to the original.
];

var gTestNumber;

function subtest_check_set_port_number(amc, aDontSet) {
  // This test expects the following POP account to exist by default
  // with port number 110 and no security.
  let server = MailServices.accounts.FindServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  let account = MailServices.accounts.FindAccountForServer(server);

  let accountRow = get_account_tree_row(account.key, "am-server.xhtml", amc);
  click_account_tree_row(amc, accountRow);

  let iframe = amc.window.document.getElementById("contentFrame");
  let portElem = iframe.contentDocument.getElementById("server.port");
  portElem.focus();

  if (portElem.value != PORT_NUMBERS_TO_TEST[gTestNumber - 1]) {
    throw new Error(
      "Port Value is not " +
        PORT_NUMBERS_TO_TEST[gTestNumber - 1] +
        " as expected, it is: " +
        portElem.value
    );
  }

  if (!aDontSet) {
    delete_all_existing(amc, new elib.Elem(portElem));
    input_value(amc, PORT_NUMBERS_TO_TEST[gTestNumber]);

    mc.sleep(0);
  }

  mc.click(
    new elib.Elem(
      amc.window.document.getElementById("accountManager").getButton("accept")
    )
  );
}

function subtest_check_port_number(amc) {
  subtest_check_set_port_number(amc, true);
}

function test_account_port_setting() {
  for (
    gTestNumber = 1;
    gTestNumber < PORT_NUMBERS_TO_TEST.length;
    ++gTestNumber
  ) {
    open_advanced_settings(subtest_check_set_port_number);
  }

  open_advanced_settings(subtest_check_port_number);
}
