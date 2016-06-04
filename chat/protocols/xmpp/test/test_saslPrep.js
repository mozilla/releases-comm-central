/* Any copyright is dedicated to the Public Domain.
* http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");

var xmppAuth = {};
Services.scriptloader.loadSubScript("resource:///modules/xmpp-authmechs.jsm",
                                    xmppAuth);

// RFC 4013 3.Examples
var TEST_DATA = [
  {
    // SOFT HYPHEN mapped to nothing.
    input: "I\u00adX",
    output: "IX",
    isError: false
  },
  {
    // No transformation.
    input: "user",
    output: "user",
    isError: false
  },
  {
    // Case preserved, will not match #2.
    input: "USER",
    output: "USER",
    isError: false
  },
  {
    // Output is NFKC, input in ISO 8859-1.
    input: "\u00aa",
    output: "a",
    isError: false
  },
  {
    // Output is NFKC, will match #1.
    input: "\u2168",
    output: "IX",
    isError: false
  },
  {
    // Error - prohibited character.
    input: "\u0007",
    output: "",
    isError: true
  },
  {
    // Error - bidirectional check.
    input: "\u0627\u0031",
    output: "",
    isError: true
  }
];

function run_test() {
  for (let current of TEST_DATA) {
    try{
      let result = xmppAuth.saslPrep(current.input);
      equal(current.isError, false);
      equal(result, current.output);
    } catch (e) {
      equal(current.isError, true);
    }
  }

  run_next_test();
}
