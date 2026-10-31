/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that a message URI for a folder whose name contains a space still
 * resolves to the folder once the URI has been through nsIURI and the space
 * is escaped as %20, as happens when forwarding inline (bug 2088260).
 */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

add_setup(function () {
  setupIMAPPump();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
});

add_task(async function test_escaped_message_uri() {
  IMAPPump.daemon.createMailbox("Parent", { subscribed: true });
  IMAPPump.daemon.createMailbox("Parent/Sub Folder", { subscribed: true });
  const mailbox = IMAPPump.daemon.getMailbox("Parent/Sub Folder");
  const message = new MessageGenerator().makeMessage();
  const dataUri = Services.io.newURI(
    "data:text/plain;base64," + btoa(message.toMessageString())
  );
  mailbox.addMessage(new ImapMessage(dataUri.spec, mailbox.uidnext++, []));

  const added = PromiseTestUtils.promiseFolderAdded("Sub Folder");
  IMAPPump.incomingServer.performExpand(false);
  await added;

  const folder = IMAPPump.incomingServer.rootFolder
    .getChildNamed("Parent")
    .getChildNamed("Sub Folder")
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  folder.updateFolderWithListener(false, listener);
  await listener.promise;

  // Simulate a folder whose files had to use a unique name because the
  // natural on-disk name, which is derived from the URI, was occupied.
  const originalPath = folder.filePath;
  const originalSummary = folder.summaryFile;
  folder.msgDatabase = null;
  const suffixedName = originalPath.leafName + "-1";
  if (originalPath.exists()) {
    originalPath.moveTo(null, suffixedName);
  }
  originalSummary.moveTo(null, suffixedName + ".msf");
  const suffixedPath = originalPath.clone();
  suffixedPath.leafName = suffixedName;
  folder.filePath = suffixedPath;
  Assert.equal(
    folder.getTotalMessages(false),
    1,
    "the folder should have a message"
  );

  const msgURI = folder.getUriForMsg([...folder.messages][0]);
  const escapedURI = Services.io.newURI(msgURI).spec;
  Assert.notEqual(escapedURI, msgURI, "the space should have been escaped");

  const service = MailServices.messageServiceFromURI(msgURI);
  Assert.equal(
    service.getUrlForUri(escapedURI).spec,
    service.getUrlForUri(msgURI).spec,
    "the escaped message URI should map to the same URL as the original"
  );
});

add_task(function endTest() {
  teardownIMAPPump();
});
