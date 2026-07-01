/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

const messageInjection = new MessageInjection({ mode: "local" });

add_task(async function rejectEmptyCopy() {
  const srcFolder = await messageInjection.makeEmptyFolder();
  const dstFolder = await messageInjection.makeEmptyFolder();

  Assert.throws(
    () =>
      dstFolder.copyMessages(srcFolder, [], false, null, null, false, false),
    ex => ex.result == Cr.NS_ERROR_INVALID_ARG,
    "Direct empty message copies should be rejected."
  );
});
