/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageSend } = ChromeUtils.importESModule(
  "resource:///modules/MessageSend.sys.mjs"
);
const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

let promptChoices;
let alertCount;
let testNumber = 0;

function confirmExPS() {
  Assert.ok(
    promptChoices.length,
    "Each failed copy should have a recovery choice"
  );
  return promptChoices.shift();
}

function alertPS() {
  alertCount++;
}

add_setup(function () {
  localAccountUtils.loadLocalMailAccount();
  registerAlertTestUtils();
});

async function checkCopyRecovery({
  outcomes,
  choices,
  savedTo,
  alerts = 0,
  inspectStartupFailure = false,
  withFcc2 = savedTo.includes("additional"),
  startWithFcc2 = false,
  deliverMode = Ci.nsIMsgSend.nsMsgDeliverNow,
  fallbackFor = "primary",
  specialFolderName = false,
}) {
  const root = localAccountUtils.rootFolder;
  const sentName = `Sent-${++testNumber}${specialFolderName ? " # copy" : ""}`;
  const sentFolder = root.createLocalSubfolder(sentName);
  const additionalFolder = root.createLocalSubfolder(
    `Additional-${testNumber}`
  );
  const fallbackFolder =
    fallbackFor == "additional" ? additionalFolder : sentFolder;
  const fallbackURI = `${root.URI}/${encodeURIComponent(
    `${fallbackFolder.localizedName}-${root.server.prettyName}`
  )}`;
  const identity = getSmtpIdentity(
    "sender@example.invalid",
    getBasicSmtpServer()
  );
  identity.fccFolderURI = sentFolder.URI;
  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  if (withFcc2) {
    fields.fcc2 = additionalFolder.URI;
  }

  const messageFile = do_get_profile();
  messageFile.append(`fcc-${testNumber}.eml`);
  const message =
    "From: sender@example.invalid\r\nTo: recipient@example.invalid\r\nSubject: FCC recovery\r\n\r\nPreserve this message.\r\n";
  await IOUtils.writeUTF8(messageFile.path, message);
  const send = new MessageSend();
  const completed = Promise.withResolvers();
  let completionCount = 0;
  Object.assign(send, {
    _userIdentity: identity,
    _compFields: fields,
    _fcc: sentFolder.URI,
    _deliverMode: deliverMode,
    _messageKey: 0xffffffff,
    _messageFile: messageFile,
    _shouldRemoveMessageFile: true,
    _sendReport: Cc[
      "@mozilla.org/messengercompose/sendreport;1"
    ].createInstance(Ci.nsIMsgSendReport),
    _sendListener: {
      ...copyListener,
      onStopCopy(status) {
        completionCount++;
        Assert.equal(
          status,
          Cr.NS_OK,
          "Copy recovery should finish successfully"
        );
        completed.resolve();
      },
      onGetDraftFolderURI() {
        if (remainingOutcomes[0] == "setup-failure") {
          remainingOutcomes.shift();
          copyFiles.push(send._copyFile.clone());
          throw new Error("Copy setup failed");
        }
      },
    },
  });

  const listenerPointer = Cc[
    "@mozilla.org/supports-interface-pointer;1"
  ].createInstance(Ci.nsISupportsInterfacePointer);
  listenerPointer.data = send._sendListener;
  send._sendListener = listenerPointer.data.QueryInterface(
    Ci.nsIMsgSendListener
  );
  Assert.ok(send._sendListener instanceof Ci.nsIMsgCopyServiceListener);

  const contract = "@mozilla.org/messengercompose/msgcopy;1";
  // Create the native copy objects before replacing their contract. Accessing
  // a factory by contract ID is not part of the scriptable component manager
  // API and is unavailable in some builds.
  const realCopies = outcomes.map(() =>
    Cc[contract].createInstance(Ci.nsIMsgCopy)
  );
  const copyFiles = [];
  const destinations = [];
  const remainingOutcomes = [...outcomes];
  let startupError;
  const mockCID = MockRegistrar.register(contract, () => {
    const realCopy = realCopies.shift();
    Assert.ok(realCopy, "Each mock copy should have a native copy instance");
    return {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgCopy"]),
      get dstFolder() {
        return realCopy.dstFolder;
      },
      startCopyOperation(userIdentity, file, mode, listener, uri, replace) {
        Assert.ok(
          messageFile.exists(),
          "The source should survive until recovery finishes"
        );
        Assert.ok(file.exists(), "Each attempt should have a copy file");
        copyFiles.push(file.clone());
        destinations.push(uri);
        Assert.ok(remainingOutcomes.length, "No unexpected copy should occur");
        switch (remainingOutcomes.shift()) {
          case "local-failure": {
            // Exercise the native local copy's callback followed by an error
            // return, using a missing input file on every platform.
            const missingFile = file.clone();
            missingFile.leafName += ".missing";
            realCopy.startCopyOperation(
              userIdentity,
              missingFile,
              mode,
              listener,
              uri,
              replace
            );
            do_throw("Copying a missing file should fail");
            break;
          }
          case "async-failure":
            TestUtils.executeSoon(() =>
              listener.notifyListenerOnStopCopy(Cr.NS_ERROR_FAILURE)
            );
            break;
          case "callback-then-throw": {
            startupError = new Error("Copy could not start");
            listener.notifyListenerOnStopCopy(Cr.NS_ERROR_FAILURE);
            throw startupError;
          }
          case "throw":
            throw Components.Exception(
              "Copy could not start",
              Cr.NS_ERROR_FILE_ACCESS_DENIED
            );
          case "throw-js":
            throw new Error("Copy could not start");
          case "success":
            realCopy.startCopyOperation(
              userIdentity,
              file,
              mode,
              listener,
              uri,
              replace
            );
            break;
        }
      },
    };
  });
  promptChoices = [...choices];
  alertCount = 0;
  try {
    if (inspectStartupFailure) {
      const error = await send
        ._copyToFcc(sentFolder.URI, Ci.nsIMsgSend.nsMsgDeliverNow)
        .then(
          () => null,
          reason => reason
        );
      Assert.stringContains(
        error.message,
        startupError.message,
        "The startup exception details should win over the synchronous callback"
      );
      Assert.notEqual(
        error.result,
        Cr.NS_ERROR_FAILURE,
        "The generic callback failure should not replace the startup exception"
      );
      Assert.ok(error.stack, "The rejected exception should have a stack");
      Assert.equal(remainingOutcomes.length, 0, "The copy should be attempted");
      Assert.ok(
        messageFile.exists(),
        "The source message should survive the attempt"
      );
      Assert.ok(
        !copyFiles[0].exists(),
        "The attempt's copy file should be removed"
      );
      return;
    }
    if (startWithFcc2) {
      await send._doFcc2();
    } else {
      await send._doFcc();
    }
    await completed.promise;
    await TestUtils.waitForCondition(
      () => !messageFile.exists(),
      "Source file should be removed after completion"
    );
    Assert.equal(
      completionCount,
      1,
      "There should be only one final completion"
    );
    Assert.equal(
      remainingOutcomes.length,
      0,
      "All expected copies should be attempted"
    );
    Assert.equal(
      promptChoices.length,
      0,
      "All recovery choices should be used"
    );
    Assert.equal(alertCount, alerts, "Failed fallbacks should show an alert");
    for (const file of copyFiles) {
      Assert.ok(
        !file.exists(),
        "Completed attempts should leave no temporary copy files"
      );
    }
    const folders = {
      primary: sentFolder,
      fallback: MailUtils.getExistingFolder(fallbackURI),
      additional: additionalFolder,
    };
    for (const [name, folder] of Object.entries(folders)) {
      const expected = savedTo.includes(name) ? 1 : 0;
      Assert.equal(
        folder?.getTotalMessages(false) ?? 0,
        expected,
        `${name} should have the expected number of messages`
      );
      if (expected) {
        Assert.ok(
          destinations.includes(folder.URI),
          `${name} should be a copy destination`
        );
        const stored = mailTestUtils.loadMessageToString(
          folder,
          mailTestUtils.firstMsgHdr(folder)
        );
        Assert.ok(
          stored.includes(message),
          "The complete message should be preserved"
        );
      }
    }
  } finally {
    MockRegistrar.unregister(mockCID);
    await IOUtils.remove(messageFile.path, { ignoreAbsent: true });
    for (const file of copyFiles) {
      await IOUtils.remove(file.path, { ignoreAbsent: true });
    }
  }
}

