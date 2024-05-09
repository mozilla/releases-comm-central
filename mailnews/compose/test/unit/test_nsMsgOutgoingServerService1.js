/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsSmtpService
 */

function run_test() {
  var outgoingServerService = Cc[
    "@mozilla.org/messengercompose/outgoingserverservice;1"
  ].getService(Ci.nsIMsgOutgoingServerService);

  // Test - no servers

  var smtpServers = outgoingServerService.servers;
  Assert.equal(smtpServers.length, 0);

  Assert.equal(outgoingServerService.defaultServer, null);

  // Test - add single server, and check

  var smtpServer = outgoingServerService.createServer("smtp");
  smtpServer.QueryInterface(Ci.nsISmtpServer).hostname = "localhost";
  smtpServer.description = "test";

  outgoingServerService.defaultServer = smtpServer;

  // Test - Check to see there is only one element in the server list
  smtpServers = outgoingServerService.servers;
  Assert.ok(smtpServers.length == 1);

  // Test - Find the server in different ways
  Assert.equal(
    smtpServer,
    outgoingServerService.findServer("", "localhost", "smtp")
  );
  Assert.equal(
    smtpServer,
    outgoingServerService.getServerByKey(smtpServer.key)
  );

  // Test - Try finding one that doesn't exist.
  Assert.equal(null, outgoingServerService.findServer("", "test", "smtp"));

  // Test - Check default server is still ok
  Assert.equal(smtpServer, outgoingServerService.defaultServer);

  // Test - Delete the only server
  outgoingServerService.deleteServer(smtpServer);

  smtpServers = outgoingServerService.servers;
  Assert.ok(smtpServers.length == 0);

  // Test - add multiple servers

  var smtpServerArray = new Array(3);

  for (let i = 0; i < 3; ++i) {
    smtpServerArray[i] = outgoingServerService.createServer("smtp");
  }

  smtpServerArray[0].QueryInterface(Ci.nsISmtpServer).hostname = "localhost";
  smtpServerArray[0].description = "test";
  smtpServerArray[0].username = "user";

  smtpServerArray[1].QueryInterface(Ci.nsISmtpServer).hostname = "localhost";
  smtpServerArray[1].description = "test1";
  smtpServerArray[1].username = "user1";

  smtpServerArray[2].QueryInterface(Ci.nsISmtpServer).hostname = "localhost1";
  smtpServerArray[2].description = "test2";
  smtpServerArray[2].username = "";

  // Now check them
  smtpServers = outgoingServerService.servers;

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
    outgoingServerService.findServer("user", "localhost", "smtp").key
  );
  Assert.equal(
    smtpServerArray[1].key,
    outgoingServerService.findServer("user1", "localhost", "smtp").key
  );
  Assert.equal(
    smtpServerArray[2].key,
    outgoingServerService.findServer("", "localhost1", "smtp").key
  );

  Assert.equal(
    null,
    outgoingServerService.findServer("user2", "localhost", "smtp")
  );

  for (let i = 0; i < 3; ++i) {
    Assert.equal(
      smtpServerArray[i].key,
      outgoingServerService.getServerByKey(smtpServerArray[i].key).key
    );
  }

  outgoingServerService.defaultServer = smtpServerArray[2];
  Assert.equal(
    outgoingServerService.defaultServer.key,
    smtpServerArray[2].key,
    "Default server should be correctly set"
  );

  // Test - Delete the servers

  for (let i = 0; i < 3; ++i) {
    outgoingServerService.deleteServer(smtpServerArray[i]);
  }

  smtpServers = outgoingServerService.servers;
  Assert.ok(smtpServers.length == 0);
}
