/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

add_task(async function testStoreToken() {
  // Create a local folder and some messages.

  localAccountUtils.loadLocalMailAccount();
  const rootFolder = localAccountUtils.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  const testFolder = rootFolder.createLocalSubfolder("testFolder");
  testFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const generator = new MessageGenerator();
  testFolder.addMessage(generator.makeMessage().toMessageString());
  testFolder.addMessage(generator.makeMessage().toMessageString());

  // Test we've got some sane values here and, because we can, check that
  // they actually match what's in the mbox file.

  const mbox = await IOUtils.readUTF8(testFolder.filePath.path);
  const fromLineLength = "From - Tue Oct 08 23:23:39 2024\r\n".length;
  const emptyLinesLength = "\r\n\r\n".length;

  const [message1, message2] = [...testFolder.messages];
  Assert.equal(message1.messageOffset, 0, "first message messageOffset");
  Assert.equal(message1.storeToken, "0", "first message storeToken");
  Assert.equal(
    message1.getStringProperty("storeToken"),
    "0",
    "first message string property"
  );
  Assert.equal(
    mbox.slice(message1.storeToken, Number(message1.storeToken) + 7),
    "From - ",
    "first message storeToken value points to a From line"
  );

  // Uncomment to print the first message, as defined by the database:
  // info(
  //   mbox.slice(
  //     Number(message1.storeToken),
  //     Number(message1.storeToken) + fromLineLength + message1.messageSize
  //   )
  // );

  Assert.equal(
    message2.messageOffset,
    message1.messageSize + fromLineLength + emptyLinesLength,
    "second message messageOffset"
  );
  Assert.equal(
    message2.storeToken,
    String(message1.messageSize + fromLineLength + emptyLinesLength),
    "second message storeToken"
  );
  Assert.equal(
    message2.getStringProperty("storeToken"),
    String(message1.messageSize + fromLineLength + emptyLinesLength),
    "second message string property"
  );
  Assert.equal(
    mbox.slice(message2.storeToken, Number(message2.storeToken) + 7),
    "From - ",
    "second message storeToken value points to a From line"
  );

  // Uncomment to print the second message, as defined by the database:
  // info(
  //   mbox.slice(
  //     Number(message2.storeToken),
  //     Number(message2.storeToken) + fromLineLength + message2.messageSize
  //   )
  // );

  // Right, let's start messing with things.

  message2.storeToken = "100";
  Assert.equal(
    message2.getStringProperty("storeToken"),
    "100",
    "setting the storeToken attribute should change the string property"
  );
  message2.setStringProperty("storeToken", "300");
  Assert.equal(
    message2.storeToken,
    "300",
    "setting the string property should change the storeToken attribute"
  );

  // Set the value to an empty string. We can't remove the property, so this
  // is the next best thing.
  message2.setStringProperty("storeToken", "");
  Assert.equal(
    message2.storeToken,
    String(message1.messageSize + fromLineLength + emptyLinesLength),
    "with no string property value, the storeToken value should come from the messageOffset"
  );
  Assert.equal(
    message2.getStringProperty("storeToken"),
    String(message1.messageSize + fromLineLength + emptyLinesLength),
    "string property value should have been set by accessing the attribute"
  );

  // Set the message offset to -1. We can't remove this property either, so
  // this uses the same default value as the retrieval code.
  message2.setStringProperty("storeToken", "");
  message2.messageOffset = -1;
  Assert.equal(
    message2.storeToken,
    "",
    "with no messageOffset value, the storeToken value should be empty"
  );
});
