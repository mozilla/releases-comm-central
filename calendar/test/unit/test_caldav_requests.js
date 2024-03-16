/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");

var { HttpServer } = ChromeUtils.importESModule("resource://testing-common/httpd.sys.mjs");
var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

var {
  CalDavGenericRequest,
  CalDavItemRequest,
  CalDavDeleteItemRequest,
  CalDavPropfindRequest,
  CalDavHeaderRequest,
  CalDavPrincipalPropertySearchRequest,
  CalDavOutboxRequest,
  CalDavFreeBusyRequest,
} = ChromeUtils.importESModule("resource:///modules/caldav/CalDavRequest.sys.mjs");
var { CalDavWebDavSyncHandler } = ChromeUtils.importESModule(
  "resource:///modules/caldav/CalDavRequestHandlers.sys.mjs"
);

var { CalDavSession } = ChromeUtils.importESModule(
  "resource:///modules/caldav/CalDavSession.sys.mjs"
);
var { CalDavXmlns } = ChromeUtils.importESModule("resource:///modules/caldav/CalDavUtils.sys.mjs");
var { Preferences } = ChromeUtils.importESModule("resource://gre/modules/Preferences.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
});

class LowerMap extends Map {
  get(key) {
    return super.get(key.toLowerCase());
  }
  set(key, value) {
    return super.set(key.toLowerCase(), value);
  }
}

var gServer;

var MockConflictPrompt = {
  _origFunc: null,
  overwrite: false,
  register() {
    if (!this._origFunc) {
      this._origFunc = cal.provider.promptOverwrite;
      cal.provider.promptOverwrite = (aMode, aItem) => {
        return this.overwrite;
      };
    }
  },

  unregister() {
    if (this._origFunc) {
      cal.provider.promptOverwrite = this._origFunc;
      this._origFunc = null;
    }
  },
};

class MockAlertsService {
  QueryInterface = ChromeUtils.generateQI(["nsIAlertsService"]);
  showAlert() {}
}

function replaceAlertsService() {
  const originalAlertsServiceCID = MockRegistrar.register(
    "@mozilla.org/alerts-service;1",
    MockAlertsService
  );
  registerCleanupFunction(() => {
    MockRegistrar.unregister(originalAlertsServiceCID);
  });
}

var gMockCalendar = {
  name: "xpcshell",
  makeUri(insert, base) {
    return base;
  },
  verboseLogging() {
    return true;
  },
  ensureEncodedPath(x) {
    return x;
  },
  ensureDecodedPath(x) {
    return x;
  },
  startBatch() {},
  endBatch() {},
  addTargetCalendarItem() {},
  finalizeUpdatedItems() {},
  mHrefIndex: [],
};
gMockCalendar.superCalendar = gMockCalendar;

class CalDavServer {
  constructor(calendarId) {
    this.server = new HttpServer();
    this.calendarId = calendarId;
    this.session = new CalDavSession(this.calendarId, "xpcshell");
    this.serverRequests = {};

    this.server.registerPrefixHandler(
      "/principals/",
      this.router.bind(this, this.principals.bind(this))
    );
    this.server.registerPrefixHandler(
      "/calendars/",
      this.router.bind(this, this.calendars.bind(this))
    );
    this.server.registerPrefixHandler(
      "/requests/",
      this.router.bind(this, this.requests.bind(this))
    );
  }

  start() {
    this.server.start(-1);
    registerCleanupFunction(() => this.server.stop(() => {}));
  }

  reset() {
    this.serverRequests = {};
  }

  uri(path) {
    const base = Services.io.newURI(`http://localhost:${this.server.identity.primaryPort}/`);
    return Services.io.newURI(path, null, base);
  }

