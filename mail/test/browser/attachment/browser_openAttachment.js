/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  add_message_to_folder,
  be_in_folder,
  create_folder,
  create_message,
  get_about_message,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

const aboutMessage = get_about_message();

const mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
const handlerService = Cc[
  "@mozilla.org/uriloader/handler-service;1"
].getService(Ci.nsIHandlerService);

const { MockFilePicker } = SpecialPowers;
MockFilePicker.init(window);

// At the time of writing, this pref was set to true on nightly channels only.
// The behaviour is slightly different when it is false.
const IMPROVEMENTS_PREF_SET = Services.prefs.getBoolPref(
  "browser.download.improvements_to_download_panel",
  true
);

let tmpD;
let savePath;
let homeDirectory;

let folder;

let mockedHandlerApp;
const mockedHandlers = new Set();

function getNsIFileFromPath(path) {
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  return file;
}

add_setup(async function () {
  folder = await create_folder("OpenAttachment");
  await be_in_folder(folder);

  // @see logic for tmpD in msgHdrView.js
  tmpD = PathUtils.join(PathUtils.tempDir, "pid-" + Services.appinfo.processID);

  savePath = await IOUtils.createUniqueDirectory(tmpD, "saveDestination");
  Services.prefs.setStringPref("browser.download.dir", savePath);

  homeDirectory = await IOUtils.createUniqueDirectory(tmpD, "homeDirectory");

  Services.prefs.setIntPref("browser.download.folderList", 2);
  Services.prefs.setBoolPref("browser.download.useDownloadDir", true);
  Services.prefs.setIntPref("security.dialog_enable_delay", 0);

  const mockExePath = PathUtils.join(PathUtils.tempDir, "mockedExecutable");
  await IOUtils.write(mockExePath, new Uint8Array(), {
    mode: "appendOrCreate",
  });
  await IOUtils.setPermissions(mockExePath, 0o755);
  const mockedExecutable = await IOUtils.getFile(mockExePath);

  mockedHandlerApp = Cc[
    "@mozilla.org/uriloader/local-handler-app;1"
  ].createInstance(Ci.nsILocalHandlerApp);
  mockedHandlerApp.executable = mockedExecutable;
  mockedHandlerApp.detailedDescription = "Mocked handler app";
  registerCleanupFunction(() => {
    if (mockedExecutable.exists()) {
      mockedExecutable.remove(true);
    }
  });
});

registerCleanupFunction(async function () {
  MockFilePicker.cleanup();

  await IOUtils.remove(savePath, { recursive: true });
  await IOUtils.remove(homeDirectory, { recursive: true });

  Services.prefs.clearUserPref("browser.download.dir");
  Services.prefs.clearUserPref("browser.download.folderList");
  Services.prefs.clearUserPref("browser.download.useDownloadDir");
  Services.prefs.clearUserPref("security.dialog.dialog_enable_delay");

  for (const type of mockedHandlers) {
    const handlerInfo = mimeService.getFromTypeAndExtension(type, null);
    if (handlerService.exists(handlerInfo)) {
      handlerService.remove(handlerInfo);
    }
  }

  // Remove created folders.
  folder.deleteSelf(null);

  Services.focus.focusedWindow = window;
});

function createMockedHandler(type, preferredAction, alwaysAskBeforeHandling) {
  info(`Creating handler for ${type}`);

  const handlerInfo = mimeService.getFromTypeAndExtension(type, null);
  handlerInfo.preferredAction = preferredAction;
  handlerInfo.alwaysAskBeforeHandling = alwaysAskBeforeHandling;

  handlerInfo.description = mockedHandlerApp.detailedDescription;
  handlerInfo.possibleApplicationHandlers.appendElement(mockedHandlerApp);
  handlerInfo.hasDefaultHandler = true;
  handlerInfo.preferredApplicationHandler = mockedHandlerApp;

  handlerService.store(handlerInfo);
  mockedHandlers.add(type);
}

