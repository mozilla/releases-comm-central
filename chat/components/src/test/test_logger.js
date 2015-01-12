/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {interfaces: Ci, utils: Cu} = Components;

do_get_profile();

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource://gre/modules/osfile.jsm");
Cu.import("resource://gre/modules/Task.jsm");

let gLogger = {};
Services.scriptloader.loadSubScript("resource:///components/logger.js", gLogger);

let logDirPath = OS.Path.join(OS.Constants.Path.profileDir, "logs");

let dummyAccount = {
  name: "dummy-account",
  normalizedName: "dummyaccount",
  protocol: {
    normalizedName: "dummy",
    id: "prpl-dummy"
  }
};

let dummyTwitterAccount = {
  name: "dummy-twitter",
  normalizedName: "dummytwitter",
  protocol: {
    normalizedName: "twitter",
    id: "prpl-twitter"
  }
};

let test_accounts = [dummyAccount, dummyTwitterAccount];

let dummyConv = {
  account: dummyAccount,
  id: 0,
  title: "dummy conv",
  normalizedName: "dummyconv",
  get name() this.normalizedName,
  get startDate() new Date(2011, 5, 28).valueOf() * 1000,
  isChat: false
};

// A day after the first one.
let dummyConv2 = {
  account: dummyAccount,
  id: 0,
  title: "dummy conv",
  normalizedName: "dummyconv",
  get name() this.normalizedName,
  get startDate() new Date(2011, 5, 29).valueOf() * 1000,
  isChat: false
};

let dummyMUC = {
  account: dummyAccount,
  id: 1,
  title: "Dummy MUC",
  normalizedName: "dummymuc",
  get name() this.normalizedName,
  startDate: new Date(2011, 5, 28).valueOf() * 1000,
  isChat: true
};

let dummyTwitterConv = {
  account: dummyTwitterAccount,
  id: 2,
  title: "Dummy Twitter Conv",
  normalizedName: "dummytwitterconv",
  get name() this.normalizedName,
  startDate: new Date(2011, 5, 28).valueOf() * 1000,
  isChat: true
};

let test_convs = [dummyConv, dummyMUC, dummyTwitterConv];

let encodeName_input = [
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
  "file\"",
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
  "fi\"le",
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
  "\"file",
  "/file",
  "\\file",
  "|file",
  "?file",
  "*file",
  "&file",
  "%file",
  "\\fi?*&%le<>"
];

let encodeName_output = [
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
  "%5c" + "fi" + "%3f%2a%26%25" + "le" + "%3c%3e"
];

let test_queueFileOperation = function* () {
  let dummyOperation = function() {};

  let dummyRejectedOperation = () => Promise.reject("Rejected!");
  let dummyResolvedOperation = () => Promise.resolve("Resolved!");

  let gFP = gLogger.gFilePromises;
  let qFO = gLogger.queueFileOperation;

  // Immediately after calling qFO, "path1" should be mapped to p1.
  // After yielding, the reference should be cleared from the map.
  let p1 = qFO("path1", dummyResolvedOperation);
  equal(gFP.get("path1"), p1);
  yield p1;
  ok(!gFP.has("path1"));

  // Repeat above test for a rejected promise.
  let p2 = qFO("path2", dummyRejectedOperation);
  equal(gFP.get("path2"), p2);
  // This should throw since p2 rejected. Drop the error.
  yield p2.then(() => do_throw(), () => {});
  ok(!gFP.has("path2"));

  let onPromiseComplete = (aPromise, aHandler) => {
    return aPromise.then(aHandler, aHandler);
  }
  let test_queueOrder = (aOperation) => {
    let promise = qFO("queueOrderPath", aOperation);
    let firstOperationComplete = false;
    onPromiseComplete(promise, () => firstOperationComplete = true);
    return qFO("queueOrderPath", () => {
      ok(firstOperationComplete);
    });
  }
  // Test the queue order for rejected and resolved promises.
  yield test_queueOrder(dummyResolvedOperation);
  yield test_queueOrder(dummyRejectedOperation);
}

let test_getLogFolderPathForAccount = function* () {
  let path = gLogger.getLogFolderPathForAccount(dummyAccount);
  equal(OS.Path.join(logDirPath, dummyAccount.protocol.normalizedName,
                     gLogger.encodeName(dummyAccount.normalizedName)), path);
}

