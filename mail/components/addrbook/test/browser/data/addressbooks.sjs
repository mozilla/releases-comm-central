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
  //   </prop>
  // </propfind>

  response.write(`<multistatus xmlns="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
    <response>
      <href>/browser/comm/mail/components/addrbook/test/browser/data/addressbooks.sjs</href>
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
        </prop>
        <status>HTTP/1.1 404 Not Found</status>
      </propstat>
    </response>
    <response>
      <href>/browser/comm/mail/components/addrbook/test/browser/data/addressbook.sjs</href>
      <propstat>
        <prop>
          <resourcetype>
            <collection/>
            <card:addressbook/>
          </resourcetype>
          <displayname>You found me!</displayname>
          <current-user-privilege-set>
            <privilege>
              <all/>
            </privilege>
          </current-user-privilege-set>
        </prop>
        <status>HTTP/1.1 200 OK</status>
      </propstat>
    </response>
  </multistatus>`);
}