let messageIndex = -1;
async function createAndLoadMessage(
  type,
  { filename, isDetached = false } = {}
) {
  messageIndex++;

  if (!filename) {
    filename = `attachment${messageIndex}.test${messageIndex}`;
  }

  const attachment = {
    contentType: type,
    body: `${type}Attachment`,
    filename,
  };

  // Allow for generation of messages with detached attachments.
  if (isDetached) {
    // Generate a file with content to represent the attachment.
    const attachmentFile = Cc["@mozilla.org/file/local;1"].createInstance(
      Ci.nsIFile
    );
    attachmentFile.initWithPath(homeDirectory);
    attachmentFile.append(filename);
    if (!attachmentFile.exists()) {
      attachmentFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o755);
      await IOUtils.writeUTF8(attachmentFile.path, "some file content");
    }

    const fileHandler = Services.io
      .getProtocolHandler("file")
      .QueryInterface(Ci.nsIFileProtocolHandler);

    // Append relevant Thunderbird headers to indicate a detached file.
    attachment.extraHeaders = {
      "X-Mozilla-External-Attachment-URL":
        fileHandler.getURLSpecFromActualFile(attachmentFile),
      "X-Mozilla-Altered":
        'AttachmentDetached; date="Mon Apr 04 13:59:42 2022"',
    };
  }

  await add_message_to_folder(
    [folder],
    create_message({
      subject: `${type} attachment`,
      body: {
        body: "I'm an attached email!",
      },
      attachments: [attachment],
    })
  );
  await select_click_row(messageIndex);
}

async function singleClickAttachmentAndWaitForDialog(
  { mode = "save", rememberExpected = true, remember } = {},
  button = "cancel"
) {
  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://mozapps/content/downloads/unknownContentType.xhtml",
    {
      async callback(dialogWindow) {
        // Wait for the buttons to be enabled, which requires focus plus
        // clearing the event queue.
        await SimpleTest.promiseFocus(dialogWindow);
        await TestUtils.waitForTick();

        const dialogDocument = dialogWindow.document;
        const rememberChoice = dialogDocument.getElementById("rememberChoice");
        Assert.equal(
          dialogDocument.getElementById("mode").selectedItem.id,
          mode,
          "correct action is selected"
        );
        Assert.equal(
          rememberChoice.checked,
          rememberExpected,
          "remember choice checkbox checked/not checked as expected"
        );
        if (remember !== undefined && remember != rememberExpected) {
          EventUtils.synthesizeMouseAtCenter(rememberChoice, {}, dialogWindow);
          Assert.equal(
            rememberChoice.checked,
            remember,
            "remember choice checkbox changed"
          );
        }

        dialogDocument.querySelector("dialog").getButton(button).click();
      },
    }
  );

  info(aboutMessage.document.getElementById("attachmentName").value);
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentName"),
    {},
    aboutMessage
  );
  await dialogPromise;
}

async function singleClickAttachment() {
  info(aboutMessage.document.getElementById("attachmentName").value);
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentName"),
    {},
    aboutMessage
  );
}

// Other test boilerplate should initialize a message with attachment; here we
// verify that it was created and return an nsIFile handle to it.
async function verifyAndFetchSavedAttachment(parentPath = savePath, leafName) {
  const expectedFile = getNsIFileFromPath(parentPath);
  if (leafName) {
    expectedFile.append(leafName);
  } else {
    expectedFile.append(`attachment${messageIndex}.test${messageIndex}`);
  }
  await TestUtils.waitForCondition(
    () => expectedFile.exists(),
    `attachment was not saved to ${expectedFile.path}`
  );
  Assert.ok(expectedFile.exists(), `${expectedFile.path} exists`);

  // Wait a moment in case the file is still locked for writing.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 250));

  return expectedFile;
}

