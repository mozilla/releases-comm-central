/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CalDAVServer } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalDAVServer.sys.mjs"
);
var { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");
var { HttpsProxy } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/HttpsProxy.sys.mjs"
);
var { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

var certOverrideService = Cc["@mozilla.org/security/certoverride;1"].getService(
  Ci.nsICertOverrideService
);

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

async function handleWizard(
  wizardWindow,
  { url, certError, username, password, expectedCalendars }
) {
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

  const certPromise = certError ? handleCertError(certError) : Promise.resolve();
  const promptPromise = certError != "cancel" ? handlePasswordPrompt(password) : Promise.resolve();
  EventUtils.synthesizeKey("VK_RETURN", {}, wizardWindow);
  await certPromise;
  if (certError == "cancel") {
    const status = wizardDocument.querySelector(".network-status-row");
    Assert.equal(status.getAttribute("status"), "certerror");
    Assert.ok(BrowserTestUtils.isVisible(wizardDocument.querySelector(".network-certerror-label")));
    EventUtils.synthesizeMouseAtCenter(cancelButton, {}, wizardWindow);
    return;
  }
  if (certError == "extra1") {
    // If we added a certificate exception, retry calendar discovery.
    EventUtils.synthesizeKey("VK_RETURN", {}, wizardWindow);
  }
  await promptPromise;

  if (expectedCalendars.length == 0) {
    const status = wizardDocument.querySelector(".network-status-row");
    Assert.equal(status.getAttribute("status"), "notfound");
    Assert.ok(BrowserTestUtils.isVisible(wizardDocument.querySelector(".network-notfound-label")));
    EventUtils.synthesizeMouseAtCenter(cancelButton, {}, wizardWindow);
    return;
  }

  // Select calendars.

  const list = wizardDocument.getElementById("network-calendar-list");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(list),
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

async function handleCertError(buttonToPress) {
  await BrowserTestUtils.promiseAlertDialog(
    buttonToPress,
    "chrome://pippki/content/exceptionDialog.xhtml",
    {
      async callback(win) {
        // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
        await new Promise(resolve => setTimeout(resolve, 1000));
        win.document.getElementById("exceptiondialog").getButton(buttonToPress).click();
      },
    }
  );
  Assert.ok(
    !Services.wm.getMostRecentWindow("mozilla:exceptiondialog"),
    "no more exception dialogs should be open"
  );
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
    return [{ strings: ["path=/browser/comm/calendar/test/browser/data/dns.sjs"] }];
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
    url: CalDAVServer.origin,
    username: "alice",
    password: "alice",
    expectedCalendars: [
      {
        uri: `${CalDAVServer.origin}/calendars/alice/test/`,
        name: "CalDAV Test",
        color: "rgb(255, 128, 0)",
      },
    ],
  });

  CalDAVServer.close();
});

/**
 * Test that the magic URL /.well-known/caldav works, even if the server returns
 * a 404 status for the resourcetype property (as done by iCloud.com).
 * Verify successful discovery, if current-user-principal and calendar-home-set
 * are returned by the principal request.
 */
add_task(async function testWellKnown_noResourceType_earlyCalendarHomeSet() {
  CalDAVServer.open("alice", "alice");
  // Return a 404 status for the resourcetype property. Return a 200 status for
  // current-user-principal and calendar-home-set. Implementation should then use
  // the available calendar-home-set.
  CalDAVServer.server.registerPathHandler("/principals/", (_request, response) => {
    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(
      `<multistatus xmlns="DAV:">
          <response>
            <href>/principals/</href>
            <propstat>
              <prop>
                <current-user-principal xmlns="DAV:">
                  <href>/principals/alice/</href>
                </current-user-principal>
                <calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav">
                  <href>/calendars/alice/</href>
                </calendar-home-set>
              </prop>
              <status>HTTP/1.1 200 OK</status>
           </propstat>
           <propstat>
            <prop>
              <resourcetype xmlns="DAV:"/>
            </prop>
            <status>HTTP/1.1 404 Not Found</status>
          </propstat>
          </response>
        </multistatus>`.replace(/>\s+</g, "><")
    );
  });
  // This should not be executed. Any empty response will cause the test to fail.
  CalDAVServer.server.registerPathHandler("/principals/alice/", () => {
    Assert.report(
      true,
      undefined,
      undefined,
      "The current-user-principal (/principal/alice/) returned by the /principal/ request should have been ignored, if a calendar-home-set was returned as well."
    );
  });
  await openWizard({
    url: CalDAVServer.origin,
    username: "alice",
    password: "alice",
    expectedCalendars: [
      {
        uri: `${CalDAVServer.origin}/calendars/alice/test/`,
        name: "CalDAV Test",
        color: "rgb(255, 128, 0)",
      },
    ],
  });

  CalDAVServer.close();
});