  router(nextHandler, request, response) {
    try {
      const method = request.method;
      const parameters = new Map(request.queryString.split("&").map(part => part.split("=", 2)));
      const available = request.bodyInputStream.available();
      const body =
        available > 0 ? NetUtil.readInputStreamToString(request.bodyInputStream, available) : null;

      const headers = new LowerMap();

      const headerIterator = function* (enumerator) {
        while (enumerator.hasMoreElements()) {
          yield enumerator.getNext().QueryInterface(Ci.nsISupportsString);
        }
      };

      for (const hdr of headerIterator(request.headers)) {
        headers.set(hdr.data, request.getHeader(hdr.data));
      }

      return nextHandler(request, response, method, headers, parameters, body);
    } catch (e) {
      info("Server Error: " + e.fileName + ":" + e.lineNumber + ": " + e + "\n");
      return null;
    }
  }

  resetClient(client) {
    MockConflictPrompt.unregister();
    cal.manager.unregisterCalendar(client);
  }

  waitForLoad(aCalendar) {
    return new Promise((resolve, reject) => {
      const observer = cal.createAdapter(Ci.calIObserver, {
        onLoad() {
          const uncached = aCalendar.wrappedJSObject.mUncachedCalendar.wrappedJSObject;
          aCalendar.removeObserver(observer);

          if (Components.isSuccessCode(uncached._lastStatus)) {
            resolve(aCalendar);
          } else {
            reject(uncached._lastMessage);
          }
        },
      });
      aCalendar.addObserver(observer);
    });
  }

  getClient() {
    const uri = this.uri("/calendars/xpcshell/events");
    const client = cal.manager.createCalendar("caldav", uri);
    const uclient = client.wrappedJSObject;
    client.name = "xpcshell";
    client.setProperty("cache.enabled", true);

    // Make sure we catch the last error message in case sync fails
    monkeyPatch(uclient, "replayChangesOn", (protofunc, aListener) => {
      protofunc({
        onResult(operation, detail) {
          uclient._lastStatus = operation.status;
          uclient._lastMessage = detail;
          aListener.onResult(operation, detail);
        },
      });
    });

    cal.manager.registerCalendar(client);

    const cachedCalendar = cal.manager.getCalendarById(client.id);
    return this.waitForLoad(cachedCalendar);
  }

  principals(request, response, method, headers, parameters, body) {
    this.serverRequests.principals = { method, headers, parameters, body };

    if (method == "REPORT" && request.path == "/principals/") {
      response.setHeader("Content-Type", "application/xml");
      response.write(dedent`
        <?xml version="1.0" encoding="utf-8" ?>
        <D:multistatus xmlns:D="DAV:" xmlns:B="http://BigCorp.com/ns/">
          <D:response>
            <D:href>http://www.example.com/users/jdoe</D:href>
            <D:propstat>
              <D:prop>
                <D:displayname>John Doe</D:displayname>
                <B:department>Widget Sales</B:department>
                <B:phone>234-4567</B:phone>
                <B:office>209</B:office>
              </D:prop>
              <D:status>HTTP/1.1 200 OK</D:status>
            </D:propstat>
            <D:propstat>
              <D:prop>
                <B:salary/>
              </D:prop>
              <D:status>HTTP/1.1 403 Forbidden</D:status>
            </D:propstat>
          </D:response>
          <D:response>
            <D:href>http://www.example.com/users/zsmith</D:href>
            <D:propstat>
              <D:prop>
                <D:displayname>Zygdoebert Smith</D:displayname>
                <B:department>Gadget Sales</B:department>
                <B:phone>234-7654</B:phone>
                <B:office>114</B:office>
              </D:prop>
              <D:status>HTTP/1.1 200 OK</D:status>
            </D:propstat>
            <D:propstat>
              <D:prop>
                <B:salary/>
              </D:prop>
              <D:status>HTTP/1.1 403 Forbidden</D:status>
            </D:propstat>
          </D:response>
        </D:multistatus>
      `);
      response.setStatusLine(null, 207, "Multistatus");
    } else if (method == "PROPFIND" && request.path == "/principals/xpcshell/user/") {
      response.setHeader("Content-Type", "application/xml");
      response.write(dedent`
        <?xml version="1.0" encoding="utf-8"?>
        <D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
          <D:response>
            <D:href>${this.uri("/principals/xpcshell/user").spec}</D:href>
            <D:propstat>
              <D:prop>
                <C:calendar-home-set>
                  <D:href>${this.uri("/calendars/xpcshell/user/").spec}</D:href>
                </C:calendar-home-set>
                <C:calendar-user-address-set>
                  <D:href>mailto:xpcshell@example.com</D:href>
                </C:calendar-user-address-set>
                <C:schedule-inbox-URL>
                  <D:href>${this.uri("/calendars/xpcshell/inbox").spec}/</D:href>
                </C:schedule-inbox-URL>
                <C:schedule-outbox-URL>
                  <D:href>${this.uri("/calendars/xpcshell/outbox").spec}</D:href>
                </C:schedule-outbox-URL>
              </D:prop>
              <D:status>HTTP/1.1 200 OK</D:status>
            </D:propstat>
          </D:response>
        </D:multistatus>
      `);
      response.setStatusLine(null, 207, "Multistatus");
    }
  }

