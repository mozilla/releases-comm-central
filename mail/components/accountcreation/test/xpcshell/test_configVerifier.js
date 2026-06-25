/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);
const { ConfigVerifier } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/ConfigVerifier.sys.mjs"
);

/**
 * Drive a ConfigVerifier's tryNextLogon() with every attempt failing, and
 * record the username and auth method of each logon attempt it makes.
 *
 * @param {AccountConfig} config - The config to verify.
 * @returns {string[]} the attempted "username:authMethod" combinations, in
 *   order, including the initial attempt.
 */
function driveFailingLogons(config) {
  const verifier = new ConfigVerifier(null, new AbortController().signal);
  verifier.config = config;
  verifier.server = {
    username: config.incoming.username,
    password: config.incoming.password,
    authMethod: config.incoming.auth,
  };
  const attempts = [`${config.incoming.username}:${config.incoming.auth}`];
  let failed = false;
  verifier.verifyLogon = () => {
    attempts.push(`${config.incoming.username}:${config.incoming.auth}`);
  };
  verifier._failed = () => {
    failed = true;
  };
  // Each tryNextLogon() call simulates the previous attempt failing. Cap the
  // iterations so a regression to the old infinite loop fails the test
  // instead of hanging it.
  for (let i = 0; !failed && i < 20; i++) {
    verifier.tryNextLogon(null);
  }
  Assert.ok(failed, "Verifier should give up after trying all variations");
  return attempts;
}

/**
 * Set up the auth methods so there is one alternative to fall back to.
 *
 * @param {AccountConfig} config - The config to set up.
 */
function setupAuthMethods(config) {
  config.incoming.auth = Ci.nsMsgAuthMethod.passwordEncrypted;
  config.incoming.authAlternatives = [Ci.nsMsgAuthMethod.passwordCleartext];
  config.outgoing.auth = Ci.nsMsgAuthMethod.passwordEncrypted;
  config.outgoing.authAlternatives = [Ci.nsMsgAuthMethod.passwordCleartext];
}

add_task(function test_guessConfigLogonOrder() {
  const config = AccountConfig.guessConfigFromEmail("user@example.invalid");
  config.identity.emailAddress = "user@example.invalid";
  setupAuthMethods(config);

  const attempts = driveFailingLogons(config);
  const encrypted = Ci.nsMsgAuthMethod.passwordEncrypted;
  const cleartext = Ci.nsMsgAuthMethod.passwordCleartext;
  Assert.deepEqual(
    attempts,
    [
      `user@example.invalid:${encrypted}`,
      `user:${encrypted}`,
      `user:${cleartext}`,
      `user@example.invalid:${cleartext}`,
    ],
    "Should try the full e-mail address before the local part, both usernames per auth method, with no duplicate attempts"
  );
});

add_task(function test_localPartConfigLogonOrder() {
  const config = new AccountConfig();
  config.incoming.username = "user";
  config.outgoing.username = "user";
  config.identity.emailAddress = "user@example.invalid";
  setupAuthMethods(config);

  const attempts = driveFailingLogons(config);
  const encrypted = Ci.nsMsgAuthMethod.passwordEncrypted;
  const cleartext = Ci.nsMsgAuthMethod.passwordCleartext;
  Assert.deepEqual(
    attempts,
    [
      `user:${encrypted}`,
      `user@example.invalid:${encrypted}`,
      `user:${cleartext}`,
      `user@example.invalid:${cleartext}`,
    ],
    "Should fall back to the full e-mail address, both usernames per auth method, with no duplicate attempts"
  );
});
