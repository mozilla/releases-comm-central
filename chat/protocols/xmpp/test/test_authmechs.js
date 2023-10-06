/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { XMPPAuthMechanisms } = ChromeUtils.importESModule(
  "resource:///modules/xmpp-authmechs.sys.mjs"
);
var { Stanza } = ChromeUtils.importESModule(
  "resource:///modules/xmpp-xml.sys.mjs"
);

/*
 * Test PLAIN using the examples given in section 6 of RFC 6120.
 */
add_task(async function testPlain() {
  const username = "juliet";
  const password = "r0m30myr0m30";

  const mech = XMPPAuthMechanisms.PLAIN(username, password, undefined);

  // Send the initiation message.
  let result = mech.next();
  ok(!result.done);
  const value = await Promise.resolve(result.value);

  // Check the algorithm.
  equal(value.send.attributes.mechanism, "PLAIN");
  // Check the PLAIN content.
  equal(value.send.children[0].text, "AGp1bGlldAByMG0zMG15cjBtMzA=");

  // Receive the success.
  const response = Stanza.node("success", Stanza.NS.sasl);
  result = mech.next(response);
  ok(result.done);
  // There is no final value.
  equal(result.value, undefined);
});

/*
 * Test SCRAM-SHA-1 using the examples given in section 5 of RFC 5802.
 *
 * Full test vectors of intermediate values are available at:
 * https://wiki.xmpp.org/web/SASL_and_SCRAM-SHA-1
 */
add_task(async function testScramSha1() {
  const username = "user";
  const password = "pencil";

  // Use a constant value for the nonce.
  const nonce = "fyko+d2lbbFgONRv9qkxdawL";

  const mech = XMPPAuthMechanisms["SCRAM-SHA-1"](
    username,
    password,
    undefined,
    nonce
  );

  // Send the client-first-message.
  let result = mech.next();
  ok(!result.done);
  let value = await Promise.resolve(result.value);

  // Check the algorithm.
  equal(value.send.attributes.mechanism, "SCRAM-SHA-1");
  // Check the SCRAM content.
  equal(
    atob(value.send.children[0].text),
    "n,,n=user,r=fyko+d2lbbFgONRv9qkxdawL"
  );

  // Receive the server-first-message and send the client-final-message.
  let response = Stanza.node(
    "challenge",
    Stanza.NS.sasl,
    null,
    btoa(
      "r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,s=QSXCR+Q6sek8bf92,i=4096"
    )
  );
  result = mech.next(response);
  ok(!result.done);
  value = await Promise.resolve(result.value);

  // Check the SCRAM content.
  equal(
    atob(value.send.children[0].text),
    "c=biws,r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,p=v0X8v3Bz2T0CJGbJQyF0X+HI4Ts="
  );

  // Receive the server-final-message.
  response = Stanza.node(
    "success",
    Stanza.NS.sasl,
    null,
    btoa("v=rmF9pqV8S7suAoZWja4dJRkFsKQ=")
  );
  result = mech.next(response);
  ok(result.done);
  // There is no final value.
  equal(result.value, undefined);
});

/*
 * Test SCRAM-SHA-256 using the examples given in section 3 of RFC 7677.
 */
add_task(async function testScramSha256() {
  const username = "user";
  const password = "pencil";

  // Use a constant value for the nonce.
  const nonce = "rOprNGfwEbeRWgbNEkqO";

  const mech = XMPPAuthMechanisms["SCRAM-SHA-256"](
    username,
    password,
    undefined,
    nonce
  );

  // Send the client-first-message.
  let result = mech.next();
  ok(!result.done);
  let value = await Promise.resolve(result.value);

  // Check the algorithm.
  equal(value.send.attributes.mechanism, "SCRAM-SHA-256");
  // Check the SCRAM content.
  equal(atob(value.send.children[0].text), "n,,n=user,r=rOprNGfwEbeRWgbNEkqO");

  // Receive the server-first-message and send the client-final-message.
  let response = Stanza.node(
    "challenge",
    Stanza.NS.sasl,
    null,
    btoa(
      "r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096"
    )
  );
  result = mech.next(response);
  ok(!result.done);
  value = await Promise.resolve(result.value);

  // Check the SCRAM content.
  equal(
    atob(value.send.children[0].text),
    "c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,p=dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ="
  );

  // Receive the server-final-message.
  response = Stanza.node(
    "success",
    Stanza.NS.sasl,
    null,
    btoa("v=6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=")
  );
  result = mech.next(response);
  ok(result.done);
  // There is no final value.
  equal(result.value, undefined);
});
