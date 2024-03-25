/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test about:downloads.
 */

"use strict";
var { content_tab_e } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
);
var {
  be_in_folder,
  close_tab,
  create_folder,
  get_about_message,
  make_message_sets_in_folders,
  select_click_row,
  switch_tab,
  wait_for_popup_to_open,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { click_menus_in_sequence, wait_for_browser_load } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/WindowHelpers.sys.mjs"
  );
var { MockFilePicker } = SpecialPowers;

var downloads = ChromeUtils.importESModule(
  "resource://gre/modules/Downloads.sys.mjs"
);
var downloadsTab;

var attachmentFileNames = [
  "Attachment#1.txt",
  "Attachment#2.txt",
  "Attachment#3.txt",
];

var downloadsView = {
  init() {
    this.items = new Map();
    this.removedItems = [];
  },

  get count() {
    return this.items.size;
  },

  onDownloadAdded(aDownload) {
    this.items.set(aDownload, aDownload.target.path);
  },

  onDownloadChanged() {},

  onDownloadRemoved(aDownload) {
    this.removedItems.push(aDownload.target.path);
    this.items.delete(aDownload);
  },

  async waitForFinish() {
    const succeededPromises = [];
    for (const download of this.items.keys()) {
      const succeededPromise = download.whenSucceeded();
      succeededPromises.push(succeededPromise);
    }
    let finished = false;
    Promise.all(succeededPromises).then(() => (finished = true), console.error);
    await TestUtils.waitForCondition(
      () => finished,
      "Timeout waiting for downloads to complete."
    );
  },
};

async function prepare_messages() {
  const folder = await create_folder("about:downloads");
  await make_message_sets_in_folders(
    [folder],
    [
      {
        count: 1,
        attachments: [
          {
            filename: attachmentFileNames[0],
            body: "Body",
          },
        ],
      },
      {
        count: 1,
        attachments: [
          {
            filename: attachmentFileNames[1],
            body: "Body",
          },
        ],
      },
      {
        count: 1,
        attachments: [
          {
            filename: attachmentFileNames[2],
            body: "Body",
          },
        ],
      },
    ]
  );
  await be_in_folder(folder);
}

async function prepare_downloads_view() {
  let success = false;
  downloads.Downloads.getList(downloads.Downloads.ALL)
    .then(list => list.addView(downloadsView))
    .then(() => (success = true), console.error);
  await TestUtils.waitForCondition(
    () => success,
    "Timeout waiting for attaching our download view."
  );
}

add_setup(async function () {
  MockFilePicker.init(window.browsingContext);

  await prepare_messages();
  await prepare_downloads_view();

  downloadsTab = await open_about_downloads();
});

function setupTest() {
  downloadsView.init();
}

async function open_about_downloads() {
  const preCount =
    document.getElementById("tabmail").tabContainer.allTabs.length;
  const newTab = window.openSavedFilesWnd();
  await TestUtils.waitForCondition(
    () =>
      document.getElementById("tabmail").tabContainer.allTabs.length ==
      preCount + 1,
    "Timeout waiting for about:downloads tab"
  );

  await wait_for_browser_load(newTab.browser, "about:downloads");
  // We append new tabs at the end, so check the last one.
  const expectedNewTab = document.getElementById("tabmail").tabInfo[preCount];
  return expectedNewTab;
}

/**
 * Test that there is no file in the list at first.
 */
add_task(async function test_empty_list() {
  setupTest();
  await switch_tab(downloadsTab);

  const list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  Assert.equal(list.children.length, 0, "Downloads list should be empty");
  await teardownTest();
});

async function save_attachment_files() {
  await switch_tab(0);

  const profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);

  const aboutMessage = get_about_message();
  const length = attachmentFileNames.length;
  for (let i = 0; i < length; i++) {
    const file = profileDir.clone();
    file.append(attachmentFileNames[i]);
    await select_click_row(i);
    MockFilePicker.setFiles([file]);
    await new Promise(function (resolve) {
      MockFilePicker.afterOpenCallback = resolve;
      EventUtils.synthesizeMouseAtCenter(
        aboutMessage.document.getElementById("attachmentSaveAllSingle"),
        { clickCount: 1 },
        aboutMessage
      );
    });
  }
}

/**
 * Test that all downloaded files are showed up in the list.
 */
