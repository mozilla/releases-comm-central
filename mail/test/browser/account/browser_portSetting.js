/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { click_account_tree_row, get_account_tree_row, open_advanced_settings } =
  ChromeUtils.import(
    "resource://testing-common/mozmill/AccountManagerHelpers.jsm"
  );
var { FAKE_SERVER_HOSTNAME } = ChromeUtils.import(
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

async function subtest_check_set_port_number(tab, dontSet) {
  // This test expects the following POP account to exist by default
  // with port number 110 and no security.
  const server = MailServices.accounts.findServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  const account = MailServices.accounts.findAccountForServer(server);

  const accountRow = get_account_tree_row(account.key, "am-server.xhtml", tab);
  await click_account_tree_row(tab, accountRow);

  const iframe =
    tab.browser.contentWindow.document.getElementById("contentFrame");
  const portElem = iframe.contentDocument.getElementById("server.port");
  portElem.focus();

  if (portElem.value != PORT_NUMBERS_TO_TEST[gTestNumber - 1]) {
    throw new Error(
      "Port Value is not " +
        PORT_NUMBERS_TO_TEST[gTestNumber - 1] +
        " as expected, it is: " +
        portElem.value
    );
  }

  if (!dontSet) {
    delete_all_existing(window, portElem);
    input_value(window, PORT_NUMBERS_TO_TEST[gTestNumber]);

    await new Promise(resolve => setTimeout(resolve));
  }
}

async function subtest_check_port_number(tab) {
  await subtest_check_set_port_number(tab, true);
}

add_task(async function test_account_port_setting() {
  for (
    gTestNumber = 1;
    gTestNumber < PORT_NUMBERS_TO_TEST.length;
    ++gTestNumber
  ) {
    await open_advanced_settings(subtest_check_set_port_number);
  }

  await open_advanced_settings(subtest_check_port_number);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
