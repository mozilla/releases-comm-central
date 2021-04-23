/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

async function calendarListContextMenu(target, menuItem) {
  // The test frequently times out if we don't wait here. Unknown why.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 250));

  let contextMenu = document.getElementById("list-calendars-context-menu");
  let shownPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(target, { type: "contextmenu" });
  await shownPromise;

  if (menuItem) {
    let hiddenPromise = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
    contextMenu.activateItem(document.getElementById(menuItem));
    await hiddenPromise;
  }
}

async function withMockPromptService(response, callback) {
  let realPrompt = Services.prompt;
  Services.prompt = {
    QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
    confirmEx: (unused1, unused2, text) => {
      info(text);
      return response;
    },
  };
  await callback();
  Services.prompt = realPrompt;
}

add_task(async () => {
  function checkProperties(index, expected) {
    let calendarList = document.getElementById("calendar-list");
    let item = calendarList.itemChildren[index];
    let colorImage = item.querySelector(".calendar-color");
    for (let [key, expectedValue] of Object.entries(expected)) {
      switch (key) {
        case "id":
          Assert.equal(item.getAttribute("calendar-id"), expectedValue);
          break;
        case "disabled":
          Assert.equal(item.querySelector(".calendar-displayed").hidden, expectedValue);
          break;
        case "displayed":
          Assert.equal(item.querySelector(".calendar-displayed").checked, expectedValue);
          break;
        case "color":
          if (item.hasAttribute("calendar-disabled")) {
            Assert.equal(getComputedStyle(colorImage).backgroundColor, "rgba(0, 0, 0, 0)");
          } else {
            Assert.equal(getComputedStyle(colorImage).backgroundColor, expectedValue);
          }
          break;
        case "name":
          Assert.equal(item.querySelector(".calendar-name").value, expectedValue);
          break;
      }
    }
  }

  function checkDisplayed(...expected) {
    let calendarList = document.getElementById("calendar-list");
    Assert.ok(calendarList.itemCount > Math.max(...expected));
    for (let i = 0; i < calendarList.itemCount; i++) {
      Assert.equal(
        calendarList.itemChildren[i].querySelector("checkbox").checked,
        expected.includes(i)
      );
    }
  }

  function checkSortOrder(...expected) {
    let orderPref = Services.prefs.getStringPref("calendar.list.sortOrder", "wrong");
    Assert.notEqual(orderPref, "wrong", "sort order pref has a value");
    let order = orderPref.split(" ");
    Assert.equal(order.length, expected.length, "sort order length");
    for (let i = 0; i < expected.length; i++) {
      Assert.equal(order[i], calendars[expected[i]].id, "sort order ids");
    }
  }

  let calendarList = document.getElementById("calendar-list");
  let contextMenu = document.getElementById("list-calendars-context-menu");
  let manager = cal.getCalendarManager();
  let composite = cal.view.getCompositeCalendar(window);

  await CalendarTestUtils.openCalendarTab(window);

  // Check the default calendar.
  let calendars = manager.getCalendars();
  Assert.equal(calendars.length, 1);
  Assert.equal(calendarList.itemCount, 1);
  checkProperties(0, {
    color: "rgb(168, 194, 225)",
    name: "Home",
  });
  checkSortOrder(0);

  // Test adding calendars.

  // Open and then cancel the 'create calendar' dialog, just to prove that the
  // context menu works.
  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    "cancel",
    "chrome://calendar/content/calendar-creation.xhtml"
  );
  calendarListContextMenu(calendarList, "list-calendars-context-new");
  await dialogPromise;

  // Add some new calendars, check their properties.
  let uri = Services.io.newURI("moz-memory-calendar://");
  for (let i = 1; i <= 3; i++) {
    calendars[i] = manager.createCalendar("memory", uri);
    calendars[i].name = `Mochitest ${i}`;
    manager.registerCalendar(calendars[i]);
  }

  Assert.equal(manager.getCalendars().length, 4);
  Assert.equal(calendarList.itemCount, 4);

  for (let i = 1; i <= 3; i++) {
    checkProperties(i, {
      id: calendars[i].id,
      displayed: true,
      color: "rgb(168, 194, 225)",
      name: `Mochitest ${i}`,
    });
  }
  checkSortOrder(0, 1, 2, 3);

  // Test the context menu.

  await new Promise(resolve => setTimeout(resolve));
  EventUtils.synthesizeMouseAtCenter(calendarList.itemChildren[1], {});
  await new Promise(resolve => setTimeout(resolve));
  await calendarListContextMenu(calendarList.itemChildren[1]);
  await new Promise(resolve => setTimeout(resolve));
  Assert.equal(
    document.getElementById("list-calendars-context-togglevisible").label,
    "Hide Mochitest 1"
  );
  Assert.equal(
    document.getElementById("list-calendars-context-showonly").label,
    "Show Only Mochitest 1"
  );
  contextMenu.hidePopup();

  Assert.equal(document.activeElement, calendarList);
  Assert.equal(calendarList.selectedItem, calendarList.itemChildren[1]);

  // Test show/hide.
  // TODO: Check events on calendars are hidden/shown.

  EventUtils.synthesizeMouseAtCenter(calendarList.itemChildren[2].querySelector("checkbox"), {});
  Assert.equal(document.activeElement, calendarList);
  Assert.equal(calendarList.selectedItem, calendarList.itemChildren[2]);
  Assert.equal(composite.getCalendarById(calendars[2].id), null);
  checkDisplayed(0, 1, 3);

  composite.removeCalendar(calendars[1]);
  checkDisplayed(0, 3);

  await calendarListContextMenu(
    calendarList.itemChildren[3],
    "list-calendars-context-togglevisible"
  );
  checkDisplayed(0);

  EventUtils.synthesizeMouseAtCenter(calendarList.itemChildren[2].querySelector("checkbox"), {});
  Assert.equal(composite.getCalendarById(calendars[2].id), calendars[2]);
  Assert.equal(document.activeElement, calendarList);
  Assert.equal(calendarList.selectedItem, calendarList.itemChildren[2]);
  checkDisplayed(0, 2);

  composite.addCalendar(calendars[1]);
  checkDisplayed(0, 1, 2);

  await calendarListContextMenu(
    calendarList.itemChildren[3],
    "list-calendars-context-togglevisible"
  );
  checkDisplayed(0, 1, 2, 3);

  await calendarListContextMenu(calendarList.itemChildren[1], "list-calendars-context-showonly");
  checkDisplayed(1);

  await calendarListContextMenu(calendarList, "list-calendars-context-showall");
  checkDisplayed(0, 1, 2, 3);

  // Test editing calendars.

  dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://calendar/content/calendar-properties-dialog.xhtml",
    {
      callback(win) {
        let doc = win.document;
        let nameElement = doc.getElementById("calendar-name");
        let colorElement = doc.getElementById("calendar-color");
        Assert.equal(nameElement.value, "Mochitest 1");
        Assert.equal(colorElement.value, "#a8c2e1");
        nameElement.value = "A New Calendar!";
        colorElement.value = "#009900";
        doc
          .querySelector("dialog")
          .getButton("accept")
          .click();
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(calendarList.itemChildren[1], { clickCount: 2 });
  await dialogPromise;

  Assert.equal(document.activeElement, calendarList);
  Assert.equal(calendarList.selectedItem, calendarList.itemChildren[1]);
  checkProperties(1, {
    color: "rgb(0, 153, 0)",
    name: "A New Calendar!",
  });

  dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://calendar/content/calendar-properties-dialog.xhtml",
    {
      callback(win) {
        let doc = win.document;
        let nameElement = doc.getElementById("calendar-name");
        let colorElement = doc.getElementById("calendar-color");
        Assert.equal(nameElement.value, "A New Calendar!");
        Assert.equal(colorElement.value, "#009900");
        nameElement.value = "Mochitest 1";
        doc
          .querySelector("dialog")
          .getButton("accept")
          .click();
      },
    }
  );
  calendarListContextMenu(calendarList.itemChildren[1], "list-calendars-context-edit");
  await dialogPromise;

  Assert.equal(document.activeElement, calendarList);
  Assert.equal(calendarList.selectedItem, calendarList.itemChildren[1]);
  checkProperties(1, {
    color: "rgb(0, 153, 0)",
    name: "Mochitest 1",
  });

  dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://calendar/content/calendar-properties-dialog.xhtml",
    {
      callback(win) {
        let doc = win.document;
        let enabledElement = doc.getElementById("calendar-enabled-checkbox");
        Assert.ok(enabledElement.checked);
        enabledElement.checked = false;
        doc
          .querySelector("dialog")
          .getButton("accept")
          .click();
      },
    }
  );
  calendarListContextMenu(calendarList.itemChildren[3], "list-calendars-context-edit");
  await dialogPromise;

  Assert.equal(document.activeElement, calendarList);
  Assert.equal(calendarList.selectedItem, calendarList.itemChildren[1]);
  checkProperties(1, { disabled: true });

  calendars[1].setProperty("disabled", false);
  checkProperties(1, { disabled: false });

  // Test reordering calendars.

  let dragSession = Cc["@mozilla.org/widget/dragservice;1"].getService(Ci.nsIDragService);
  dragSession.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_MOVE);

  await new Promise(resolve => window.setTimeout(resolve));

  let [result, dataTransfer] = EventUtils.synthesizeDragOver(
    calendarList.itemChildren[3],
    calendarList.itemChildren[0],
    undefined,
    undefined,
    undefined,
    undefined,
    {
      screenY: calendarList.itemChildren[0].getBoundingClientRect().top + 1,
    }
  );
  await new Promise(resolve => setTimeout(resolve));

  EventUtils.synthesizeDropAfterDragOver(result, dataTransfer, calendarList.itemChildren[0]);
  dragSession.endDragSession(true);
  await new Promise(resolve => setTimeout(resolve));

  checkSortOrder(3, 0, 1, 2);

  Assert.equal(document.activeElement, calendarList);
  Assert.equal(calendarList.selectedItem, calendarList.itemChildren[0]);

  // Test deleting calendars.

  // Delete a calendar by unregistering it.
  manager.unregisterCalendar(calendars[3]);
  Assert.equal(manager.getCalendars().length, 3);
  Assert.equal(calendarList.itemCount, 3);
  checkSortOrder(0, 1, 2);

  // Start to remove a calendar. Cancel the prompt.
  EventUtils.synthesizeMouseAtCenter(calendarList.itemChildren[1], {});
  await withMockPromptService(1, () => {
    EventUtils.synthesizeKey("VK_DELETE");
  });
  Assert.equal(manager.getCalendars().length, 3, "three calendars left in the manager");
  Assert.equal(calendarList.itemCount, 3, "three calendars left in the list");
  checkSortOrder(0, 1, 2);

  // Remove a calendar with the keyboard.
  await withMockPromptService(0, () => {
    EventUtils.synthesizeKey("VK_DELETE");
  });
  Assert.equal(manager.getCalendars().length, 2, "two calendars left in the manager");
  Assert.equal(calendarList.itemCount, 2, "two calendars left in the list");
  checkSortOrder(0, 2);

  // Remove a calendar with the context menu.
  await withMockPromptService(0, async () => {
    EventUtils.synthesizeMouseAtCenter(calendarList.itemChildren[1], {});
    await calendarListContextMenu(calendarList.itemChildren[1], "list-calendars-context-delete");
  });

  Assert.equal(manager.getCalendars().length, 1, "one calendar left in the manager");
  Assert.equal(calendarList.itemCount, 1, "one calendar left in the list");
  checkSortOrder(0);

  Assert.equal(composite.defaultCalendar.id, calendars[0].id, "default calendar id check");
  Assert.equal(calendarList.selectedItem, calendarList.itemChildren[0]);
  await CalendarTestUtils.closeCalendarTab(window);
});