async function subtest_save_attachment_files_in_list() {
  await save_attachment_files();

  document.getElementById("tabmail").switchToTab(downloadsTab);
  const list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");

  const length = attachmentFileNames.length;
  await TestUtils.waitForCondition(
    () => downloadsView.count == length,
    () =>
      "Timeout waiting for saving three attachment files; " +
      "downloadsView.count=" +
      downloadsView.count
  );

  Assert.equal(length, list.children.length);
  Assert.equal(downloadsView.count, list.children.length);

  const actualNames = [];
  let child = list.firstElementChild;
  dump(child.querySelector(".fileName").getAttribute("value"));
  while (child) {
    actualNames.push(child.querySelector(".fileName").getAttribute("value"));
    child = child.nextElementSibling;
  }
  actualNames.sort();

  for (let i = 0; i < length; i++) {
    Assert.equal(attachmentFileNames[i], actualNames[i]);
  }
}
add_task(async function test_save_attachment_files_in_list() {
  setupTest();
  await subtest_save_attachment_files_in_list();
  await teardownTest();
});

/**
 * Test that 'remove' in context menu removes surely the target file from
 * the list.
 */
add_task(async function test_remove_file() {
  setupTest();
  await subtest_save_attachment_files_in_list();

  const list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  const firstElement = list.firstElementChild;
  const removingFileName = firstElement
    .querySelector(".fileName")
    .getAttribute("value");

  // select first element
  EventUtils.synthesizeMouseAtCenter(
    firstElement,
    { clickCount: 1 },
    firstElement.ownerGlobal
  );
  EventUtils.synthesizeMouseAtCenter(
    firstElement,
    { type: "contextmenu" },
    firstElement.ownerGlobal
  );

  const contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  await wait_for_popup_to_open(contextMenu);
  await click_menus_in_sequence(contextMenu, [
    { command: "msgDownloadsCmd_remove" },
  ]);
  await TestUtils.waitForCondition(
    () => downloadsView.count == 2,
    "Timeout waiting for removing a saved attachment file."
  );

  let child = list.firstElementChild;
  while (child) {
    Assert.notEqual(
      removingFileName,
      child.querySelector(".fileName").getAttribute("value")
    );
    child = child.nextElementSibling;
  }
  await teardownTest();
});

/**
 * Test that removing multiple files surely removes the files.
 */
add_task(async function test_remove_multiple_files() {
  setupTest();
  await subtest_save_attachment_files_in_list();

  const list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  const firstElement = list.firstElementChild.nextElementSibling;
  const secondElement = firstElement.nextElementSibling;
  const removingFileNames = [];

  removingFileNames.push(
    firstElement.querySelector(".fileName").getAttribute("value")
  );
  removingFileNames.push(
    secondElement.querySelector(".fileName").getAttribute("value")
  );

  // select two elements
  EventUtils.synthesizeMouseAtCenter(
    firstElement,
    { clickCount: 1 },
    firstElement.ownerGlobal
  );
  list.selectItemRange(firstElement, secondElement);
  EventUtils.synthesizeMouseAtCenter(
    firstElement,
    { type: "contextmenu" },
    firstElement.ownerGlobal
  );

  const contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  await wait_for_popup_to_open(contextMenu);
  await click_menus_in_sequence(contextMenu, [
    { command: "msgDownloadsCmd_remove" },
  ]);
  await TestUtils.waitForCondition(
    () => downloadsView.count == 1,
    "Timeout waiting for removing two saved attachment files."
  );

  let child = list.firstElementChild;
  while (child) {
    for (const name of removingFileNames) {
      Assert.notEqual(
        name,
        child.querySelector(".fileName").getAttribute("value")
      );
    }
    child = child.nextElementSibling;
  }
  await teardownTest();
});

/**
 * Test that 'clearDownloads" in context menu purges all files in the list.
 */
add_task(async function test_clear_all_files() {
  setupTest();
  await subtest_save_attachment_files_in_list();
  await downloadsView.waitForFinish();

  const listbox = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  EventUtils.synthesizeMouseAtCenter(
    listbox,
    { clickCount: 1 },
    listbox.ownerGlobal
  );
  EventUtils.synthesizeMouseAtCenter(
    listbox,
    { type: "contextmenu" },
    listbox.ownerGlobal
  );

  const contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  await wait_for_popup_to_open(contextMenu);
  await click_menus_in_sequence(contextMenu, [
    { command: "msgDownloadsCmd_clearDownloads" },
  ]);
  await TestUtils.waitForCondition(
    () => downloadsView.count == 0,
    "Timeout waiting for clearing all saved attachment files."
  );

  const list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  Assert.equal(list.children.length, 0, "Downloads list should be empty");
  await teardownTest();
});

async function teardownTest() {
  downloads.Downloads.getList(downloads.Downloads.ALL)
    .then(function (list) {
      for (const download of downloadsView.items.keys()) {
        list.remove(download);
      }
    })
    .catch(console.error);
  await TestUtils.waitForCondition(
    () => downloadsView.count == 0,
    "Timeout waiting for clearing all saved attachment files."
  );
}

registerCleanupFunction(function () {
  close_tab(downloadsTab);
  MockFilePicker.cleanup();
});
