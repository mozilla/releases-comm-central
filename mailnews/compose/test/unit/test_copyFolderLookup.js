/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_setup(function () {
  localAccountUtils.loadLocalMailAccount();
});

add_task(function test_missingCopyDestination() {
  const root = localAccountUtils.rootFolder;
  const uri = `${root.URI}/MissingCopyDestination`;
  const identity = MailServices.accounts.createIdentity();
  const sender = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );
  const account = MailServices.accounts.createAccount();
  account.addIdentity(identity);
  registerCleanupFunction(() =>
    MailServices.accounts.removeAccount(account, false)
  );

  for (const mode of [
    Ci.nsIMsgSend.nsMsgDeliverNow,
    Ci.nsIMsgSend.nsMsgSaveAsDraft,
    Ci.nsIMsgSend.nsMsgSaveAsTemplate,
    Ci.nsIMsgSend.nsMsgQueueForLater,
  ]) {
    const copy = Cc["@mozilla.org/messengercompose/msgcopy;1"].createInstance(
      Ci.nsIMsgCopy
    );
    Assert.throws(
      () =>
        copy.startCopyOperation(
          identity,
          do_get_file("data/429891_testcase.eml"),
          mode,
          sender,
          uri,
          null
        ),
      error => error.result == Cr.NS_MSG_ERROR_FOLDER_MISSING,
      "Copying should report a missing destination before starting the copy"
    );
    Assert.equal(
      root.server.getFolderFromURI(uri),
      null,
      "A native copy lookup should leave the destination absent"
    );
  }
});

add_task(async function test_customOutboxCreation() {
  const root = localAccountUtils.rootFolder;
  const name = "Custom Outbox # ü";
  const uri = `${root.URI}/${encodeURIComponent(name)}`;
  Services.prefs.setCharPref("mail.default_sendlater_uri", uri);
  registerCleanupFunction(() =>
    Services.prefs.clearUserPref("mail.default_sendlater_uri")
  );
  const identity = MailServices.accounts.createIdentity();
  identity.email = "sender@example.invalid";
  identity.doFcc = false;
  const account = MailServices.accounts.createAccount();
  account.addIdentity(identity);
  registerCleanupFunction(() =>
    MailServices.accounts.removeAccount(account, false)
  );

  const sendLater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(
    Ci.nsIMsgSendLater
  );
  Assert.ok(
    !sendLater.hasUnsentMessages(identity),
    "An absent Outbox should have no unsent messages"
  );
  Assert.equal(
    root.server.getFolderFromURI(uri),
    null,
    "Checking for unsent messages should leave the destination absent"
  );

  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.from = identity.email;
  fields.to = "recipient@example.invalid";
  const sender = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );
  const { promise, resolve, reject } = Promise.withResolvers();
  const listener = {
    ...copyListener,
    onStopCopy(status) {
      if (Components.isSuccessCode(status)) {
        resolve();
      } else {
        reject(new Components.Exception("Queueing failed", status));
      }
    },
  };
  await sender.sendMessageFile(
    identity,
    account.key,
    fields,
    do_get_file("data/429891_testcase.eml"),
    false,
    false,
    Ci.nsIMsgSend.nsMsgQueueForLater,
    null,
    listener,
    null
  );
  await promise;
  const folder = sendLater.getUnsentMessagesFolder(identity);
  Assert.equal(
    folder.URI,
    uri,
    "Queueing should use the configured destination"
  );
  Assert.equal(folder.parent, root, "The Outbox should have a real parent");
  Assert.ok(
    folder.getFlag(Ci.nsMsgFolderFlags.Queue),
    "The Outbox should have its Queue flag"
  );
  Assert.equal(
    folder.getTotalMessages(false),
    1,
    "The message should be queued"
  );
});