function checkHandler(type, preferredAction, alwaysAskBeforeHandling) {
  const handlerInfo = mimeService.getFromTypeAndExtension(type, null);
  Assert.equal(
    handlerInfo.preferredAction,
    preferredAction,
    `preferredAction of ${type}`
  );
  Assert.equal(
    handlerInfo.alwaysAskBeforeHandling,
    alwaysAskBeforeHandling,
    `alwaysAskBeforeHandling of ${type}`
  );
}

function promiseFileOpened() {
  const __openFile = aboutMessage.AttachmentInfo.prototype._openFile;
  return new Promise(resolve => {
    aboutMessage.AttachmentInfo.prototype._openFile = function (
      mimeInfo,
      file
    ) {
      aboutMessage.AttachmentInfo.prototype._openFile = __openFile;
      resolve({ mimeInfo, file });
    };
  });
}

/**
 * Check that the directory for saving is correct.
 * If not, we're gonna have a bad time.
 */
add_task(async function sanityCheck() {
  Assert.equal(
    await Downloads.getPreferredDownloadsDirectory(),
    savePath,
    "sanity check: correct downloads directory"
  );
});

// First, check content types we have no saved information about.

/**
 * Open a content type we've never seen before. Save, and remember the action.
 */
add_task(async function noHandler() {
  await createAndLoadMessage("test/foo");
  await singleClickAttachmentAndWaitForDialog(
    { rememberExpected: false, remember: true },
    "accept"
  );
  const file = await verifyAndFetchSavedAttachment();
  file.remove(false);
  checkHandler("test/foo", Ci.nsIHandlerInfo.saveToDisk, false);
});

/**
 * Open a content type we've never seen before. Save, and DON'T remember the
 * action (except that we do remember it, but also remember to ask next time).
 */
add_task(async function noHandlerNoSave() {
  await createAndLoadMessage("test/bar");
  await singleClickAttachmentAndWaitForDialog(
    { rememberExpected: false, remember: false },
    "accept"
  );
  const file = await verifyAndFetchSavedAttachment();
  file.remove(false);
  checkHandler("test/bar", Ci.nsIHandlerInfo.saveToDisk, true);
});

/**
 * The application/octet-stream type is handled weirdly. Check that opening it
 * still behaves in a useful way.
 */
add_task(async function applicationOctetStream() {
  await createAndLoadMessage("application/octet-stream");
  await singleClickAttachmentAndWaitForDialog(
    { rememberExpected: false },
    "accept"
  );
  const file = await verifyAndFetchSavedAttachment();
  file.remove(false);
});

// Now we'll test the various states that handler info objects might be in.
// There's two fields: preferredAction and alwaysAskBeforeHandling. If the
// latter is true, we MUST get a prompt. Check that first.

/**
 * Open a content type set to save to disk, but always ask.
 */
add_task(async function saveToDiskAlwaysAsk() {
  createMockedHandler(
    "test/saveToDisk-true",
    Ci.nsIHandlerInfo.saveToDisk,
    true
  );
  await createAndLoadMessage("test/saveToDisk-true");
  await singleClickAttachmentAndWaitForDialog(
    { rememberExpected: false },
    "accept"
  );
  const file = await verifyAndFetchSavedAttachment();
  file.remove(false);
  checkHandler("test/saveToDisk-true", Ci.nsIHandlerInfo.saveToDisk, true);
});

/**
 * Open a content type set to save to disk, but always ask, and with no
 * default download directory.
 */
add_task(async function saveToDiskAlwaysAskPromptLocation() {
  Services.prefs.setBoolPref("browser.download.useDownloadDir", false);

  createMockedHandler(
    "test/saveToDisk-true",
    Ci.nsIHandlerInfo.saveToDisk,
    true
  );
  await createAndLoadMessage("test/saveToDisk-true");

  const expectedFile = getNsIFileFromPath(tmpD);
  expectedFile.append(`attachment${messageIndex}.test${messageIndex}`);
  MockFilePicker.showCallback = function (instance) {
    Assert.equal(instance.defaultString, expectedFile.leafName);
    Assert.equal(instance.defaultExtension, `test${messageIndex}`);
  };
  MockFilePicker.setFiles([expectedFile]);
  MockFilePicker.returnValue = Ci.nsIFilePicker.returnOK;

  await singleClickAttachmentAndWaitForDialog(
    { rememberExpected: false },
    "accept"
  );
  const file = await verifyAndFetchSavedAttachment(tmpD);
  file.remove(false);
  Assert.ok(MockFilePicker.shown, "file picker was shown");

  MockFilePicker.reset();
  Services.prefs.setBoolPref("browser.download.useDownloadDir", true);
});

