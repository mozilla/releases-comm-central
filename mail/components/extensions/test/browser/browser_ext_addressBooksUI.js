/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  async function background() {
    let awaitMessage = function(messageToSend, ...sendArgs) {
      return new Promise(resolve => {
        browser.test.onMessage.addListener(function listener(...args) {
          browser.test.onMessage.removeListener(listener);
          resolve(args);
        });
        if (messageToSend) {
          browser.test.sendMessage(messageToSend, ...sendArgs);
        }
      });
    };

    await awaitMessage("checkNumberOfAddressBookWindows", 0);

    await browser.addressBooks.openUI();
    await awaitMessage("checkNumberOfAddressBookWindows", 1);

    await browser.addressBooks.openUI();
    await awaitMessage("checkNumberOfAddressBookWindows", 1);

    await browser.addressBooks.closeUI();
    await awaitMessage("checkNumberOfAddressBookWindows", 0);

    browser.test.notifyPass("addressBooks");
  }

  let extension = ExtensionTestUtils.loadExtension({
    background,
    manifest: { permissions: ["addressBooks"] },
  });

  extension.onMessage("checkNumberOfAddressBookWindows", (count) => {
    is([...Services.wm.getEnumerator("mail:addressbook")].length, count, "Right number of address books open");
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("addressBooks");
  await extension.unload();
});
