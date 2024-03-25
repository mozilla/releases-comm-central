/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Test that the subscribe window for news servers has working autocomplete. */

"use strict";

var {
  NNTP_PORT,
  setupLocalServer,
  setupNNTPDaemon,
  shutdownNNTPServer,
  startupNNTPServer,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/NNTPHelpers.sys.mjs"
);
var {
  check_newsgroup_displayed,
  enter_text_in_search_box,
  open_subscribe_window_from_context_menu,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/SubscribeWindowHelpers.sys.mjs"
);

/**
 * Checks that the filter in the subscribe window works correctly
 * (shows only newsgroups matching all of several search strings
 * separated by whitespace)
 */
add_task(async function test_subscribe_newsgroup_filter() {
  var daemon = setupNNTPDaemon();
  var remoteServer = startupNNTPServer(daemon, NNTP_PORT);
  const server = setupLocalServer(NNTP_PORT);
  const rootFolder = server.rootFolder;
  await new Promise(r => setTimeout(r));
  await open_subscribe_window_from_context_menu(rootFolder, filter_test_helper);
  shutdownNNTPServer(remoteServer);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});

/**
 * Helper function (callback), needed because the subscribe window is modal.
 *
 * @param {Window} swc - The subscribe window.
 */
async function filter_test_helper(swc) {
  enter_text_in_search_box(swc, "subscribe empty");
  await TestUtils.waitForCondition(
    () => check_newsgroup_displayed(swc, "test.subscribe.empty"),
    "test.subscribe.empty not in the list"
  );
  await TestUtils.waitForCondition(
    () => !check_newsgroup_displayed(swc, "test.empty"),
    "test.empty is in the list, but should not be"
  );
  await TestUtils.waitForCondition(
    () => !check_newsgroup_displayed(swc, "test.subscribe.simple"),
    "test.subscribe.simple is in the list, but should not be"
  );
}
