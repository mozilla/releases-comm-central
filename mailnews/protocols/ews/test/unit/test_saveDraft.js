/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

let ewsServer, incomingServer, ewsAccount, identity;

add_setup(async function () {
  [ewsServer, incomingServer] = setupBasicEwsTestServer({});
  ewsAccount = MailServices.accounts.createAccount();
  identity = MailServices.accounts.createIdentity();
  ewsAccount.addIdentity(identity);
  ewsAccount.incomingServer = incomingServer;
});

add_task(async function saveDraft() {
  const rootFolder = incomingServer.rootFolder;
  await syncFolder(incomingServer, rootFolder);

  const draftsFolder = rootFolder.getChildNamed("Drafts");
  Assert.ok(!!draftsFolder, "Drafts folder should exist.");
  Assert.equal(
    draftsFolder.getTotalMessages(false),
    0,
    "Drafts should be empty."
  );

  const msgCompose = Cc[
    "@mozilla.org/messengercompose/compose;1"
  ].createInstance(Ci.nsIMsgCompose);
  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.from = "Me <me@me.org>";

  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = fields;
  msgCompose.initialize(params);

  const progress = Cc["@mozilla.org/messenger/progress;1"].createInstance(
    Ci.nsIMsgProgress
  );
  const progressListener = new PromiseTestUtils.WebProgressListener();
  progress.registerListener(progressListener);
  msgCompose.sendMsg(
    Ci.nsIMsgSend.nsMsgSaveAsDraft,
    identity,
    "",
    null,
    progress
  );
  await progressListener.promise;
  Assert.equal(
    draftsFolder.getTotalMessages(false),
    1,
    "Drafts should have 1 message."
  );
});
