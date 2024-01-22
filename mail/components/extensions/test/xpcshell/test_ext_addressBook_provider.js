/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

add_task(async function () {
  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      let id = "9b9074ff-8fa4-4c58-9c3b-bc9ea2e17db1";
      const dummy = async (node, searchString, query) => {
        await browser.test.assertTrue(
          false,
          "Should have removed this address book"
        );
      };
      await browser.addressBooks.provider.onSearchRequest.addListener(dummy, {
        addressBookName: "dummy",
        isSecure: false,
        id,
      });
      await browser.addressBooks.provider.onSearchRequest.removeListener(dummy);
      id = "00e1d9af-a846-4ef5-a6ac-15e8926bf6d3";
      await browser.addressBooks.provider.onSearchRequest.addListener(
        async (node, searchString, query) => {
          await browser.test.assertEq(
            id,
            node.id,
            "Addressbook should have the id we requested"
          );
          return {
            results: [
              {
                DisplayName: searchString,
                PrimaryEmail: searchString + "@example.com",
              },
            ],
            isCompleteResult: true,
          };
        },
        {
          addressBookName: "xpcshell",
          isSecure: false,
          id,
        }
      );
      await browser.addressBooks.provider.onSearchRequest.addListener(
        async (node, searchString, query) => {
          await browser.test.assertTrue(
            false,
            "Should not have created a duplicate address book"
          );
        },
        {
          addressBookName: "xpcshell",
          isSecure: false,
          id,
        }
      );
    },
    manifest: { permissions: ["addressBooks"] },
  });

  await extension.startup();

  const dummyUID = "9b9074ff-8fa4-4c58-9c3b-bc9ea2e17db1";
  let searchBook = MailServices.ab.getDirectoryFromUID(dummyUID);
  Assert.equal(searchBook, null, "Dummy directory was removed by extension");

  const UID = "00e1d9af-a846-4ef5-a6ac-15e8926bf6d3";
  searchBook = MailServices.ab.getDirectoryFromUID(UID);
  Assert.notEqual(searchBook, null, "Extension registered an async directory");

  let foundCards = 0;
  await new Promise(resolve => {
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