// Tests the global function getLogFilePathForConversation in logger.js.
let test_getLogFilePathForConversation = function* () {
  let path = gLogger.getLogFilePathForConversation(dummyConv, "format");
  let expectedPath = OS.Path.join(logDirPath, dummyAccount.protocol.normalizedName,
                                  gLogger.encodeName(dummyAccount.normalizedName));
  expectedPath = OS.Path.join(
    expectedPath, gLogger.encodeName(dummyConv.normalizedName));
  expectedPath = OS.Path.join(
    expectedPath, gLogger.getNewLogFileName("format", dummyConv.startDate));
  equal(path, expectedPath);
}

let test_getLogFilePathForMUC = function* () {
  let path = gLogger.getLogFilePathForConversation(dummyMUC, "format");
  let expectedPath = OS.Path.join(logDirPath, dummyAccount.protocol.normalizedName,
                                  gLogger.encodeName(dummyAccount.normalizedName));
  expectedPath = OS.Path.join(
    expectedPath, gLogger.encodeName(dummyMUC.normalizedName + ".chat"));
  expectedPath = OS.Path.join(
    expectedPath, gLogger.getNewLogFileName("format", dummyMUC.startDate));
  equal(path, expectedPath);
}

let test_getLogFilePathForTwitterConv = function* () {
  let path = gLogger.getLogFilePathForConversation(dummyTwitterConv, "format");
  let expectedPath =
    OS.Path.join(logDirPath, dummyTwitterAccount.protocol.normalizedName,
                 gLogger.encodeName(dummyTwitterAccount.normalizedName));
  expectedPath = OS.Path.join(
    expectedPath, gLogger.encodeName(dummyTwitterConv.normalizedName));
  expectedPath = OS.Path.join(
    expectedPath, gLogger.getNewLogFileName("format", dummyTwitterConv.startDate));
  equal(path, expectedPath);
}

let test_appendToFile = function* () {
  const kStringToWrite = "Hello, world!";
  let path = OS.Path.join(OS.Constants.Path.profileDir, "testFile.txt");
  let encoder = new TextEncoder();
  let encodedString = encoder.encode(kStringToWrite);
  gLogger.appendToFile(path, encodedString);
  encodedString = encoder.encode(kStringToWrite);
  gLogger.appendToFile(path, encodedString);
  let text = (new TextDecoder()).decode(
    yield gLogger.queueFileOperation(path, () => OS.File.read(path)));
  // The read text should be equal to kStringToWrite repeated twice.
  equal(text, kStringToWrite + kStringToWrite);
  yield OS.File.remove(path);
}

// Tests the getLogPathForConversation API defined in the imILogger interface.
let test_getLogPathForConversation = function* () {
  let logger = new gLogger.Logger();
  let path = yield logger.getLogPathForConversation(dummyConv);
  // The path should be null since a LogWriter hasn't been created yet.
  equal(path, null);
  let logWriter = gLogger.getLogWriter(dummyConv);
  path = yield logger.getLogPathForConversation(dummyConv);
  equal(path, logWriter.path);
  ok(yield OS.File.exists(path));
  // Ensure this doesn't interfere with future tests.
  yield OS.File.remove(path);
  gLogger.closeLogWriter(dummyConv);
}

