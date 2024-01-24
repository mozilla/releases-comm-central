/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { QuotaServer } = ChromeUtils.importESModule(
  "resource://testing-common/IMAPServer.sys.mjs"
);

let imapServer;

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
let imapRootFolder, imapFolder;

add_setup(async function () {
  imapServer = new QuotaServer(this);

  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapAccount.incomingServer = MailServices.accounts.createIncomingServer(
    `${imapAccount.key}user`,
    "localhost",
    "imap"
  );
  imapAccount.incomingServer.port = imapServer.port;
  imapAccount.incomingServer.username = "user";
  imapAccount.incomingServer.password = "password";
  imapAccount.incomingServer.deleteModel = Ci.nsMsgImapDeleteModels.IMAPDelete;
  imapRootFolder = imapAccount.incomingServer.rootFolder;
  imapFolder = imapRootFolder
    .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox)
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  registerCleanupFunction(async () => {
    await promiseServerIdle(imapAccount.incomingServer);
    MailServices.accounts.removeAccount(imapAccount, false);
  });
});

add_task(async function () {
  const quotaPanel = document.getElementById("quotaPanel");

  // Load the folder with no quota.

  about3Pane.displayFolder(imapFolder);
  Assert.ok(BrowserTestUtils.isHidden(quotaPanel), "panel should be hidden");

  // Reload the folder with usage below mail.quota.mainwindow_threshold.show.

  about3Pane.displayFolder(imapRootFolder);
  Assert.ok(BrowserTestUtils.isHidden(quotaPanel), "panel should be hidden");

  await updateQuota(20, 123);
  about3Pane.displayFolder(imapFolder);
  Assert.ok(BrowserTestUtils.isHidden(quotaPanel), "panel should be hidden");

  // Reload the folder with usage above mail.quota.mainwindow_threshold.show
  // but below mail.quota.mainwindow_threshold.warning.

  about3Pane.displayFolder(imapRootFolder);
  Assert.ok(BrowserTestUtils.isHidden(quotaPanel), "panel should be hidden");

  await updateQuota(98, 123);
  about3Pane.displayFolder(imapFolder);
  checkStatus(79, "98.0 KB", "123 KB");

  // Reload the folder with usage above mail.quota.mainwindow_threshold.warning
  // but below mail.quota.mainwindow_threshold.critical.

  about3Pane.displayFolder(imapRootFolder);
  Assert.ok(BrowserTestUtils.isHidden(quotaPanel), "panel should be hidden");

  await updateQuota(105, 123);
  about3Pane.displayFolder(imapFolder);
  checkStatus(85, "105 KB", "123 KB", "alert-warning");

  about3Pane.displayFolder(imapRootFolder);
  Assert.ok(BrowserTestUtils.isHidden(quotaPanel), "panel should be hidden");

  // Reload the folder with usage above mail.quota.mainwindow_threshold.critical.

  await updateQuota(120, 123);
  about3Pane.displayFolder(imapFolder);
  checkStatus(97, "120 KB", "123 KB", "alert-critical");

  // Click on the status bar panel to open the folder properties dialog.

  const folderPropsPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://messenger/content/folderProps.xhtml",
    {
      async callback(win) {
        await SimpleTest.promiseFocus(win);

        const doc = win.document;
        const tabBox = doc.getElementById("folderPropTabBox");
        const quotaStatus = doc.getElementById("folderQuotaStatus");
        const quotaDetails = doc.getElementById("quotaDetails");
        const cancelButton = doc.querySelector("dialog").getButton("cancel");

        Assert.equal(
          tabBox.selectedPanel.id,
          "quotaPanel",
          "quota panel should be selected"
        );
        await TestUtils.waitForCondition(
          () => BrowserTestUtils.isHidden(quotaStatus),
          "waiting for quota UI to update"
        );
        Assert.ok(
          BrowserTestUtils.isVisible(quotaDetails),
          "quota details should be visible"
        );
        Assert.equal(
          quotaDetails.childElementCount,
          1,
          "one quota should be displayed"
        );

        const li = quotaDetails.firstElementChild;
        Assert.equal(li.querySelector("span").textContent, "STORAGE");
        Assert.equal(li.querySelector("progress").value, 120);
        Assert.equal(li.querySelector("progress").max, 123);
        Assert.deepEqual(
          document.l10n.getAttributes(li.querySelector("span:nth-child(3)")),
          { id: "quota-percent-used", args: { percent: 97 } }
        );
        Assert.equal(
          li.querySelector("span:nth-child(4)").textContent,
          "120 KB / 123 KB"
        );

        cancelButton.click();
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(quotaPanel, {}, window);
  await folderPropsPromise;
});

async function updateQuota(usage, limit) {
  // Drain the event queue so that the folder just displayed starts to use the
  // IMAP connection.
  await TestUtils.waitForTick();
  await promiseServerIdle(imapFolder.server);
  imapServer.setQuota(imapFolder, "STORAGE", usage, limit);
  // Force the folder to be updated from the server.
  await new Promise(resolve =>
    imapFolder.updateFolderWithListener(window.msgWindow, {
      OnStartRunningUrl() {},
      OnStopRunningUrl() {
        resolve();
      },
    })
  );
  await TestUtils.waitForCondition(
    () => imapFolder.getQuota().length == 1,
    "waiting for the folder to have a quota"
  );
}

function checkStatus(percent, usage, limit, className) {
  const quotaPanel = document.getElementById("quotaPanel");
  const quotaMeter = document.getElementById("quotaMeter");
  const quotaLabel = document.getElementById("quotaLabel");

  Assert.ok(
    BrowserTestUtils.isVisible(quotaPanel),
    "status bar panel should be visible"
  );
  Assert.equal(
    quotaMeter.value,
    percent,
    "meter should have the correct value"
  );
  Assert.equal(quotaMeter.max, 100, "meter should have the correct maximum");
  Assert.deepEqual(
    document.l10n.getAttributes(quotaLabel),
    {
      id: "quota-panel-percent-used",
      args: { percent, usage, limit },
    },
    "label should have the correct text"
  );
  Assert.equal(
    quotaPanel.classList.contains("alert-warning"),
    className == "alert-warning",
    "panel should have the correct classes"
  );
  Assert.equal(
    quotaPanel.classList.contains("alert-critical"),
    className == "alert-critical",
    "panel should have the correct classes"
  );
}
