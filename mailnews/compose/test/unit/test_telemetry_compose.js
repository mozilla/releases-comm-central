/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to message composition.
 */

ChromeUtils.defineModuleGetter(
  this,
  "TelemetryTestUtils",
  "resource://testing-common/TelemetryTestUtils.jsm"
);

const HTML_SCALAR = "tb.compose.format_html";
const PLAIN_TEXT_SCALAR = "tb.compose.format_plain_text";

/**
 * Check that we're counting HTML or Plain text when composing.
 */
add_task(async function test_compose_format() {
  Services.telemetry.clearScalars();

  // Bare-bones code to initiate composing a message in given format.
  let createCompose = function(fmt) {
    let msgCompose = Cc[
      "@mozilla.org/messengercompose/compose;1"
    ].createInstance(Ci.nsIMsgCompose);

    let params = Cc[
      "@mozilla.org/messengercompose/composeparams;1"
    ].createInstance(Ci.nsIMsgComposeParams);

    params.format = fmt;
    msgCompose.initialize(params);
  };

  // Start composing arbitrary numbers of messages in each format.
  const NUM_HTML = 7;
  const NUM_PLAIN = 13;
  for (let i = 0; i < NUM_HTML; i++) {
    createCompose(Ci.nsIMsgCompFormat.HTML);
  }
  for (let i = 0; i < NUM_PLAIN; i++) {
    createCompose(Ci.nsIMsgCompFormat.PlainText);
  }

  // Did we count them correctly?
  const scalars = TelemetryTestUtils.getProcessScalars("parent");
  Assert.equal(
    scalars[HTML_SCALAR],
    NUM_HTML,
    HTML_SCALAR + " must have the correct value."
  );
  Assert.equal(
    scalars[PLAIN_TEXT_SCALAR],
    NUM_PLAIN,
    PLAIN_TEXT_SCALAR + " must have the correct value."
  );
});