  calendars(request, response, method, headers, parameters, body) {
    this.serverRequests.calendars = { method, headers, parameters, body };

    if (
      method == "PROPFIND" &&
      request.path.startsWith("/calendars/xpcshell/events") &&
      headers.get("depth") == 0
    ) {
      response.setHeader("Content-Type", "application/xml");
      response.write(dedent`
        <?xml version="1.0" encoding="utf-8" ?>
        <D:multistatus ${CalDavXmlns("D", "C", "CS")} xmlns:R="http://www.foo.bar/boxschema/">
          <D:response>
            <D:href>${request.path}</D:href>
            <D:propstat>
              <D:prop>
                <D:resourcetype>
                  <D:collection/>
                  <C:calendar/>
                </D:resourcetype>
                <R:plain-text-prop>hello, world</R:plain-text-prop>
                <D:principal-collection-set>
                  <D:href>${this.uri("/principals/").spec}</D:href>
                  <D:href>${this.uri("/principals/subthing/").spec}</D:href>
                </D:principal-collection-set>
                <D:current-user-principal>
                  <D:href>${this.uri("/principals/xpcshell/user").spec}</D:href>
                </D:current-user-principal>
                <D:supported-report-set>
                  <D:supported-report>
                    <D:report>
                      <D:principal-property-search/>
                    </D:report>
                  </D:supported-report>
                  <D:supported-report>
                    <D:report>
                      <C:calendar-multiget/>
                    </D:report>
                  </D:supported-report>
                  <D:supported-report>
                    <D:report>
                      <D:sync-collection/>
                    </D:report>
                  </D:supported-report>
                </D:supported-report-set>
                <C:supported-calendar-component-set>
                  <C:comp name="VEVENT"/>
                  <C:comp name="VTODO"/>
                </C:supported-calendar-component-set>
                <C:schedule-inbox-URL>
                  <D:href>${this.uri("/calendars/xpcshell/inbox").spec}</D:href>
                </C:schedule-inbox-URL>
                <C:schedule-outbox-URL>
                  ${this.uri("/calendars/xpcshell/outbox").spec}
                </C:schedule-outbox-URL>
                <CS:getctag>1413647159-1007960</CS:getctag>
              </D:prop>
              <D:status>HTTP/1.1 200 OK</D:status>
            </D:propstat>
            <D:propstat>
              <D:prop>
                <R:obscure-thing-not-found/>
              </D:prop>
              <D:status>HTTP/1.1 404 Not Found</D:status>
            </D:propstat>
          </D:response>
        </D:multistatus>
      `);
      response.setStatusLine(null, 207, "Multistatus");
    } else if (method == "POST" && request.path == "/calendars/xpcshell/outbox") {
      response.setHeader("Content-Type", "application/xml");
      response.write(dedent`
        <?xml version="1.0" encoding="utf-8" ?>
        <C:schedule-response ${CalDavXmlns("D", "C")}>
          <D:response>
            <D:href>mailto:recipient1@example.com</D:href>
            <D:request-status>2.0;Success</D:request-status>
          </D:response>
          <D:response>
            <D:href>mailto:recipient2@example.com</D:href>
            <D:request-status>2.0;Success</D:request-status>
          </D:response>
        </C:schedule-response>
      `);
      response.setStatusLine(null, 200, "OK");
    } else if (method == "POST" && request.path == "/calendars/xpcshell/outbox2") {
      response.setHeader("Content-Type", "application/xml");
      response.write(dedent`
        <?xml version="1.0" encoding="utf-8" ?>
        <C:schedule-response ${CalDavXmlns("D", "C")}>
          <D:response>
            <D:recipient>
              <D:href>mailto:recipient1@example.com</D:href>
            </D:recipient>
            <D:request-status>2.0;Success</D:request-status>
            <C:calendar-data>
        BEGIN:VCALENDAR
        PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN
        VERSION:2.0
        METHOD:REQUEST
        BEGIN:VFREEBUSY
        DTSTART;VALUE=DATE:20180102
        DTEND;VALUE=DATE:20180126
        ORGANIZER:mailto:xpcshell@example.com
        ATTENDEE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT;CUTYPE=INDIVIDUAL:mail
          to:recipient@example.com
        FREEBUSY;FBTYPE=FREE:20180103T010101Z/20180117T010101Z
        FREEBUSY;FBTYPE=BUSY:20180118T010101Z/P7D
        END:VFREEBUSY
        END:VCALENDAR
            </C:calendar-data>
          </D:response>
        </C:schedule-response>
      `);
      response.setStatusLine(null, 200, "OK");
    } else if (method == "OPTIONS" && request.path == "/calendars/xpcshell/") {
      response.setHeader(
        "DAV",
        "1, 2, 3, access-control, extended-mkcol, resource-sharing, calendar-access, calendar-auto-schedule, calendar-query-extended, calendar-availability, calendarserver-sharing, inbox-availability"
      );
      response.setStatusLine(null, 200, "OK");
    } else if (method == "REPORT" && request.path == "/calendars/xpcshell/events/") {
      response.setHeader("Content-Type", "application/xml");
      const bodydom = cal.xml.parseString(body);
      const report = bodydom.documentElement.localName;
      const eventName = String.fromCharCode(...new TextEncoder().encode("イベント"));
      if (report == "sync-collection") {
        response.write(dedent`
          <?xml version="1.0" encoding="utf-8" ?>
          <D:multistatus ${CalDavXmlns("D")}>
            <D:response>
              <D:href>${this.uri("/calendars/xpcshell/events/test.ics").spec}</D:href>
              <D:propstat>
                <D:prop>
                  <D:getcontenttype>text/calendar; charset=utf-8; component=VEVENT</D:getcontenttype>
                  <D:getetag>"2decee6ffb701583398996bfbdacb8eec53edf94"</D:getetag>
                  <D:displayname>${eventName}</D:displayname>
                </D:prop>
                <D:status>HTTP/1.1 200 OK</D:status>
              </D:propstat>
            </D:response>
          </D:multistatus>
        `);
      } else if (report == "calendar-multiget") {
        const event = new CalEvent();
        event.title = "会議";
        event.startDate = cal.dtz.now();
        event.endDate = cal.dtz.now();
        const icalString = String.fromCharCode(...new TextEncoder().encode(event.icalString));
        response.write(dedent`
          <?xml version="1.0" encoding="utf-8"?>
          <D:multistatus ${CalDavXmlns("D", "C")}>
            <D:response>
              <D:href>${this.uri("/calendars/xpcshell/events/test.ics").spec}</D:href>
              <D:propstat>
                <D:prop>
                  <D:getetag>"2decee6ffb701583398996bfbdacb8eec53edf94"</D:getetag>
                  <C:calendar-data>${icalString}</C:calendar-data>
                </D:prop>
              </D:propstat>
            </D:response>
          </D:multistatus>
        `);
      }
      response.setStatusLine(null, 207, "Multistatus");
    } else {
      console.log("XXX: " + method, request.path, [...headers.entries()]);
    }
  }

