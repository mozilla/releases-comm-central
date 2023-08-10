/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsSmtpService
 */

function run_test() {
  var smtpService = Cc["@mozilla.org/messengercompose/smtp;1"].getService(
    Ci.nsISmtpService
  );

  // Test - no servers

  var smtpServers = smtpService.servers;
  Assert.equal(smtpServers.length, 0);

  Assert.equal(smtpService.defaultServer, null);

  // Test - add single server, and check

  var smtpServer = smtpService.createServer();

  smtpServer.hostname = "localhost";
  smtpServer.description = "test";

  smtpService.defaultServer = smtpServer;

  // Test - Check to see there is only one element in the server list
  smtpServers = smtpService.servers;
  Assert.ok(smtpServers.length == 1);

  // Test - Find the server in different ways
  Assert.equal(smtpServer, smtpService.findServer("", "localhost"));
  Assert.equal(smtpServer, smtpService.getServerByKey(smtpServer.key));

  // Test - Try finding one that doesn't exist.
  Assert.equal(null, smtpService.findServer("", "test"));

  // Test - Check default server is still ok
  Assert.equal(smtpServer, smtpService.defaultServer);

  // Test - Delete the only server
  smtpService.deleteServer(smtpServer);

  smtpServers = smtpService.servers;
  Assert.ok(smtpServers.length == 0);

  //    do_check_eq(null, smtpService.defaultServer);

  // Test - add multiple servers

  var smtpServerArray = new Array(3);

  for (let i = 0; i < 3; ++i) {
    smtpServerArray[i] = smtpService.createServer();
  }

  smtpServerArray[0].hostname = "localhost";
  smtpServerArray[0].description = "test";
  smtpServerArray[0].username = "user";

  smtpServerArray[1].hostname = "localhost";
  smtpServerArray[1].description = "test1";
  smtpServerArray[1].username = "user1";

  smtpServerArray[2].hostname = "localhost1";
  smtpServerArray[2].description = "test2";
  smtpServerArray[2].username = "";

  // Now check them
  smtpServers = smtpService.servers;

  var found = [false, false, false];

  for (smtpServer of smtpServers) {
    for (let i = 0; i < 3; ++i) {
      if (smtpServer.key == smtpServerArray[i].key) {
        found[i] = true;
      }
    }
  }

  Assert.equal(found, "true,true,true");

  // Test - Find the servers.

  Assert.equal(
    smtpServerArray[0].key,
    smtpService.findServer("user", "localhost").key
  );
  Assert.equal(
    smtpServerArray[1].key,
    smtpService.findServer("user1", "localhost").key
  );
  Assert.equal(
    smtpServerArray[2].key,
    smtpService.findServer("", "localhost1").key
  );

  Assert.equal(null, smtpService.findServer("user2", "localhost"));

  // XXX: FIXME
  // do_check_eq(null, smtpService.findServer("", "localhost"));

  for (let i = 0; i < 3; ++i) {
    Assert.equal(
      smtpServerArray[i].key,
      smtpService.getServerByKey(smtpServerArray[i].key).key
    );
  }

  smtpService.defaultServer = smtpServerArray[2];
  Assert.equal(
    smtpService.defaultServer.key,
    smtpServerArray[2].key,
    "Default server should be correctly set"
  );

  // Test - Delete the servers

  for (let i = 0; i < 3; ++i) {
    smtpService.deleteServer(smtpServerArray[i]);
  }

  smtpServers = smtpService.servers;
  Assert.ok(smtpServers.length == 0);
}
