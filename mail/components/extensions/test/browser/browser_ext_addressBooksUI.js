/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testUI() {
  async function background() {
    async function checkNumberOfAddressBookTabs(expectedNumberOfTabs) {
      const addressBookTabs = await browser.tabs.query({ type: "addressBook" });
      browser.test.assertEq(
        expectedNumberOfTabs,
        addressBookTabs.length,
        "Should find the correct number of open address book tabs"
      );
    }

    const addedTabs = new Set();
    let removedTabs = 0;
    function tabCreateListener(tab) {
      if (tab.type == "addressBook") {
        addedTabs.add(tab.id);
      } else {
        browser.test.fail(
          "Should not receive a onTabCreated event for a non address book tab"
        );
      }
    }

    function tabRemoveListener(tabId) {
      console.log("Remove: " + tabId);
      if (addedTabs.has(tabId)) {
        removedTabs++;
      } else {
        browser.test.fail(
          "Should not receive a onTabRemoved event for a non address book tab"
        );
      }
    }

    browser.tabs.onCreated.addListener(tabCreateListener);
    browser.tabs.onRemoved.addListener(tabRemoveListener);

    await window.sendMessage("checkNumberOfAddressBookTabs", 0);
    await checkNumberOfAddressBookTabs(0);

    const abTab1 = await browser.addressBooks.openUI();
    browser.test.log(JSON.stringify(abTab1));
    browser.test.assertEq(
      "addressBook",
      abTab1.type,
      "Should have found an addressBook tab"
    );
    await window.sendMessage("checkNumberOfAddressBookTabs", 1);
    await checkNumberOfAddressBookTabs(1);

    await browser.addressBooks.openUI();
    const abTab2 = await browser.addressBooks.openUI();
    browser.test.log(JSON.stringify(abTab2));
    browser.test.assertEq(
      "addressBook",
      abTab2.type,
      "Should have found an addressBook tab"
    );
    await window.sendMessage("checkNumberOfAddressBookTabs", 1);
    await checkNumberOfAddressBookTabs(1);

    browser.test.assertEq(
      abTab1.id,
      abTab2.id,
      "addressBook tabs should be identical"
    );

    await browser.addressBooks.closeUI();
    await window.sendMessage("checkNumberOfAddressBookTabs", 0);
    await checkNumberOfAddressBookTabs(0);

    browser.tabs.onCreated.removeListener(tabCreateListener);
    browser.tabs.onRemoved.removeListener(tabRemoveListener);

    browser.test.assertEq(
      1,
      removedTabs,
      "Should have seen the correct number of address book tabs being removed"
    );

    browser.test.assertEq(
      1,
      addedTabs.size,
      "Should have seen the correct number of address book tabs being added"
    );

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

  extension.onMessage("checkNumberOfAddressBookTabs", count => {
    const tabmail = document.getElementById("tabmail");
    const tabs = tabmail.tabInfo.filter(
      tab => tab.browser?.currentURI.spec == "about:addressbook"
    );
    Assert.equal(tabs.length, count, "Right number of address books open");
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("addressBooks");
  await extension.unload();
});
