/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);

const {
  Logger,
  gFilePromises,
  gPendingCleanup,
  queueFileOperation,
  getLogFolderPathForAccount,
  encodeName,
  getLogFilePathForConversation,
  getNewLogFileName,
  appendToFile,
  getLogWriter,
  closeLogWriter,
} = ChromeUtils.importESModule("resource:///modules/logger.sys.mjs");

var logDirPath = PathUtils.join(
  Services.dirsvc.get("ProfD", Ci.nsIFile).path,
  "logs"
);

var dummyAccount = {
  name: "dummy-account",
  normalizedName: "dummyaccount",
  protocol: {
    normalizedName: "dummy",
    id: "prpl-dummy",
  },
};

var dummyConv = {
  account: dummyAccount,
  id: 0,
  title: "dummy conv",
  normalizedName: "dummyconv",
  get name() {
    return this.normalizedName;
  },
  get startDate() {
    return new Date(2011, 5, 28).valueOf() * 1000;
  },
  isChat: false,
};

// A day after the first one.
var dummyConv2 = {
  account: dummyAccount,
  id: 0,
  title: "dummy conv",
  normalizedName: "dummyconv",
  get name() {
    return this.normalizedName;
  },
  get startDate() {
    return new Date(2011, 5, 29).valueOf() * 1000;
  },
  isChat: false,
};

var dummyMUC = {
  account: dummyAccount,
  id: 1,
  title: "Dummy MUC",
  normalizedName: "dummymuc",
  get name() {
    return this.normalizedName;
  },
  startDate: new Date(2011, 5, 28).valueOf() * 1000,
  isChat: true,
};

var encodeName_input = [
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM3",
  "LPT5",
  "file",
  "file.",
  "file ",
  "file_",
  "file<",
  "file>",
  "file:",
  'file"',
  "file/",
  "file\\",
  "file|",
  "file?",
  "file*",
  "file&",
  "file%",
  "fi<le",
  "fi>le",
  "fi:le",
  'fi"le',
  "fi/le",
  "fi\\le",
  "fi|le",
  "fi?le",
  "fi*le",
  "fi&le",
  "fi%le",
  "<file",
  ">file",
  ":file",
  '"file',
  "/file",
  "\\file",
  "|file",
  "?file",
  "*file",
  "&file",
  "%file",
  "\\fi?*&%le<>",
];

var encodeName_output = [
  "%CON",
  "%PRN",
  "%AUX",
  "%NUL",
  "%COM3",
  "%LPT5",
  "file",
  "file._",
  "file _",
  "file__",
  "file%3c",
  "file%3e",
  "file%3a",
  "file%22",
  "file%2f",
  "file%5c",
  "file%7c",
  "file%3f",
  "file%2a",
  "file%26",
  "file%25",
  "fi%3cle",
  "fi%3ele",
  "fi%3ale",
  "fi%22le",
  "fi%2fle",
  "fi%5cle",
  "fi%7cle",
  "fi%3fle",
  "fi%2ale",
  "fi%26le",
  "fi%25le",
  "%3cfile",
  "%3efile",
  "%3afile",
  "%22file",
  "%2ffile",
  "%5cfile",
  "%7cfile",
  "%3ffile",
  "%2afile",
  "%26file",
  "%25file",
  "%5c" + "fi" + "%3f%2a%26%25" + "le" + "%3c%3e", // eslint-disable-line no-useless-concat
];

var test_queueFileOperation = async function () {
  const dummyRejectedOperation = () => Promise.reject("Rejected!");
  const dummyResolvedOperation = () => Promise.resolve("Resolved!");

  // Immediately after calling qFO, "path1" should be mapped to p1.
  // After yielding, the reference should be cleared from the map.
  const p1 = queueFileOperation("path1", dummyResolvedOperation);
  equal(gFilePromises.get("path1"), p1);
  await p1;
  ok(!gFilePromises.has("path1"));

  // Repeat above test for a rejected promise.
  const p2 = queueFileOperation("path2", dummyRejectedOperation);
  equal(gFilePromises.get("path2"), p2);
  // This should throw since p2 rejected. Drop the error.
  await p2.then(
    () => do_throw(),
    () => {}
  );
  ok(!gFilePromises.has("path2"));

  const onPromiseComplete = (aPromise, aHandler) => {
    return aPromise.then(aHandler, aHandler);
  };
  const test_queueOrder = aOperation => {
    const promise = queueFileOperation("queueOrderPath", aOperation);
    let firstOperationComplete = false;
    onPromiseComplete(promise, () => (firstOperationComplete = true));
    return queueFileOperation("queueOrderPath", () => {
      ok(firstOperationComplete);
    });
  };
  // Test the queue order for rejected and resolved promises.
  await test_queueOrder(dummyResolvedOperation);
  await test_queueOrder(dummyRejectedOperation);
};

