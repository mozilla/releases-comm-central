/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

var { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);

ExtensionTestUtils.mockAppInfo();
AddonTestUtils.maybeInit(this);

add_task(async function () {
  await AddonTestUtils.promiseStartupManager();

  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      // Persistent listeners.
      const id1 = "00e1d9af-a846-4ef5-a6ac-15e8926bf6d3";
      browser.addressBooks.provider.onSearchRequest.addListener(
        async (node, searchString) => {
          await browser.test.assertEq(
            id1,
            node.id,
            "Addressbook should have the id we requested"
          );
          return {
            results: [
              `BEGIN:VCARD
VERSION:3.0
FN;CHARSET=UTF-8:${searchString}
EMAIL;TYPE=PREF,INTERNET:${searchString}@example.com
END:VCARD`,
            ],
            isCompleteResult: true,
          };
        },
        {
          addressBookName: "xpcshell",
          isSecure: false,
          id: id1,
        }
      );
      browser.addressBooks.provider.onSearchRequest.addListener(
        async () => {
          await browser.test.assertTrue(
            false,
            "Should not have created a duplicate address book"
          );
        },
        {
          addressBookName: "xpcshell",
          isSecure: false,
          id: id1,
        }
      );

      await new Promise(r => window.setTimeout(r));

      // Non-persisting listeners (because after an await).
      const id2 = "9b9074ff-8fa4-4c58-9c3b-bc9ea2e17db1";
      const dummy = async () => {
        await browser.test.assertTrue(
          false,
          "Should have removed this address book"
        );
      };
      browser.addressBooks.provider.onSearchRequest.addListener(dummy, {
        addressBookName: "dummy",
        isSecure: false,
        id: id2,
      });
      browser.addressBooks.provider.onSearchRequest.removeListener(dummy);

      browser.test.sendMessage("ready");
    },
    manifest: {
      manifest_version: 3,
      browser_specific_settings: {
        gecko: { id: "provider_test@mochi.test" },
      },
      permissions: ["addressBooks"],
    },
  });

  await extension.startup();
  await extension.awaitMessage("ready");

  const dummyUID = "9b9074ff-8fa4-4c58-9c3b-bc9ea2e17db1";
  let searchBook = MailServices.ab.getDirectoryFromUID(dummyUID);
  Assert.equal(searchBook, null, "Dummy directory was removed by extension");

  const UID = "00e1d9af-a846-4ef5-a6ac-15e8926bf6d3";
  searchBook = MailServices.ab.getDirectoryFromUID(UID);
  Assert.notEqual(searchBook, null, "Extension registered an async directory");

  await new Promise(resolve => {
    let foundCards = 0;
    searchBook.search(null, "test", {
      onSearchFoundCard(card) {
        Assert.notEqual(card, null, "A card was found.");
        equal(card.directoryUID, UID, "The card comes from the directory.");
        equal(
          card.primaryEmail,
          "test@example.com",
          "The card has the correct email address."
        );
        equal(
          card.displayName,
          "test",
          "The card has the correct display name."
        );
        foundCards++;
      },
      onSearchFinished(status, isCompleteResult) {
        ok(Components.isSuccessCode(status), "Search finished successfully.");
        equal(foundCards, 1, "One card was found.");
        ok(isCompleteResult, "A full result set was received.");
        resolve();
      },
    });
  });

  const autoCompleteSearch = Cc[
    "@mozilla.org/autocomplete/search;1?name=addrbook"
  ].createInstance(Ci.nsIAutoCompleteSearch);
  await new Promise(resolve => {
    autoCompleteSearch.startSearch("test", null, null, {
      onSearchResult(aSearch, aResult) {
        equal(aSearch, autoCompleteSearch, "This is our search.");
        if (aResult.searchResult == Ci.nsIAutoCompleteResult.RESULT_SUCCESS) {
          equal(aResult.matchCount, 1, "One match was found.");
          equal(
            aResult.getValueAt(0),
            "test <test@example.com>",
            "The match had the expected value."
          );
          resolve();
        } else {
          equal(
            aResult.searchResult,
            Ci.nsIAutoCompleteResult.RESULT_NOMATCH_ONGOING,
            "We should be waiting for the extension's results."
          );
        }
      },
    });
  });

  // Terminate Background and prime listener.
  assertPersistentListeners(extension, "addressBook", "onSearchRequest", {
    primed: false,
  });
  await extension.terminateBackground({ disableResetIdleForTest: true });
  assertPersistentListeners(extension, "addressBook", "onSearchRequest", {
    primed: true,
  });

  // We should still be able to trigger our persistent listeners.
  await new Promise(resolve => {
    let foundCards = 0;
    searchBook.search(null, "otherTest", {
      onSearchFoundCard(card) {
        Assert.notEqual(card, null, "A card was found.");
        equal(card.directoryUID, UID, "The card comes from the directory.");
        equal(
          card.primaryEmail,
          "otherTest@example.com",
          "The card has the correct email address."
        );
        equal(
          card.displayName,
          "otherTest",
          "The card has the correct display name."
        );
        foundCards++;
      },
      onSearchFinished(status, isCompleteResult) {
        ok(Components.isSuccessCode(status), "Search finished successfully.");
        equal(foundCards, 1, "One card was found.");
        ok(isCompleteResult, "A full result set was received.");
        resolve();
      },
    });
  });

  // We should have received an additional "ready" message from the restarted
  // background script.
  await extension.awaitMessage("ready");

  await extension.unload();
  searchBook = MailServices.ab.getDirectoryFromUID(UID);
  Assert.equal(searchBook, null, "Extension directory removed after unload");
});

registerCleanupFunction(() => {
  // Make sure any open database is given a chance to close.
  Services.startup.advanceShutdownPhase(
    Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
  );
});
