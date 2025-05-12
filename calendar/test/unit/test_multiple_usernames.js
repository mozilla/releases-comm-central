/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests there can be calendars with different usernames on the same server.
 */

var { CalDAVServer } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalDAVServer.sys.mjs"
);
var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

const calendarObserver = {
  QueryInterface: ChromeUtils.generateQI(["calIObserver"]),

  onStartBatch() {},
  onEndBatch() {},
  onLoad(calendar) {
    info(`onLoad ${calendar.id}`);
    this._onLoadPromise?.resolve();
  },
  onAddItem(item) {
    info(`onAddItem ${item.calendar.id} ${item.id}`);
    this._onAddItemPromise?.resolve();
  },
  onModifyItem() {},
  onDeleteItem() {},
  onError() {},
  onPropertyChanged() {},
  onPropertyDeleting() {},
};

add_setup(async function () {
  do_get_profile();
  await new Promise(resolve => cal.manager.startup({ onResult: resolve }));
  await new Promise(resolve => cal.timezoneService.startup({ onResult: resolve }));
  cal.manager.addCalendarObserver(calendarObserver);

  CalDAVServer.open("alice", "alice");
  CalDAVServer.addUser("bob", "bob");

  await CalDAVServer.putItemInternal(
    "/calendars/alice/test/eb7d6850-6bf9-4c19-b59f-4e1817239094.ics",
    CalendarTestUtils.dedent`
      BEGIN:VCALENDAR
      BEGIN:VEVENT
      UID:eb7d6850-6bf9-4c19-b59f-4e1817239094
      SUMMARY:alice's item
      DTSTART:20210401T120000Z
      DTEND:20210401T130000Z
      END:VEVENT
      END:VCALENDAR
      `
  );
  await CalDAVServer.putItemInternal(
    "/calendars/bob/test/92debd5e-ee59-4c6a-a0ba-07818e58aa4c.ics",
    CalendarTestUtils.dedent`
      BEGIN:VCALENDAR
      BEGIN:VEVENT
      UID:92debd5e-ee59-4c6a-a0ba-07818e58aa4c
      SUMMARY:bob's item
      DTSTART:20250401T120000Z
      DTEND:20250401T130000Z
      END:VEVENT
      END:VCALENDAR
      `
  );

  let loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  loginInfo.init(CalDAVServer.origin, null, "test", "alice", "alice", "", "");
  await Services.logins.addLoginAsync(loginInfo);

  loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  loginInfo.init(CalDAVServer.origin, null, "test", "bob", "bob", "", "");
  await Services.logins.addLoginAsync(loginInfo);
});

registerCleanupFunction(() => CalDAVServer.close());

add_task(async function () {
  async function createCalendar(uri, name, username) {
    calendarObserver._onAddItemPromise = Promise.withResolvers();
    calendarObserver._onLoadPromise = Promise.withResolvers();

    const calendar = cal.manager.createCalendar("caldav", Services.io.newURI(uri));
    calendar.name = name;
    calendar.id = cal.getUUID();
    calendar.setProperty("username", username);

    cal.manager.registerCalendar(calendar);

    await calendarObserver._onAddItemPromise.promise;
    await calendarObserver._onLoadPromise.promise;

    return cal.manager.getCalendarById(calendar.id);
  }

  const aliceCalendar = await createCalendar(
    `${CalDAVServer.origin}/calendars/alice/test/`,
    "Alice's Calendar",
    "alice"
  );
  const bobCalendar = await createCalendar(
    `${CalDAVServer.origin}/calendars/bob/test/`,
    "Bob's Calendar",
    "bob"
  );

  Assert.ok(await aliceCalendar.getItem("eb7d6850-6bf9-4c19-b59f-4e1817239094"));
  Assert.ok(!(await aliceCalendar.getItem("92debd5e-ee59-4c6a-a0ba-07818e58aa4c")));
  Assert.ok(await bobCalendar.getItem("92debd5e-ee59-4c6a-a0ba-07818e58aa4c"));
  Assert.ok(!(await bobCalendar.getItem("eb7d6850-6bf9-4c19-b59f-4e1817239094")));
});
