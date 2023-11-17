/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CalDAVServer } = ChromeUtils.import("resource://testing-common/calendar/CalDAVServer.jsm");
var { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");

async function openWizard(...args) {
  await CalendarTestUtils.openCalendarTab(window);
  const wizardPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://calendar/content/calendar-creation.xhtml",
    {
      callback: wizardWindow => handleWizard(wizardWindow, ...args),
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    document.querySelector("#newCalendarSidebarButton"),
    {},
    window
  );
  return wizardPromise;
}

async function handleWizard(wizardWindow, { username, url, password, expectedCalendars }) {
  const wizardDocument = wizardWindow.document;
  const acceptButton = wizardDocument.querySelector("dialog").getButton("accept");
  const cancelButton = wizardDocument.querySelector("dialog").getButton("cancel");

  // Select calendar type.

  EventUtils.synthesizeMouseAtCenter(
    wizardDocument.querySelector(`radio[value="network"]`),
    {},
    wizardWindow
  );
  EventUtils.synthesizeMouseAtCenter(acceptButton, {}, wizardWindow);

  // Network calendar settings.

  Assert.ok(acceptButton.disabled);
  Assert.equal(wizardDocument.activeElement.id, "network-username-input");
  if (username) {
    EventUtils.sendString(username, wizardWindow);
  }

  if (username?.includes("@")) {
    Assert.equal(
      wizardDocument.getElementById("network-location-input").placeholder,
      username.replace(/^.*@/, "")
    );
  }

  EventUtils.synthesizeKey("VK_TAB", {}, wizardWindow);
  Assert.equal(wizardDocument.activeElement.id, "network-location-input");
  if (url) {
    EventUtils.sendString(url, wizardWindow);
  }

  Assert.ok(!acceptButton.disabled);

  const promptPromise = handlePasswordPrompt(password);
  EventUtils.synthesizeKey("VK_RETURN", {}, wizardWindow);
  await promptPromise;

  // Select calendars.

  const list = wizardDocument.getElementById("network-calendar-list");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.is_visible(list),
    "waiting for calendar list to appear",
    200,
    100
  );

  Assert.equal(list.childElementCount, expectedCalendars.length);
  for (let i = 0; i < expectedCalendars.length; i++) {
    const item = list.children[i];

    Assert.equal(item.calendar.uri.spec, expectedCalendars[i].uri);
    Assert.equal(
      item.querySelector(".calendar-color").style.backgroundColor,
      expectedCalendars[i].color
    );
    Assert.equal(item.querySelector(".calendar-name").value, expectedCalendars[i].name);

    if (expectedCalendars[i].hasOwnProperty("readOnly")) {
      Assert.equal(
        item.calendar.readOnly,
        expectedCalendars[i].readOnly,
        `calendar read-only property is ${expectedCalendars[i].readOnly}`
      );
    }
  }
  EventUtils.synthesizeMouseAtCenter(cancelButton, {}, wizardWindow);
}

async function handlePasswordPrompt(password) {
  return BrowserTestUtils.promiseAlertDialog(null, undefined, {
    async callback(prompt) {
      await new Promise(resolve => prompt.setTimeout(resolve));

      prompt.document.getElementById("password1Textbox").value = password;

      const checkbox = prompt.document.getElementById("checkbox");
      Assert.greater(checkbox.getBoundingClientRect().width, 0);
      Assert.ok(checkbox.checked);

      prompt.document.querySelector("dialog").getButton("accept").click();
    },
  });
}

/**
 * Test that we correctly use DNS discovery. This uses the mochitest server
 * (files in the data directory) instead of CalDAVServer because the latter
 * can't speak HTTPS, and we only do DNS discovery for HTTPS.
 */
add_task(async function testDNS() {
  var _srv = DNS.srv;
  var _txt = DNS.txt;
  DNS.srv = function (name) {
    Assert.equal(name, "_caldavs._tcp.dnstest.invalid");
    return [{ prio: 0, weight: 0, host: "example.org", port: 443 }];
  };
  DNS.txt = function (name) {
    Assert.equal(name, "_caldavs._tcp.dnstest.invalid");
    return [{ data: "path=/browser/comm/calendar/test/browser/data/dns.sjs" }];
  };

  await openWizard({
    username: "carol@dnstest.invalid",
    password: "carol",
    expectedCalendars: [
      {
        uri: "https://example.org/browser/comm/calendar/test/browser/data/calendar.sjs",
        name: "You found me!",
        color: "rgb(0, 128, 0)",
      },
      {
        uri: "https://example.org/browser/comm/calendar/test/browser/data/calendar2.sjs",
        name: "Röda dagar",
        color: "rgb(255, 0, 0)",
      },
    ],
  });

  DNS.srv = _srv;
  DNS.txt = _txt;
});

/**
 * Test that the magic URL /.well-known/caldav works.
 */
add_task(async function testWellKnown() {
  CalDAVServer.open("alice", "alice");

  await openWizard({
    username: "alice",
    url: CalDAVServer.origin,
    password: "alice",
    expectedCalendars: [
      {
        uri: CalDAVServer.url,
        name: "CalDAV Test",
        color: "rgb(255, 128, 0)",
      },
    ],
  });

  CalDAVServer.close();
});

/**
 * Tests calendars with only the "read" "current-user-privilege-set" are
 * flagged read-only.
 */
add_task(async function testCalendarWithOnlyReadPriv() {
  CalDAVServer.open("alice", "alice");
  CalDAVServer.privileges = "<d:privilege><d:read/></d:privilege>";
  await openWizard({
    username: "alice",
    url: CalDAVServer.origin,
    password: "alice",
    expectedCalendars: [
      {
        uri: CalDAVServer.url,
        name: "CalDAV Test",
        color: "rgb(255, 128, 0)",
        readOnly: true,
      },
    ],
  });
  CalDAVServer.close();
});

/**
 * Tests calendars that return none of the expected values for "current-user-privilege-set"
 * are flagged read-only.
 */
add_task(async function testCalendarWithoutPrivs() {
  CalDAVServer.open("alice", "alice");
  CalDAVServer.privileges = "";
  await openWizard({
    username: "alice",
    url: CalDAVServer.origin,
    password: "alice",
    expectedCalendars: [
      {
        uri: CalDAVServer.url,
        name: "CalDAV Test",
        color: "rgb(255, 128, 0)",
        readOnly: true,
      },
    ],
  });
  CalDAVServer.close();
});

/**
 * Tests calendars that return status 404 for "current-user-privilege-set" are
 * not flagged read-only.
 */
add_task(async function testCalendarWithNoPrivSupport() {
  CalDAVServer.open("alice", "alice");
  CalDAVServer.privileges = null;
  await openWizard({
    username: "alice",
    url: CalDAVServer.origin,
    password: "alice",
    expectedCalendars: [
      {
        uri: CalDAVServer.url,
        name: "CalDAV Test",
        color: "rgb(255, 128, 0)",
        readOnly: false,
      },
    ],
  });
  CalDAVServer.close();
});