let test_logging = function* () {
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
        outgoing: true
      },
      {
        time: startTime + 2,
        who: "personB",
        displayMessage: "Hello!",
        incoming: true
      },
      {
        time: startTime + 3,
        who: "personA",
        displayMessage: "What's up?",
        outgoing: true
      },
      {
        time: startTime + 4,
        who: "personB",
        displayMessage: "Nothing much!",
        incoming: true
      }
    ];
  }
  let firstDayMsgs = getMsgsForConv(dummyConv);
  let secondDayMsgs = getMsgsForConv(dummyConv2);

  let logMessagesForConv = Task.async(function* (aConv, aMessages) {
    let logWriter = gLogger.getLogWriter(aConv);
    for (let message of aMessages)
      logWriter.logMessage(message);
    // If we don't wait for the messages to get written, we have no guarantee
    // later in the test that the log files were created, and getConversation
    // will return an EmptyEnumerator. Logging the messages is queued on the
    // _initialized promise, so we need to yield on that first.
    yield logWriter._initialized;
    yield gLogger.gFilePromises.get(logWriter.path);
    // Ensure two different files for the different dates.
    gLogger.closeLogWriter(aConv);
  });
  yield logMessagesForConv(dummyConv, firstDayMsgs);
  yield logMessagesForConv(dummyConv2, secondDayMsgs);

  // Write a zero-length file and a file with incorrect JSON for each day
  // to ensure they are handled correctly.
  let logDir = OS.Path.dirname(yield gLogger.getLogFilePathForConversation(dummyConv, "json"));
  let createBadFiles = Task.async(function* (aConv) {
    let blankFile = OS.Path.join(logDir,
      gLogger.getNewLogFileName("json", aConv.startDate + oneSec));
    let invalidJSONFile = OS.Path.join(logDir,
      gLogger.getNewLogFileName("json", aConv.startDate + (2 * oneSec)));
    let file = yield OS.File.open(blankFile, {truncate: true});
    yield file.close();
    yield OS.File.writeAtomic(invalidJSONFile,
                              new TextEncoder().encode("This isn't JSON!"));
  });
  yield createBadFiles(dummyConv);
  yield createBadFiles(dummyConv2);

  let testMsgs = function (aMsgs, aExpectedMsgs, aExpectedSessions) {
    // Ensure the number of session messages is correct.
    let sessions = aMsgs.filter(aMsg => aMsg.who == "sessionstart").length;
    equal(sessions, aExpectedSessions);

    // Discard session messages, etc.
    aMsgs = aMsgs.filter(aMsg => !aMsg.noLog);

    equal(aMsgs.length, aExpectedMsgs.length);

    for (let i = 0; i < aMsgs.length; ++i) {
      let message = aMsgs[i], expectedMessage = aExpectedMsgs[i];
      for (let prop in expectedMessage) {
        ok(prop in message);
        equal(expectedMessage[prop], message[prop]);
      }
    }
  };

  let logs = yield logger.getLogsForConversation(dummyConv);
  let allLogMsgs = [];
  while (logs.hasMoreElements()) {
    let conv = yield logs.getNext().getConversation();
    if (!conv)
      continue;
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
  }

  // Group expected messages by day.
  let messagesByDay = new Map();
  messagesByDay.set(reduceTimeToDate(firstDayMsgs[0].time), firstDayMsgs);
  messagesByDay.set(reduceTimeToDate(secondDayMsgs[0].time), secondDayMsgs);

  logs = yield logger.getLogsForConversation(dummyConv, true);
  while (logs.hasMoreElements()) {
    let log = logs.getNext();
    let conv = yield log.getConversation();
    let date = reduceTimeToDate(log.time);
    // 3 session messages - for daily logs, bad files are included.
    testMsgs(conv.getMessages(), messagesByDay.get(date), 3);
  }

  // Remove the created log files, testing forEach in the process.
  yield logger.forEach({
    processLog: Task.async(function* (aLog) {
      let info = yield OS.File.stat(aLog);
      ok(!info.isDir);
      ok(aLog.endsWith(".json"));
      yield OS.File.remove(aLog);
    })
  });
  let logFolder = OS.Path.dirname(gLogger.getLogFilePathForConversation(dummyConv));
  // The folder should now be empty - this will throw if it isn't.
  yield OS.File.removeEmptyDir(logFolder, {ignoreAbsent: false});
}

function run_test() {
  // Test encodeName().
  for (let i = 0; i < encodeName_input.length; ++i)
    equal(gLogger.encodeName(encodeName_input[i]), encodeName_output[i]);

  // Test convIsRealMUC().
  ok(!gLogger.convIsRealMUC(dummyConv));
  ok(!gLogger.convIsRealMUC(dummyTwitterConv));
  ok(gLogger.convIsRealMUC(dummyMUC));

  add_task(test_getLogFolderPathForAccount);

  add_task(test_getLogFilePathForConversation);

  add_task(test_getLogFilePathForMUC);

  add_task(test_getLogFilePathForTwitterConv);

  add_task(test_queueFileOperation);

  add_task(test_appendToFile);

  add_task(test_getLogPathForConversation);

  add_task(test_logging);

  run_next_test();
}
