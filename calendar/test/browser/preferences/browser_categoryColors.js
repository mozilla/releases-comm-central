/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

add_task(async function testCategoryColors() {
  let manager = cal.getCalendarManager();
  let calendar = manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  calendar.name = "Mochitest";
  manager.registerCalendar(calendar);

  registerCleanupFunction(async () => {
    manager.unregisterCalendar(calendar);
  });

  let { prefsWindow, prefsDocument } = await openNewPrefsTab("paneCalendar", "categorieslist");

  let listBox = prefsDocument.getElementById("categorieslist");
  Assert.equal(listBox.itemChildren.length, 22);

  for (let item of listBox.itemChildren) {
    info(`${item.firstElementChild.value}: ${item.lastElementChild.style.backgroundColor}`);
    Assert.ok(item.lastElementChild.style.backgroundColor);
  }

  // Edit the name and colour of a built-in category.

  let subDialogPromise = BrowserTestUtils.waitForEvent(
    prefsWindow.gSubDialog._dialogStack,
    "dialogopen"
  );

  EventUtils.synthesizeMouse(listBox, 5, 5, {}, prefsWindow);
  Assert.equal(listBox.selectedIndex, 0);
  EventUtils.synthesizeMouseAtCenter(prefsDocument.getElementById("editCButton"), {}, prefsWindow);

  await subDialogPromise;

  let subDialogBrowser = prefsWindow.gSubDialog._topDialog._frame;
  await new Promise(subDialogBrowser.contentWindow.setTimeout);
  let subDialogDocument = subDialogBrowser.contentDocument;
  subDialogDocument.getElementById("categoryName").value = "ZZZ Mochitest";
  subDialogDocument.getElementById("categoryColor").value = "#00CC00";
  subDialogDocument.documentElement.firstElementChild.getButton("accept").click();

  let listItem = listBox.itemChildren[listBox.itemCount - 1];
  Assert.equal(listBox.selectedItem, listItem);
  Assert.equal(listItem.firstElementChild.value, "ZZZ Mochitest");
  Assert.equal(listItem.lastElementChild.style.backgroundColor, "rgb(0, 204, 0)");
  Assert.equal(Services.prefs.getCharPref("calendar.category.color.zzz_mochitest"), "#00cc00");

  // Remove the colour of a built-in category.

  subDialogPromise = BrowserTestUtils.waitForEvent(
    prefsWindow.gSubDialog._dialogStack,
    "dialogopen"
  );

  EventUtils.synthesizeMouse(listBox, 5, 5, {}, prefsWindow);
  EventUtils.synthesizeKey("VK_HOME", {}, prefsWindow);
  Assert.equal(listBox.selectedIndex, 0);
  let itemName = listBox.itemChildren[0].firstElementChild.value;
  EventUtils.synthesizeMouseAtCenter(prefsDocument.getElementById("editCButton"), {}, prefsWindow);

  await subDialogPromise;

  subDialogBrowser = prefsWindow.gSubDialog._topDialog._frame;
  await new Promise(subDialogBrowser.contentWindow.setTimeout);
  subDialogDocument = subDialogBrowser.contentDocument;
  subDialogDocument.getElementById("useColor").checked = false;
  subDialogDocument.documentElement.firstElementChild.getButton("accept").click();

  listItem = listBox.itemChildren[0];
  Assert.equal(listBox.selectedItem, listItem);
  Assert.equal(listItem.firstElementChild.value, itemName);
  Assert.equal(listItem.lastElementChild.style.backgroundColor, "");
  Assert.equal(Services.prefs.getCharPref(`calendar.category.color.${itemName.toLowerCase()}`), "");

  // Remove the added category.

  EventUtils.synthesizeMouse(listBox, 5, 5, {}, prefsWindow);
  EventUtils.synthesizeKey("VK_END", {}, prefsWindow);
  Assert.equal(listBox.selectedIndex, listBox.itemCount - 1);
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("deleteCButton"),
    {},
    prefsWindow
  );
});
