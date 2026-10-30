/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const alerts = [];
let daemon;
let server;
let incomingServer;
let messageIndex = 0;
let canEnforceReadOnly = false;

add_setup(function () {
  localAccountUtils.loadLocalMailAccount(
    "@mozilla.org/msgstore/berkeleystore;1"
  );
  [daemon, server] = setupServerDaemon();
  server.start();
  registerCleanupFunction(() => server.stop());
  incomingServer = createPop3ServerAndLocalFolders(server.port);

  const probe = do_get_profile().clone();
  probe.append("filter-read-only-probe");
  probe.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
  try {
    probe.permissions = 0o400;
    canEnforceReadOnly = !probe.isWritable();
  } finally {
    probe.permissions = 0o600;
    probe.remove(false);
  }
  if (!canEnforceReadOnly) {
    info(
      "Read-only tests require enforced file permissions; locked-folder tests still run."
    );
  }

  const listener = {
    QueryInterface: ChromeUtils.generateQI(["nsIMsgUserFeedbackListener"]),
    onAlert(message) {
      alerts.push(message);
      return true;
    },
  };
  MailServices.mailSession.addUserFeedbackListener(listener);
  registerCleanupFunction(() => {
    MailServices.mailSession.removeUserFeedbackListener(listener);
  });
});

/**
 * Download a message whose incoming filter cannot write to its destination.
 *
 * @param {boolean} loggingEnabled - Whether to enable filter logging.
 * @param {"locked"|"read-only"} failure - The destination failure to exercise.
 */
async function checkFailedMove(loggingEnabled, failure) {
  const inbox = localAccountUtils.inboxFolder;
  const target = localAccountUtils.rootFolder.createLocalSubfolder(
    `${failure}-${++messageIndex}`
  );
  const messageId = `pop3-failure-${messageIndex}@example.invalid`;
  const filterList = incomingServer.getFilterList();
  filterList.clearLog();
  filterList.loggingEnabled = loggingEnabled;
  const filter = filterList.createFilter(`Failing destination ${messageIndex}`);
  filter.enabled = true;
  filter.filterType = Ci.nsMsgFilterType.InboxRule;
  const term = filter.createTerm();
  term.matchAll = true;
  filter.appendTerm(term);
  const action = filter.createAction();
  action.type = Ci.nsMsgFilterAction.MoveToFolder;
  action.targetFolderUri = target.URI;
  filter.appendAction(action);
  filterList.insertFilterAt(0, filter);

  const file = target.filePath;
  const permissions = file.permissions;
  const originalCount = inbox.getTotalMessages(false);
  alerts.length = 0;
  try {
    if (failure == "read-only") {
      file.permissions = 0o400;
      Assert.ok(!file.isWritable(), "The destination should be read-only");
    } else {
      target.acquireSemaphore(inbox, "Incoming filter failure test");
    }

    daemon.setMessages([
      {
        fileData:
          "From: sender@example.invalid\r\n" +
          "To: recipient@example.invalid\r\n" +
          "Subject: Incoming filter failure\r\n" +
          `Message-ID: <${messageId}>\r\n` +
          "\r\nThe message body should survive the failed move.\r\n",
      },
    ]);
    const listener = new PromiseTestUtils.PromiseUrlListener();
    MailServices.pop3.GetNewMail(null, listener, inbox, incomingServer);
    await listener.promise;

    Assert.equal(
      inbox.getTotalMessages(false),
      originalCount + 1,
      "The downloaded message should remain in the Inbox after the failed move"
    );
    Assert.equal(
      target.getTotalMessages(false),
      0,
      "The failed move should not add a destination message"
    );
    const message = [...inbox.messages].find(hdr => hdr.messageId == messageId);
    Assert.ok(message, "The Inbox should retain the downloaded message header");
    const content = mailTestUtils.loadMessageToString(inbox, message);
    Assert.ok(
      content.includes("The message body should survive the failed move."),
      "The Inbox should retain the downloaded message body"
    );

    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/messenger.properties"
    );
    const folderName = bundle.formatStringFromName("verboseFolderFormat", [
      target.prettyPath,
      localAccountUtils.incomingServer.prettyName,
    ]);
    Assert.deepEqual(
      alerts,
      [
        bundle.formatStringFromName(
          failure == "read-only"
            ? "filterFolderWriteFailed"
            : "filterFolderDeniedLocked",
          [folderName]
        ),
      ],
      "The failed incoming move should report one alert describing its destination failure"
    );
  } finally {
    if (failure == "read-only") {
      file.permissions = permissions;
    } else {
      target.releaseSemaphore(inbox, "Incoming filter failure test");
    }
    filterList.loggingEnabled = false;
    filterList.removeFilter(filter);
  }

  const logFile = Services.io
    .newURI(filterList.logURL)
    .QueryInterface(Ci.nsIFileURL).file;
  const log = await IOUtils.readUTF8(logFile.path);
  const logDocument = new DOMParser().parseFromString(log, "text/html");
  const failures = [...logDocument.querySelectorAll("p")]
    .map(entry => entry.textContent)
    .filter(entry => /0x[0-9A-F]{8}/i.test(entry));
  Assert.equal(
    failures.length > 0,
    loggingEnabled,
    "Failure details should be recorded only when filter logging is enabled"
  );
  for (const entry of failures) {
    Assert.ok(
      entry.includes(filter.filterName),
      "The failure entry should identify the filter"
    );
    Assert.ok(
      entry.includes(target.URI),
      "The failure entry should identify the destination"
    );
    Assert.ok(
      entry.includes(messageId),
      "The failure entry should identify the affected message"
    );
  }
}

add_task(async function test_lockedMoveNoLogging() {
  await checkFailedMove(false, "locked");
});

add_task(async function test_lockedMoveWithLogging() {
  await checkFailedMove(true, "locked");
});

add_task(
  { skip_if: () => !canEnforceReadOnly },
  async function test_readOnlyMoveWithLogging() {
    await checkFailedMove(true, "read-only");
  }
);
