/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

function handleRequest(request, response) {
  if (!request.hasHeader("Authorization")) {
    response.setStatusLine("1.1", 401, "Unauthorized");
    response.setHeader("WWW-Authenticate", `Basic realm="test"`);
    return;
  }

  response.setStatusLine("1.1", 207, "Multi-Status");
  response.setHeader("Content-Type", "text/xml", false);

  // Request:
  // <propfind>
  //   <prop>
  //     <resourcetype/>
  //     <displayname/>
  //     <current-user-privilege-set/>
  //     <calendar-color/>
  //   </prop>
  // </propfind>

  response.write(`<multistatus xmlns="DAV:"
                               xmlns:A="http://apple.com/ns/ical/"
                               xmlns:C="urn:ietf:params:xml:ns:caldav"
                               xmlns:CS="http://calendarserver.org/ns/">
    <response>
      <href>/browser/comm/calendar/test/browser/data/calendars.sjs</href>
      <propstat>
        <prop>
          <resourcetype>
            <collection/>
          </resourcetype>
          <displayname>Things found by DNS</displayname>
        </prop>
        <status>HTTP/1.1 200 OK</status>
      </propstat>
      <propstat>
        <prop>
          <current-user-privilege-set/>
          <A:calendar-color/>
        </prop>
        <status>HTTP/1.1 404 Not Found</status>
      </propstat>
    </response>
    <response>
      <href>/browser/comm/calendar/test/browser/data/calendar.sjs</href>
      <propstat>
        <prop>
          <resourcetype>
            <collection/>
            <C:calendar/>
            <CS:shared/>
          </resourcetype>
          <displayname>You found me!</displayname>
          <A:calendar-color>#008000</A:calendar-color>
        </prop>
        <status>HTTP/1.1 200 OK</status>
      </propstat>
      <propstat>
        <prop>
          <current-user-privilege-set/>
        </prop>
        <status>HTTP/1.1 404 Not Found</status>
      </propstat>
    </response>
  </multistatus>`);
}
