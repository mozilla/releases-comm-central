/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that a calendar keeps its place in the calendar list when it is
 * re-created (toggling its offline support) or re-registered (a provider being
 * enabled/disabled), instead of dropping to the bottom of the list
 * (bug 1675937).
 */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalReadableStreamFactory } = ChromeUtils.importESModule(
  "resource:///modules/CalReadableStreamFactory.sys.mjs"
);

/**
 * Returns the calendar ids in the order they appear in the calendar list.
 *
 * @returns {string[]} - Calendar ids, top to bottom.
 */
function listedIds() {
  const list = document.getElementById("calendar-list");
  return [...list.rows].map(row => row.getAttribute("calendar-id"));
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
 * Creates and registers a memory calendar.
 *
 * @param {string} name - Name for the new calendar.
 * @returns {calICalendar} - The registered calendar.
 */
function registerMemory(name) {
  const calendar = cal.manager.createCalendar(
    "memory",
    Services.io.newURI("moz-memory-calendar://")
  );
  calendar.name = name;
  calendar.id = cal.getUUID();
  cal.manager.registerCalendar(calendar);
  return cal.manager.getCalendarById(calendar.id);
}

/**
 * Removes all registered calendars with one of the given names.
 *
 * @param {string[]} names - Names of the calendars to remove.
 */
function removeByName(names) {
  for (const calendar of cal.manager.getCalendars()) {
    if (names.includes(calendar.name)) {
      cal.manager.removeCalendar(calendar);
    }
  }
}

/**
 * Creates a minimal dynamic calendar provider class, so enabling/disabling it
 * swaps the calendar for a dummy - the path a provider add-on uses.
 *
 * @param {string} providerType - Value for the calendars' type property.
 * @returns {Function} - The provider's calendar implementation class.
 */
function makeProvider(providerType) {
  /** A calendar of the dynamically registered provider. */
  return class CalendarProvider extends cal.provider.BaseClass {
    QueryInterface = ChromeUtils.generateQI(["calICalendar"]);
    type = providerType;

    constructor() {
      super();
      this.initProviderBase();
    }

    getItems() {
      return CalReadableStreamFactory.createEmptyReadableStream();
    }
  };
}

add_setup(async function () {
  await CalendarTestUtils.openCalendarTab(window);
});

/**
 * Tests that toggling a calendar's offline support, which re-creates it under a
 * new id, keeps it in place in the list.
 */
add_task(async function testCacheToggleKeepsListPosition() {
  const a = registerMemory("SortA");
  const b = registerMemory("SortB");
  const c = registerMemory("SortC");
  registerCleanupFunction(() => removeByName(["SortA", "SortB", "SortC"]));

  await TestUtils.waitForCondition(() => listedIds().includes(c.id), "calendars listed");
  const bIndex = listedIds().indexOf(b.id);
  Assert.greater(bIndex, 0, "B is listed in the middle");

  // Toggle offline support: B is re-created under a new id.
  b.setProperty("cache.enabled", true);
  const newB = await TestUtils.waitForCondition(
    () => cal.manager.getCalendars().find(x => x.name == "SortB" && x.id != b.id),
    "B was re-created under a new id"
  );
  await TestUtils.waitForCondition(
    () => listedIds().includes(newB.id),
    "the re-created B is listed"
  );

  const ids = listedIds();
  Assert.equal(ids.indexOf(newB.id), bIndex, "the re-created calendar keeps its list position");
  Assert.ok(!ids.includes(b.id), "the old id no longer lingers in the list");
  Assert.equal(ids.indexOf(a.id), bIndex - 1, "A stays before it");
  Assert.equal(ids.indexOf(c.id), bIndex + 1, "C stays after it");
  Assert.equal(ids.filter(id => id == newB.id).length, 1, "the re-created calendar is listed once");
  Assert.deepEqual(savedOrder(), ids, "the persisted sort order matches the list");
});

/**
 * Tests that disabling and re-enabling a provider, which swaps its calendar for
 * a dummy and back, keeps the calendar in place in the list.
 */
add_task(async function testProviderSwapKeepsListPosition() {
  const CalendarProvider = makeProvider("blm");
  cal.manager.registerCalendarProvider("blm", CalendarProvider);
  registerCleanupFunction(() => {
    if (cal.manager.hasCalendarProvider("blm")) {
      cal.manager.unregisterCalendarProvider("blm");
    }
    removeByName(["SwapA", "SwapMid", "SwapC"]);
  });

  registerMemory("SwapA");
  const mid = cal.manager.createCalendar("blm", Services.io.newURI("blm://cal"));
  mid.name = "SwapMid";
  mid.id = cal.getUUID();
  cal.manager.registerCalendar(mid);
  registerMemory("SwapC");

  await TestUtils.waitForCondition(
    () => listedIds().includes(mid.id),
    "the provider calendar is listed"
  );
  const midIndex = listedIds().indexOf(mid.id);
  Assert.greater(midIndex, 0, "the provider calendar is in the middle");

  // Disable the provider: the calendar is swapped for a dummy (same id).
  cal.manager.unregisterCalendarProvider("blm");
  await TestUtils.waitForCondition(
    () => listedIds().includes(mid.id),
    "the swapped calendar is still listed after disabling"
  );
  Assert.equal(
    listedIds().indexOf(mid.id),
    midIndex,
    "the calendar keeps its position when the provider is disabled"
  );
  Assert.equal(
    listedIds().filter(id => id == mid.id).length,
    1,
    "the calendar is listed once after disabling"
  );
  Assert.deepEqual(savedOrder(), listedIds(), "the persisted sort order matches after disabling");

  // Re-enable the provider.
  cal.manager.registerCalendarProvider("blm", CalendarProvider);
  await TestUtils.waitForCondition(
    () => listedIds().includes(mid.id),
    "the swapped calendar is still listed after enabling"
  );
  Assert.equal(
    listedIds().indexOf(mid.id),
    midIndex,
    "the calendar keeps its position when the provider is enabled"
  );
});

/**
 * Tests that the calendars of a provider owning several of them keep their
 * relative order, even when it differs from the registration order.
 */
add_task(async function testMultiCalendarProviderKeepsListOrder() {
  const CalendarProvider = makeProvider("blm2");
  cal.manager.registerCalendarProvider("blm2", CalendarProvider);
  registerCleanupFunction(() => {
    if (cal.manager.hasCalendarProvider("blm2")) {
      cal.manager.unregisterCalendarProvider("blm2");
    }
    removeByName(["MultiA", "MultiB", "MultiC"]);
  });

  /**
   * Creates and registers a calendar of the dynamic provider.
   *
   * @param {string} name - Name for the new calendar.
   * @returns {calICalendar} - The registered calendar.
   */
  function registerProviderCalendar(name) {
    const calendar = cal.manager.createCalendar("blm2", Services.io.newURI(`blm2://${name}`));
    calendar.name = name;
    calendar.id = cal.getUUID();
    cal.manager.registerCalendar(calendar);
    return cal.manager.getCalendarById(calendar.id);
  }

  // Registration (and cache) order is A, B, C.
  const a = registerProviderCalendar("MultiA");
  const b = registerProviderCalendar("MultiB");
  const c = registerProviderCalendar("MultiC");
  await TestUtils.waitForCondition(() => listedIds().includes(c.id), "provider calendars listed");

  // Reorder the list to the reverse, C, B, A, so the list order no longer
  // matches the registration order the manager iterates.
  const list = document.getElementById("calendar-list");
  /**
   * Moves a row of the calendar list, like a user dragging it.
   *
   * @param {string} movingId - Id of the calendar to move.
   * @param {string} beforeId - Id of the calendar to move it before.
   */
  function moveBefore(movingId, beforeId) {
    const moving = list.getElementsByAttribute("calendar-id", movingId)[0];
    const before = list.getElementsByAttribute("calendar-id", beforeId)[0];
    list.insertBefore(moving, before);
    list.dispatchEvent(new CustomEvent("ordered", { detail: moving }));
  }
  moveBefore(c.id, a.id);
  moveBefore(b.id, a.id);

  const wantOrder = listedIds();
  Assert.less(wantOrder.indexOf(c.id), wantOrder.indexOf(b.id), "reordered to C, B, A");
  Assert.less(wantOrder.indexOf(b.id), wantOrder.indexOf(a.id), "reordered to C, B, A");
  Assert.deepEqual(savedOrder(), wantOrder, "the reorder was persisted");

  // Disable the provider: all three are swapped for dummies together.
  cal.manager.unregisterCalendarProvider("blm2");
  await TestUtils.waitForCondition(
    () => !cal.manager.hasCalendarProvider("blm2"),
    "the provider is disabled"
  );
  Assert.deepEqual(listedIds(), wantOrder, "the list order is kept when the provider is disabled");
  Assert.deepEqual(savedOrder(), wantOrder, "the persisted order is kept when disabled");

  // Re-enable the provider.
  cal.manager.registerCalendarProvider("blm2", CalendarProvider);
  await TestUtils.waitForCondition(
    () => cal.manager.hasCalendarProvider("blm2"),
    "the provider is enabled"
  );
  Assert.deepEqual(listedIds(), wantOrder, "the list order is kept when the provider is enabled");
});