  requests(request, response, method, headers, parameters, body) {
    // ["", "requests", "generic"] := /requests/generic
    const parts = request.path.split("/");
    const id = parts[2];
    let status = parseInt(parts[3] || "", 10) || 200;

    if (id == "redirected") {
      response.setHeader("Location", "/requests/redirected-target", false);
      status = 302;
    } else if (id == "dav") {
      response.setHeader("DAV", "1, calendar-schedule, calendar-auto-schedule");
    }

    this.serverRequests[id] = { method, headers, parameters, body };

    for (const [hdr, value] of headers.entries()) {
      response.setHeader(hdr, "response-" + value, false);
    }

    response.setHeader("Content-Type", "application/xml");
    response.write(`<response id="${id}">xpc</response>`);
    response.setStatusLine(null, status, null);
  }
}

function run_test() {
  Preferences.set("calendar.debug.log", true);
  Preferences.set("calendar.debug.log.verbose", true);
  cal.console.maxLogLevel = "debug";
  replaceAlertsService();

  // TODO: make do_calendar_startup to work with this test and replace the startup code here
  do_get_profile();
  do_test_pending();

  cal.manager.startup({
    onResult() {
      gServer = new CalDavServer("xpcshell@example.com");
      gServer.start();
      cal.timezoneService.startup({
        onResult() {
          run_next_test();
          do_test_finished();
        },
      });
    },
  });
}

