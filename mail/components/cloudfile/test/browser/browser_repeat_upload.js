/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../base/content/mailWindowOverlay.js */

const { BrowserTestUtils } = ChromeUtils.import(
  "resource://testing-common/BrowserTestUtils.jsm"
);

let { cloudFileAccounts } = ChromeUtils.import(
  "resource:///modules/cloudFileAccounts.jsm"
);

const ICON_URL = getRootDirectory(gTestPath) + "files/icon.svg";
const MANAGEMENT_URL = getRootDirectory(gTestPath) + "files/management.html";

function getFileFromChromeURL(leafName) {
  let ChromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(
    Ci.nsIChromeRegistry
  );

  let url = Services.io.newURI(
    getRootDirectory(gTestPath) + "files/" + leafName
  );
  let fileURL = ChromeRegistry.convertChromeURL(url).QueryInterface(
    Ci.nsIFileURL
  );
  return fileURL.file;
}

add_task(async () => {
  let uploadedFiles = [];
  let provider = {
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
      };
    },
  };

  Assert.equal(
    cloudFileAccounts.configuredAccounts.length,
    0,
    "Should have no cloudfile accounts starting off."
  );

  cloudFileAccounts.registerProvider(provider.type, provider);
  let account = cloudFileAccounts.createAccount(provider.type);
  Assert.equal(
    cloudFileAccounts.configuredAccounts.length,
    1,
    "Should have only the one account we created."
  );

  let composeWindow = await new Promise(resolve => {
    function onWindowOpen(win) {
      win.addEventListener(
        "load",
        async () => {
          Services.ww.unregisterNotification(onWindowOpen);
          await win.setTimeout(resolve, 500, win);
        },
        { once: true }
      );
    }
    Services.ww.registerNotification(onWindowOpen);
    composeMsgByType(Ci.nsIMsgCompType.New);
  });
  is(
    composeWindow.location.href,
    "chrome://messenger/content/messengercompose/messengercompose.xhtml"
  );
  let composeDocument = composeWindow.document;

  // Compose window loaded.
  // Check the attach dropdown has our account as a <menuitem>.

  let toolbarButton = composeDocument.getElementById("button-attach");
  let rect = toolbarButton.getBoundingClientRect();
  EventUtils.synthesizeMouse(
    toolbarButton,
    rect.width - 5,
    5,
    { clickCount: 1 },
    composeWindow
  );
  await promiseAnimationFrame(composeWindow);

  let menu = composeDocument.getElementById(
    "button-attachPopup_attachCloudMenu"
  );
  ok(!BrowserTestUtils.is_hidden(menu));

  let popupshown = BrowserTestUtils.waitForEvent(menu, "popupshown");
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
      leafName: "green_eggs.txt",
      path: getFileFromChromeURL("green_eggs.txt").path,
      size: 30,
      url: "https://mochi.test/green_eggs.txt",
    },
    {
      id: 2,
      leafName: "ham.zip",
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

  let bucket = composeDocument.getElementById("attachmentBucket");
  await new Promise(resolve => {
    bucket.addEventListener("attachments-added", resolve, { once: true });
    EventUtils.synthesizeMouseAtCenter(
      menuitems[1],
      { clickCount: 1 },
      composeWindow
    );
  });
  info("attachment added");
  await promiseAnimationFrame(composeWindow);
  ok(toolbarButton.open === false);

  is(bucket.itemCount, 1);
  let attachment = bucket.itemChildren[0];
  is(attachment.getAttribute("name"), "green_eggs.txt");
  ok(attachment.attachment.sendViaCloud);
  is(attachment.attachment.cloudFileAccountKey, account.accountKey);
  is(
    attachment.attachment.contentLocation,
    "https://mochi.test/green_eggs.txt"
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
});
