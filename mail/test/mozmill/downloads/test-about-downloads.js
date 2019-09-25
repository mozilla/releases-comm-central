/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test about:downloads.
 */

"use strict";

/* import-globals-from ../shared-modules/test-content-tab-helpers.js */
/* import-globals-from ../shared-modules/test-dom-helpers.js */
/* import-globals-from ../shared-modules/test-folder-display-helpers.js */

var MODULE_NAME = "test-about-downloads";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "content-tab-helpers",
  "dom-helpers",
  "folder-display-helpers",
];

var elementslib = ChromeUtils.import(
  "chrome://mozmill/content/modules/elementslib.jsm"
);

var { wait_for_browser_load } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { gMockFilePicker, gMockFilePickReg } = ChromeUtils.import(
  "resource://testing-common/mozmill/AttachmentHelpers.jsm"
);

var downloads = ChromeUtils.import("resource://gre/modules/Downloads.jsm");

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

  onDownloadChanged(aDownload) {},

  onDownloadRemoved(aDownload) {
    this.removedItems.push(aDownload.target.path);
    this.items.delete(aDownload);
  },

  waitForFinish() {
    let succeededPromises = [];
    for (let download of this.items.keys()) {
      let succeededPromise = download.whenSucceeded();
      succeededPromises.push(succeededPromise);
    }
    let finished = false;
    Promise.all(succeededPromises).then(
      () => (finished = true),
      Cu.reportError
    );
    mc.waitFor(() => finished, "Timeout waiting for downloads to complete.");
  },
};

function prepare_messages() {
  let folder = create_folder("about:downloads");
  make_new_sets_in_folder(folder, [
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
  ]);
  be_in_folder(folder);
}

function prepare_downloads_view() {
  let success = false;
  downloads.Downloads.getList(downloads.Downloads.ALL)
    .then(list => list.addView(downloadsView))
    .then(() => (success = true), Cu.reportError);
  mc.waitFor(() => success, "Timeout waiting for attaching our download view.");
}

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }
  gMockFilePickReg.register();

  prepare_messages();
  prepare_downloads_view();

  downloadsTab = open_about_downloads();
}

function setupTest(test) {
  downloadsView.init();
}

function open_about_downloads() {
  let preCount = mc.tabmail.tabContainer.allTabs.length;
  let newTab = mc.tabmail.openTab("chromeTab", {
    chromePage: "about:downloads",
    clickHandler: "specialTabs.aboutClickHandler(event);",
  });
  mc.waitFor(
    () => mc.tabmail.tabContainer.allTabs.length == preCount + 1,
    "Timeout waiting for about:downloads tab"
  );

  wait_for_browser_load(newTab.browser, "about:downloads");
  // We append new tabs at the end, so check the last one.
  let expectedNewTab = mc.tabmail.tabInfo[preCount];
  return expectedNewTab;
}

/**
 * Test that there is no file in the list at first.
 */
function test_empty_list() {
  switch_tab(downloadsTab);

  let empty = content_tab_e(downloadsTab, "msgDownloadsListEmptyDescription");
  assert_false(empty.hidden, "msgDownloadsListEmptyDescription is not visible");
}

function save_attachment_files() {
  switch_tab(0);

  let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);

  let length = attachmentFileNames.length;
  for (let i = 0; i < length; i++) {
    let file = profileDir.clone();
    file.append(attachmentFileNames[i]);
    select_click_row(i);
    gMockFilePicker.returnFiles = [file];
    mc.click(
      mc.eid("attachmentSaveAllSingle", {
        class: "toolbarbutton-menubutton-button",
      })
    );
  }
}

/**
 * Test that all downloaded files are showed up in the list.
 */
function test_save_attachment_files_in_list() {
  save_attachment_files();

  mc.tabmail.switchToTab(downloadsTab);
  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");

  let length = attachmentFileNames.length;
  mc.waitFor(
    () => downloadsView.count == length,
    () =>
      "Timeout waiting for saving three attachment files; " +
      "downloadsView.count=" +
      downloadsView.count
  );

  assert_equals(length, list.childNodes.length);
  assert_equals(downloadsView.count, list.childNodes.length);

  let actualNames = [];
  let child = list.firstChild;
  dump(child.querySelector(".fileName").getAttribute("value"));
  while (child) {
    actualNames.push(child.querySelector(".fileName").getAttribute("value"));
    child = child.nextSibling;
  }
  actualNames.sort();

  for (let i = 0; i < length; i++) {
    assert_equals(attachmentFileNames[i], actualNames[i]);
  }
}

