/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that non-ASCII user names and passwords end up UTF-8 encoded in the
 * SASL tokens we send, see rfc4616#section-2.
 */

const { SmtpAuthenticator } = ChromeUtils.importESModule(
  "resource:///modules/MailAuthenticator.sys.mjs"
);

// "u<U+00FC>ser<U+20AC>" and "p<U+00E4>ss<U+20AC>", the euro sign making them
// unrepresentable in Latin-1.
const kUsername = "üser€";
const kPassword = "päss€";
const kUsernameUtf8 = "\xc3\xbcser\xe2\x82\xac";
const kPasswordUtf8 = "p\xc3\xa4ss\xe2\x82\xac";
// Same, but representable in Latin-1.
const kLatin1Username = "üser";
const kLatin1Password = "päss";

function createAuthenticator(username, password) {
  const server = getBasicSmtpServer();
  server.username = username;
  server.password = password;
  return new SmtpAuthenticator(server);
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("mail.smtp_login_pop3_user_pass_auth_is_latin1");
});

add_task(function testPlainToken() {
  const authenticator = createAuthenticator(kUsername, kPassword);
  Assert.equal(
    authenticator.getPlainToken(),
    btoa(`\0${kUsernameUtf8}\0${kPasswordUtf8}`),
    "AUTH PLAIN should send the user name and password as UTF-8"
  );
});

add_task(function testCramMd5TokenUserName() {
  const authenticator = createAuthenticator(kUsername, kPassword);
  const token = authenticator.getCramMd5Token(
    kPassword,
    btoa("<1234@localhost>")
  );
  Assert.equal(
    atob(token).split(" ")[0],
    kUsernameUtf8,
    "AUTH CRAM-MD5 should send the user name as UTF-8"
  );
});

/**
 * LOGIN auth is not standardized, so
 * `mail.smtp_login_pop3_user_pass_auth_is_latin1` keeps sending Latin-1 for
 * credentials which fit into Latin-1.
 */
add_task(function testLoginTokenLatin1() {
  Services.prefs.setBoolPref(
    "mail.smtp_login_pop3_user_pass_auth_is_latin1",
    true
  );
  const authenticator = createAuthenticator(kLatin1Username, kLatin1Password);
  Assert.equal(
    authenticator.getLoginUsernameToken(),
    btoa("\xfcser"),
    "AUTH LOGIN should send the Latin-1 user name as Latin-1"
  );
  Assert.equal(
    authenticator.getLoginPasswordToken(kLatin1Password),
    btoa("p\xe4ss"),
    "AUTH LOGIN should send the Latin-1 password as Latin-1"
  );
});

add_task(function testLoginTokenLatin1PrefOff() {
  Services.prefs.setBoolPref(
    "mail.smtp_login_pop3_user_pass_auth_is_latin1",
    false
  );
  const authenticator = createAuthenticator(kLatin1Username, kLatin1Password);
  Assert.equal(
    authenticator.getLoginUsernameToken(),
    btoa("\xc3\xbcser"),
    "AUTH LOGIN should send the user name as UTF-8"
  );
  Assert.equal(
    authenticator.getLoginPasswordToken(kLatin1Password),
    btoa("p\xc3\xa4ss"),
    "AUTH LOGIN should send the password as UTF-8"
  );
});

/**
 * Credentials which don't fit into Latin-1 must be sent as UTF-8 regardless of
 * the pref, since there is no other way to encode them.
 */
add_task(function testLoginTokenNonLatin1() {
  Services.prefs.setBoolPref(
    "mail.smtp_login_pop3_user_pass_auth_is_latin1",
    true
  );
  const authenticator = createAuthenticator(kUsername, kPassword);
  Assert.equal(
    authenticator.getLoginUsernameToken(),
    btoa(kUsernameUtf8),
    "AUTH LOGIN should send the non-Latin-1 user name as UTF-8"
  );
  Assert.equal(
    authenticator.getLoginPasswordToken(kPassword),
    btoa(kPasswordUtf8),
    "AUTH LOGIN should send the non-Latin-1 password as UTF-8"
  );
});
