/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testWithNewUI() {
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

  extension.onMessage("checkNumberOfAddressBookWindows", count => {
    let tabmail = document.getElementById("tabmail");
    let tabs = tabmail.tabInfo.filter(
      tab => tab.browser?.currentURI.spec == "about:addressbook"
    );
    Assert.equal(tabs.length, count, "Right number of address books open");
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("addressBooks");
  await extension.unload();
});
