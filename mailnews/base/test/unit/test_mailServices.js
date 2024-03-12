/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests for the MailServices module.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_task(function test_services() {
  function check_service(service, serviceInterface) {
    Assert.ok(
      service in MailServices,
      `${service} should be a member of MailServices`
    );
    Assert.ok(
      MailServices[service] instanceof serviceInterface,
      `MailServices.${service} should implement Ci.${serviceInterface.name}`
    );
  }

  check_service("mailSession", Ci.nsIMsgMailSession);
  check_service("accounts", Ci.nsIMsgAccountManager);
  check_service("pop3", Ci.nsIPop3Service);
  check_service("imap", Ci.nsIImapService);
  check_service("nntp", Ci.nsINntpService);
  check_service("smtp", Ci.nsISmtpService);
  check_service("compose", Ci.nsIMsgComposeService);
  check_service("ab", Ci.nsIAbManager);
  check_service("copy", Ci.nsIMsgCopyService);
  check_service("mfn", Ci.nsIMsgFolderNotificationService);
  check_service("headerParser", Ci.nsIMsgHeaderParser);
  check_service("mimeConverter", Ci.nsIMimeConverter);
  check_service("tags", Ci.nsIMsgTagService);
  check_service("filters", Ci.nsIMsgFilterService);
  check_service("junk", Ci.nsIJunkMailPlugin);
});

add_task(function test_message_services() {
  function check_message_service(uri) {
    const service = MailServices.messageServiceFromURI(uri);
    Assert.ok(
      service instanceof Ci.nsIMsgMessageService,
      `message service for ${uri.substring(
        0,
        uri.indexOf(":")
      )} URIs should exist`
    );
  }

  check_message_service("file://it.does.not.matter/");
  check_message_service("imap://it.does.not.matter/");
  check_message_service("imap-message://it.does.not.matter/");
  check_message_service("mailbox://it.does.not.matter/");
  check_message_service("mailbox-message://it.does.not.matter/");
  check_message_service("news://it.does.not.matter/");
  check_message_service("news-message://it.does.not.matter/");

  Assert.throws(
    () => MailServices.messageServiceFromURI("fake://not.going.to.work/"),
    () => true, // Accept any exception.
    "message service for other URIs should not exist"
  );
});
