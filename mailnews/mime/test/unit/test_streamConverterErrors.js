/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

add_task(function test_draftServiceLookupFailure() {
  const uri = Services.io.newURI("https://example.invalid/message");
  for (const outputType of [
    Ci.nsMimeOutput.nsMimeMessageDraftOrTemplate,
    Ci.nsMimeOutput.nsMimeMessageEditorTemplate,
  ]) {
    const converter = Cc[
      "@mozilla.org/streamconv;1?from=message/rfc822&to=application/xhtml+xml"
    ].createInstance(Ci.nsIMimeStreamConverter);
    converter.setMimeOutputType(outputType);
    Assert.throws(
      () =>
        converter
          .QueryInterface(Ci.nsIStreamConverter)
          .asyncConvertData(null, null, null, uri),
      error => error.result == Cr.NS_ERROR_FACTORY_NOT_REGISTERED,
      "Draft conversion should preserve the message-service lookup error"
    );
  }
});

add_task(function test_draftUrlFailure() {
  const cid = MockRegistrar.register(
    "@mozilla.org/messenger/messageservice;1?type=https",
    {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgMessageService"]),
      getUrlForUri() {
        throw Components.Exception(
          "URL lookup failed",
          Cr.NS_ERROR_FILE_NOT_FOUND
        );
      },
    }
  );
  try {
    const converter = Cc[
      "@mozilla.org/streamconv;1?from=message/rfc822&to=application/xhtml+xml"
    ].createInstance(Ci.nsIMimeStreamConverter);
    converter.setMimeOutputType(Ci.nsMimeOutput.nsMimeMessageDraftOrTemplate);
    Assert.throws(
      () =>
        converter
          .QueryInterface(Ci.nsIStreamConverter)
          .asyncConvertData(
            null,
            null,
            null,
            Services.io.newURI("https://example.invalid/message")
          ),
      error => error.result == Cr.NS_ERROR_FILE_NOT_FOUND,
      "Draft conversion should preserve the message URL error"
    );
  } finally {
    MockRegistrar.unregister(cid);
  }
});

add_task(function test_displayComponentFailure() {
  const cid = MockRegistrar.register("@mozilla.org/txttohtmlconv;1", () => {
    throw Components.Exception(
      "Converter unavailable",
      Cr.NS_ERROR_NOT_AVAILABLE
    );
  });
  try {
    const converter = Cc[
      "@mozilla.org/streamconv;1?from=message/rfc822&to=application/xhtml+xml"
    ].createInstance(Ci.nsIMimeStreamConverter);
    converter.setMimeOutputType(Ci.nsMimeOutput.nsMimeMessageRaw);
    Assert.throws(
      () =>
        converter
          .QueryInterface(Ci.nsIStreamConverter)
          .asyncConvertData(
            null,
            null,
            null,
            Services.io.newURI("https://example.invalid/message")
          ),
      error => error.result == Cr.NS_ERROR_NOT_AVAILABLE,
      "Display conversion should preserve the text converter creation error"
    );
  } finally {
    MockRegistrar.unregister(cid);
  }
});