add_task(async function testRepeatedLocalFailure() {
  await checkCopyRecovery({
    outcomes: ["local-failure", "local-failure", "success", "success"],
    choices: [0, 0],
    savedTo: ["primary", "additional"],
  });
});

add_task(async function testFailureWithoutCallback() {
  for (const outcome of ["throw", "throw-js"]) {
    await checkCopyRecovery({
      outcomes: [outcome, "success"],
      choices: [0],
      savedTo: ["primary"],
    });
  }
});

add_task(async function testSetupFailure() {
  await checkCopyRecovery({
    outcomes: ["setup-failure", "success"],
    choices: [0],
    savedTo: ["primary"],
  });
});

add_task(async function testSynchronousCallbackThenThrow() {
  await checkCopyRecovery({
    outcomes: ["callback-then-throw"],
    choices: [],
    savedTo: [],
    inspectStartupFailure: true,
  });
});

add_task(async function testAsynchronousFailure() {
  await checkCopyRecovery({
    outcomes: ["async-failure", "success"],
    choices: [0],
    savedTo: ["primary"],
  });
});

add_task(async function testSaveLocally() {
  for (const outcome of ["local-failure", "async-failure"]) {
    await checkCopyRecovery({
      outcomes: [outcome, "success", "success"],
      choices: [2],
      savedTo: ["fallback", "additional"],
    });
  }
});

