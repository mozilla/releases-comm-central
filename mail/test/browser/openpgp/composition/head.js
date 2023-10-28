/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Uses the "cmd_sendLater" to store the message in the passed compose window
 * in the outbox.
 */
async function sendMessage(win) {
  const closePromise = BrowserTestUtils.domWindowClosed(win);
  win.goDoCommand("cmd_sendLater");
  await closePromise;

  // Give encryption/signing time to finish.
  return new Promise(resolve => setTimeout(resolve));
}