/**
 * Open a content type set to always ask in both fields.
 */
add_task(async function alwaysAskAlwaysAsk() {
  createMockedHandler("test/alwaysAsk-true", Ci.nsIHandlerInfo.alwaysAsk, true);
  await createAndLoadMessage("test/alwaysAsk-true");
  await singleClickAttachmentAndWaitForDialog({
    mode: IMPROVEMENTS_PREF_SET ? "save" : "open",
    rememberExpected: false,
  });
});

/**
 * Open a content type set to use helper app, but always ask.
 */
add_task(async function useHelperAppAlwaysAsk() {
  createMockedHandler(
    "test/useHelperApp-true",
    Ci.nsIHandlerInfo.useHelperApp,
    true
  );
  await createAndLoadMessage("test/useHelperApp-true");
  await singleClickAttachmentAndWaitForDialog({
    mode: "open",
    rememberExpected: false,
  });
});

/*
 * Open a detached attachment with content type set to use helper app, but
 * always ask.
 */
add_task(async function detachedUseHelperAppAlwaysAsk() {
  const mimeType = "test/useHelperApp-true";
  const openedPromise = promiseFileOpened();

  createMockedHandler(mimeType, Ci.nsIHandlerInfo.useHelperApp, true);

  // Generate an email with detached attachment.
  await createAndLoadMessage(mimeType, { isDetached: true });
  await singleClickAttachmentAndWaitForDialog(
    { mode: "open", rememberExpected: false },
    "accept"
  );

  const expectedPath = PathUtils.join(
    homeDirectory,
    `attachment${messageIndex}.test${messageIndex}`
  );

  const { file } = await openedPromise;
  Assert.equal(
    file.path,
    expectedPath,
    "opened file should match attachment path"
  );

  file.remove(false);
});

/**
 * Open a content type set to use the system default app, but always ask.
 */
add_task(async function useSystemDefaultAlwaysAsk() {
  createMockedHandler(
    "test/useSystemDefault-true",
    Ci.nsIHandlerInfo.useSystemDefault,
    true
  );
  await createAndLoadMessage("test/useSystemDefault-true");
  // Would be mode: "open" on all platforms except our handler isn't real.
  await singleClickAttachmentAndWaitForDialog({
    mode: AppConstants.platform == "win" ? "open" : "save",
    rememberExpected: false,
  });
});

// Check what happens with alwaysAskBeforeHandling set to false. We can't test
// the actions that would result in an external app opening the file.

/**
 * Open a content type set to save to disk without asking.
 */
add_task(async function saveToDisk() {
  createMockedHandler("test/saveToDisk-false", saveToDisk, false);
  await createAndLoadMessage("test/saveToDisk-false");
  await singleClickAttachment();
  const file = await verifyAndFetchSavedAttachment();
  file.remove(false);
});

/**
 * Open a content type set to save to disk without asking, and with no
 * default download directory.
 */
