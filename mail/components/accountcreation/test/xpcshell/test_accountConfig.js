/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);

add_task(function test_isOauthOnly() {
  const config = new AccountConfig();

  Assert.ok(!config.isOauthOnly(), "Should initially not be oAuth only");

  config.incoming.auth = Ci.nsMsgAuthMethod.OAuth2;

  Assert.ok(
    !config.isOauthOnly(),
    "One of two servers should still not be oAuth only"
  );

  config.outgoing.auth = Ci.nsMsgAuthMethod.OAuth2;

  Assert.ok(
    config.isOauthOnly(),
    "When both incoming and outgoing use oauth, the config should be oAuth only"
  );
});

add_task(function test_hasPassword() {
  const config = new AccountConfig();

  Assert.ok(!config.hasPassword(), "Empty config should not have a password");

  config.incoming.password = "hunter2";

  Assert.ok(
    config.hasPassword(),
    "Should report having a password with incoming password set"
  );

  config.outgoing.password = "hunter2";

  Assert.ok(
    config.hasPassword(),
    "Should still report having a password with both passwords set"
  );

  config.incoming.password = "";

  Assert.ok(
    config.hasPassword(),
    "Should report a password with only the outgoing password set"
  );
});
