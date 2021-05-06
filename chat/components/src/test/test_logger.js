/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");

var gLogger = {};
Services.scriptloader.loadSubScript("resource:///modules/logger.jsm", gLogger);

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

var test_queueFileOperation = async function() {
  let dummyRejectedOperation = () => Promise.reject("Rejected!");
  let dummyResolvedOperation = () => Promise.resolve("Resolved!");

  let gFP = gLogger.gFilePromises;
  let qFO = gLogger.queueFileOperation;

  // Immediately after calling qFO, "path1" should be mapped to p1.
  // After yielding, the reference should be cleared from the map.
  let p1 = qFO("path1", dummyResolvedOperation);
  equal(gFP.get("path1"), p1);
  await p1;
  ok(!gFP.has("path1"));

  // Repeat above test for a rejected promise.
  let p2 = qFO("path2", dummyRejectedOperation);
  equal(gFP.get("path2"), p2);
  // This should throw since p2 rejected. Drop the error.
  await p2.then(
    () => do_throw(),
    () => {}
  );
  ok(!gFP.has("path2"));

  let onPromiseComplete = (aPromise, aHandler) => {
    return aPromise.then(aHandler, aHandler);
  };
  let test_queueOrder = aOperation => {
    let promise = qFO("queueOrderPath", aOperation);
    let firstOperationComplete = false;
    onPromiseComplete(promise, () => (firstOperationComplete = true));
    return qFO("queueOrderPath", () => {
      ok(firstOperationComplete);
    });
  };
  // Test the queue order for rejected and resolved promises.
  await test_queueOrder(dummyResolvedOperation);
  await test_queueOrder(dummyRejectedOperation);
};

var test_getLogFolderPathForAccount = async function() {
  let path = gLogger.getLogFolderPathForAccount(dummyAccount);
  equal(
    PathUtils.join(
      logDirPath,
      dummyAccount.protocol.normalizedName,
      gLogger.encodeName(dummyAccount.normalizedName)
    ),
    path
  );
};

// Tests the global function getLogFilePathForConversation in logger.js.
var test_getLogFilePathForConversation = async function() {
  let path = gLogger.getLogFilePathForConversation(dummyConv, "format");
  let expectedPath = PathUtils.join(
    logDirPath,
    dummyAccount.protocol.normalizedName,
    gLogger.encodeName(dummyAccount.normalizedName)
  );
  expectedPath = PathUtils.join(
    expectedPath,
    gLogger.encodeName(dummyConv.normalizedName)
  );
  expectedPath = PathUtils.join(
    expectedPath,
    gLogger.getNewLogFileName("format", dummyConv.startDate / 1000)
  );
  equal(path, expectedPath);
};

var test_getLogFilePathForMUC = async function() {
  let path = gLogger.getLogFilePathForConversation(dummyMUC, "format");
  let expectedPath = PathUtils.join(
    logDirPath,
    dummyAccount.protocol.normalizedName,
    gLogger.encodeName(dummyAccount.normalizedName)
  );
  expectedPath = PathUtils.join(
    expectedPath,
    gLogger.encodeName(dummyMUC.normalizedName + ".chat")
  );
  expectedPath = PathUtils.join(
    expectedPath,
    gLogger.getNewLogFileName("format", dummyMUC.startDate / 1000)
  );
  equal(path, expectedPath);
};

var test_appendToFile = async function() {
  const kStringToWrite = "Hello, world!";
  let path = PathUtils.join(
    Services.dirsvc.get("ProfD", Ci.nsIFile).path,
    "testFile.txt"
  );
  await IOUtils.write(path, new Uint8Array());
  gLogger.appendToFile(path, kStringToWrite);
  gLogger.appendToFile(path, kStringToWrite);
  ok(await gLogger.queueFileOperation(path, () => IOUtils.exists(path)));
  let text = await gLogger.queueFileOperation(path, () =>
    IOUtils.readUTF8(path)
  );
  // The read text should be equal to kStringToWrite repeated twice.
  equal(text, kStringToWrite + kStringToWrite);
  await IOUtils.remove(path);
};

