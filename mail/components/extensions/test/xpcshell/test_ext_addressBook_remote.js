/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
var { LDAPServer } = ChromeUtils.import(
  "resource://testing-common/LDAPServer.jsm"
);

add_setup(async () => {
  // If nsIAbLDAPDirectory doesn't exist in our build options, someone has
  // specified --disable-ldap.
  if (!("nsIAbLDAPDirectory" in Ci)) {
    return;
  }
  Services.prefs.setIntPref("ldap_2.servers.osx.dirType", -1);

  LDAPServer.open();

  // Create an LDAP directory.
  MailServices.ab.newAddressBook(
    "test",
    `ldap://localhost:${LDAPServer.port}/people??sub?(objectclass=*)`,
    Ci.nsIAbManager.LDAP_DIRECTORY_TYPE
  );

  registerCleanupFunction(() => {
    LDAPServer.close();
    // Make sure any open database is given a chance to close.
    Services.startup.advanceShutdownPhase(
      Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
    );
  });
});

add_task(async function test_addressBooks_remote() {
  async function background() {
    const list = await browser.addressBooks.list();

    // The remote AB should be in the list.
    const remoteAB = list.find(ab => ab.name == "test");
    browser.test.assertTrue(!!remoteAB, "Should have found the address book");

    browser.test.assertTrue(
      remoteAB.remote,
      "Should have marked the address book as remote"
    );

    const cards = await browser.contacts.quickSearch("eurus");
    browser.test.assertTrue(
      cards.length,
      "Should have found at least one card"
    );

    browser.test.assertTrue(
      cards[0].remote,
      "Should have marked the card as remote"
    );

    // Mailing lists are not supported for LDAP address books.

    browser.test.notifyPass("addressBooks");
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["addressBooks"],
    },
  });

  const startupPromise = extension.startup();

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry({
    dn: "uid=eurus,dc=bakerstreet,dc=invalid",
    attributes: {
      objectClass: "person",
      cn: "Eurus Holmes",
      givenName: "Eurus",
      mail: "eurus@bakerstreet.invalid",
      sn: "Holmes",
    },
  });
  LDAPServer.writeSearchResultDone();

  await startupPromise;
  await extension.awaitFinish("addressBooks");
  await extension.unload();
});
