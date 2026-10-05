/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
var { ICSServer } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ICSServer.sys.mjs"
);

var { detection } = ChromeUtils.importESModule(
  "resource:///modules/calendar/utils/calProviderDetectionUtils.sys.mjs"
);
var { HttpServer } = ChromeUtils.importESModule("resource://testing-common/httpd.sys.mjs");
var { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);

const USERNAME = "user";
const PASSWORD = "password";
// The entered location, a server on the same site, and one on another site.
const HOSTNAMES = ["example.org", "dav.example.org", "example.com"];

let redirectServer;
const authorizations = [];

add_setup(async () => {
  do_get_profile();

  ICSServer.open();
  ICSServer.putICSInternal(
    CalendarTestUtils.dedent`
      BEGIN:VCALENDAR
      BEGIN:VEVENT
      UID:6714b781-920f-46f8-80ec-3d3995e2e9ce
      SUMMARY:some event
      DTSTART:20210401T120000Z
      DTEND:20210401T130000Z
      END:VEVENT
      END:VCALENDAR
      `
  );
  registerCleanupFunction(() => ICSServer.close());

  redirectServer = new HttpServer();
  redirectServer.registerPathHandler("/redirect", (request, response) => {
    response.setStatusLine("1.1", 302, "Found");
    response.setHeader("Location", `http://${request.queryString}/test.ics`);
  });
  redirectServer.registerPathHandler("/test.ics", (request, response) => {
    const authorization = request.hasHeader("Authorization")
      ? request.getHeader("Authorization")
      : null;
    authorizations.push({ host: request.host, authorization });
    if (authorization != `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`) {
      response.setStatusLine("1.1", 401, "Unauthorized");
      response.setHeader("WWW-Authenticate", `Basic realm="test"`);
      return;
    }
    response.setHeader("Content-Type", "text/calendar");
    response.write("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
  });
  redirectServer.start(-1);
  for (const hostname of HOSTNAMES) {
    redirectServer.identity.add("http", hostname, 80);
    NetworkTestUtils.configureProxy(hostname, 80, redirectServer.identity.primaryPort);
  }
  registerCleanupFunction(async () => {
    for (const hostname of HOSTNAMES) {
      NetworkTestUtils.unconfigureProxy(hostname, 80);
    }
    await new Promise(resolve => redirectServer.stop(resolve));
  });
});

add_task(async function testIcsDetection() {
  const url = `${ICSServer.origin}/test.ics`;
  const detectedCals = await detection.detect("", "", url, false, null, [], {});
  Assert.ok(detectedCals, "should find calendars");
  Assert.equal(detectedCals.size, 1, "should find one calendar");
  const icsCal = detectedCals.values().next().value[0];
  Assert.equal(icsCal.uri.spec, url, "should have expected uri");
});

add_task(async function testIcsDetection302() {
  // This url will redirect to test.ics for the actual content.
  // We still want to subscribe to the original url.
  const url = `${ICSServer.origin}/http302?path=test.ics`;
  const detectedCals = await detection.detect("", "", url, false, null, [], {});
  Assert.ok(detectedCals, "should find calendars");
  Assert.equal(detectedCals.size, 1, "should find one calendar");
  const icsCal = detectedCals.values().next().value[0];
  Assert.equal(icsCal.uri.spec, url, "should have expected uri");
});

add_task(async function testIcsDetectionPasswordRedirectSameSite() {
  authorizations.length = 0;
  const calendars = await detection.providers
    .get("ics")
    .detectCalendars(USERNAME, PASSWORD, "http://example.org/redirect?dav.example.org", false);
  Assert.equal(calendars.length, 1, "should find the calendar on the same site");
  Assert.ok(
    authorizations.some(a => a.host == "dav.example.org" && a.authorization),
    "should send the password to a server on the same site"
  );
});

add_task(async function testIcsDetectionPasswordRedirectOtherSite() {
  authorizations.length = 0;
  await detection.providers
    .get("ics")
    .detectCalendars(USERNAME, PASSWORD, "http://example.org/redirect?example.com", false)
    .catch(() => {});
  Assert.ok(authorizations.length, "should have tried the server on another site");
  Assert.deepEqual(
    authorizations.filter(a => a.authorization),
    [],
    "should not send the password to a server on another site"
  );
});