var test_getLogFolderPathForAccount = async function () {
  const path = getLogFolderPathForAccount(dummyAccount);
  equal(
    PathUtils.join(
      logDirPath,
      dummyAccount.protocol.normalizedName,
      encodeName(dummyAccount.normalizedName)
    ),
    path
  );
};

// Tests the global function getLogFilePathForConversation in logger.js.
var test_getLogFilePathForConversation = async function () {
  const path = getLogFilePathForConversation(dummyConv);
  let expectedPath = PathUtils.join(
    logDirPath,
    dummyAccount.protocol.normalizedName,
    encodeName(dummyAccount.normalizedName)
  );
  expectedPath = PathUtils.join(
    expectedPath,
    encodeName(dummyConv.normalizedName)
  );
  expectedPath = PathUtils.join(
    expectedPath,
    getNewLogFileName(dummyConv.startDate / 1000)
  );
  equal(path, expectedPath);
};

var test_getLogFilePathForMUC = async function () {
  const path = getLogFilePathForConversation(dummyMUC);
  let expectedPath = PathUtils.join(
    logDirPath,
    dummyAccount.protocol.normalizedName,
    encodeName(dummyAccount.normalizedName)
  );
  expectedPath = PathUtils.join(
    expectedPath,
    encodeName(dummyMUC.normalizedName + ".chat")
  );
  expectedPath = PathUtils.join(
    expectedPath,
    getNewLogFileName(dummyMUC.startDate / 1000)
  );
  equal(path, expectedPath);
};

var test_appendToFile = async function () {
  const kStringToWrite = "Hello, world!";
  const path = PathUtils.join(
    Services.dirsvc.get("ProfD", Ci.nsIFile).path,
    "testFile.txt"
  );
  await IOUtils.write(path, new Uint8Array());
  appendToFile(path, kStringToWrite);
  appendToFile(path, kStringToWrite);
  ok(await queueFileOperation(path, () => IOUtils.exists(path)));
  const text = await queueFileOperation(path, () => IOUtils.readUTF8(path));
  // The read text should be equal to kStringToWrite repeated twice.
  equal(text, kStringToWrite + kStringToWrite);
  await IOUtils.remove(path);
};

add_task(async function test_appendToFileHeader() {
  const kStringToWrite = "Lorem ipsum";
  const path = PathUtils.join(
    Services.dirsvc.get("ProfD", Ci.nsIFile).path,
    "headerTestFile.txt"
  );
  await appendToFile(path, kStringToWrite, true);
  await appendToFile(path, kStringToWrite, true);
  const text = await queueFileOperation(path, () => IOUtils.readUTF8(path));
  // The read text should be equal to kStringToWrite once, since the second
  // create should just noop.
  equal(text, kStringToWrite);
  await IOUtils.remove(path);
});

// Tests the getLogPathsForConversation API defined in the Logger interface.
var test_getLogPathsForConversation = async function () {
  const logger = new Logger();
  let paths = await logger.getLogPathsForConversation(dummyConv);
  // The path should be null since a LogWriter hasn't been created yet.
  equal(paths, null);
  const logWriter = getLogWriter(dummyConv);
  paths = await logger.getLogPathsForConversation(dummyConv);
  equal(paths.length, 1);
  equal(paths[0], logWriter.currentPath);
  ok(await IOUtils.exists(paths[0]));
  // Ensure this doesn't interfere with future tests.
  await IOUtils.remove(paths[0]);
  closeLogWriter(dummyConv);
};