add_task(async function saveToDiskPromptLocation() {
  Services.prefs.setBoolPref("browser.download.useDownloadDir", false);

  createMockedHandler(
    "test/saveToDisk-true",
    Ci.nsIHandlerInfo.saveToDisk,
    false
  );
  await createAndLoadMessage("test/saveToDisk-false");

  const expectedFile = getNsIFileFromPath(tmpD);
  expectedFile.append(`attachment${messageIndex}.test${messageIndex}`);
  MockFilePicker.showCallback = function (instance) {
    Assert.equal(instance.defaultString, expectedFile.leafName);
    Assert.equal(instance.defaultExtension, `test${messageIndex}`);
  };
  MockFilePicker.setFiles([expectedFile]);
  MockFilePicker.returnValue = Ci.nsIFilePicker.returnOK;

  await singleClickAttachment();
  const file = await verifyAndFetchSavedAttachment(tmpD);
  file.remove(false);
  Assert.ok(MockFilePicker.shown, "file picker was shown");

  MockFilePicker.reset();
  Services.prefs.setBoolPref("browser.download.useDownloadDir", true);
});

/**
 * Open a content type set to always ask without asking (weird but plausible).
 * Check the action is saved and the "do this automatically" checkbox works.
 */
add_task(async function alwaysAskRemember() {
  createMockedHandler(
    "test/alwaysAsk-false",
    Ci.nsIHandlerInfo.alwaysAsk,
    false
  );
  await createAndLoadMessage("test/alwaysAsk-false");
  await singleClickAttachmentAndWaitForDialog(undefined, "accept");
  const file = await verifyAndFetchSavedAttachment();
  file.remove(false);
  checkHandler("test/alwaysAsk-false", Ci.nsIHandlerInfo.saveToDisk, false);
}).__skipMe = !IMPROVEMENTS_PREF_SET;

/**
 * Open a content type set to always ask without asking (weird but plausible).
 * Check the action is saved and the unticked "do this automatically" leaves
 * alwaysAskBeforeHandling set.
 */
add_task(async function alwaysAskForget() {
  createMockedHandler(
    "test/alwaysAsk-false",
    Ci.nsIHandlerInfo.alwaysAsk,
    false
  );
  await createAndLoadMessage("test/alwaysAsk-false");
  await singleClickAttachmentAndWaitForDialog({ remember: false }, "accept");
  const file = await verifyAndFetchSavedAttachment();
  file.remove(false);
  checkHandler("test/alwaysAsk-false", Ci.nsIHandlerInfo.saveToDisk, true);
}).__skipMe = !IMPROVEMENTS_PREF_SET;

/**
 * Open a content type set to use helper app.
 */
add_task(async function useHelperApp() {
  const openedPromise = promiseFileOpened();

  createMockedHandler(
    "test/useHelperApp-false",
    Ci.nsIHandlerInfo.useHelperApp,
    false
  );
  await createAndLoadMessage("test/useHelperApp-false");
  await singleClickAttachment();
  const attachmentFile = await verifyAndFetchSavedAttachment(tmpD);

  const { file } = await openedPromise;
  Assert.ok(file.path);

  // In the temp dir, files should be read-only.
  if (AppConstants.platform != "win") {
    const fileInfo = await IOUtils.stat(file.path);
    Assert.equal(
      fileInfo.permissions,
      0o400,
      `file ${file.path} should be read-only`
    );
  }
  attachmentFile.permissions = 0o755;
  attachmentFile.remove(false);
});

/*
 * Open a detached attachment with content type set to use helper app.
 */
add_task(async function detachedUseHelperApp() {
  const mimeType = "test/useHelperApp-false";
  const openedPromise = promiseFileOpened();

  createMockedHandler(mimeType, Ci.nsIHandlerInfo.useHelperApp, false);

  // Generate an email with detached attachment.
  await createAndLoadMessage(mimeType, { isDetached: true });
  await singleClickAttachment();

  const expectedPath = PathUtils.join(
    homeDirectory,
    `attachment${messageIndex}.test${messageIndex}`
  );

  const { file } = await openedPromise;
  Assert.equal(
    file.path,
    expectedPath,
    "opened file should match attachment path"
  );

  file.remove(false);
});

/**
 * Open a content type set to use the system default app.
 */