add_task(async function test_caldav_session() {
  gServer.reset();

  let prepared = 0;
  let redirected = 0;
  let completed = 0;
  let restart = false;

  gServer.session.authAdapters.localhost = {
    async prepareRequest(aChannel) {
      prepared++;
    },

    async prepareRedirect(aOldChannel, aNewChannel) {
      redirected++;
    },

    async completeRequest(aResponse) {
      completed++;
      if (restart) {
        restart = false;
        return CalDavSession.RESTART_REQUEST;
      }
      return null;
    },
  };

  // First a simple request
  let uri = gServer.uri("/requests/session");
  let request = new CalDavGenericRequest(gServer.session, gMockCalendar, "HEAD", uri);
  await request.commit();

  equal(prepared, 1);
  equal(redirected, 0);
  equal(completed, 1);

  // Now a redirect
  prepared = redirected = completed = 0;

  uri = gServer.uri("/requests/redirected");
  request = new CalDavGenericRequest(gServer.session, gMockCalendar, "HEAD", uri);
  await request.commit();

  equal(prepared, 1);
  equal(redirected, 1);
  equal(completed, 1);

  // Now with restarting the request
  prepared = redirected = completed = 0;
  restart = true;

  uri = gServer.uri("/requests/redirected");
  request = new CalDavGenericRequest(gServer.session, gMockCalendar, "HEAD", uri);
  await request.commit();

  equal(prepared, 2);
  equal(redirected, 2);
  equal(completed, 2);
});

/**
 * This test covers both GenericRequest and the base class CalDavRequestBase/CalDavResponseBase
 */
add_task(async function test_generic_request() {
  gServer.reset();
  const uri = gServer.uri("/requests/generic");
  const headers = { "X-Hdr": "exists" };
  const request = new CalDavGenericRequest(
    gServer.session,
    gMockCalendar,
    "PUT",
    uri,
    headers,
    "<body>xpc</body>",
    "text/plain"
  );

  strictEqual(request.uri.spec, uri.spec);
  strictEqual(request.session.id, gServer.session.id);
  strictEqual(request.calendar, gMockCalendar);
  strictEqual(request.uploadData, "<body>xpc</body>");
  strictEqual(request.contentType, "text/plain");
  strictEqual(request.response, null);
  strictEqual(request.getHeader("X-Hdr"), null); // Only works after commit

  const response = await request.commit();

  ok(!!request.response);
  equal(request.getHeader("X-Hdr"), "exists");

  equal(response.uri.spec, uri.spec);
  ok(!response.redirected);
  equal(response.status, 200);
  equal(response.statusCategory, 2);
  ok(response.ok);
  ok(!response.clientError);
  ok(!response.conflict);
  ok(!response.notFound);
  ok(!response.serverError);
  equal(response.text, '<response id="generic">xpc</response>');
  equal(response.xml.documentElement.localName, "response");
  equal(response.getHeader("X-Hdr"), "response-exists");

  const serverResult = gServer.serverRequests.generic;

  equal(serverResult.method, "PUT");
  equal(serverResult.headers.get("x-hdr"), "exists");
  equal(serverResult.headers.get("content-type"), "text/plain");
  equal(serverResult.body, "<body>xpc</body>");
});

