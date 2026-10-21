/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that mailbox: URLs with UNC paths to remote hosts are blocked.
 */

const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

function openChannel(path) {
  const uri = Services.io.newURI(`mailbox://${path}?number=0&part=1.2`);
  try {
    NetUtil.newChannel({ uri, loadUsingSystemPrincipal: true });
  } catch (ex) {
    return ex.result;
  }
  return Cr.NS_OK;
}

add_task(function test_blockedPaths() {
  for (const path of [
    "///example.com/share/msg.eml",
    "///192.0.2.1/share/msg.eml",
    "///2130706433/share/msg.eml",
    "///017700000001/share/msg.eml",
    "///0x7f000001/share/msg.eml",
    "///%3F/UNC/192.0.2.1/share/msg.eml",
    "///%3f/unc/example.com/share/msg.eml",
    "/%5C%5C.%5CUNC%5C192.0.2.1%5Cshare%5Cmsg.eml",
    "//%5C%3F%5CUNC%5C192.0.2.1%5Cshare%5Cmsg.eml",
    "/%5C%5C%3F/UNC//192.0.2.1/share/msg.eml",
    "////192.0.2.1/share/msg.eml",
    "///%3F/GLOBALROOT/Device/Mup/192.0.2.1/share/msg.eml",
    "/%5C%5C.%5Cpipe%5Cfoo",
    "///%3F/C:/../UNC/192.0.2.1/share/msg.eml",
    "///lanhost/share/%5C..%5Cmsg.eml",
    "///%3F",
  ]) {
    Assert.equal(
      openChannel(path),
      Cr.NS_ERROR_FILE_UNRECOGNIZED_PATH,
      `mailbox:${path} should be blocked`
    );
  }
});

add_task(function test_allowedPaths() {
  for (const path of [
    "///lanhost/share/msg.eml",
    "///%3F/UNC/lanhost/share/msg.eml",
    "///%3F/C:/msg.eml",
  ]) {
    Assert.notEqual(
      openChannel(path),
      Cr.NS_ERROR_FILE_UNRECOGNIZED_PATH,
      `mailbox:${path} should not be blocked`
    );
  }
});

add_task(function test_allowedHosts() {
  registerCleanupFunction(() =>
    Services.prefs.clearUserPref("mail.allowed_unc_hosts")
  );
  Services.prefs.setStringPref(
    "mail.allowed_unc_hosts",
    "example.com,192.0.2.1"
  );
  for (const path of [
    "///example.com/share/msg.eml",
    "///%3F/UNC/EXAMPLE.COM/share/msg.eml",
    "/%5C%5C.%5CUNC%5C192.0.2.1%5Cshare%5Cmsg.eml",
  ]) {
    Assert.notEqual(
      openChannel(path),
      Cr.NS_ERROR_FILE_UNRECOGNIZED_PATH,
      `mailbox:${path} should not be blocked when allowed`
    );
  }
  Assert.equal(
    openChannel("///%3F/UNC/192.0.2.2/share/msg.eml"),
    Cr.NS_ERROR_FILE_UNRECOGNIZED_PATH,
    "mailbox: path to a host not allowed should be blocked"
  );
});
