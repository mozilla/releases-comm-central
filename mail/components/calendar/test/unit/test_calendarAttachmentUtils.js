/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { getAttachmentIcon } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/modules/CalendarAttachmentUtils.sys.mjs"
);

const { CalAttachment } = ChromeUtils.importESModule(
  "resource:///modules/CalAttachment.sys.mjs"
);

add_task(function test_getAttachmentIcon_emptyAttachment() {
  const attachment = new CalAttachment();

  const result = getAttachmentIcon(attachment);

  Assert.equal(
    result,
    "",
    "Should get an empty icon URL for an attachment without URI"
  );
});

add_task(function test_getAttachmentIcon_aboutBlankAttachment() {
  const attachment = new CalAttachment();
  attachment.uri = Services.io.newURI("about:blank");

  const result = getAttachmentIcon(attachment);

  Assert.equal(
    result,
    "",
    "Should get an empty icon URL for an attachment with about:blank as URI"
  );
});

add_task(function test_getAttachmentIcon_fileURI() {
  const attachment = new CalAttachment();
  attachment.uri = Services.io.newURI("file:///example.png");
  attachment.formatType = "foo";
  attachment.setParameter("X-SERVICE-ICONURL", "https://example.com/");

  const result = getAttachmentIcon(attachment);

  Assert.equal(
    result,
    "moz-icon://file:///example.png",
    "Should get moz-icon URI for file URI"
  );
});

add_task(function test_getAttachmentIcon_formatType() {
  const attachment = new CalAttachment();
  attachment.uri = Services.io.newURI("https://example.com/document.pdf");
  attachment.formatType = "text/plain";
  attachment.setParameter("X-SERVICE-ICONURL", "https://example.com/");

  const result = getAttachmentIcon(attachment);

  Assert.equal(
    result,
    "moz-icon://goat?contentType=text/plain",
    "Should get goat moz-icon URI with the formatType as parameter"
  );
});

add_task(function test_getAttachmentIcon_serviceIconURL() {
  const attachment = new CalAttachment();
  attachment.uri = Services.io.newURI("https://example.com/document.pdf");
  attachment.setParameter("X-SERVICE-ICONURL", "https://example.com/icon.png");

  const result = getAttachmentIcon(attachment);

  Assert.equal(
    result,
    attachment.getParameter("X-SERVICE-ICONURL"),
    "Should get the service icon as the attachment icon URL"
  );
});

add_task(function test_getAttachmentIcon_remoteGuess() {
  const attachment = new CalAttachment();
  attachment.uri = Services.io.newURI(
    "https://example.com/document.pdf?page=23"
  );

  const result = getAttachmentIcon(attachment);

  Assert.equal(
    result,
    "moz-icon://document.pdf?page=23",
    "Should get the extracted file name as moz-icon URI"
  );
});

add_task(function test_getAttachmentIcon_fallback() {
  const attachment = new CalAttachment();
  attachment.uri = Services.io.newURI("foo:///");

  const result = getAttachmentIcon(attachment);

  Assert.equal(
    result,
    "moz-icon://dummy.html",
    "Should get the fallback as moz-icon URI"
  );
});
