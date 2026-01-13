/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for GuessConfig.sys.mjs
 *
 * Currently tested:
 * - getHostEntry function.
 * - getIncomingTryOrder function.
 * - getOutgoingTryOrder function.
 *
 * TODO:
 * - Test the returned CMDS.
 * - Figure out what else to test.
 */

var { GuessConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/GuessConfig.sys.mjs"
);

var {
  UNKNOWN,
  IMAP,
  POP,
  SMTP,
  getHostEntry,
  getIncomingTryOrder,
  getOutgoingTryOrder,
} = GuessConfig;

/*
 * UTILITIES
 */

/**
 * Test that two host entries are the same, ignoring the commands.
 */
function assert_equal_host_entries(hostEntry, expected) {
  Assert.equal(hostEntry.protocol, expected[0], "Protocols are different");
  Assert.equal(hostEntry.socketType, expected[1], "SSL values are different");
  Assert.equal(hostEntry.port, expected[2], "Port values are different");
}

/**
 * Assert that the list of tryOrders are the same.
 */
function assert_equal_try_orders(aA, aB) {
  Assert.equal(aA.length, aB.length, "tryOrders have different length");
  for (const [i, subA] of aA.entries()) {
    const subB = aB[i];
    assert_equal_host_entries(subA, subB);
  }
}

/**
 * Check that the POP calculations are correct for a given host and
 * protocol.
 */
function checkPop(host, protocol) {
  // The list of protocol+ssl+port configurations should match
  // getIncomingTryOrder() in guessConfig.js.

  // port == UNKNOWN
  // [POP, Ci.nsMsgSocketType.alwaysSTARTTLS, 110], [POP, Ci.nsMsgSocketType.SSL, 995], [POP, NONE, 110]
  // port != UNKNOWN
  // ssl == UNKNOWN
  // [POP, Ci.nsMsgSocketType.alwaysSTARTTLS, port], [POP, Ci.nsMsgSocketType.SSL, port], [POP, NONE, port]
  // ssl != UNKNOWN
  // [POP, ssl, port]
  let ssl = UNKNOWN;
  let port = UNKNOWN;
  let tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [POP, Ci.nsMsgSocketType.alwaysSTARTTLS, 110],
    [POP, Ci.nsMsgSocketType.SSL, 995],
    [POP, Ci.nsMsgSocketType.plain, 110],
  ]);

  ssl = Ci.nsMsgSocketType.alwaysSTARTTLS;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[POP, ssl, 110]]);

  ssl = Ci.nsMsgSocketType.SSL;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[POP, ssl, 995]]);

  ssl = Ci.nsMsgSocketType.plain;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[POP, ssl, 110]]);

  ssl = UNKNOWN;
  port = 31337;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [POP, Ci.nsMsgSocketType.alwaysSTARTTLS, port],
    [POP, Ci.nsMsgSocketType.SSL, port],
    [POP, Ci.nsMsgSocketType.plain, port],
  ]);

  for (ssl in [
    Ci.nsMsgSocketType.alwaysSTARTTLS,
    Ci.nsMsgSocketType.SSL,
    Ci.nsMsgSocketType.plain,
  ]) {
    tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
    assert_equal_try_orders(tryOrder, [[POP, ssl, port]]);
  }
}

/**
 * Check that the IMAP calculations are correct for a given host and
 * protocol.
 */
function checkImap(host, protocol) {
  // The list of protocol+ssl+port configurations should match
  // getIncomingTryOrder() in guessConfig.js.

  // port == UNKNOWN
  // [IMAP, Ci.nsMsgSocketType.alwaysSTARTTLS, 143], [IMAP, SSL, 993], [IMAP, Ci.nsMsgSocketType.plain, 143]
  // port != UNKNOWN
  // ssl == UNKNOWN
  // [IMAP, Ci.nsMsgSocketType.alwaysSTARTTLS, port], [IMAP, SSL, port], [IMAP, Ci.nsMsgSocketType.plain, port]
  // ssl != UNKNOWN
  // [IMAP, ssl, port];

  let ssl = UNKNOWN;
  let port = UNKNOWN;
  let tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [IMAP, Ci.nsMsgSocketType.alwaysSTARTTLS, 143],
    [IMAP, Ci.nsMsgSocketType.SSL, 993],
    [IMAP, Ci.nsMsgSocketType.plain, 143],
  ]);

  ssl = Ci.nsMsgSocketType.alwaysSTARTTLS;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[IMAP, ssl, 143]]);

  ssl = Ci.nsMsgSocketType.SSL;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[IMAP, ssl, 993]]);

  ssl = Ci.nsMsgSocketType.plain;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[IMAP, ssl, 143]]);

  ssl = UNKNOWN;
  port = 31337;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [IMAP, Ci.nsMsgSocketType.alwaysSTARTTLS, port],
    [IMAP, Ci.nsMsgSocketType.SSL, port],
    [IMAP, Ci.nsMsgSocketType.plain, port],
  ]);

  for (ssl in [
    Ci.nsMsgSocketType.alwaysSTARTTLS,
    Ci.nsMsgSocketType.SSL,
    Ci.nsMsgSocketType.plain,
  ]) {
    tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
    assert_equal_try_orders(tryOrder, [[IMAP, ssl, port]]);
  }
}

/*
 * TESTS
 */

/**
 * Test that getHostEntry returns the correct port numbers.
 *
 * TODO:
 * - Test the returned commands as well.
 */
