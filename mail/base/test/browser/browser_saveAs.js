/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;

add_setup(async function () {
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder;

  const testFolder = await rootFolder.createSubfolderAsync("saveAs");
  testFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );

  about3Pane.displayFolder(testFolder);

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function testSingle() {
  const sourceMessage = about3Pane.gDBView.getMsgHdrAt(0);
  about3Pane.threadTree.selectedIndex = 0;
  await messageLoadedIn(about3Pane.messageBrowser);

  const targetPath = await IOUtils.createUniqueFile(
    PathUtils.tempDir,
    "saveAsFile.eml"
  );
  await IOUtils.remove(targetPath);
  const targetFile = await IOUtils.getFile(targetPath);

  SpecialPowers.MockFilePicker.init(window.browsingContext);
  SpecialPowers.MockFilePicker.returnData = [{ nsIFile: targetFile }];
  const pickerPromise = new Promise(resolve => {
    SpecialPowers.MockFilePicker.showCallback = picker => {
      Assert.equal(
        picker.mode,
        Ci.nsIFilePicker.modeSave,
        "file picker should be in save mode"
      );
      resolve(picker);
      return Ci.nsIFilePicker.returnOk;
    };
  });

  const mailContext = about3Pane.document.getElementById("mailContext");
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.threadTree.getRowAtIndex(0),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");

  const saveAsFileItem =
    about3Pane.document.getElementById("mailContext-saveAs");
  mailContext.activateItem(saveAsFileItem);
  await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");

  const picker = await pickerPromise;
  Assert.ok(picker, "should have opened the file picker");
  await TestUtils.waitForCondition(
    async () =>
      (await IOUtils.exists(targetPath)) &&
      (await IOUtils.stat(targetPath)).size,
    "waiting for the message to be saved to file"
  );

  const savedText = await IOUtils.readUTF8(targetPath);
  Assert.stringContains(
    savedText,
    `Subject: ${sourceMessage.subject}\r\n`,
    "the message content should be saved to the file"
  );

  await IOUtils.remove(targetPath);
});

add_task(async function testMultiple() {
  const sourceMessages = [
    about3Pane.gDBView.getMsgHdrAt(2),
    about3Pane.gDBView.getMsgHdrAt(3),
    about3Pane.gDBView.getMsgHdrAt(7),
  ];
  about3Pane.threadTree.selectedIndices = [2, 3, 7];

  const targetPath = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "saveAsDir"
  );

  SpecialPowers.MockFilePicker.init(window.browsingContext);
  SpecialPowers.MockFilePicker.useDirectory(targetPath);
  const pickerPromise = new Promise(resolve => {
    SpecialPowers.MockFilePicker.showCallback = picker => {
      Assert.equal(
        picker.mode,
        Ci.nsIFilePicker.modeGetFolder,
        "file picker should be in folder mode"
      );
      resolve(picker);
      return Ci.nsIFilePicker.returnOk;
    };
  });

  const mailContext = about3Pane.document.getElementById("mailContext");
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.threadTree.getRowAtIndex(2),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");

  const saveAsFileItem =
    about3Pane.document.getElementById("mailContext-saveAs");
  mailContext.activateItem(saveAsFileItem);
  await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");

  const picker = await pickerPromise;
  Assert.ok(picker, "should have opened the file picker");

  await TestUtils.waitForCondition(
    async () => (await IOUtils.getChildren(targetPath)).length == 3,
    "waiting for the messages files to exist"
  );

  const expectedFilenames = [
    "2000-02-01 0200.eml",
    "2000-02-01 0300.eml",
    "2000-02-01 0700.eml",
  ];
  for (const path of await IOUtils.getChildren(targetPath)) {
    const filename = PathUtils.filename(path);
    const index = expectedFilenames.indexOf(filename.slice(-19));
    Assert.notEqual(
      index,
      undefined,
      "file name should be one of the expected names"
    );
    const sourceMessage = sourceMessages[index];

    Assert.ok(
      filename.startsWith(sourceMessage.subject),
      "file name should contain the subject"
    );

    await TestUtils.waitForCondition(
      async () => (await IOUtils.stat(path)).size,
      "waiting for message to be saved to file"
    );
    const savedText = await IOUtils.readUTF8(path);
    Assert.stringContains(
      savedText,
      `Subject: ${sourceMessage.subject}\r\n`,
      "the message content should be saved to the file"
    );
  }

  await IOUtils.remove(targetPath, { recursive: true });
});
