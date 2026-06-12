/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { ConfigVerifier } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/ConfigVerifier.sys.mjs"
);

const PREF_NAME = "mailnews.auto_config_url";

add_setup(async function () {
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_NAME, url]],
  });
});

add_task(async function test_gssapi_account_skips_password_step() {
  await subtest_passwordless_account_skips_password_step({
    email: "john.doe@gssapi.test",
    expectedAuthLabelId: "account-hub-result-auth-gssapi",
    incomingAuthMethod: Ci.nsMsgAuthMethod.GSSAPI,
    outgoingAuthMethod: Ci.nsMsgAuthMethod.GSSAPI,
  });
});

add_task(async function test_mixed_passwordless_account_skips_password_step() {
  await subtest_passwordless_account_skips_password_step({
    email: "john.doe@mixed-passwordless.test",
    expectedAuthLabelId: "account-hub-result-auth-oauth2",
    incomingAuthMethod: Ci.nsMsgAuthMethod.OAuth2,
    outgoingAuthMethod: Ci.nsMsgAuthMethod.GSSAPI,
  });
});

add_task(async function test_no_auth_account_skips_password_step() {
  await subtest_passwordless_account_skips_password_step({
    email: "john.doe@oauth-no-auth.test",
    expectedAuthLabelId: "account-hub-result-auth-oauth2",
    incomingAuthMethod: Ci.nsMsgAuthMethod.OAuth2,
    outgoingAuthMethod: Ci.nsMsgAuthMethod.none,
  });
});

async function subtest_passwordless_account_skips_password_step({
  email,
  expectedAuthLabelId,
  incomingAuthMethod,
  outgoingAuthMethod,
}) {
  const verifyConfigStub = sinon
    .stub(ConfigVerifier.prototype, "verifyConfig")
    .callsFake(config => Promise.resolve(config));

  const emailUser = {
    name: "John Doe",
    email,
  };

  const dialog = await subtest_open_account_hub_dialog();
  await subtest_fill_initial_config_fields(dialog, emailUser);

  const footer = dialog.querySelector("account-hub-footer");
  const footerForward = footer.querySelector("#forward");
  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () =>
      configFoundTemplate.querySelector("#imap") &&
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option should be visible"
  );

  Assert.equal(
    configFoundTemplate.l10n.getAttributes(
      configFoundTemplate.querySelector("#authenticationType")
    ).id,
    expectedAuthLabelId,
    "Should show expected authentication type on IMAP config."
  );

  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  Assert.ok(
    BrowserTestUtils.isHidden(dialog.querySelector("email-password-form")),
    "The email password form should not be visible."
  );

  const successStep = dialog.querySelector("email-added-success");
  await BrowserTestUtils.waitForAttributeRemoval("hidden", successStep);

  Assert.ok(
    verifyConfigStub.calledOnce,
    "Should verify the GSSAPI config once."
  );

  const imapAccount = MailServices.accounts.accounts.find(
    account => account.defaultIdentity?.email === emailUser.email
  );

  Assert.ok(imapAccount, "IMAP account should be created.");
  Assert.equal(
    imapAccount.incomingServer.authMethod,
    incomingAuthMethod,
    "Incoming server should use the expected passwordless auth method."
  );

  const smtpServer = MailServices.outgoingServer.getServerByKey(
    imapAccount.defaultIdentity.smtpServerKey
  );
  Assert.equal(
    smtpServer.authMethod,
    outgoingAuthMethod,
    "Outgoing server should use the expected passwordless auth method."
  );

  MailServices.accounts.removeAccount(imapAccount);
  MailServices.outgoingServer.deleteServer(smtpServer);
  await Services.logins.removeAllLoginsAsync();
  verifyConfigStub.restore();
  await subtest_close_account_hub_dialog(dialog, successStep);
}