add_task(async function test_appendToFileHeader() {
  const kStringToWrite = "Lorem ipsum";
  let path = PathUtils.join(
    Services.dirsvc.get("ProfD", Ci.nsIFile).path,
    "headerTestFile.txt"
  );
  await gLogger.appendToFile(path, kStringToWrite, true);
  await gLogger.appendToFile(path, kStringToWrite, true);
  let text = await gLogger.queueFileOperation(path, () =>
    IOUtils.readUTF8(path)
  );
  // The read text should be equal to kStringToWrite once, since the second
  // create should just noop.
  equal(text, kStringToWrite);
  await IOUtils.remove(path);
});

// Tests the getLogPathsForConversation API defined in the imILogger interface.
var test_getLogPathsForConversation = async function() {
  let logger = new gLogger.Logger();
  let paths = await logger.getLogPathsForConversation(dummyConv);
  // The path should be null since a LogWriter hasn't been created yet.
  equal(paths, null);
  let logWriter = gLogger.getLogWriter(dummyConv);
  paths = await logger.getLogPathsForConversation(dummyConv);
  equal(paths.length, 1);
  equal(paths[0], logWriter.currentPath);
  ok(await IOUtils.exists(paths[0]));
  // Ensure this doesn't interfere with future tests.
  await IOUtils.remove(paths[0]);
  gLogger.closeLogWriter(dummyConv);
};

var test_logging = async function() {
  let logger = new gLogger.Logger();
  let oneSec = 1000000; // Microseconds.

  // Creates a set of dummy messages for a conv (sets appropriate times).
  let getMsgsForConv = function(aConv) {
    // Convert to seconds because that's what logMessage expects.
    let startTime = Math.round(aConv.startDate / oneSec);
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
    ];
  };
  let firstDayMsgs = getMsgsForConv(dummyConv);
  let secondDayMsgs = getMsgsForConv(dummyConv2);

  let logMessagesForConv = async function(aConv, aMessages) {
    let logWriter = gLogger.getLogWriter(aConv);
    for (let message of aMessages) {
      logWriter.logMessage(message);
    }
    // If we don't wait for the messages to get written, we have no guarantee
    // later in the test that the log files were created, and getConversation
    // will return an EmptyEnumerator. Logging the messages is queued on the
    // _initialized promise, so we need to await on that first.
    await logWriter._initialized;
    await gLogger.gFilePromises.get(logWriter.currentPath);
    // Ensure two different files for the different dates.
    gLogger.closeLogWriter(aConv);
  };
  await logMessagesForConv(dummyConv, firstDayMsgs);
  await logMessagesForConv(dummyConv2, secondDayMsgs);

  // Write a zero-length file and a file with incorrect JSON for each day
  // to ensure they are handled correctly.
  let logDir = PathUtils.parent(
    gLogger.getLogFilePathForConversation(dummyConv, "json")
  );
  let createBadFiles = async function(aConv) {
    let blankFile = PathUtils.join(
      logDir,
      gLogger.getNewLogFileName("json", (aConv.startDate + oneSec) / 1000)
    );
    let invalidJSONFile = PathUtils.join(
      logDir,
      gLogger.getNewLogFileName("json", (aConv.startDate + 2 * oneSec) / 1000)
    );
    await IOUtils.write(blankFile, new Uint8Array());
    await IOUtils.writeUTF8(invalidJSONFile, "This isn't JSON!");
  };
  await createBadFiles(dummyConv);
  await createBadFiles(dummyConv2);

  let testMsgs = function(aMsgs, aExpectedMsgs, aExpectedSessions) {
    // Ensure the number of session messages is correct.
    let sessions = aMsgs.filter(aMsg => aMsg.who == "sessionstart").length;
    equal(sessions, aExpectedSessions);

    // Discard session messages, etc.
    aMsgs = aMsgs.filter(aMsg => !aMsg.noLog);

    equal(aMsgs.length, aExpectedMsgs.length);

    for (let i = 0; i < aMsgs.length; ++i) {
      let message = aMsgs[i],
        expectedMessage = aExpectedMsgs[i];
      for (let prop in expectedMessage) {
        ok(prop in message);
        equal(expectedMessage[prop], message[prop]);
      }
    }
  };

  let logs = await logger.getLogsForConversation(dummyConv);
  let allLogMsgs = [];
  for (let log of logs) {
    let conv = await log.getConversation();
    if (!conv) {
      continue;
    }
    allLogMsgs = allLogMsgs.concat(conv.getMessages());
  }
  // Two session messages, one for each valid log file.
  testMsgs(allLogMsgs, firstDayMsgs.concat(secondDayMsgs), 2);

  // Accepts time in seconds, reduces it to a date, and returns the value in millis.
  let reduceTimeToDate = function(aTime) {
    let date = new Date(aTime * 1000);
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    return date.valueOf();
  };

  // Group expected messages by day.
  let messagesByDay = new Map();
  messagesByDay.set(reduceTimeToDate(firstDayMsgs[0].time), firstDayMsgs);
  messagesByDay.set(reduceTimeToDate(secondDayMsgs[0].time), secondDayMsgs);

  logs = await logger.getLogsForConversation(dummyConv, true);
  for (let log of logs) {
    let conv = await log.getConversation();
    let date = reduceTimeToDate(log.time);
    // 3 session messages - for daily logs, bad files are included.
    testMsgs(conv.getMessages(), messagesByDay.get(date), 3);
  }

  // Remove the created log files, testing forEach in the process.
  await logger.forEach({
    async processLog(aLog) {
      let info = await IOUtils.stat(aLog);
      notEqual(info.type, "directory");
      ok(aLog.endsWith(".json"));
      await IOUtils.remove(aLog);
    },
  });
  let logFolder = PathUtils.parent(
    gLogger.getLogFilePathForConversation(dummyConv)
  );
  // The folder should now be empty - this will throw if it isn't.
  await IOUtils.remove(logFolder, { ignoreAbsent: false });
};

