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
  response.setHeader("Content-Type", "text/xml; charset=utf-8", false);

  // Request:
  // <propfind>
  //   <prop>
  //     <resourcetype/>
  //     <displayname/>
  //     <current-user-privilege-set/>
  //     <calendar-color/>
  //   </prop>
  // </propfind>

  const res = `<multistatus xmlns="DAV:"
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
    <response>
      <href>/browser/comm/calendar/test/browser/data/calendar2.sjs</href>
      <propstat>
        <prop>
          <resourcetype>
            <collection/>
            <C:calendar/>
            <CS:shared/>
          </resourcetype>
          <displayname>Röda dagar</displayname>
          <A:calendar-color>#ff0000</A:calendar-color>
          <current-user-privilege-set>
           <privilege>
            <read/>
           </privilege>
           <privilege>
            <C:read-free-busy/>
           </privilege>
           <privilege>
            <read-current-user-privilege-set/>
           </privilege>
           <privilege>
            <write/>
           </privilege>
           <privilege>
            <write-content/>
           </privilege>
           <privilege>
            <write-properties/>
           </privilege>
           <privilege>
            <bind/>
           </privilege>
           <privilege>
            <unbind/>
           </privilege>
          </current-user-privilege-set>
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
  </multistatus>`;

  const bytes = new TextEncoder().encode(res);
  let str = "";
  for (let i = 0; i < bytes.length; i += 65536) {
    str += String.fromCharCode.apply(null, bytes.subarray(i, i + 65536));
  }
  response.write(str);
}