add_task(async function test_generic_redirected_request() {
  gServer.reset();
  const uri = gServer.uri("/requests/redirected");
  const headers = {
    Depth: 1,
    Originator: "o",
    Recipient: "r",
    "If-None-Match": "*",
    "If-Match": "123",
  };
  const request = new CalDavGenericRequest(
    gServer.session,
    gMockCalendar,
    "PUT",
    uri,
    headers,
    "<body>xpc</body>",
    "text/plain"
  );

  const response = await request.commit();

  ok(response.redirected);
  equal(response.status, 200);
  equal(response.text, '<response id="redirected-target">xpc</response>');
  equal(response.xml.documentElement.getAttribute("id"), "redirected-target");

  ok(gServer.serverRequests.redirected);
  ok(gServer.serverRequests["redirected-target"]);

  let results = gServer.serverRequests.redirected;
  equal(results.headers.get("Depth"), 1);
  equal(results.headers.get("Originator"), "o");
  equal(results.headers.get("Recipient"), "r");
  equal(results.headers.get("If-None-Match"), "*");
  equal(results.headers.get("If-Match"), "123");

  results = gServer.serverRequests["redirected-target"];
  equal(results.headers.get("Depth"), 1);
  equal(results.headers.get("Originator"), "o");
  equal(results.headers.get("Recipient"), "r");
  equal(results.headers.get("If-None-Match"), "*");
  equal(results.headers.get("If-Match"), "123");

  equal(response.lastRedirectStatus, 302);
});

add_task(async function test_item_request() {
  gServer.reset();
  let uri = gServer.uri("/requests/item/201");
  const icalString = "BEGIN:VEVENT\r\nUID:123\r\nEND:VEVENT";
  const componentString = `BEGIN:VCALENDAR\r\nPRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN\r\nVERSION:2.0\r\n${icalString}\r\nEND:VCALENDAR\r\n`;
  let request = new CalDavItemRequest(
    gServer.session,
    gMockCalendar,
    uri,
    new CalEvent(icalString),
    "*"
  );
  let response = await request.commit();

  equal(response.status, 201);
  ok(response.ok);

  let serverResult = gServer.serverRequests.item;

  equal(serverResult.method, "PUT");
  equal(serverResult.body, componentString);
  equal(serverResult.headers.get("If-None-Match"), "*");
  ok(!serverResult.headers.has("If-Match"));

  // Now the same with 204 No Content and an etag
  gServer.reset();
  uri = gServer.uri("/requests/item/204");
  request = new CalDavItemRequest(
    gServer.session,
    gMockCalendar,
    uri,
    new CalEvent(icalString),
    "123123"
  );
  response = await request.commit();

  equal(response.status, 204);
  ok(response.ok);

  serverResult = gServer.serverRequests.item;

  equal(serverResult.method, "PUT");
  equal(serverResult.body, componentString);
  equal(serverResult.headers.get("If-Match"), "123123");
  ok(!serverResult.headers.has("If-None-Match"));

  // Now the same with 200 OK and no etag
  gServer.reset();
  uri = gServer.uri("/requests/item/200");
  request = new CalDavItemRequest(gServer.session, gMockCalendar, uri, new CalEvent(icalString));
  response = await request.commit();

  equal(response.status, 200);
  ok(response.ok);

  serverResult = gServer.serverRequests.item;

  equal(serverResult.method, "PUT");
  equal(serverResult.body, componentString);
  ok(!serverResult.headers.has("If-Match"));
  ok(!serverResult.headers.has("If-None-Match"));
});

