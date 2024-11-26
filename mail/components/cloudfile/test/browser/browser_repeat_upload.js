/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../base/content/mailWindowOverlay.js */

const { cloudFileAccounts } = ChromeUtils.importESModule(
  "resource:///modules/cloudFileAccounts.sys.mjs"
);

const ICON_URL = getRootDirectory(gTestPath) + "files/icon.svg";
const MANAGEMENT_URL = getRootDirectory(gTestPath) + "files/management.html";

function getFileFromChromeURL(leafName) {
  const ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(
    Ci.nsIChromeRegistry
  );

  const url = Services.io.newURI(
    getRootDirectory(gTestPath) + "files/" + leafName
  );
  const fileURL = ChromeRegistry.convertChromeURL(url).QueryInterface(
    Ci.nsIFileURL
  );
  return fileURL.file;
}

add_task(async () => {
  let uploadedFiles = [];
  const provider = {
    type: "Mochitest",
    displayName: "Mochitest",
    iconURL: ICON_URL,
    initAccount(accountKey) {
      return {
        accountKey,
        type: "Mochitest",
        get displayName() {
          return Services.prefs.getCharPref(
            `mail.cloud_files.accounts.${this.accountKey}.displayName`,
            "Mochitest Account"
          );
        },
        getPreviousUploads() {
          return uploadedFiles;
        },
        urlForFile(file) {
          return "https://mochi.test/" + file.leafName;
        },
        iconURL: ICON_URL,
        configured: true,
        managementURL: MANAGEMENT_URL,
        reuseUploads: true,
      };
    },
  };

  Assert.equal(
    cloudFileAccounts.configuredAccounts.length,
    0,
    "Should have no cloudfile accounts starting off."
  );

  cloudFileAccounts.registerProvider(provider.type, provider);
  const account = cloudFileAccounts.createAccount(provider.type);
  Assert.equal(
    cloudFileAccounts.configuredAccounts.length,
    1,
    "Should have only the one account we created."
  );

  const composeWindowPromise = BrowserTestUtils.domWindowOpened();
  MsgNewMessage();
  const composeWindow = await composeWindowPromise;
  await BrowserTestUtils.waitForEvent(composeWindow, "compose-editor-ready");
  await TestUtils.waitForCondition(
    () => Services.focus.activeWindow == composeWindow
  );
  const composeDocument = composeWindow.document;

  // Compose window loaded.
  // Check the attach dropdown has our account as a <menuitem>.

  const toolbarButton = composeDocument.getElementById("button-attach");
  const rect = toolbarButton.getBoundingClientRect();
  EventUtils.synthesizeMouse(
    toolbarButton,
    rect.width - 5,
    5,
    { clickCount: 1 },
    composeWindow
  );
  await promiseAnimationFrame(composeWindow);

  const menu = composeDocument.getElementById(
    "button-attachPopup_attachCloudMenu"
  );
  ok(!BrowserTestUtils.isHidden(menu));

  const popupshown = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(menu, { clickCount: 1 }, composeWindow);
  await popupshown;

  Assert.equal(
    cloudFileAccounts.configuredAccounts.length,
    1,
    "Should still have one registered account."
  );

  let menuitems = menu.menupopup.children;
  is(menuitems.length, 1);
  is(menuitems[0].getAttribute("image"), ICON_URL);
  is(menuitems[0].getAttribute("label"), "Mochitest Account\u2026");

  composeDocument.getElementById("button-attachPopup").hidePopup();

  // Pretend we uploaded some files before.

  uploadedFiles = [
    {
      id: 1,
      name: "green_eggs.txt",
      path: getFileFromChromeURL("green_eggs.txt").path,
      size: 30,
      url: "https://mochi.test/green_eggs.txt",
      serviceName: "MyCloud",
      serviceIcon: "chrome://messenger/skin/icons/globe.svg",
    },
    {
      id: 2,
      name: "ham.zip",
      path: getFileFromChromeURL("ham.zip").path,
      size: 1234,
      url: "https://mochi.test/ham.zip",
    },
  ];
  is(account.getPreviousUploads().length, 2);

  // Check the attach dropdown has our account as a <menu>.

  await new Promise(resolve => {
    toolbarButton.addEventListener("popupshown", resolve, { once: true });
    EventUtils.synthesizeMouse(
      toolbarButton,
      rect.width - 5,
      5,
      { clickCount: 1 },
      composeWindow
    );
  });
  info("toolbar button menu opened");
  await promiseAnimationFrame(composeWindow);

  await new Promise(resolve => {
    menu.menupopup.addEventListener("popupshown", resolve, { once: true });
    EventUtils.synthesizeMouseAtCenter(menu, { clickCount: 1 }, composeWindow);
  });
  info("file link menu opened");
  await promiseAnimationFrame(composeWindow);

  menuitems = menu.menupopup.children;
  is(menuitems.length, 2);
  is(menuitems[0].getAttribute("image"), ICON_URL);
  is(menuitems[0].getAttribute("label"), "Mochitest Account\u2026");
  is(menuitems[1].localName, "menuitem");
  is(menuitems[1].getAttribute("image"), "moz-icon://green_eggs.txt");
  is(menuitems[1].getAttribute("label"), "green_eggs.txt");
  // TODO: Enable this when we handle files that no longer exist on the filesystem.
  // is(menuitems[2].localName, "menuitem");
  // is(menuitems[2].getAttribute("image"), "moz-icon://ham.zip");
  // is(menuitems[2].getAttribute("label"), "ham.zip");

  // Select one of the previously-uploaded items and check the attachment is added.

  const bucket = composeDocument.getElementById("attachmentBucket");
  await new Promise(resolve => {
    bucket.addEventListener("attachments-added", resolve, { once: true });
    menu.menupopup.activateItem(menuitems[1]);
  });
  info("attachment added");
  await promiseAnimationFrame(composeWindow);
  Assert.strictEqual(toolbarButton.open, false);

  is(bucket.itemCount, 1);
  const attachment = bucket.itemChildren[0];
  is(attachment.getAttribute("name"), "green_eggs.txt");
  ok(attachment.attachment.sendViaCloud);
  is(attachment.attachment.cloudFileAccountKey, account.accountKey);
  is(
    attachment.attachment.contentLocation,
    "https://mochi.test/green_eggs.txt"
  );

  is(
    attachment.querySelector("img.attachmentcell-icon").src,
    uploadedFiles[0].serviceIcon,
    "CloudFile icon should be correct."
  );

  // Check the content of the editor for the added template.
  const editor = composeWindow.GetCurrentEditor();
  const urls = editor.document.querySelectorAll(
    "body > #cloudAttachmentListRoot > #cloudAttachmentList"
  );
  Assert.equal(urls.length, 1, "Found 1 FileLink template in the document.");

  // Template is added asynchronously.
  await TestUtils.waitForCondition(() => urls[0].querySelector("li"));
  Assert.equal(
    urls[0].querySelector(".cloudfile-name").textContent,
    "green_eggs.txt",
    "The name of the cloud file in the template should be correct."
  );

  Assert.equal(
    urls[0].querySelector(".cloudfile-name").href,
    "https://mochi.test/green_eggs.txt",
    "The URL attached to the name of the cloud file in the template should be correct."
  );

  Assert.equal(
    urls[0].querySelector(".cloudfile-service-name").textContent,
    "MyCloud",
    "The used service name in the template should be correct."
  );

  Assert.equal(
    urls[0].querySelector(".cloudfile-service-icon").style.backgroundImage,
    `url("data:image/svg+xml;filename=globe.svg;base64,PCEtLSBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljCiAgIC0gTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpcwogICAtIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uIC0tPgo8c3ZnIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiB2aWV3Qm94PSIwIDAgMTYgMTYiPgogIDxwYXRoIGZpbGw9ImNvbnRleHQtZmlsbCIgZD0iTTggMGE4IDggMCAxIDAgOCA4IDguMDA5IDguMDA5IDAgMCAwLTgtOHptNS4xNjMgNC45NThoLTEuNTUyYTcuNyA3LjcgMCAwIDAtMS4wNTEtMi4zNzYgNi4wMyA2LjAzIDAgMCAxIDIuNjAzIDIuMzc2ek0xNCA4YTUuOTYzIDUuOTYzIDAgMCAxLS4zMzUgMS45NThoLTEuODIxQTEyLjMyNyAxMi4zMjcgMCAwIDAgMTIgOGExMi4zMjcgMTIuMzI3IDAgMCAwLS4xNTYtMS45NThoMS44MjFBNS45NjMgNS45NjMgMCAwIDEgMTQgOHptLTYgNmMtMS4wNzUgMC0yLjAzNy0xLjItMi41NjctMi45NThoNS4xMzVDMTAuMDM3IDEyLjggOS4wNzUgMTQgOCAxNHpNNS4xNzQgOS45NThhMTEuMDg0IDExLjA4NCAwIDAgMSAwLTMuOTE2aDUuNjUxQTExLjExNCAxMS4xMTQgMCAwIDEgMTEgOGExMS4xMTQgMTEuMTE0IDAgMCAxLS4xNzQgMS45NTh6TTIgOGE1Ljk2MyA1Ljk2MyAwIDAgMSAuMzM1LTEuOTU4aDEuODIxYTEyLjM2MSAxMi4zNjEgMCAwIDAgMCAzLjkxNkgyLjMzNUE1Ljk2MyA1Ljk2MyAwIDAgMSAyIDh6bTYtNmMxLjA3NSAwIDIuMDM3IDEuMiAyLjU2NyAyLjk1OEg1LjQzM0M1Ljk2MyAzLjIgNi45MjUgMiA4IDJ6bS0yLjU2LjU4MmE3LjcgNy43IDAgMCAwLTEuMDUxIDIuMzc2SDIuODM3QTYuMDMgNi4wMyAwIDAgMSA1LjQ0IDIuNTgyem0tMi42IDguNDZoMS41NDlhNy43IDcuNyAwIDAgMCAxLjA1MSAyLjM3NiA2LjAzIDYuMDMgMCAwIDEtMi42MDMtMi4zNzZ6bTcuNzIzIDIuMzc2YTcuNyA3LjcgMCAwIDAgMS4wNTEtMi4zNzZoMS41NTJhNi4wMyA2LjAzIDAgMCAxLTIuNjA2IDIuMzc2eiI+PC9wYXRoPgo8L3N2Zz4K")`,
    "The used service icon should be correct."
  );

  // clean up
  cloudFileAccounts.removeAccount(account);
  cloudFileAccounts.unregisterProvider(provider.type);
  Assert.equal(
    cloudFileAccounts.configuredAccounts.length,
    0,
    "Should leave no cloudfile accounts when done"
  );
  composeWindow.close();

  // Request focus on something in the main window so the test doesn't time
  // out waiting for focus.
  document.getElementById("button-appmenu").focus();
});
