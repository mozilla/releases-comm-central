/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { MessengerContentHandler } = ChromeUtils.importESModule(
  "resource:///modules/MessengerContentHandler.sys.mjs"
);
var { MailLinkParent } = ChromeUtils.importESModule(
  "resource:///actors/MailLinkParent.sys.mjs"
);
var { get_about_3pane, get_about_message } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

add_task(async function test_midUriEntryPoints() {
  const messageId = "test%25#?/test@example.invalid";
  const openedIds = [];
  const handledUris = [];
  const originalOpen = MailUtils.openMessageForMessageId;
  const originalOpenMidUri = MailUtils.openMidUri;
  MailUtils.openMessageForMessageId = id => {
    if (id != messageId) {
      return false;
    }
    openedIds.push(id);
    return true;
  };
  MailUtils.openMidUri = uri => {
    handledUris.push(uri);
    return originalOpenMidUri.call(MailUtils, uri);
  };
  try {
    const commandLineForUri = uri => ({
      state: Ci.nsICommandLine.STATE_REMOTE_AUTO,
      handleFlagWithParam: () => null,
      handleFlag: () => false,
      findFlag: () => -1,
      length: 1,
      getArgument: () => uri,
    });
    for (const uri of [
      MailUtils.constructMidUriSpec(messageId),
      `mid:${messageId}`,
    ]) {
      info(`Opening ${uri} through both entry points`);
      openedIds.length = handledUris.length = 0;
      MailLinkParent.prototype._handleMidLink({ data: { href: uri } });
      Assert.deepEqual(
        openedIds,
        [messageId],
        "A clicked encoded or legacy mid link should open the original ID"
      );

      new MessengerContentHandler().handle(commandLineForUri(uri));
      await TestUtils.waitForCondition(
        () => handledUris.length == 2,
        "The command line should pass the URI to the centralized handler"
      );
      Assert.deepEqual(
        openedIds,
        [messageId, messageId],
        "An encoded or legacy mid URI on the command line should open the original ID"
      );
      Assert.deepEqual(
        handledUris,
        [uri, uri],
        "Both entry points should pass the original URI to the centralized handler"
      );
    }

    const uri = ` \tMID:${messageId}`;
    openedIds.length = handledUris.length = 0;
    new MessengerContentHandler().handle(commandLineForUri(uri));
    await TestUtils.waitForCondition(
      () => handledUris.length == 1,
      "The command line should pass a mid URI with leading whitespace to the handler"
    );
    Assert.deepEqual(
      openedIds,
      [messageId],
      "A mid URI with leading whitespace should open the original ID"
    );
    Assert.deepEqual(
      handledUris,
      [uri],
      "The command line should preserve leading whitespace in the mid URI"
    );
  } finally {
    MailUtils.openMessageForMessageId = originalOpen;
    MailUtils.openMidUri = originalOpenMidUri;
  }
});

add_task(function test_copyMessageLinks() {
  const messageId = "test%25#?/test@example.invalid";
  const about3Pane = get_about_3pane();
  const aboutMessage = get_about_message();

  const copied = [];
  const originalMessage = aboutMessage.gMessage;
  const originalViewWrapper = about3Pane.gViewWrapper;
  const originalHeaderWrite = aboutMessage.navigator.clipboard.writeText;
  const originalContextWrite = about3Pane.navigator.clipboard.writeText;
  aboutMessage.gMessage = { messageId };
  about3Pane.gViewWrapper = {
    dbView: { hdrForFirstSelectedMessage: { messageId } },
  };
  aboutMessage.navigator.clipboard.writeText = text => copied.push(text);
  about3Pane.navigator.clipboard.writeText = text => copied.push(text);
  try {
    aboutMessage.document.getElementById("otherActionsCopyMessageLink").click();
    about3Pane.mailContextMenu.onMailContextMenuCommand({
      target: about3Pane.document.getElementById("mailContext-copyMessageLink"),
    });
    const expected = MailUtils.constructMidUriSpec(messageId);
    Assert.deepEqual(
      copied,
      [expected, expected],
      "Both copy commands should escape the Message-ID"
    );
  } finally {
    aboutMessage.gMessage = originalMessage;
    about3Pane.gViewWrapper = originalViewWrapper;
    aboutMessage.navigator.clipboard.writeText = originalHeaderWrite;
    about3Pane.navigator.clipboard.writeText = originalContextWrite;
  }
});