add_task(async function test_delete_item_request() {
  gServer.reset();
  let uri = gServer.uri("/requests/deleteitem");
  let request = new CalDavDeleteItemRequest(gServer.session, gMockCalendar, uri, "*");

  strictEqual(request.uploadData, null);
  strictEqual(request.contentType, null);

  let response = await request.commit();

  equal(response.status, 200);
  ok(response.ok);

  let serverResult = gServer.serverRequests.deleteitem;

  equal(serverResult.method, "DELETE");
  equal(serverResult.headers.get("If-Match"), "*");
  ok(!serverResult.headers.has("If-None-Match"));

  // Now the same with no etag, and a (valid) 404 response
  gServer.reset();
  uri = gServer.uri("/requests/deleteitem/404");
  request = new CalDavDeleteItemRequest(gServer.session, gMockCalendar, uri);
  response = await request.commit();

  equal(response.status, 404);
  ok(response.ok);

  serverResult = gServer.serverRequests.deleteitem;

  equal(serverResult.method, "DELETE");
  ok(!serverResult.headers.has("If-Match"));
  ok(!serverResult.headers.has("If-None-Match"));
});

add_task(async function test_propfind_request() {
  gServer.reset();
  const uri = gServer.uri("/calendars/xpcshell/events");
  const props = [
    "D:principal-collection-set",
    "D:current-user-principal",
    "D:supported-report-set",
    "C:supported-calendar-component-set",
    "C:schedule-inbox-URL",
    "C:schedule-outbox-URL",
    "R:obscure-thing-not-found",
  ];
  const request = new CalDavPropfindRequest(gServer.session, gMockCalendar, uri, props);
  const response = await request.commit();

  equal(response.status, 207);
  ok(response.ok);

  const results = gServer.serverRequests.calendars;

  ok(
    results.body.match(/<D:prop>\s*<D:principal-collection-set\/>\s*<D:current-user-principal\/>/)
  );

  equal(Object.keys(response.data).length, 1);
  ok(!!response.data[uri.filePath]);
  ok(!!response.firstProps);

  const resprops = response.firstProps;

  deepEqual(resprops["D:principal-collection-set"], [
    gServer.uri("/principals/").spec,
    gServer.uri("/principals/subthing/").spec,
  ]);
  equal(resprops["D:current-user-principal"], gServer.uri("/principals/xpcshell/user").spec);

  deepEqual(
    [...resprops["D:supported-report-set"].values()],
    ["D:principal-property-search", "C:calendar-multiget", "D:sync-collection"]
  );

  deepEqual([...resprops["C:supported-calendar-component-set"].values()], ["VEVENT", "VTODO"]);
  equal(resprops["C:schedule-inbox-URL"], gServer.uri("/calendars/xpcshell/inbox").spec);
  equal(resprops["C:schedule-outbox-URL"], gServer.uri("/calendars/xpcshell/outbox").spec);
  strictEqual(resprops["R:obscure-thing-not-found"], null);
  equal(resprops["R:plain-text-prop"], "hello, world");
});

add_task(async function test_davheader_request() {
  gServer.reset();
  const uri = gServer.uri("/requests/dav");
  const request = new CalDavHeaderRequest(gServer.session, gMockCalendar, uri);
  const response = await request.commit();

  const serverResult = gServer.serverRequests.dav;

  equal(serverResult.method, "OPTIONS");
  deepEqual([...response.features], ["calendar-schedule", "calendar-auto-schedule"]);
  strictEqual(response.version, 1);
});

add_task(async function test_propsearch_request() {
  gServer.reset();
  const uri = gServer.uri("/principals/");
  const props = ["D:displayname", "B:department", "B:phone", "B:office"];
  const request = new CalDavPrincipalPropertySearchRequest(
    gServer.session,
    gMockCalendar,
    uri,
    "doE",
    "D:displayname",
    props
  );
  const response = await request.commit();

  equal(response.status, 207);
  ok(response.ok);

  equal(response.data["http://www.example.com/users/jdoe"]["D:displayname"], "John Doe");

  ok(gServer.serverRequests.principals.body.includes("<D:match>doE</D:match>"));
  ok(gServer.serverRequests.principals.body.match(/<D:prop>\s*<D:displayname\/>\s*<\/D:prop>/));
  ok(
    gServer.serverRequests.principals.body.match(/<D:prop>\s*<D:displayname\/>\s*<B:department\/>/)
  );
});

