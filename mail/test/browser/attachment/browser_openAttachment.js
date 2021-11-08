const {
  add_message_to_folder,
  be_in_folder,
  create_folder,
  create_message,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

const mimeService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
const handlerService = Cc[
  "@mozilla.org/uriloader/handler-service;1"
].getService(Ci.nsIHandlerService);

const { MockFilePicker } = SpecialPowers;
MockFilePicker.init(window);

const {
  saveToDisk,
  alwaysAsk,
  useHelperApp,
  useSystemDefault,
} = Ci.nsIHandlerInfo;

let tempDir = FileUtils.getDir("TmpD", [], false);
let saveDestination = FileUtils.getFile("TmpD", ["saveDestination"]);
saveDestination.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

Services.prefs.setStringPref("browser.download.dir", saveDestination.path);
Services.prefs.setIntPref("browser.download.folderList", 2);
Services.prefs.setBoolPref("browser.download.useDownloadDir", true);
Services.prefs.setIntPref("security.dialog_enable_delay", 0);

let folder = create_folder("OpenAttachment");
be_in_folder(folder);

let mockedExecutable = FileUtils.getFile("TmpD", ["mockedExecutable"]);
if (!mockedExecutable.exists()) {
  mockedExecutable.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o755);
}

let mockedHandlerApp = Cc[
  "@mozilla.org/uriloader/local-handler-app;1"
].createInstance(Ci.nsILocalHandlerApp);
mockedHandlerApp.executable = mockedExecutable;
mockedHandlerApp.detailedDescription = "Mocked handler app";

let mockedHandlers = new Set();

registerCleanupFunction(function() {
  MockFilePicker.cleanup();

  saveDestination.remove(true);

  Services.prefs.clearUserPref("browser.download.dir");
  Services.prefs.clearUserPref("browser.download.folderList");
  Services.prefs.clearUserPref("browser.download.useDownloadDir");
  Services.prefs.clearUserPref("security.dialog.dialog_enable_delay");

  if (mockedExecutable.exists()) {
    mockedExecutable.remove(true);
  }

  for (let type of mockedHandlers) {
    let handlerInfo = mimeService.getFromTypeAndExtension(type, null);
    if (handlerService.exists(handlerInfo)) {
      handlerService.remove(handlerInfo);
    }
  }
});

function createMockedHandler(type, preferredAction, alwaysAskBeforeHandling) {
  info(`Creating handler for ${type}`);

  let handlerInfo = mimeService.getFromTypeAndExtension(type, null);
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
function createAndLoadMessage(type) {
  messageIndex++;
  add_message_to_folder(
    folder,
    create_message({
      subject: `${type} attachment`,
      body: {
        body: "I'm an attached email!",
      },
      attachments: [
        {
          contentType: type,
          body: `${type}Attachment`,
          filename: `attachment${messageIndex}.test`,
        },
      ],
    })
  );
  select_click_row(messageIndex);
}

async function clickWithDialog(
  { mode = "save", rememberExpected = true, remember } = {},
  button = "cancel"
) {
  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://mozapps/content/downloads/unknownContentType.xhtml",
    {
      async callback(dialogWindow) {
        await new Promise(resolve => dialogWindow.setTimeout(resolve));
        await new Promise(resolve => dialogWindow.setTimeout(resolve));

        let dialogDocument = dialogWindow.document;
        let rememberChoice = dialogDocument.getElementById("rememberChoice");
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

        dialogDocument
          .querySelector("dialog")
          .getButton(button)
          .click();
      },
    }
  );
  info(document.getElementById("attachmentName").value);
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("attachmentName"),
    {},
    window
  );
  await dialogPromise;
}

async function clickWithoutDialog() {
  info(document.getElementById("attachmentName").value);
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("attachmentName"),
    {},
    window
  );
}

async function checkFileSaved(parent = saveDestination) {
  let expectedFile = parent.clone();
  expectedFile.append(`attachment${messageIndex}.test`);
  await TestUtils.waitForCondition(
    () => expectedFile.exists(),
    `attachment was saved to ${expectedFile.path}`
  );
  expectedFile.remove(false);
}

