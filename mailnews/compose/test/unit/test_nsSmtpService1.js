/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsSmtpService
 */

var SmtpServiceContractID = "@mozilla.org/messengercompose/smtp;1";
var nsISmtpService = Ci.nsISmtpService;

function run_test() {
  var smtpService = Cc[SmtpServiceContractID].getService(nsISmtpService);

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
  var i;

  for (i = 0; i < 3; ++i) {
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
    for (i = 0; i < 3; ++i) {
      if (smtpServer == smtpServerArray[i]) {
        found[i] = true;
      }
    }
  }

  Assert.equal(found, "true,true,true");

  // Test - Find the servers.

  Assert.equal(smtpServerArray[0], smtpService.findServer("user", "localhost"));
  Assert.equal(
    smtpServerArray[1],
    smtpService.findServer("user1", "localhost")
  );
  Assert.equal(smtpServerArray[2], smtpService.findServer("", "localhost1"));

  Assert.equal(null, smtpService.findServer("user2", "localhost"));

  // XXX: FIXME
  // do_check_eq(null, smtpService.findServer("", "localhost"));

  for (i = 0; i < 3; ++i) {
    Assert.equal(
      smtpServerArray[i],
      smtpService.getServerByKey(smtpServerArray[i].key)
    );
  }

  smtpService.defaultServer = smtpServerArray[2];
  Assert.equal(
    smtpService.defaultServer,
    smtpServerArray[2],
    "Default server should be correctly set"
  );

  // Test - Delete the servers

  for (i = 0; i < 3; ++i) {
    smtpService.deleteServer(smtpServerArray[i]);
  }

  smtpServers = smtpService.servers;
  Assert.ok(smtpServers.length == 0);
}
