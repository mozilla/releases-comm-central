/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
const dateFormat = new Services.intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});
let testMessages;

add_setup(async function () {
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder;

  const testFolder = await rootFolder.createSubfolderAsync("saveAs");
  testFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );
  testMessages = [...testFolder.messages];

  about3Pane.displayFolder(testFolder);

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * Saves the message at the given index with the given file extension.
 *
 * @param {number} index - An integer between 0 and 9.
 * @param {string} extension
 * @returns {string} The saved file content.
 */
async function subtestSingle(index, extension) {
  about3Pane.threadTree.selectedIndex = index;
  await messageLoadedIn(about3Pane.messageBrowser);

  const targetPath = await IOUtils.createUniqueFile(
    PathUtils.tempDir,
    `saveAsFile.${extension}`
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
    about3Pane.threadTree.getRowAtIndex(index),
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
  await IOUtils.remove(targetPath);
  return savedText;
}

add_task(async function testSingleEML() {
  const savedText = await subtestSingle(0, "eml");

  // This is a local date, so the value varies by timezone.
  // It will always be at this date and time, as that's when MessageGenerator
  // starts making messages unless told otherwise, and this is the first
  // message this instance generated.
  const dateParts = new Date("2000-02-01T00:00:00").toString().split(" ");
  const dateString = [
    dateParts[0] + ",",
    dateParts[2],
    dateParts[1],
    dateParts[3],
    dateParts[4],
    dateParts[5].substring(3),
  ].join(" ");
  Assert.stringContains(
    savedText,
    `Date: ${dateString}`,
    "file content should include the date in RFC822 format"
  );
  Assert.stringContains(
    savedText,
    `Subject: ${testMessages[0].subject}\r\n`,
    "file content should include the subject"
  );
});

add_task(async function testSingleHTML() {
  const savedText = await subtestSingle(4, "html");

  Assert.equal(
    savedText.slice(0, 25),
    "<!DOCTYPE html>\r\n<html>\r\n",
    "file content should be in HTML format"
  );
  Assert.stringContains(
    savedText,
    `\r\n<title>${testMessages[4].subject}</title>\r\n`,
    "file content should include the subject in the title"
  );
  Assert.stringContains(
    savedText,
    `>${dateFormat.format(new Date("2000-02-01T04:00:00"))}</`,
    "file content should include the localised date"
  );
  Assert.equal(
    savedText.slice(-11),
    "\r\n</html>\r\n",
    "file content should end with a closing HTML tag"
  );
});

add_task(async function testSingleTXT() {
  const savedText = await subtestSingle(5, "txt");
  const end = AppConstants.platform == "win" ? "\r\n" : "\n";

  Assert.stringContains(
    savedText,
    `Date:${end}${dateFormat.format(new Date("2000-02-01T05:00:00"))}${end}`,
    "file content should include the localised date"
  );
  Assert.stringContains(
    savedText,
    `Subject:${end}${testMessages[5].subject}${end}`,
    "file content should include the subject"
  );
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
