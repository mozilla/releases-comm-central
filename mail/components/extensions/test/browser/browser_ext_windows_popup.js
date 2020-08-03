/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  async function checkPopup(expected) {
    let popups = [...Services.wm.getEnumerator("mail:extensionPopup")];
    Assert.equal(popups.length, 1);

    let popup = popups[0];

    let popupBrowser = popup.getBrowser();
    Assert.ok(popupBrowser);
    if (popupBrowser.contentDocument.readyState != "complete") {
      await BrowserTestUtils.browserLoaded(popupBrowser);
    }
    let popupBody = popupBrowser.contentDocument.body;
    Assert.ok(popupBody);
    let computedStyle = popupBrowser.contentWindow.getComputedStyle(popupBody);

    if ("backgroundColor" in expected) {
      Assert.equal(computedStyle.backgroundColor, expected.backgroundColor);
    }
    if ("textContent" in expected) {
      Assert.equal(popupBody.textContent, expected.textContent);
    }
  }

  async function background() {
    function sendMessageGetReply() {
      return new Promise(resolve => {
        browser.test.onMessage.addListener(function listener() {
          browser.test.onMessage.removeListener(listener);
          resolve();
        });
        browser.test.sendMessage();
      });
    }

    let popup = await browser.windows.create({
      url: "test.html",
      type: "popup",
    });
    browser.test.assertEq(1, popup.tabs.length);
    let tab = popup.tabs[0];

    await sendMessageGetReply();
    await browser.tabs.insertCSS(tab.id, { code: "body { background: lime }" });
    await sendMessageGetReply();
    await browser.tabs.removeCSS(tab.id, { code: "body { background: lime }" });
    await sendMessageGetReply();
    await browser.tabs.executeScript(tab.id, {
      code: `document.body.textContent = "Hey look, the script ran!";`,
    });
    await sendMessageGetReply();

    await browser.tabs.remove(tab.id);
    browser.test.notifyPass();
  }

  let extension = ExtensionTestUtils.loadExtension({
    background,
    files: {
      "test.html": "<html><body></body></html>",
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkPopup({ backgroundColor: "rgba(0, 0, 0, 0)", textContent: "" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkPopup({ backgroundColor: "rgb(0, 255, 0)" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkPopup({ backgroundColor: "rgba(0, 0, 0, 0)" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkPopup({ textContent: "Hey look, the script ran!" });
  extension.sendMessage();

  await extension.awaitFinish();
  await extension.unload();
});