var test_logging = async function () {
  const logger = new Logger();
  const oneSec = 1000000; // Microseconds.

  // Creates a set of dummy messages for a conv (sets appropriate times).
  const getMsgsForConv = function (aConv) {
    // Convert to seconds because that's what logMessage expects.
    const startTime = Math.round(aConv.startDate / oneSec);
    return [
      {
        time: startTime + 1,
        who: "personA",
        displayMessage: "Hi!",
        outgoing: true,
      },
      {
        time: startTime + 2,
        who: "personB",
        displayMessage: "Hello!",
        incoming: true,
      },
      {
        time: startTime + 3,
        who: "personA",
        displayMessage: "What's up?",
        outgoing: true,
      },
      {
        time: startTime + 4,
        who: "personB",
        displayMessage: "Nothing much!",
        incoming: true,
      },
      {
        time: startTime + 5,
        who: "personB",
        displayMessage: "Encrypted msg",
        remoteId: "identifier",
        incoming: true,
        isEncrypted: true,
      },
      {
        time: startTime + 6,
        who: "personA",
        displayMessage: "Deleted",
        remoteId: "otherID",
        outgoing: true,
        isEncrypted: true,
        deleted: true,
      },
    ];
  };
  const firstDayMsgs = getMsgsForConv(dummyConv);
  const secondDayMsgs = getMsgsForConv(dummyConv2);

  const logMessagesForConv = async function (aConv, aMessages) {
    const logWriter = getLogWriter(aConv);
    for (const message of aMessages) {
      logWriter.logMessage(message);
    }
    // If we don't wait for the messages to get written, we have no guarantee
    // later in the test that the log files were created, and getConversation
    // will return an EmptyEnumerator. Logging the messages is queued on the
    // _initialized promise, so we need to await on that first.
    await logWriter._initialized;
    await gFilePromises.get(logWriter.currentPath);
    // Ensure two different files for the different dates.
    closeLogWriter(aConv);
  };
  await logMessagesForConv(dummyConv, firstDayMsgs);
  await logMessagesForConv(dummyConv2, secondDayMsgs);

  // Write a zero-length file and a file with incorrect JSON for each day
  // to ensure they are handled correctly.
  const logDir = PathUtils.parent(getLogFilePathForConversation(dummyConv));
  const createBadFiles = async function (aConv) {
    const blankFile = PathUtils.join(
      logDir,
      getNewLogFileName((aConv.startDate + oneSec) / 1000)
    );
    const invalidJSONFile = PathUtils.join(
      logDir,
      getNewLogFileName((aConv.startDate + 2 * oneSec) / 1000)
    );
    await IOUtils.write(blankFile, new Uint8Array());
    await IOUtils.writeUTF8(invalidJSONFile, "This isn't JSON!");
  };
  await createBadFiles(dummyConv);
  await createBadFiles(dummyConv2);

  const testMsgs = function (aMsgs, aExpectedMsgs, aExpectedSessions) {
    // Ensure the number of session messages is correct.
    const sessions = aMsgs.filter(aMsg => aMsg.who == "sessionstart").length;
    equal(sessions, aExpectedSessions);

    // Discard session messages, etc.
    aMsgs = aMsgs.filter(aMsg => !aMsg.noLog);

    equal(aMsgs.length, aExpectedMsgs.length);

    for (let i = 0; i < aMsgs.length; ++i) {
      const message = aMsgs[i],
        expectedMessage = aExpectedMsgs[i];
      for (const prop in expectedMessage) {
        ok(prop in message);
        equal(expectedMessage[prop], message[prop]);
      }
    }
  };

  // Accepts time in seconds, reduces it to a date, and returns the value in millis.
  const reduceTimeToDate = function (aTime) {
    const date = new Date(aTime * 1000);
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    return date.valueOf();
  };

  // Group expected messages by day.
  const messagesByDay = new Map();
  messagesByDay.set(
    reduceTimeToDate(firstDayMsgs[0].time),
    firstDayMsgs.filter(msg => !msg.deleted)
  );
  messagesByDay.set(
    reduceTimeToDate(secondDayMsgs[0].time),
    secondDayMsgs.filter(msg => !msg.deleted)
  );

  const logs = await logger.getLogsForConversation(dummyConv);
  for (const log of logs) {
    const conv = await log.getConversation();
    const date = reduceTimeToDate(log.time);
    // 3 session messages - for daily logs, bad files are included.
    testMsgs(conv.getMessages(), messagesByDay.get(date), 3);
  }

  // Remove the created log files, testing forEach in the process.
  await logger.forEach({
    async processLog(aLog) {
      const info = await IOUtils.stat(aLog);
      notEqual(info.type, "directory");
      ok(aLog.endsWith(".json"));
      await IOUtils.remove(aLog);
    },
  });
  const logFolder = PathUtils.parent(getLogFilePathForConversation(dummyConv));
  // The folder should now be empty - this will throw if it isn't.
  await IOUtils.remove(logFolder, { ignoreAbsent: false });
};

