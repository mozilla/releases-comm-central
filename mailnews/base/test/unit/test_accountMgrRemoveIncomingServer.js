/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_setup(function () {
  do_get_profile();
});

function createTestServer(username, hostname) {
  return MailServices.accounts.createIncomingServer(username, hostname, "pop3");
}

function assertServerRemoved(server) {
  Assert.ok(
    !MailServices.accounts.allServers.some(item => item.key == server.key),
    "server should be deregistered"
  );
  Assert.deepEqual(
    Services.prefs.getChildList(`mail.server.${server.key}.`),
    [],
    "server preferences should be cleared"
  );
}

add_task(function testRemoveWithUnavailableServerDirectory() {
  const username = "server-directory-user";
  const hostname = "server-directory.example.invalid";
  const server = createTestServer(username, hostname);
  server.wrappedJSObject.removeFiles = () => {
    throw Components.Exception(
      "server directory unavailable",
      Cr.NS_ERROR_FILE_ACCESS_DENIED
    );
  };

  MailServices.accounts.removeIncomingServer(server, true);

  assertServerRemoved(server);

  const retry = createTestServer(username, hostname);
  Assert.ok(retry, "the same server should be creatable again");
  MailServices.accounts.removeIncomingServer(retry, false);
});

add_task(function testRemoveWithUnavailableRootFolder() {
  const username = "root-folder-user";
  const hostname = "root-folder.example.invalid";
  const server = createTestServer(username, hostname);
  Object.defineProperty(server.wrappedJSObject, "rootFolder", {
    configurable: true,
    get() {
      throw Components.Exception(
        "root folder unavailable",
        Cr.NS_ERROR_FAILURE
      );
    },
  });

  MailServices.accounts.removeIncomingServer(server, false);

  assertServerRemoved(server);

  const retry = createTestServer(username, hostname);
  Assert.ok(retry, "the same server should be creatable again");
  MailServices.accounts.removeIncomingServer(retry, false);
});
