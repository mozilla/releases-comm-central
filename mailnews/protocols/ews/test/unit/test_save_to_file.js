/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { SyntheticPartLeaf, MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

let ewsServer, incomingServer, ewsAccount, identity;

// The content we expect to see written to disk.
const EXPECTED_MSG_CONTENT =
  `Content-Type: text/plain; charset=ISO-8859-1; format=flowed
Subject: test mail
From: from_B@foo.invalid
To: to_B@foo.invalid
Message-Id: <0@made.up.invalid>
Date: Tue, 01 Feb 2000 00:00:00 +0000

test message
`
    // Fixup the line endings so they're the same on every platform. The
    // save-to-file backend code applies the same line endings irrespective of
    // platform so this ensures we can make this string match what we *actually*
    // expect to be generated.
    .replaceAll("\r\n", "\n")
    // We'll instruct the message service to use "canonical" line ending, which
    // here means CRLF, when writing the message to disk.
    .replaceAll("\n", "\r\n");

add_setup(async function () {
  [ewsServer, incomingServer] = setupBasicEwsTestServer({});
});

add_task(async function test_save_to_file() {
  const folderName = "save_to_file";

  ewsServer.appendRemoteFolder(
    new RemoteFolder(folderName, "root", folderName, folderName)
  );

  // Sync the folder hierarchy to ensure the new folder is created.
  await syncFolder(incomingServer, incomingServer.rootFolder);

  // The spec for the message we'll be saving to disk.
  const srcMsgSpec = {
    from: "from_B@foo.invalid",
    to: "to_B@foo.invalid",
    subject: "test mail",
    bodyPart: new SyntheticPartLeaf("test message"),
  };

  // Generate and add the message to the test folder.
  const generator = new MessageGenerator();
  const srcMsg = generator.makeMessage(srcMsgSpec);

  ewsServer.addMessages(folderName, [srcMsg]);

  // Sync the folder itself to ensure the new message is downloaded.
  const folder = incomingServer.rootFolder.getChildNamed(folderName);
  await syncFolder(incomingServer, folder);

  // Guess the message URI for the new message; it should be the only message in
  // the new folder.
  const messageURI = `ews-message://${incomingServer.username}@${incomingServer.hostName}/${folderName}#1`;

  // Create a new handle for the temporary file that will be written to disk. We
  // don't need to create the file here, the save-to-disk backend code will take
  // care of that for us.
  const file = Services.dirsvc.get("TmpD", Ci.nsIFile);
  file.append("test_ews_save_to_file_tmp.eml");

  // Save the message to the temporary file.
  const service = MailServices.messageServiceFromURI(messageURI);

  const asyncUrlListener = new PromiseTestUtils.PromiseUrlListener();
  service.saveMessageToDisk(
    messageURI,
    file,
    false,
    asyncUrlListener,
    true,
    null
  );
  await asyncUrlListener.promise;

  // Read the file and make sure it matches the expected output.
  const savedMessageContent = await IOUtils.readUTF8(file.path);
  Assert.equal(savedMessageContent, EXPECTED_MSG_CONTENT);

  // Remove the file. This won't happen if the test failed, so the resulting
  // file can be analyzed to debug the failure.
  file.remove(false);
});