function checkHandler(type, preferredAction, alwaysAskBeforeHandling) {
  let handlerInfo = mimeService.getFromTypeAndExtension(type, null);
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

/**
 * Check that the directory for saving is correct.
 * If not, we're gonna have a bad time.
 */
add_task(async function sanityCheck() {
  Assert.equal(
    await Downloads.getPreferredDownloadsDirectory(),
    saveDestination.path,
    "sanity check: correct downloads directory"
  );
});

// First, check content types we have no saved information about.

/**
 * Open a content type we've never seen before. Save, and remember the action.
 */
add_task(async function noHandler() {
  createAndLoadMessage("test/foo");
  await clickWithDialog({ rememberExpected: false }, "accept");
  await checkFileSaved();
  checkHandler("test/foo", saveToDisk, true);
});

/**
 * Open a content type we've never seen before. Save, and DON'T remember the
 * action (except that we do remember it, but also remember to ask next time).
 */
add_task(async function noHandlerNoSave() {
  createAndLoadMessage("test/bar");
  await clickWithDialog({ rememberExpected: false }, "accept");
  await checkFileSaved();
  checkHandler("test/bar", saveToDisk, true);
});

// Now we'll test the various states that handler info objects might be in.
// There's two fields: preferredAction and alwaysAskBeforeHandling. If the
// latter is true, we MUST get a prompt. Check that first.

/**
 * Open a content type set to save to disk, but always ask.
 */
add_task(async function saveToDiskAlwaysAsk() {
  createMockedHandler("test/saveToDisk-true", saveToDisk, true);
  createAndLoadMessage("test/saveToDisk-true");
  await clickWithDialog({ rememberExpected: false }, "accept");
  await checkFileSaved();
  checkHandler("test/saveToDisk-true", saveToDisk, true);
});

/**
 * Open a content type set to save to disk, but always ask, and with no
 * default download directory.
 */
add_task(async function saveToDiskAlwaysAskPromptLocation() {
  Services.prefs.setBoolPref("browser.download.useDownloadDir", false);

  createMockedHandler("test/saveToDisk-true", saveToDisk, true);
  createAndLoadMessage("test/saveToDisk-true");

  let expectedFile = tempDir.clone();
  expectedFile.append(`attachment${messageIndex}.test`);
  MockFilePicker.setFiles([expectedFile]);
  MockFilePicker.returnValue = Ci.nsIFilePicker.returnOK;

  await clickWithDialog({ rememberExpected: false }, "accept");
  await checkFileSaved(tempDir);
  Assert.ok(MockFilePicker.shown, "file picker was shown");

  MockFilePicker.reset();
  Services.prefs.setBoolPref("browser.download.useDownloadDir", true);
});

/**
 * Open a content type set to always ask in both fields.
 */
add_task(async function alwaysAskAlwaysAsk() {
  createMockedHandler("test/alwaysAsk-true", alwaysAsk, true);
  createAndLoadMessage("test/alwaysAsk-true");
  await clickWithDialog({ rememberExpected: false });
});

/**
 * Open a content type set to use helper app, but always ask.
 */
add_task(async function useHelperAppAlwaysAsk() {
  createMockedHandler("test/useHelperApp-true", useHelperApp, true);
  createAndLoadMessage("test/useHelperApp-true");
  await clickWithDialog({ mode: "open", rememberExpected: false });
});

/**
 * Open a content type set to use the system default app, but always ask.
 */
add_task(async function useSystemDefaultAlwaysAsk() {
  createMockedHandler("test/useSystemDefault-true", useSystemDefault, true);
  createAndLoadMessage("test/useSystemDefault-true");
  // Would be mode: "open" on all platforms except our handler isn't real.
  await clickWithDialog({
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
  createAndLoadMessage("test/saveToDisk-false");
  await clickWithoutDialog();
  await checkFileSaved();
});

/**
 * Open a content type set to save to disk without asking, and with no
 * default download directory.
 */
add_task(async function saveToDiskPromptLocation() {
  Services.prefs.setBoolPref("browser.download.useDownloadDir", false);

  createMockedHandler("test/saveToDisk-true", saveToDisk, false);
  createAndLoadMessage("test/saveToDisk-false");

  let expectedFile = tempDir.clone();
  expectedFile.append(`attachment${messageIndex}.test`);
  MockFilePicker.setFiles([expectedFile]);
  MockFilePicker.returnValue = Ci.nsIFilePicker.returnOK;

  await clickWithoutDialog();
  await checkFileSaved(tempDir);
  Assert.ok(MockFilePicker.shown, "file picker was shown");

  MockFilePicker.reset();
  Services.prefs.setBoolPref("browser.download.useDownloadDir", true);
});

/**
 * Open a content type set to always ask without asking (weird but plausible).
 * Check the action is saved and the "do this automatically" checkbox works.
 */
add_task(async function alwaysAskRemember() {
  createMockedHandler("test/alwaysAsk-false", alwaysAsk, false);
  createAndLoadMessage("test/alwaysAsk-false");
  await clickWithDialog(undefined, "accept");
  await checkFileSaved();
  checkHandler("test/alwaysAsk-false", saveToDisk, false);
});

/**
 * Open a content type set to always ask without asking (weird but plausible).
 * Check the action is saved and the unticked "do this automatically" leaves
 * alwaysAskBeforeHandling set.
 */
add_task(async function alwaysAskForget() {
  createMockedHandler("test/alwaysAsk-false", alwaysAsk, false);
  createAndLoadMessage("test/alwaysAsk-false");
  await clickWithDialog({ remember: false }, "accept");
  await checkFileSaved();
  checkHandler("test/alwaysAsk-false", saveToDisk, true);
});
