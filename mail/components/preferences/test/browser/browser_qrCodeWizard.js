/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { QRExport } = ChromeUtils.importESModule(
  "resource:///modules/QRExport.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const accountKeys = [];
let browser, wizard, doc;

add_setup(async () => {
  for (let i = 0; i < 5; ++i) {
    const imapServer = MailServices.accounts.createIncomingServer(
      `imap${i}@foo.invalid`,
      "foo.invalid",
      "imap"
    );
    imapServer.password = "password";
    const imapIdentity = MailServices.accounts.createIdentity();
    imapIdentity.email = `imap${i}@foo.invalid`;
    const imapAccount = MailServices.accounts.createAccount();
    imapAccount.incomingServer = imapServer;
    imapAccount.addIdentity(imapIdentity);
    const imapOutgoing = MailServices.outgoingServer.createServer("smtp");
    imapIdentity.smtpServerKey = imapOutgoing.key;
    accountKeys.push(imapAccount.key);
  }

  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/preferences/test/browser/files/qrCodeWizard.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("qrCodeWizard.xhtml")
  );
  await SimpleTest.promiseFocus(tab.browser);
  browser = tab.browser;
  doc = browser.contentDocument;
  wizard = doc.querySelector("qr-code-wizard");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
    for (const accountKey of accountKeys) {
      const account = MailServices.accounts.getAccount(accountKey);
      MailServices.accounts.removeAccount(account, false);
    }
  });
});

add_task(async function test_initializeQRCodes_withPassword() {
  wizard.initializeQRCodes(accountKeys, true);
  const expectedQRCodes = QRExport.getQRCodes(accountKeys, true);

  Assert.ok(
    wizard.querySelector("img").src == expectedQRCodes[0],
    "Should display expected QR code with passwords"
  );
  const stepLabel = wizard.querySelector("figcaption");
  Assert.equal(
    stepLabel.dataset.l10nId,
    "qr-export-scan-progress",
    "Should show step label string"
  );
  Assert.deepEqual(
    JSON.parse(stepLabel.dataset.l10nArgs),
    {
      step: 1,
      count: 2,
    },
    "Should set string args to match step progress"
  );
});

add_task(async function test_initializeQRCodes_withoutPassword() {
  wizard.initializeQRCodes(accountKeys, false);
  const expectedQRCodes = QRExport.getQRCodes(accountKeys, false);

  Assert.ok(
    wizard.querySelector("img").src == expectedQRCodes[0],
    "Should display expected QR code without passwords"
  );
});

add_task(async function test_next() {
  wizard.initializeQRCodes(accountKeys, false);
  const expectedQRCodes = QRExport.getQRCodes(accountKeys, false);

  Assert.ok(wizard.next(), "Should successfully advance");

  Assert.ok(
    wizard.querySelector("img").src == expectedQRCodes[1],
    "Should advance to second QR code"
  );
  const stepLabel = wizard.querySelector("figcaption");
  Assert.equal(
    stepLabel.dataset.l10nId,
    "qr-export-scan-progress",
    "Should set label to progress string"
  );
  Assert.deepEqual(
    JSON.parse(stepLabel.dataset.l10nArgs),
    {
      step: 2,
      count: 2,
    },
    "Should update args for step 2"
  );

  Assert.ok(!wizard.next(), "Should not be able to advance any further");
});

add_task(async function test_back() {
  wizard.initializeQRCodes(accountKeys, false);
  const expectedQRCodes = QRExport.getQRCodes(accountKeys, false);
  wizard.next();

  Assert.ok(wizard.back(), "Should successfully go back");

  Assert.ok(
    wizard.querySelector("img").src == expectedQRCodes[0],
    "Should return to first QR code"
  );
  const stepLabel = wizard.querySelector("figcaption");
  Assert.equal(
    stepLabel.dataset.l10nId,
    "qr-export-scan-progress",
    "Should set label to progress string"
  );
  Assert.deepEqual(
    JSON.parse(stepLabel.dataset.l10nArgs),
    {
      step: 1,
      count: 2,
    },
    "Should update label args to reflect step 1"
  );

  Assert.ok(!wizard.back(), "Should not be able to go back any further");
});

add_task(function test_getTotalSteps() {
  wizard.initializeQRCodes(accountKeys, false);

  Assert.equal(wizard.getTotalSteps(), 2, "Should require two steps");

  wizard.initializeQRCodes(accountKeys.slice(0, 2), false);

  Assert.equal(wizard.getTotalSteps(), 1, "Should only need one step");

  wizard.initializeQRCodes([], false);

  Assert.equal(wizard.getTotalSteps(), 0, "Should not have any steps");
});