add_task(async function test_outbox_request() {
  gServer.reset();
  const icalString = "BEGIN:VEVENT\r\nUID:123\r\nEND:VEVENT";
  const uri = gServer.uri("/calendars/xpcshell/outbox");
  const request = new CalDavOutboxRequest(
    gServer.session,
    gMockCalendar,
    uri,
    "xpcshell@example.com",
    ["recipient1@example.com", "recipient2@example.com"],
    "REPLY",
    new CalEvent(icalString)
  );
  const response = await request.commit();

  equal(response.status, 200);
  ok(response.ok);

  const results = gServer.serverRequests.calendars;

  ok(results.body.includes("METHOD:REPLY"));
  equal(results.method, "POST");
  equal(results.headers.get("Originator"), "xpcshell@example.com");
  equal(results.headers.get("Recipient"), "recipient1@example.com, recipient2@example.com");
});

add_task(async function test_freebusy_request() {
  gServer.reset();
  const uri = gServer.uri("/calendars/xpcshell/outbox2");
  const request = new CalDavFreeBusyRequest(
    gServer.session,
    gMockCalendar,
    uri,
    "mailto:xpcshell@example.com",
    "mailto:recipient@example.com",
    cal.createDateTime("20180101"),
    cal.createDateTime("20180201")
  );

  const response = await request.commit();

  equal(response.status, 200);
  ok(response.ok);

  const results = gServer.serverRequests.calendars;
  equal(
    ics_unfoldline(
      results.body
        .replace(/\r\n/g, "\n")
        .replace(/(UID|DTSTAMP):[^\n]+\n/g, "")
        .trim()
    ),
    dedent`
      BEGIN:VCALENDAR
      PRODID:-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN
      VERSION:2.0
      METHOD:REQUEST
      BEGIN:VFREEBUSY
      DTSTART;VALUE=DATE:20180101
      DTEND;VALUE=DATE:20180201
      ORGANIZER:mailto:xpcshell@example.com
      ATTENDEE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT;CUTYPE=INDIVIDUAL:mailto:recipient@example.com
      END:VFREEBUSY
      END:VCALENDAR
    `
  );
  equal(results.method, "POST");
  equal(results.headers.get("Content-Type"), "text/calendar; charset=utf-8");
  equal(results.headers.get("Originator"), "mailto:xpcshell@example.com");
  equal(results.headers.get("Recipient"), "mailto:recipient@example.com");

  const first = response.firstRecipient;
  equal(first.status, "2.0;Success");
  deepEqual(
    first.intervals.map(interval => interval.type),
    ["UNKNOWN", "FREE", "BUSY", "UNKNOWN"]
  );
  deepEqual(
    first.intervals.map(interval => interval.begin.icalString + ":" + interval.end.icalString),
    [
      "20180101:20180102",
      "20180103T010101Z:20180117T010101Z",
      "20180118T010101Z:20180125T010101Z",
      "20180126:20180201",
    ]
  );
});

add_task(async function test_caldav_client() {
  const client = await gServer.getClient();
  const items = await client.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null);

  equal(items.length, 1);
  equal(items[0].title, "会議");
});

/**
 * Test non-ASCII text in the XML response is parsed correctly in CalDavWebDavSyncHandler.
 */
add_task(async function test_caldav_sync() {
  gServer.reset();
  const uri = gServer.uri("/calendars/xpcshell/events/");
  gMockCalendar.session = gServer.session;
  const webDavSync = new CalDavWebDavSyncHandler(gMockCalendar, uri);
  await webDavSync.doWebDAVSync();
  ok(webDavSync.logXML.includes("イベント"), "Non-ASCII text should be parsed correctly");
});

add_task(function test_can_get_google_adapter() {
  // Initialize a session with bogus values
  const session = new CalDavSession("xpcshell@example.com", "xpcshell");

  // We don't have a facility for actually testing our Google CalDAV requests,
  // but we can at least verify that the adapter looks okay at a glance
  equal(
    session.authAdapters["apidata.googleusercontent.com"].authorizationEndpoint,
    "https://accounts.google.com/o/oauth2/auth"
  );
});