/**
 * Test that the magic URL /.well-known/caldav works, even if the server returns
 * a 404 status for the resourcetype property (as done by iCloud.com).
 * Verify successful discovery, if only the current-user-principal is returned
 * by the principal request.
 */
add_task(async function testWellKnown_noResourceType() {
  CalDAVServer.open("alice", "alice");
  // Return a 404 status for the resourcetype property. Return a 200 status for
  // current-user-principal.
  CalDAVServer.server.registerPathHandler("/principals/", (request, response) => {
    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(
      `<multistatus xmlns="DAV:">
          <response>
            <href>/principals/</href>
            <propstat>
              <prop>
                <current-user-principal xmlns="DAV:">
                  <href>/principals/alice/</href>
                </current-user-principal>
              </prop>
              <status>HTTP/1.1 200 OK</status>
           </propstat>
           <propstat>
            <prop>
              <resourcetype xmlns="DAV:"/>
            </prop>
            <status>HTTP/1.1 404 Not Found</status>
          </propstat>
          </response>
        </multistatus>`.replace(/>\s+</g, "><")
    );
  });
  // Return a 404 status for the resourcetype property. Return a 200 status for
  // calendar-home-set.
  CalDAVServer.server.registerPathHandler("/principals/alice/", (request, response) => {
    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(
      `<multistatus xmlns="DAV:">
          <response>
            <href>/principals/alice/</href>
            <propstat>
              <prop>
                <calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav">
                  <href>/calendars/alice/</href>
                </calendar-home-set>
              </prop>
              <status>HTTP/1.1 200 OK</status>
           </propstat>
           <propstat>
            <prop>
              <resourcetype xmlns="DAV:"/>
            </prop>
            <status>HTTP/1.1 404 Not Found</status>
          </propstat>
          </response>
        </multistatus>`.replace(/>\s+</g, "><")
    );
  });

  await openWizard({
    url: CalDAVServer.origin,
    username: "alice",
    password: "alice",
    expectedCalendars: [
      {
        uri: `${CalDAVServer.origin}/calendars/alice/test/`,
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
    url: CalDAVServer.origin,
    username: "alice",
    password: "alice",
    expectedCalendars: [
      {
        uri: `${CalDAVServer.origin}/calendars/alice/test/`,
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
    url: CalDAVServer.origin,
    username: "alice",
    password: "alice",
    expectedCalendars: [
      {
        uri: `${CalDAVServer.origin}/calendars/alice/test/`,
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
    url: CalDAVServer.origin,
    username: "alice",
    password: "alice",
    expectedCalendars: [
      {
        uri: `${CalDAVServer.origin}/calendars/alice/test/`,
        name: "CalDAV Test",
        color: "rgb(255, 128, 0)",
        readOnly: false,
      },
    ],
  });
  CalDAVServer.close();
});

/**
 * Test a server with a certificate problem.
 */
add_task(async function testCertificateError() {
  CalDAVServer.open("alice", "alice");
  const proxy = await HttpsProxy.create(CalDAVServer.port, "dav", "wrong.test");

  await openWizard({
    url: "https://wrong.test/",
    certError: "cancel",
    username: "alice",
    password: "alice",
    expectedCalendars: [],
  });

  proxy.destroy();
  CalDAVServer.close();
});

/**
 * Test a server with a certificate problem, but this time we accept the
 * exception dialog and try again.
 */
add_task(async function testCertificateErrorWithException() {
  CalDAVServer.open("alice", "alice");
  const proxy = await HttpsProxy.create(CalDAVServer.port, "dav", "wrong.test");

  await openWizard({
    url: "https://wrong.test/",
    certError: "extra1",
    username: "alice",
    password: "alice",
    expectedCalendars: [
      {
        uri: "https://wrong.test/calendars/alice/test/",
        name: "CalDAV Test",
        color: "rgb(255, 128, 0)",
      },
    ],
  });

  proxy.destroy();
  CalDAVServer.close();

  const isTemporary = {};
  Assert.ok(
    certOverrideService.hasMatchingOverride(
      "wrong.test",
      443,
      {},
      await ServerTestUtils.getCertificate("dav"),
      isTemporary
    ),
    "certificate exception should exist for wrong.test:443"
  );

  certOverrideService.clearAllOverrides();
});
