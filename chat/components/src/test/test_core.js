/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);

const DISABLED_PROTOCOLS = [
  "prpl-facebook",
  "prpl-gtalk",
  "prpl-twitter",
  "prpl-yahoo",
];

add_setup(() => {
  do_get_profile();
  IMServices.core.init();
});

add_task(function test_getProtocols() {
  const protocols = IMServices.core.getProtocols();

  Assert.ok(Array.isArray(protocols), "Protocols are returned as array");
  Assert.greaterOrEqual(
    protocols.length,
    4,
    "At least 4 active protocols are returned"
  );
  for (const protocol of protocols) {
    Assert.ok(
      !DISABLED_PROTOCOLS.includes(protocol.id),
      `${protocol.id} is not one of the disabled protocols`
    );
  }
});