/**
 * Test that 'remove' in context menu removes surely the target file from
 * the list.
 */
function test_remove_file() {
  test_save_attachment_files_in_list();

  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  let firstElement = list.firstChild;
  let removingFileName = firstElement
    .querySelector(".fileName")
    .getAttribute("value");

  // select first element
  mc.click(new elementslib.Elem(firstElement));
  mc.rightClick(new elementslib.Elem(firstElement));

  let contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  wait_for_popup_to_open(contextMenu);
  mc.click_menus_in_sequence(contextMenu, [
    { command: "msgDownloadsCmd_remove" },
  ]);
  mc.waitFor(
    () => downloadsView.count == 2,
    "Timeout waiting for removing a saved attachment file."
  );

  let child = list.firstChild;
  while (child) {
    assert_not_equals(
      removingFileName,
      child.querySelector(".fileName").getAttribute("value")
    );
    child = child.nextSibling;
  }
}

/**
 * Test that removing multiple files surely removes the files.
 */
function test_remove_multiple_files() {
  test_save_attachment_files_in_list();

  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  let firstElement = list.firstChild.nextSibling;
  let secondElement = firstElement.nextSibling;
  let removingFileNames = [];

  removingFileNames.push(
    firstElement.querySelector(".fileName").getAttribute("value")
  );
  removingFileNames.push(
    secondElement.querySelector(".fileName").getAttribute("value")
  );

  // select two elements
  mc.click(new elementslib.Elem(firstElement));
  list.selectItemRange(firstElement, secondElement);
  mc.rightClick(new elementslib.Elem(firstElement));

  let contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  wait_for_popup_to_open(contextMenu);
  mc.click_menus_in_sequence(contextMenu, [
    { command: "msgDownloadsCmd_remove" },
  ]);
  mc.waitFor(
    () => downloadsView.count == 1,
    "Timeout waiting for removing two saved attachment files."
  );

  let child = list.firstChild;
  while (child) {
    for (let name of removingFileNames) {
      assert_not_equals(
        name,
        child.querySelector(".fileName").getAttribute("value")
      );
    }
    child = child.nextSibling;
  }
}

/**
 * Test that 'clearDownloads" in context menu purges all files in the list.
 */
function test_clear_all_files() {
  test_save_attachment_files_in_list();
  downloadsView.waitForFinish();

  mc.click(content_tab_eid(downloadsTab, "msgDownloadsRichListBox"));
  mc.rightClick(content_tab_eid(downloadsTab, "msgDownloadsRichListBox"));

  let contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  wait_for_popup_to_open(contextMenu);
  mc.click_menus_in_sequence(contextMenu, [
    { command: "msgDownloadsCmd_clearDownloads" },
  ]);
  mc.waitFor(
    () => downloadsView.count == 0,
    "Timeout waiting for clearing all saved attachment files."
  );

  let empty = content_tab_e(downloadsTab, "msgDownloadsListEmptyDescription");
  assert_false(empty.hidden, "msgDownloadsListEmptyDescription is not visible");
}

function teardownTest() {
  downloads.Downloads.getList(downloads.Downloads.ALL)
    .then(function(list) {
      for (let download of downloadsView.items.keys()) {
        list.remove(download);
      }
    })
    .then(null, Cu.reportError);
  mc.waitFor(
    () => downloadsView.count == 0,
    "Timeout waiting for clearing all saved attachment files."
  );
  let empty = content_tab_e(downloadsTab, "msgDownloadsListEmptyDescription");
  mc.waitFor(
    () => empty.hidden === false,
    "Timeout waiting for msgDownloadsListEmptyDescription is visible."
  );
}

function teardownModule(module) {
  close_tab(downloadsTab);
  gMockFilePickReg.unregister();
}
