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
  //     <owner/>
  //     <displayname/>
  //     <current-user-principal/>
  //     <current-user-privilege-set/>
  //     <calendar-color/>
  //     <calendar-home-set/>
  //   </prop>
  // </propfind>

  response.write(`<multistatus xmlns="DAV:"
                               xmlns:A="http://apple.com/ns/ical/"
                               xmlns:C="urn:ietf:params:xml:ns:caldav">
    <response>
      <href>/browser/comm/calendar/test/browser/data/dns.sjs</href>
      <propstat>
        <prop>
          <resourcetype>
            <collection/>
          </resourcetype>
          <current-user-principal>
            <href>/browser/comm/calendar/test/browser/data/principal.sjs</href>
          </current-user-principal>
        </prop>
        <status>HTTP/1.1 200 OK</status>
      </propstat>
      <propstat>
        <prop>
          <owner/>
          <displayname/>
          <current-user-privilege-set/>
          <A:calendar-color/>
          <C:calendar-home-set/>
        </prop>
        <status>HTTP/1.1 404 Not Found</status>
      </propstat>
    </response>
  </multistatus>`);
}
