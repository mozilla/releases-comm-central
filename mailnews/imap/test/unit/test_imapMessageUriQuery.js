/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const composeParameters = ["editasnew=true", "redirect=true", "edittempl=true"];

let folder;
let messageURI;

add_setup(async function () {
  setupIMAPPump();
  registerCleanupFunction(() => teardownIMAPPump());

  IMAPPump.daemon.createMailbox("INBOX/Parent", { subscribed: true });
  IMAPPump.daemon.createMailbox("INBOX/Parent/Child", { subscribed: true });
  const mailbox = IMAPPump.daemon.getMailbox("INBOX/Parent/Child");
  const message = new MessageGenerator().makeMessage();
  const dataURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(message.toMessageString())
  );
  mailbox.addMessage(new ImapMessage(dataURI.spec, mailbox.uidnext++, []));

  const added = PromiseTestUtils.promiseFolderAdded("Child");
  IMAPPump.incomingServer.performExpand(false);
  await added;

  folder = IMAPPump.inbox
    .getChildNamed("Parent")
    .getChildNamed("Child")
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  folder.updateFolderWithListener(false, listener);
  await listener.promise;
  messageURI = folder.getUriForMsg([...folder.messages][0]);

  // Move the parent directory to simulate a different on-disk name. Close the
  // database first so its cache cannot mask an incorrect path during lookup.
  const originalPath = folder.filePath;
  folder.ForceDBClosed();
  const parentDirectory = originalPath.parent;
  parentDirectory.moveTo(null, parentDirectory.leafName + "-1");
  const movedPath = parentDirectory.clone();
  movedPath.append(originalPath.leafName);
  folder.filePath = movedPath;

  Assert.equal(
    folder.getTotalMessages(false),
    1,
    "The moved folder should retain its message"
  );
});

add_task(function test_messageURIsWithQuery() {
  const service = MailServices.messageServiceFromURI(messageURI);
  const message = service.messageURIToMsgHdr(messageURI);
  const expectedURL = service.getUrlForUri(messageURI).spec;

  for (const parameter of composeParameters) {
    const specs = [
      `${messageURI}?${parameter}`,
      messageURI.replace("#", `?${parameter}#`),
    ];
    for (const spec of specs) {
      Assert.equal(
        service.messageURIToMsgHdr(spec),
        message,
        `The service should resolve the original message for ${spec}`
      );
      Assert.equal(
        service.getUrlForUri(spec).spec,
        expectedURL,
        "Compose parameters should not change the message URL"
      );
    }
  }
});

add_task(function test_composeMIMEInitialization() {
  const outputTypes = [
    Ci.nsMimeOutput.nsMimeMessageDraftOrTemplate,
    Ci.nsMimeOutput.nsMimeMessageEditorTemplate,
  ];
  for (const outputType of outputTypes) {
    for (const parameter of composeParameters) {
      const converter = Cc[
        "@mozilla.org/streamconv;1?from=message/rfc822&to=*/*"
      ].createInstance(Ci.nsIMimeStreamConverter);
      converter.setMimeOutputType(outputType);
      converter
        .QueryInterface(Ci.nsIStreamConverter)
        .asyncConvertData(
          null,
          null,
          null,
          Services.io.newURI(`${messageURI}?${parameter}`)
        );
    }
  }
});