add_task(async function testLocalFallbackEscapesFolderName() {
  await checkCopyRecovery({
    outcomes: ["local-failure", "success"],
    choices: [2],
    savedTo: ["fallback"],
    withFcc2: false,
    specialFolderName: true,
  });
});

add_task(async function testFailedLocalFallback() {
  for (const outcome of ["local-failure", "async-failure", "throw"]) {
    await checkCopyRecovery({
      outcomes: ["local-failure", outcome, "success"],
      choices: [2, 1],
      savedTo: ["additional"],
      alerts: 1,
    });
  }
});

add_task(async function testRetryLocalFallback() {
  await checkCopyRecovery({
    outcomes: ["local-failure", "local-failure", "success", "success"],
    choices: [2, 2],
    savedTo: ["fallback", "additional"],
    alerts: 1,
  });
});

add_task(async function testRetryOriginalAfterLocalFallbackFailure() {
  await checkCopyRecovery({
    outcomes: ["local-failure", "local-failure", "success", "success"],
    choices: [2, 0],
    savedTo: ["primary", "additional"],
    alerts: 1,
  });
});

add_task(async function testRetryFcc2() {
  await checkCopyRecovery({
    outcomes: ["success", "async-failure", "success"],
    choices: [0],
    savedTo: ["primary", "additional"],
  });
});

add_task(async function testRetryFcc2WhenQueueing() {
  await checkCopyRecovery({
    outcomes: ["async-failure", "success"],
    choices: [0],
    savedTo: ["additional"],
    startWithFcc2: true,
    deliverMode: Ci.nsIMsgSend.nsMsgQueueForLater,
  });
});

add_task(async function testSaveFcc2Locally() {
  await checkCopyRecovery({
    outcomes: ["success", "async-failure", "success"],
    choices: [2],
    savedTo: ["primary", "fallback"],
    withFcc2: true,
    fallbackFor: "additional",
  });
});

add_task(async function testDontSave() {
  await checkCopyRecovery({
    outcomes: ["local-failure", "success"],
    choices: [1],
    savedTo: ["additional"],
  });
});

add_task(async function testUnrecoverableOutboxSetupFailureRejects() {
  const root = localAccountUtils.rootFolder;
  const identity = getSmtpIdentity(
    "sender@example.invalid",
    getBasicSmtpServer()
  );
  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  for (const deliverMode of [
    Ci.nsIMsgSend.nsMsgQueueForLater,
    Ci.nsIMsgSend.nsMsgDeliverBackground,
  ]) {
    const setupError = new Error("Could not create the Outbox copy file");
    const send = new MessageSend();
    Object.assign(send, {
      _userIdentity: identity,
      _compFields: fields,
      _fcc: root.URI,
      _deliverMode: deliverMode,
      _createCopyFile() {
        throw setupError;
      },
    });

    await Assert.rejects(
      send._mimeDoFcc(),
      error => error === setupError,
      "An Outbox setup failure should propagate"
    );
  }
});

add_task(async function testFolderResolutionFailureRejects() {
  const resolutionError = new Error("Could not resolve the drafts folder");
  const send = new MessageSend();
  Object.assign(send, {
    _userIdentity: {
      async getOrCreateDraftsFolderAsync() {
        throw resolutionError;
      },
    },
    _deliverMode: Ci.nsIMsgSend.nsMsgSaveAsDraft,
  });

  await Assert.rejects(
    send._mimeDoFcc(),
    error => error === resolutionError,
    "A folder-resolution failure should propagate"
  );
});