var test_logFileSplitting = async function () {
  // Start clean, remove the log directory.
  await IOUtils.remove(logDirPath, { recursive: true });
  const logWriter = getLogWriter(dummyConv);
  const startTime = logWriter._startTime / 1000; // Message times are in seconds.
  let oldPath = logWriter.currentPath;
  const message = {
    time: startTime,
    who: "John Doe",
    originalMessage: "Hello, world!",
    outgoing: true,
  };

  const logMessage = async function (aMessage) {
    logWriter.logMessage(aMessage);
    await logWriter._initialized;
    await gFilePromises.get(logWriter.currentPath);
  };

  await logMessage(message);
  message.time += logWriter.constructor.kInactivityLimit / 1000 + 1;
  // This should go in a new log file.
  await logMessage(message);
  notEqual(logWriter.currentPath, oldPath);
  // The log writer's new start time should be the time of the message.
  equal(message.time * 1000, logWriter._startTime);

  const getCurrentHeader = async function () {
    return JSON.parse(
      (await IOUtils.readUTF8(logWriter.currentPath)).split("\n")[0]
    );
  };

  // The header of the new log file should not have the continuedSession flag set.
  ok(!(await getCurrentHeader()).continuedSession);

  // Set the start time sufficiently before midnight, and the last message time
  // to just before midnight. A new log file should be created at midnight.
  logWriter._startTime = new Date(logWriter._startTime).setHours(
    24,
    0,
    0,
    -(logWriter.constructor.kDayOverlapLimit + 1)
  );
  const nearlyMidnight = new Date(logWriter._startTime).setHours(24, 0, 0, -1);
  oldPath = logWriter.currentPath;
  logWriter._lastMessageTime = nearlyMidnight;
  message.time = new Date(nearlyMidnight).setHours(24, 0, 0, 1) / 1000;
  await logMessage(message);
  // The message should have gone in a new file.
  notEqual(oldPath, logWriter.currentPath);
  // The header should have the continuedSession flag set this time.
  ok((await getCurrentHeader()).continuedSession);

  // Ensure a new file is created every kMessageCountLimit messages.
  oldPath = logWriter.currentPath;
  const messageCountLimit = logWriter.constructor.kMessageCountLimit;
  for (let i = 0; i < messageCountLimit; ++i) {
    logMessage(message);
  }
  await logMessage(message);
  notEqual(oldPath, logWriter.currentPath);
  // The header should have the continuedSession flag set this time too.
  ok((await getCurrentHeader()).continuedSession);
  // Again, to make sure it still works correctly after splitting it once already.
  oldPath = logWriter.currentPath;
  // We already logged one message to ensure it went into a new file, so i = 1.
  for (let i = 1; i < messageCountLimit; ++i) {
    logMessage(message);
  }
  await logMessage(message);
  notEqual(oldPath, logWriter.currentPath);
  ok((await getCurrentHeader()).continuedSession);

  // The new start time is the time of the message. If we log sufficiently more
  // messages with the same time property, ensure that the start time of the next
  // log file is greater than the previous one, and that a new path is being used.
  let oldStartTime = logWriter._startTime;
  oldPath = logWriter.currentPath;
  logWriter._messageCount = messageCountLimit;
  await logMessage(message);
  notEqual(oldPath, logWriter.currentPath);
  Assert.greater(logWriter._startTime, oldStartTime);

  // Do it again with the same message.
  oldStartTime = logWriter._startTime;
  oldPath = logWriter.currentPath;
  logWriter._messageCount = messageCountLimit;
  await logMessage(message);
  notEqual(oldPath, logWriter.currentPath);
  Assert.greater(logWriter._startTime, oldStartTime);

  // Clean up.
  await IOUtils.remove(logDirPath, { recursive: true });
  closeLogWriter(dummyConv);
};

