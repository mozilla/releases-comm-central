/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that reordering the calendar list in one window reorders it in every
 * other window, and that the order survives a calendar being registered.
 */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

/** The calendars this test creates, to be removed when it is done. */
const calendarsToRemove = [];

/**
 * Returns the calendar ids in the order they appear in a window's list.
 *
 * @param {Window} win - The window whose list to read.
 * @returns {string[]} - Calendar ids, top to bottom.
 */
function listedIds(win) {
  const list = win.document.getElementById("calendar-list");
  return list ? [...list.rows].map(row => row.getAttribute("calendar-id")) : [];
}

/**
 * Returns the persisted sort order from the calendar.list.sortOrder pref.
 *
 * @returns {string[]} - Calendar ids in the persisted order.
 */
function savedOrder() {
  return Services.prefs.getStringPref("calendar.list.sortOrder", "").split(" ").filter(Boolean);
}

/**
 * Returns the id of the calendar whose row is shown as selected.
 *
 * @param {Window} win - The window to read the selection from.
 * @returns {?string} - The calendar id, or null if no row is shown as selected.
 */
function selectedId(win) {
  const row = win.document.getElementById("calendar-list").querySelector("li.selected");
  return row ? row.getAttribute("calendar-id") : null;
}

/**
 * Creates and registers a memory calendar, remembering it for clean-up.
 *
 * @param {string} name - Name for the new calendar.
 * @returns {calICalendar} - The registered calendar.
 */
function addCalendar(name) {
  const calendar = CalendarTestUtils.createCalendar(name, "memory");
  calendarsToRemove.push(calendar);
  return calendar;
}

/**
 * Opens a second 3pane window and waits for its calendar list.
 *
 * @returns {Window} - The new window.
 */
async function open3PaneWindow() {
  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  Services.ww.openWindow(
    null,
    "chrome://messenger/content/messenger.xhtml",
    "_blank",
    "all,chrome,dialog=no,status,toolbar",
    null
  );
  const win = await winPromise;
  await TestUtils.waitForCondition(
    () => win.gSpacesToolbar.isLoaded,
    "the second window's spaces toolbar is ready"
  );
  await CalendarTestUtils.openCalendarTab(win);
  await TestUtils.waitForCondition(
    () => !!listedIds(window).length && listedIds(win).length == listedIds(window).length,
    "second window's calendar list is populated"
  );
  return win;
}

/**
 * Moves a calendar up the list of a window, the way the keyboard shortcut does.
 *
 * @param {Window} win - The window to reorder in.
 * @param {string} id - Id of the calendar to move.
 * @param {integer} places - How many places to move it up.
 */
async function moveUp(win, id, places) {
  await SimpleTest.promiseFocus(win);
  const list = win.document.getElementById("calendar-list");
  list.focus();
  list.selectedIndex = list.rows.findIndex(row => row.getAttribute("calendar-id") == id);
  for (let i = 0; i < places; i++) {
    EventUtils.synthesizeKey("KEY_ArrowUp", { altKey: true }, win);
  }
}

add_setup(async function () {
  await CalendarTestUtils.openCalendarTab(window);
  registerCleanupFunction(() => {
    for (const calendar of calendarsToRemove) {
      CalendarTestUtils.removeCalendar(calendar);
    }
  });
});

add_task(async function testBothWindowsFollowTheOrder() {
  addCalendar("TwoWinA");
  addCalendar("TwoWinB");
  const c = addCalendar("TwoWinC");

  await TestUtils.waitForCondition(() => listedIds(window).includes(c.id), "calendars listed");

  const secondWindow = await open3PaneWindow();
  try {
    const before = listedIds(window);
    Assert.deepEqual(listedIds(secondWindow), before, "both windows should start out the same");

    // Park the keyboard focus on a control inside a row of the second window.
    await SimpleTest.promiseFocus(secondWindow);
    const checkbox = secondWindow.document
      .querySelector(`#calendar-list li[calendar-id="${c.id}"]`)
      .querySelector(".calendar-displayed");
    checkbox.focus();
    Assert.equal(
      secondWindow.document.activeElement,
      checkbox,
      "the second window's checkbox should have focus"
    );

    // Reorder in the first window.
    await moveUp(window, c.id, 2);
    const reordered = listedIds(window);
    Assert.notDeepEqual(reordered, before, "the first window's order should have changed");

    Assert.deepEqual(savedOrder(), reordered, "the new order should be remembered");
    Assert.deepEqual(
      listedIds(secondWindow),
      reordered,
      "the second window should follow the new order"
    );

    // The list reacts to changes of its rows from a microtask, let it settle.
    await TestUtils.waitForTick();
    const selected = selectedId(window);
    Assert.ok(selected, "the first window should show a selected calendar");
    Assert.equal(
      selectedId(secondWindow),
      selected,
      "the second window should show the same calendar selected"
    );
    Assert.equal(
      secondWindow.document.activeElement,
      checkbox,
      "the second window should keep the focus inside its list"
    );

    // Registering a calendar must not bring any window's old order back.
    const d = addCalendar("TwoWinD");
    await TestUtils.waitForCondition(
      () => listedIds(window).includes(d.id) && listedIds(secondWindow).includes(d.id),
      "both windows list the new calendar"
    );

    const expected = [...reordered, d.id];
    Assert.deepEqual(
      savedOrder(),
      expected,
      "the remembered order should have survived the registration"
    );
    Assert.deepEqual(
      cal.manager.getCalendars().map(calendar => calendar.id),
      expected,
      "the calendars should come back in the new order"
    );
    Assert.deepEqual(
      listedIds(window),
      expected,
      "the first window should list the calendars in the new order"
    );
    Assert.deepEqual(
      listedIds(secondWindow),
      expected,
      "the second window should list the calendars in the new order"
    );

    // Reordering in the second window decides the order just the same.
    await moveUp(secondWindow, d.id, 1);
    const secondWindowOrder = listedIds(secondWindow);
    Assert.notDeepEqual(
      secondWindowOrder,
      expected,
      "reordering in the second window should change the order"
    );
    Assert.deepEqual(
      savedOrder(),
      secondWindowOrder,
      "the second window's order should be remembered"
    );
    Assert.deepEqual(
      listedIds(window),
      secondWindowOrder,
      "the first window should follow the second window's order"
    );
  } finally {
    await BrowserTestUtils.closeWindow(secondWindow);
  }
});
