/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests CreateInBackend functionality.
 */

const { CreateInBackend } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/CreateInBackend.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { EnterprisePolicyTesting } = ChromeUtils.importESModule(
  "resource://testing-common/EnterprisePolicyTesting.sys.mjs"
);

/**
 * Tests CreateInBackend.rememberPassword without the PrimaryPassword enterprise
 * policy set.
 */
add_task(async function testNoPrimaryPasswordPolicyRememberPasswordSaves() {
  Assert.ok(
    Services.policies.isAllowed("removeMasterPassword"),
    "removeMasterPassword should be allowed with PrimaryPassword policy"
  );

  const testServer = MailServices.accounts.createIncomingServer(
    "testuser",
    "test.example.com",
    "imap"
  );

  try {
    await CreateInBackend.rememberPassword(testServer, "testpassword");
    Assert.equal(
      (await Services.logins.getAllLogins()).length,
      1,
      "login should get saved"
    );
  } finally {
    MailServices.accounts.removeIncomingServer(testServer, true);
    await Services.logins.removeAllLoginsAsync();
  }
});

/**
 * Tests that the PrimaryPassword enterprise policy prevents saving a new mail
 * account password when no primary password is set, by prompting to set one.
 */
add_task(async function testPrimaryPasswordPolicyPreventsSave() {
  await EnterprisePolicyTesting.setupPolicyEngineWithJson({
    policies: { PrimaryPassword: true },
  });

  const pkcsToken = Cc[
    "@mozilla.org/security/internalkeytoken;1"
  ].createInstance(Ci.nsIPKCS11Token);
  Assert.ok(!pkcsToken.hasPassword, "no primary password should be set");
  Assert.ok(
    !Services.policies.isAllowed("removeMasterPassword"),
    "removeMasterPassword should be disallowed with PrimaryPassword policy"
  );

  const testServer = MailServices.accounts.createIncomingServer(
    "testuser",
    "test.example.com",
    "imap"
  );

  try {
    // With the policy active and no primary password, rememberPassword should
    // open the changemp.xhtml dialog. Cancelling must prevent save.
    const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
      undefined,
      "chrome://mozapps/content/preferences/changemp.xhtml",
      {
        async callback(win) {
          win.document.querySelector("dialog").getButton("cancel").click();
        },
      }
    );

    const savePromise = Promise.resolve().then(() =>
      CreateInBackend.rememberPassword(testServer, "testpassword")
    );
    await dialogPromise;
    await savePromise;

    Assert.equal(
      (await Services.logins.getAllLogins()).length,
      0,
      "no login should be saved when primary password dialog is cancelled"
    );
  } finally {
    MailServices.accounts.removeIncomingServer(testServer, true);
    await EnterprisePolicyTesting.setupPolicyEngineWithJson("");
    await Services.logins.removeAllLoginsAsync();
  }
});
