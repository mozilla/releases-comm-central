/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/. */

var { EnigmailVerify } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/mimeVerify.sys.mjs"
);

/**
 * Tests switching content-type handlers on demand.
 */
add_task(function () {
  const CONTRACT_ID = "@mozilla.org/mimecth;1?type=multipart/signed";
  const INTERFACE = Ci.nsIMimeContentTypeHandler;

  Assert.ok(
    !Components.manager.isContractIDRegistered(CONTRACT_ID),
    "no factory is registered initially"
  );

  EnigmailVerify.registerPGPMimeHandler();
  Assert.equal(
    Cc[CONTRACT_ID].number,
    EnigmailVerify.pgpMimeFactory.classID.number,
    "pgpMimeFactory is the registered factory"
  );
  Assert.ok(
    Cc[CONTRACT_ID].createInstance(INTERFACE),
    "pgpMimeFactory successfully created an instance"
  );

  EnigmailVerify.unregisterPGPMimeHandler();
  Assert.ok(
    !Components.manager.isContractIDRegistered(CONTRACT_ID),
    "pgpMimeFactory has been unregistered"
  );
  Assert.throws(
    () => Cc[CONTRACT_ID].createInstance(INTERFACE),
    /NS_ERROR_XPC_CI_RETURNED_FAILURE/,
    "exception correctly thrown"
  );

  EnigmailVerify.registerPGPMimeHandler();
  Assert.equal(
    Cc[CONTRACT_ID].number,
    EnigmailVerify.pgpMimeFactory.classID.number,
    "pgpMimeFactory is the registered factory"
  );
  Assert.ok(
    Cc[CONTRACT_ID].createInstance(INTERFACE),
    "pgpMimeFactory successfully created an instance"
  );

  EnigmailVerify.unregisterPGPMimeHandler();
  Assert.ok(
    !Components.manager.isContractIDRegistered(CONTRACT_ID),
    "pgpMimeFactory has been unregistered"
  );
  Assert.throws(
    () => Cc[CONTRACT_ID].createInstance(INTERFACE),
    /NS_ERROR_XPC_CI_RETURNED_FAILURE/,
    "exception correctly thrown"
  );
});
