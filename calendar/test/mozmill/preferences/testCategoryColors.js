/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testCategoryColors";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "content-tab-helpers"];

var { wait_for_frame_load } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var helpersForController, openLightningPrefs, closeLightningPrefs;
var content_tab_e, content_tab_eid;

var prefTab = null;

function setupModule(module) {
  controller = mozmill.getMail3PaneController();
  ({ helpersForController, openLightningPrefs, closeLightningPrefs } = collector.getModule(
    "calendar-utils"
  ));
  collector.getModule("calendar-utils").setupModule(controller);

  ({ content_tab_e, content_tab_eid } = collector.getModule("content-tab-helpers"));
  collector.getModule("content-tab-helpers").setupModule();
}

function testCategoryColors() {
  openLightningPrefs(tab => {
    prefTab = tab;

    let listBox = content_tab_e(tab, "categorieslist");
    listBox.scrollIntoView();
    controller.assert(() => listBox.itemChildren.length == 22);

    for (let item of listBox.itemChildren) {
      dump(`${item.firstElementChild.value}: ${item.lastElementChild.style.backgroundColor}\n`);
      controller.assert(() => item.lastElementChild.style.backgroundColor);
    }

    controller.click(content_tab_eid(tab, "categorieslist"), 5, 5);
    controller.click(content_tab_eid(tab, "editCButton"));

    let editFrame = wait_for_frame_load(
      tab.browser.contentDocument.getElementById("dialogOverlay-0").querySelector("browser"),
      "chrome://calendar/content/preferences/editCategory.xul"
    );
    let { replaceText, lookup } = helpersForController(editFrame);
    let categoryName = editFrame.eid("categoryName");
    replaceText(categoryName, "ZZZ Mozmill");
    editFrame.e("categoryColor").value = "#00CC00";
    editFrame.click(
      lookup(`
            id("editCategory")/shadow/{"class":"dialog-button-box"}/{"dlgtype":"accept"}
        `)
    );

    let listItem = listBox.itemChildren[listBox.itemCount - 1];
    controller.assert(() => listItem.firstElementChild.value == "ZZZ Mozmill");
    controller.assert(() => listItem.lastElementChild.style.backgroundColor == "rgb(0, 204, 0)");
  }, controller);
}

function teardownModule() {
  if (prefTab) {
    closeLightningPrefs(prefTab);
  }
}