add_task(async function useSystemDefault() {
  const openedPromise = promiseFileOpened();

  createMockedHandler(
    "test/useSystemDefault-false",
    Ci.nsIHandlerInfo.useSystemDefault,
    false
  );
  await createAndLoadMessage("test/useSystemDefault-false");
  await singleClickAttachment();
  const attachmentFile = await verifyAndFetchSavedAttachment(tmpD);
  const { file } = await openedPromise;
  Assert.ok(file.path);

  // In the temp dir, files should be read-only.
  if (AppConstants.platform != "win") {
    const fileInfo = await IOUtils.stat(file.path);
    Assert.equal(
      fileInfo.permissions,
      0o400,
      `file ${file.path} should be read-only`
    );
  }
  attachmentFile.permissions = 0o755;
  attachmentFile.remove(false);
});

/*
 * Open a detached attachment with content type set to use the system default
 * app.
 */
add_task(async function detachedUseSystemDefault() {
  const mimeType = "test/useSystemDefault-false";
  const openedPromise = promiseFileOpened();

  createMockedHandler(mimeType, Ci.nsIHandlerInfo.useSystemDefault, false);

  // Generate an email with detached attachment.
  await createAndLoadMessage(mimeType, { isDetached: true });
  await singleClickAttachment();

  const expectedPath = PathUtils.join(
    homeDirectory,
    `attachment${messageIndex}.test${messageIndex}`
  );

  const { file } = await openedPromise;
  Assert.equal(
    file.path,
    expectedPath,
    "opened file should match attachment path"
  );

  file.remove(false);
});

/**
 * Save an attachment with characters that are illegal in a file name.
 * Check the characters are sanitized.
 */
add_task(async function filenameSanitisedSave() {
  createMockedHandler("test/bar", Ci.nsIHandlerInfo.saveToDisk, false);

  // Colon, slash and backslash are escaped on all platforms.
  // Backslash is double-escaped here because of the message generator.
  await createAndLoadMessage("test/bar", { filename: "f:i\\\\le/123.bar" });
  await singleClickAttachment();
  let file = await verifyAndFetchSavedAttachment(undefined, "f i_le_123.bar");
  file.remove(false);

  // Asterisk, question mark, pipe and angle brackets are escaped on Windows.
  await createAndLoadMessage("test/bar", { filename: "f*i?|le<123>.bar" });
  await singleClickAttachment();
  file = await verifyAndFetchSavedAttachment(undefined, "f i le 123 .bar");
  file.remove(false);
});

/**
 * Open an attachment with characters that are illegal in a file name.
 * Check the characters are sanitized.
 */
add_task(async function filenameSanitisedOpen() {
  createMockedHandler("test/bar", Ci.nsIHandlerInfo.useHelperApp, false);

  let openedPromise = promiseFileOpened();

  // Colon, slash and backslash are escaped on all platforms.
  // Backslash is double-escaped here because of the message generator.
  await createAndLoadMessage("test/bar", { filename: "f:i\\\\le/123.bar" });
  await singleClickAttachment();
  let { file } = await openedPromise;
  let attachmentFile = await verifyAndFetchSavedAttachment(
    tmpD,
    "f i_le_123.bar"
  );
  Assert.equal(file.leafName, "f i_le_123.bar");
  // In the temp dir, files should be read-only.
  if (AppConstants.platform != "win") {
    const fileInfo = await IOUtils.stat(file.path);
    Assert.equal(
      fileInfo.permissions,
      0o400,
      `file ${file.path} should be read-only`
    );
  }
  attachmentFile.permissions = 0o755;
  attachmentFile.remove(false);

  openedPromise = promiseFileOpened();

  // Asterisk, question mark, pipe and angle brackets are escaped on Windows.
  await createAndLoadMessage("test/bar", { filename: "f*i?|le<123>.bar" });
  await singleClickAttachment();
  ({ file } = await openedPromise);
  attachmentFile = await verifyAndFetchSavedAttachment(tmpD, "f i le 123 .bar");
  Assert.equal(file.leafName, "f i le 123 .bar");
  attachmentFile.permissions = 0o755;
  attachmentFile.remove(false);
});
