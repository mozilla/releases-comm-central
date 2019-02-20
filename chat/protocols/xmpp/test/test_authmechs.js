/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var {XMPPAuthMechanisms} = ChromeUtils.import("resource:///modules/xmpp-authmechs.jsm");
var {Stanza} = ChromeUtils.import("resource:///modules/xmpp-xml.jsm");

/*
 * Test PLAIN using the examples given in section 6 of RFC 6120.
 */
add_task(async function testPlain() {
  const username = "juliet";
  const password = "r0m30myr0m30";

  let mech = XMPPAuthMechanisms["PLAIN"](username, password, undefined);

  // Send the initiation message.
  let result = mech.next();
  ok(!result.done);
  let value = await Promise.resolve(result.value);

  // Check the PLAIN content.
  equal(value.send.children[0].text, "AGp1bGlldAByMG0zMG15cjBtMzA=");

  // Receive the success.
  let response = Stanza.node("success", Stanza.NS.sasl);
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
add_task(async function testScram() {
  const username = "user";
  const password = "pencil";

  // Use a constant value for the nonce.
  const nonce = "fyko+d2lbbFgONRv9qkxdawL";

  let mech = XMPPAuthMechanisms["SCRAM-SHA-1"](username, password, undefined, nonce);

  // Send the client-first-message.
  let result = mech.next();
  ok(!result.done);
  let value = await Promise.resolve(result.value);

  // Check the SCRAM content.
  equal(atob(value.send.children[0].text), "n,,n=user,r=fyko+d2lbbFgONRv9qkxdawL");

  // Receive the server-first-message and send the client-final-message.
  let response = Stanza.node("challenge", Stanza.NS.sasl, null, btoa("r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,s=QSXCR+Q6sek8bf92,i=4096"));
  result = mech.next(response);
  ok(!result.done);
  value = await Promise.resolve(result.value);

  // Check the SCRAM content.
  equal(atob(value.send.children[0].text), "c=biws,r=fyko+d2lbbFgONRv9qkxdawL3rfcNHYJY1ZVvWVs7j,p=v0X8v3Bz2T0CJGbJQyF0X+HI4Ts=");

  // Receive the server-final-message.
  response = Stanza.node("success", Stanza.NS.sasl, null, btoa("v=rmF9pqV8S7suAoZWja4dJRkFsKQ="));
  result = mech.next(response);
  ok(result.done);
  // There is no final value.
  equal(result.value, undefined);
});