add_task(function test_getHostEntry() {
  // IMAP port numbers.
  assert_equal_host_entries(
    getHostEntry(IMAP, Ci.nsMsgSocketType.alwaysSTARTTLS, UNKNOWN),
    [IMAP, Ci.nsMsgSocketType.alwaysSTARTTLS, 143]
  );
  assert_equal_host_entries(
    getHostEntry(IMAP, Ci.nsMsgSocketType.SSL, UNKNOWN),
    [IMAP, Ci.nsMsgSocketType.SSL, 993]
  );
  assert_equal_host_entries(
    getHostEntry(IMAP, Ci.nsMsgSocketType.plain, UNKNOWN),
    [IMAP, Ci.nsMsgSocketType.plain, 143]
  );

  // POP port numbers.
  assert_equal_host_entries(
    getHostEntry(POP, Ci.nsMsgSocketType.alwaysSTARTTLS, UNKNOWN),
    [POP, Ci.nsMsgSocketType.alwaysSTARTTLS, 110]
  );
  assert_equal_host_entries(
    getHostEntry(POP, Ci.nsMsgSocketType.SSL, UNKNOWN),
    [POP, Ci.nsMsgSocketType.SSL, 995]
  );
  assert_equal_host_entries(
    getHostEntry(POP, Ci.nsMsgSocketType.plain, UNKNOWN),
    [POP, Ci.nsMsgSocketType.plain, 110]
  );

  // SMTP port numbers.
  assert_equal_host_entries(
    getHostEntry(SMTP, Ci.nsMsgSocketType.alwaysSTARTTLS, UNKNOWN),
    [SMTP, Ci.nsMsgSocketType.alwaysSTARTTLS, 587]
  );
  assert_equal_host_entries(
    getHostEntry(SMTP, Ci.nsMsgSocketType.SSL, UNKNOWN),
    [SMTP, Ci.nsMsgSocketType.SSL, 465]
  );
  assert_equal_host_entries(
    getHostEntry(SMTP, Ci.nsMsgSocketType.plain, UNKNOWN),
    [SMTP, Ci.nsMsgSocketType.plain, 587]
  );
});

/**
 * Test the getIncomingTryOrder method.
 */
add_task(function test_getIncomingTryOrder() {
  // The list of protocol+ssl+port configurations should match
  // getIncomingTryOrder() in guessConfig.js.

  // protocol == POP || host starts with pop. || host starts with pop3.
  checkPop("example.com", POP);
  checkPop("pop.example.com", UNKNOWN);
  checkPop("pop3.example.com", UNKNOWN);
  checkPop("imap.example.com", POP);

  // protocol == IMAP || host starts with imap.
  checkImap("example.com", IMAP);
  checkImap("imap.example.com", UNKNOWN);
  checkImap("pop.example.com", IMAP);

  const domain = "example.com";
  const protocol = UNKNOWN;
  let ssl = UNKNOWN;
  let port = UNKNOWN;
  let tryOrder = getIncomingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [IMAP, Ci.nsMsgSocketType.alwaysSTARTTLS, 143],
    [IMAP, Ci.nsMsgSocketType.SSL, 993],
    [POP, Ci.nsMsgSocketType.alwaysSTARTTLS, 110],
    [POP, Ci.nsMsgSocketType.SSL, 995],
    [IMAP, Ci.nsMsgSocketType.plain, 143],
    [POP, Ci.nsMsgSocketType.plain, 110],
  ]);

  ssl = Ci.nsMsgSocketType.SSL;
  tryOrder = getIncomingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [IMAP, Ci.nsMsgSocketType.SSL, 993],
    [POP, Ci.nsMsgSocketType.SSL, 995],
  ]);

  ssl = UNKNOWN;
  port = 31337;
  tryOrder = getIncomingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [IMAP, Ci.nsMsgSocketType.alwaysSTARTTLS, port],
    [IMAP, Ci.nsMsgSocketType.SSL, port],
    [POP, Ci.nsMsgSocketType.alwaysSTARTTLS, port],
    [POP, Ci.nsMsgSocketType.SSL, port],
    [IMAP, Ci.nsMsgSocketType.plain, port],
    [POP, Ci.nsMsgSocketType.plain, port],
  ]);

  ssl = Ci.nsMsgSocketType.SSL;
  tryOrder = getIncomingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [IMAP, Ci.nsMsgSocketType.SSL, port],
    [POP, Ci.nsMsgSocketType.SSL, port],
  ]);
});

/**
 * Test the getOutgoingTryOrder method.
 */
add_task(function test_getOutgoingTryOrder() {
  // The list of protocol+ssl+port configurations should match
  // getOutgoingTryOrder() in guessConfig.js.
  const domain = "example.com";
  const protocol = SMTP;
  let ssl = UNKNOWN;
  let port = UNKNOWN;
  let tryOrder = getOutgoingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [SMTP, Ci.nsMsgSocketType.alwaysSTARTTLS, 587],
    [SMTP, Ci.nsMsgSocketType.alwaysSTARTTLS, 25],
    [SMTP, Ci.nsMsgSocketType.SSL, 465],
    [SMTP, Ci.nsMsgSocketType.plain, 587],
    [SMTP, Ci.nsMsgSocketType.plain, 25],
  ]);

  ssl = Ci.nsMsgSocketType.SSL;
  tryOrder = getOutgoingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[SMTP, Ci.nsMsgSocketType.SSL, 465]]);

  ssl = UNKNOWN;
  port = 31337;
  tryOrder = getOutgoingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [SMTP, Ci.nsMsgSocketType.alwaysSTARTTLS, port],
    [SMTP, Ci.nsMsgSocketType.SSL, port],
    [SMTP, Ci.nsMsgSocketType.plain, port],
  ]);

  ssl = Ci.nsMsgSocketType.SSL;
  tryOrder = getOutgoingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[SMTP, Ci.nsMsgSocketType.SSL, port]]);
});