add_task(async function test_logWithEdits() {
  // Start clean, remove the log directory.
  await IOUtils.remove(logDirPath, { recursive: true });
  const logger = new Logger();
  const logFilePath = getLogFilePathForConversation(dummyConv);
  await IOUtils.writeUTF8(
    logFilePath,
    [
      {
        date: "2022-03-04T12:00:03.508Z",
        name: "test",
        title: "test",
        account: "@test:example.com",
        protocol: "matrix",
        isChat: false,
        normalizedName: "!foobar:example.com",
      },
      {
        date: "2022-03-04T11:59:48.000Z",
        who: "@other:example.com",
        text: "Decrypting...",
        flags: ["incoming", "delayed", "isEncrypted"],
        remoteId: "$AjmS57jkBbYnSnC01r3fXya8BfuHIMAw9mOYQRlnkFk",
        alias: "other",
      },
      {
        date: "2022-03-04T11:59:51.000Z",
        who: "@other:example.com",
        text: "Decrypting...",
        flags: ["incoming", "delayed", "isEncrypted"],
        remoteId: "$00zdmKvErkDR4wMaxZBCFsV1WwqPQRolP0kYiXPIXsQ",
        alias: "other",
      },
      {
        date: "2022-03-04T11:59:53.000Z",
        who: "@other:example.com",
        text: "Decrypting...",
        flags: ["incoming", "delayed", "isEncrypted"],
        remoteId: "$Z6ILSf7cBMRbr_B6Z6DPHJWzf-Utxa8_s0f6vxhR_VQ",
        alias: "other",
      },
      {
        date: "2022-03-04T11:59:56.000Z",
        who: "@other:example.com",
        text: "Decrypting...",
        flags: ["incoming", "delayed", "isEncrypted"],
        remoteId: "$GFlcel-9tWrTvSb7HM_113-WpkzEdB4neglPVpZn3dM",
        alias: "other",
      },
      {
        date: "2022-03-04T11:59:56.000Z",
        who: "@other:example.com",
        text: "Lorem ipsum dolor sit amet",
        flags: ["incoming", "isEncrypted"],
        remoteId: "$GFlcel-9tWrTvSb7HM_113-WpkzEdB4neglPVpZn3dM",
        alias: "other",
      },
      {
        date: "2022-03-04T11:59:53.000Z",
        who: "@other:example.com",
        text: "consectetur adipiscing elit",
        flags: ["incoming", "isEncrypted"],
        remoteId: "$Z6ILSf7cBMRbr_B6Z6DPHJWzf-Utxa8_s0f6vxhR_VQ",
        alias: "other",
      },
      {
        date: "2022-03-04T11:59:51.000Z",
        who: "@other:example.com",
        text: "sed do eiusmod tempor incididunt ut labore et dolore magna aliqua",
        flags: ["incoming", "isEncrypted"],
        remoteId: "$00zdmKvErkDR4wMaxZBCFsV1WwqPQRolP0kYiXPIXsQ",
        alias: "other",
      },
      {
        date: "2022-03-04T11:59:48.000Z",
        who: "@other:example.com",
        text: "Ut enim ad minim veniam",
        flags: ["incoming", "isEncrypted"],
        remoteId: "$AjmS57jkBbYnSnC01r3fXya8BfuHIMAw9mOYQRlnkFk",
        alias: "other",
      },
    ]
      .map(message => JSON.stringify(message))
      .join("\n"),
    {
      mode: "create",
    }
  );
  const logs = await logger.getLogsForConversation(dummyConv);
  equal(logs.length, 1);
  const conv = await logs[0].getConversation();
  const messages = conv.getMessages();
  equal(messages.length, 5);
  for (const msg of messages) {
    if (msg.who !== "sessionstart") {
      notEqual(msg.displayMessage, "Decrypting...");
    }
  }

  // Clean up.
  await IOUtils.remove(logDirPath, { recursive: true });
});

// Ensure that any message with a remoteId that has a deleted flag in the
// latest version is not visible in logs.
add_task(async function test_logWithDeletedMessages() {
  // Start clean, remove the log directory.
  await IOUtils.remove(logDirPath, { recursive: true });
  const logger = new Logger();
  const logFilePath = getLogFilePathForConversation(dummyConv);
  const remoteId = "$GFlcel-9tWrTvSb7HM_113-WpkzEdB4neglPVpZn3dM";
  await IOUtils.writeUTF8(
    logFilePath,
    [
      {
        date: "2022-03-04T12:00:03.508Z",
        name: "test",
        title: "test",
        account: "@test:example.com",
        protocol: "matrix",
        isChat: false,
        normalizedName: "!foobar:example.com",
      },
      {
        date: "2022-03-04T11:59:56.000Z",
        who: "@other:example.com",
        text: "Decrypting...",
        flags: ["incoming", "isEncrypted"],
        remoteId,
        alias: "other",
      },
      {
        date: "2022-03-04T11:59:56.000Z",
        who: "@other:example.com",
        text: "Message was redacted.",
        flags: ["incoming", "isEncrypted", "deleted"],
        remoteId,
        alias: "other",
      },
    ]
      .map(message => JSON.stringify(message))
      .join("\n"),
    {
      mode: "create",
    }
  );
  const logs = await logger.getLogsForConversation(dummyConv);
  equal(logs.length, 1);
  const conv = await logs[0].getConversation();
  const messages = conv.getMessages();
  equal(messages.length, 1);
  equal(messages[0].who, "sessionstart");

  // Clean up.
  await IOUtils.remove(logDirPath, { recursive: true });
});

