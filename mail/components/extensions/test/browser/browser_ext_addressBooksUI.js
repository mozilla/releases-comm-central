/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

async function subTest(checkCallback) {
  async function background() {
    await window.sendMessage("checkNumberOfAddressBookWindows", 0);

    await browser.addressBooks.openUI();
    await window.sendMessage("checkNumberOfAddressBookWindows", 1);

    await browser.addressBooks.openUI();
    await window.sendMessage("checkNumberOfAddressBookWindows", 1);

    await browser.addressBooks.closeUI();
    await window.sendMessage("checkNumberOfAddressBookWindows", 0);

    browser.test.notifyPass("addressBooks");
  }
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["addressBooks"],
    },
  });

  extension.onMessage("checkNumberOfAddressBookWindows", count =>
    checkCallback(extension, count)
  );

  await extension.startup();
  await extension.awaitFinish("addressBooks");
  await extension.unload();
}

add_task(async function testWithOldUI() {
  Services.prefs.setBoolPref("mail.addr_book.useNewAddressBook", false);
  await subTest((extension, count) => {
    Assert.equal(
      [...Services.wm.getEnumerator("mail:addressbook")].length,
      count,
      "Right number of address books open"
    );
    extension.sendMessage();
  });
});

add_task(async function testWithNewUI() {
  Services.prefs.setBoolPref("mail.addr_book.useNewAddressBook", true);
  await subTest((extension, count) => {
    let tabmail = document.getElementById("tabmail");
    let tabs = tabmail.tabInfo.filter(
      tab => tab.browser?.currentURI.spec == "about:addressbook"
    );
    Assert.equal(tabs.length, count, "Right number of address books open");
    extension.sendMessage();
  });
});

registerCleanupFunction(() =>
  Services.prefs.clearUserPref("mail.addr_book.useNewAddressBook")
);
