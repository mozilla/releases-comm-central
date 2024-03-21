/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
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
  NONE,
  STARTTLS,
  SSL,
  getHostEntry,
  getIncomingTryOrder,
  getOutgoingTryOrder,
} = GuessConfig;

/*
 * UTILITIES
 */

function assert_equal(aA, aB, aWhy) {
  if (aA != aB) {
    do_throw(aWhy);
  }
  Assert.equal(aA, aB);
}

/**
 * Test that two host entries are the same, ignoring the commands.
 */
function assert_equal_host_entries(hostEntry, expected) {
  assert_equal(hostEntry.protocol, expected[0], "Protocols are different");
  assert_equal(hostEntry.socketType, expected[1], "SSL values are different");
  assert_equal(hostEntry.port, expected[2], "Port values are different");
}

/**
 * Assert that the list of tryOrders are the same.
 */
function assert_equal_try_orders(aA, aB) {
  assert_equal(aA.length, aB.length, "tryOrders have different length");
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
  // [POP, STARTTLS, 110], [POP, SSL, 995], [POP, NONE, 110]
  // port != UNKNOWN
  // ssl == UNKNOWN
  // [POP, STARTTLS, port], [POP, SSL, port], [POP, NONE, port]
  // ssl != UNKNOWN
  // [POP, ssl, port]
  let ssl = UNKNOWN;
  let port = UNKNOWN;
  let tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [POP, STARTTLS, 110],
    [POP, SSL, 995],
    [POP, NONE, 110],
  ]);

  ssl = STARTTLS;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[POP, ssl, 110]]);

  ssl = SSL;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[POP, ssl, 995]]);

  ssl = NONE;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[POP, ssl, 110]]);

  ssl = UNKNOWN;
  port = 31337;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [POP, STARTTLS, port],
    [POP, SSL, port],
    [POP, NONE, port],
  ]);

  for (ssl in [STARTTLS, SSL, NONE]) {
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
  // [IMAP, STARTTLS, 143], [IMAP, SSL, 993], [IMAP, NONE, 143]
  // port != UNKNOWN
  // ssl == UNKNOWN
  // [IMAP, STARTTLS, port], [IMAP, SSL, port], [IMAP, NONE, port]
  // ssl != UNKNOWN
  // [IMAP, ssl, port];

  let ssl = UNKNOWN;
  let port = UNKNOWN;
  let tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [IMAP, STARTTLS, 143],
    [IMAP, SSL, 993],
    [IMAP, NONE, 143],
  ]);

  ssl = STARTTLS;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[IMAP, ssl, 143]]);

  ssl = SSL;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[IMAP, ssl, 993]]);

  ssl = NONE;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[IMAP, ssl, 143]]);

  ssl = UNKNOWN;
  port = 31337;
  tryOrder = getIncomingTryOrder(host, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [IMAP, STARTTLS, port],
    [IMAP, SSL, port],
    [IMAP, NONE, port],
  ]);

  for (ssl in [STARTTLS, SSL, NONE]) {
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
function test_getHostEntry() {
  // IMAP port numbers.
  assert_equal_host_entries(getHostEntry(IMAP, STARTTLS, UNKNOWN), [
    IMAP,
    STARTTLS,
    143,
  ]);
  assert_equal_host_entries(getHostEntry(IMAP, SSL, UNKNOWN), [IMAP, SSL, 993]);
  assert_equal_host_entries(getHostEntry(IMAP, NONE, UNKNOWN), [
    IMAP,
    NONE,
    143,
  ]);

  // POP port numbers.
  assert_equal_host_entries(getHostEntry(POP, STARTTLS, UNKNOWN), [
    POP,
    STARTTLS,
    110,
  ]);
  assert_equal_host_entries(getHostEntry(POP, SSL, UNKNOWN), [POP, SSL, 995]);
  assert_equal_host_entries(getHostEntry(POP, NONE, UNKNOWN), [POP, NONE, 110]);

  // SMTP port numbers.
  assert_equal_host_entries(getHostEntry(SMTP, STARTTLS, UNKNOWN), [
    SMTP,
    STARTTLS,
    587,
  ]);
  assert_equal_host_entries(getHostEntry(SMTP, SSL, UNKNOWN), [SMTP, SSL, 465]);
  assert_equal_host_entries(getHostEntry(SMTP, NONE, UNKNOWN), [
    SMTP,
    NONE,
    587,
  ]);
}

/**
 * Test the getIncomingTryOrder method.
 */
function test_getIncomingTryOrder() {
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
    [IMAP, STARTTLS, 143],
    [IMAP, SSL, 993],
    [POP, STARTTLS, 110],
    [POP, SSL, 995],
    [IMAP, NONE, 143],
    [POP, NONE, 110],
  ]);

  ssl = SSL;
  tryOrder = getIncomingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [IMAP, SSL, 993],
    [POP, SSL, 995],
  ]);

  ssl = UNKNOWN;
  port = 31337;
  tryOrder = getIncomingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [IMAP, STARTTLS, port],
    [IMAP, SSL, port],
    [POP, STARTTLS, port],
    [POP, SSL, port],
    [IMAP, NONE, port],
    [POP, NONE, port],
  ]);

  ssl = SSL;
  tryOrder = getIncomingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [IMAP, SSL, port],
    [POP, SSL, port],
  ]);
}

/**
 * Test the getOutgoingTryOrder method.
 */
function test_getOutgoingTryOrder() {
  // The list of protocol+ssl+port configurations should match
  // getOutgoingTryOrder() in guessConfig.js.
  const domain = "example.com";
  const protocol = SMTP;
  let ssl = UNKNOWN;
  let port = UNKNOWN;
  let tryOrder = getOutgoingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [SMTP, STARTTLS, 587],
    [SMTP, STARTTLS, 25],
    [SMTP, SSL, 465],
    [SMTP, NONE, 587],
    [SMTP, NONE, 25],
  ]);

  ssl = SSL;
  tryOrder = getOutgoingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[SMTP, SSL, 465]]);

  ssl = UNKNOWN;
  port = 31337;
  tryOrder = getOutgoingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [
    [SMTP, STARTTLS, port],
    [SMTP, SSL, port],
    [SMTP, NONE, port],
  ]);

  ssl = SSL;
  tryOrder = getOutgoingTryOrder(domain, protocol, ssl, port);
  assert_equal_try_orders(tryOrder, [[SMTP, SSL, port]]);
}

function run_test() {
  test_getHostEntry();
  test_getIncomingTryOrder();
  test_getOutgoingTryOrder();
}