var test_logFileSplitting = async function() {
  // Start clean, remove the log directory.
  await IOUtils.remove(logDirPath, { recursive: true });
  let logWriter = gLogger.getLogWriter(dummyConv);
  let startTime = logWriter._startTime / 1000; // Message times are in seconds.
  let oldPath = logWriter.currentPath;
  let message = {
    time: startTime,
    who: "John Doe",
    originalMessage: "Hello, world!",
    outgoing: true,
  };

  let logMessage = async function(aMessage) {
    logWriter.logMessage(aMessage);
    await logWriter._initialized;
    await gLogger.gFilePromises.get(logWriter.currentPath);
  };

  await logMessage(message);
  message.time += logWriter.kInactivityLimit / 1000 + 1;
  // This should go in a new log file.
  await logMessage(message);
  notEqual(logWriter.currentPath, oldPath);
  // The log writer's new start time should be the time of the message.
  equal(message.time * 1000, logWriter._startTime);

  let getCurrentHeader = async function() {
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
    -(logWriter.kDayOverlapLimit + 1)
  );
  let nearlyMidnight = new Date(logWriter._startTime).setHours(24, 0, 0, -1);
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
  let messageCountLimit = logWriter.kMessageCountLimit;
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
  ok(logWriter._startTime > oldStartTime);

  // Do it again with the same message.
  oldStartTime = logWriter._startTime;
  oldPath = logWriter.currentPath;
  logWriter._messageCount = messageCountLimit;
  await logMessage(message);
  notEqual(oldPath, logWriter.currentPath);
  ok(logWriter._startTime > oldStartTime);

  // Clean up.
  await IOUtils.remove(logDirPath, { recursive: true });
};

function run_test() {
  // Test encodeName().
  for (let i = 0; i < encodeName_input.length; ++i) {
    equal(gLogger.encodeName(encodeName_input[i]), encodeName_output[i]);
  }

  add_task(test_getLogFolderPathForAccount);

  add_task(test_getLogFilePathForConversation);

  add_task(test_getLogFilePathForMUC);

  add_task(test_queueFileOperation);

  add_task(test_appendToFile);

  add_task(test_getLogPathsForConversation);

  add_task(test_logging);

  add_task(test_logFileSplitting);

  run_next_test();
}
