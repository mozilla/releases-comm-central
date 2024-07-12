/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Tests for mailbox: URLs.
 */

var mailboxFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
mailboxFile.append("mailFolder");
mailboxFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
var mailboxFileName = Services.io.newFileURI(mailboxFile).pathQueryRef;

var mailboxURLs = [
  {
    url: "mailbox://user@domain@example.com/folder?number=1",
    spec: "mailbox://user%40domain@example.com/folder?number=1",
    host: "example.com",
    port: -1,
    scheme: "mailbox",
    pathQueryRef: "/folder?number=1",
    prePath: "mailbox://user%40domain@example.com",
  },
  {
    url: "mailbox://nobody@Local%20Folders/folder?number=2",
    spec: "mailbox://nobody@Local%20Folders/folder?number=2",
    host: "Local%20Folders",
    port: -1,
    scheme: "mailbox",
    pathQueryRef: "/folder?number=2",
    prePath: "mailbox://nobody@Local%20Folders",
  },
  {
    url: "mailbox://" + mailboxFileName + "?number=3",
    spec: "mailbox://" + mailboxFileName + "?number=3",
    host: "",
    port: -1,
    scheme: "mailbox",
    pathQueryRef: mailboxFileName + "?number=3",
    prePath: "mailbox://",
  },
];

function run_test() {
  registerCleanupFunction(teardown);
  var url;

  // Test - get and check urls.
  var part = 0;
  for (part = 0; part < mailboxURLs.length; part++) {
    dump(`url: ${mailboxURLs[part].url}\n`);
    url = Services.io.newURI(mailboxURLs[part].url);

    Assert.equal(url.spec, mailboxURLs[part].spec);
    Assert.equal(url.scheme, mailboxURLs[part].scheme);
    Assert.equal(url.host, mailboxURLs[part].host);
    Assert.equal(url.port, mailboxURLs[part].port);
    Assert.equal(url.pathQueryRef, mailboxURLs[part].pathQueryRef);
    Assert.equal(url.prePath, mailboxURLs[part].prePath);
  }

  // Test - Check changing values.
  dump("Other Tests\n");

  // We can set the username on the URLs with a host.
  url = Services.io.newURI("mailbox://user@domain@example.com/folder?number=1");
  url.mutate().setUsername("john").finalize();
  url = Services.io.newURI("mailbox://nobody@Local%20Folders/folder?number=2");
  url.mutate().setUsername("jane").finalize();

  // It should throw on our file-style URLs.
  url = Services.io.newURI("mailbox://" + mailboxFileName + "?number=3");
  try {
    url.mutate().setUsername("noway").finalize();
    do_throw("Should not be able to set username on file-style mailbox: URL");
  } catch (ex) {
    Assert.equal(ex.result, Cr.NS_ERROR_UNEXPECTED);
  }
}

function teardown() {
  if (mailboxFile.exists()) {
    mailboxFile.remove(false);
  }
}
