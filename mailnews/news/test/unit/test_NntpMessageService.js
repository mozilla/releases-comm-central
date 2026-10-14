/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let folder, message;

add_setup(function () {
  const server = setupLocalServer(NNTP_PORT);
  folder = server.rootFolder.getChildNamed("test.subscribe.simple");
  const db = folder.msgDatabase;
  const header = db.createNewHdr();
  header.messageId = "compose@nntp.invalid";
  message = db.attachHdr(header, false);
});

/**
 * Query parameters before or after the article key should not change which
 * message the news message service resolves.
 */
add_task(function test_messageURIsWithQuery() {
  const uri = folder.getUriForMsg(message);
  const service = MailServices.messageServiceFromURI(uri);
  for (const parameter of [
    "editasnew=true",
    "redirect=true",
    "edittempl=true",
    "editasnew=true&type=application/x-message-display",
  ]) {
    for (const spec of [
      `${uri}?${parameter}`,
      uri.replace("#", `?${parameter}#`),
    ]) {
      Assert.equal(
        service.messageURIToMsgHdr(spec),
        message,
        `The service should resolve the original message for ${spec}`
      );
      const url = new URL(service.getUrlForUri(spec).spec);
      Assert.equal(
        url.searchParams.get("group"),
        folder.name,
        "The URL should reference the original newsgroup"
      );
      Assert.equal(
        url.searchParams.get("key"),
        String(message.messageKey),
        "The URL should reference the original article key"
      );
    }
  }
});

/**
 * MIME initialization should resolve news message URIs after moving compose
 * parameters out of the fragment and into the query.
 */
add_task(function test_composeMIMEInitialization() {
  const uri = folder.getUriForMsg(message);
  for (const parameter of [
    "editasnew=true",
    "redirect=true",
    "edittempl=true",
  ]) {
    const converter = Cc[
      "@mozilla.org/streamconv;1?from=message/rfc822&to=*/*"
    ].createInstance(Ci.nsIMimeStreamConverter);
    converter.setMimeOutputType(Ci.nsMimeOutput.nsMimeMessageEditorTemplate);
    converter
      .QueryInterface(Ci.nsIStreamConverter)
      .asyncConvertData(
        null,
        null,
        null,
        Services.io.newURI(`${uri}?${parameter}`)
      );
  }
});
