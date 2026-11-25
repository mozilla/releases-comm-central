/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MailMigrator } = ChromeUtils.importESModule(
  "resource:///modules/MailMigrator.sys.mjs"
);

/**
 * Returns the principal for a stored sender permission.
 *
 * @param {string} address - The sender address, including its original domain.
 * @returns {nsIPrincipal} The sender permission principal.
 */
function senderPrincipal(address) {
  return Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(`chrome://messenger/content/email=${address}`),
    {}
  );
}

add_task(function test_migrateSenderPermissions() {
  const allow = Services.perms.ALLOW_ACTION;
  const deny = Services.perms.DENY_ACTION;
  const originals = [
    ["alice@EXAMPLE.COM", deny],
    ["alice@example.com", allow],
    ["bob@EXAMPLE.COM", allow],
    ["bob@example.com", deny],
    ["Alice@EXAMPLE.COM", allow],
    ["reader@BÜCHER.example", deny],
    ["reader@xn--bcher-kva.example", allow],
    ["other@BÜCHER.example", allow],
    ["*@EXAMPLE.COM", deny],
    ["alice*test@EXAMPLE.COM", allow],
    ["alice%tag@EXAMPLE.COM", allow],
    ["literal@[127.0.0.1]", deny],
  ];
  const expected = [
    ["alice@example.com", deny],
    ["bob@example.com", deny],
    ["Alice@example.com", allow],
    ["reader@xn--bcher-kva.example", deny],
    ["other@xn--bcher-kva.example", allow],
    ["*@example.com", deny],
    ["alice*test@example.com", allow],
    ["alice%tag@example.com", allow],
    ["literal@[127.0.0.1]", deny],
  ];
  registerCleanupFunction(() => {
    Services.perms.removeAll();
    Services.prefs.clearUserPref("mail.ui-rdf.version");
  });
  for (const [address, capability] of originals) {
    Services.perms.addFromPrincipal(
      senderPrincipal(address),
      "image",
      capability
    );
  }
  const site = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI("https://example.com"),
    {}
  );
  Services.perms.addFromPrincipal(site, "image", allow);
  Services.perms.addFromPrincipal(
    senderPrincipal("cookie@EXAMPLE.COM"),
    "cookie",
    deny
  );

  Services.prefs.setIntPref("mail.ui-rdf.version", 67);
  MailMigrator._migrateUI();
  Assert.greaterOrEqual(
    Services.prefs.getIntPref("mail.ui-rdf.version"),
    68,
    "The migration should advance the profile version"
  );

  for (const [address, capability] of expected) {
    Assert.equal(
      Services.perms.testExactPermissionFromPrincipal(
        senderPrincipal(address),
        "image"
      ),
      capability,
      `${address} should retain the expected sender permission`
    );
  }
  const canonicalAddresses = new Set(expected.map(([address]) => address));
  for (const [address] of originals) {
    if (!canonicalAddresses.has(address)) {
      Assert.equal(
        Services.perms.testExactPermissionFromPrincipal(
          senderPrincipal(address),
          "image"
        ),
        Services.perms.UNKNOWN_ACTION,
        "Legacy aliases should be removed after migration"
      );
    }
  }
  Assert.equal(
    Services.perms.testExactPermissionFromPrincipal(site, "image"),
    allow,
    "Image-host permissions should remain unchanged"
  );
  Assert.equal(
    Services.perms.testExactPermissionFromPrincipal(
      senderPrincipal("cookie@EXAMPLE.COM"),
      "cookie"
    ),
    deny,
    "Other permission types should remain unchanged"
  );

  Services.perms.addFromPrincipal(
    senderPrincipal("alice@example.com"),
    "image",
    allow
  );
  MailMigrator._migrateUI();
  Assert.equal(
    Services.perms.testExactPermissionFromPrincipal(
      senderPrincipal("alice@example.com"),
      "image"
    ),
    allow,
    "Migration should not rerun after a user changes a canonical permission"
  );
});