add_task(async function test_logDeletedMessageCleanup() {
  // Start clean, remove the log directory.
  await IOUtils.remove(logDirPath, { recursive: true });
  const logger = new Logger();
  const logWriter = getLogWriter(dummyConv);
  const remoteId = "testId";

  const logMessage = async function (aMessage) {
    logWriter.logMessage(aMessage);
    await logWriter._initialized;
    await gFilePromises.get(logWriter.currentPath);
  };

  await logMessage({
    time: Math.floor(dummyConv.startDate / 1000000) + 10,
    who: "test",
    displayMessage: "delete me",
    remoteId,
    incoming: true,
  });

  await logMessage({
    time: Math.floor(dummyConv.startDate / 1000000) + 20,
    who: "test",
    displayMessage: "Message is deleted",
    remoteId,
    deleted: true,
    incoming: true,
  });
  ok(gPendingCleanup.has(logWriter.currentPath));
  equal(
    Services.prefs.getStringPref("chat.logging.cleanup.pending"),
    JSON.stringify([logWriter.currentPath])
  );

  await new Promise(resolve => ChromeUtils.idleDispatch(resolve));
  await (gFilePromises.get(logWriter.currentPath) || Promise.resolve());

  ok(!gPendingCleanup.has(logWriter.currentPath));
  equal(Services.prefs.getStringPref("chat.logging.cleanup.pending"), "[]");

  const logs = await logger.getLogsForConversation(dummyConv);
  equal(logs.length, 1, "Only a single log file for this conversation");
  const conv = await logs[0].getConversation();
  const messages = conv.getMessages();
  equal(messages.length, 1, "Only the log header is left");
  equal(messages[0].who, "sessionstart");

  // Check that the message contents were removed from the file on disk. The
  // log parser above removes it either way.
  const logOnDisk = await IOUtils.readUTF8(logWriter.currentPath);
  const rawMessages = logOnDisk
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
  equal(rawMessages.length, 3);
  equal(rawMessages[1].text, "", "Deleted message content was removed");
  equal(
    rawMessages[2].text,
    "Message is deleted",
    "Deletion content is unaffected"
  );

  // Clean up.
  await IOUtils.remove(logDirPath, { recursive: true });

  closeLogWriter(dummyConv);
});

add_task(async function test_displayOldActionLog() {
  // Start clean, remove the log directory.
  await IOUtils.remove(logDirPath, { recursive: true });
  const logger = new Logger();
  const logFilePath = getLogFilePathForConversation(dummyConv);
  await IOUtils.writeUTF8(
    logFilePath,
    [
      {
        date: "2022-03-04T12:00:03.508Z",
        name: "test",
        title: "test",
        account: "@test:example.com",
        protocol: "matrix",
        isChat: false,
        normalizedName: "!foobar:example.com",
      },
      {
        date: "2022-03-04T11:59:56.000Z",
        who: "@other:example.com",
        text: "/me an old action",
        flags: ["incoming"],
      },
      {
        date: "2022-03-04T11:59:56.000Z",
        who: "@other:example.com",
        text: "a new action",
        flags: ["incoming", "action"],
      },
    ]
      .map(message => JSON.stringify(message))
      .join("\n"),
    {
      mode: "create",
    }
  );
  const logs = await logger.getLogsForConversation(dummyConv);
  equal(logs.length, 1);
  for (const log of logs) {
    const conv = await log.getConversation();
    const messages = conv.getMessages();
    equal(messages.length, 3);
    for (const message of messages) {
      if (message.who !== "sessionstart") {
        ok(message.action, "Message is marked as action");
        ok(
          !message.displayMessage.startsWith("/me"),
          "Message has no leading /me"
        );
      }
    }
  }

  // Clean up.
  await IOUtils.remove(logDirPath, { recursive: true });
});

add_task(function test_encodeName() {
  // Test encodeName().
  for (let i = 0; i < encodeName_input.length; ++i) {
    equal(encodeName(encodeName_input[i]), encodeName_output[i]);
  }
});

add_task(test_getLogFolderPathForAccount);

add_task(test_getLogFilePathForConversation);

add_task(test_getLogFilePathForMUC);

add_task(test_queueFileOperation);

add_task(test_appendToFile);

add_task(test_getLogPathsForConversation);

add_task(test_logging);

add_task(test_logFileSplitting);
