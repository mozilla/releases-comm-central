/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

add_task(function test_bug392729() {
  // Bug 392729 — invalid message keys in news URIs used to cause a crash.
  // With the removal of nsNntpUrl, these are now handled gracefully by
  // nsStandardURL (URI creation succeeds) and the protocol layer (NNTP
  // commands fail with an appropriate error).
  const uri = Services.io.newURI(
    "news://localhost:119" +
      "/123@example.invalid?group=test.subscribe.simple&key=abcdefghijk"
  );
  Assert.ok(uri.spec.includes("123@example.invalid"));
});

/**
 * Test munge/unmunge of authority-less news: URIs (RFC 5538 §4).
 * nsMsgMailNewsUrl inserts "///" so nsStandardURL can parse them,
 * then strips the extra slashes in GetSpec()/GetDisplaySpec().
 */
add_task(function test_newsURImunge() {
  // Authority-less URIs — spec is preserved through the round-trip.
  Assert.equal(
    Services.io.newURI("news:foo@bar.invalid").spec,
    "news:foo@bar.invalid"
  );
  Assert.equal(
    Services.io.newURI("snews:foo@bar.invalid").spec,
    "snews:foo@bar.invalid"
  );
  Assert.equal(
    Services.io.newURI("news:comp.lang.java").spec,
    "news:comp.lang.java"
  );
  Assert.equal(Services.io.newURI("news:comp.*").spec, "news:comp.*");

  // Scheme with uppercase letters — munging is case-insensitive.
  Assert.equal(
    Services.io.newURI("NEWS:foo@bar.invalid").spec,
    "news:foo@bar.invalid"
  );
  Assert.equal(
    Services.io.newURI("Snews:foo@bar.invalid").spec,
    "snews:foo@bar.invalid"
  );

  // URIs with authority — no munging needed.
  const withHost = Services.io.newURI("news://host.example/foo@bar.invalid");
  Assert.equal(withHost.spec, "news://host.example/foo@bar.invalid");
  Assert.equal(withHost.host, "host.example");

  // Mixed: host, port, query, group, key — all preserved.
  const full = Services.io.newURI(
    "news://news.example:563/msg%40id?group=comp.test&key=42"
  );
  Assert.equal(
    full.spec,
    "news://news.example:563/msg%40id?group=comp.test&key=42"
  );
  Assert.equal(full.host, "news.example");
  Assert.equal(full.port, 563);
  Assert.equal(full.query, "group=comp.test&key=42");
});
