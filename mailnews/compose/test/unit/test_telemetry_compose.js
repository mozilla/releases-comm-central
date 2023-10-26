/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to message composition.
 */

ChromeUtils.defineESModuleGetters(this, {
  TelemetryTestUtils: "resource://testing-common/TelemetryTestUtils.sys.mjs",
});

const HTML_SCALAR = "tb.compose.format_html";
const PLAIN_TEXT_SCALAR = "tb.compose.format_plain_text";

/**
 * Check that we're counting HTML or Plain text when composing.
 */
add_task(async function test_compose_format() {
  Services.telemetry.clearScalars();

  // Bare-bones code to initiate composing a message in given format.
  const createCompose = function (fmt) {
    const msgCompose = Cc[
      "@mozilla.org/messengercompose/compose;1"
    ].createInstance(Ci.nsIMsgCompose);

    const params = Cc[
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

/**
 * Check that we're counting compose type (new/reply/fwd etc) when composing.
 */
add_task(async function test_compose_type() {
  // Bare-bones code to initiate composing a message in given type.
  const createCompose = function (type) {
    const msgCompose = Cc[
      "@mozilla.org/messengercompose/compose;1"
    ].createInstance(Ci.nsIMsgCompose);

    const params = Cc[
      "@mozilla.org/messengercompose/composeparams;1"
    ].createInstance(Ci.nsIMsgComposeParams);

    params.type = type;
    msgCompose.initialize(params);
  };
  const histogram = TelemetryTestUtils.getAndClearHistogram("TB_COMPOSE_TYPE");

  // Start composing arbitrary numbers of messages in each format.
  const NUM_NEW = 4;
  const NUM_DRAFT = 7;
  const NUM_EDIT_TEMPLATE = 3;
  for (let i = 0; i < NUM_NEW; i++) {
    createCompose(Ci.nsIMsgCompType.New);
  }
  for (let i = 0; i < NUM_DRAFT; i++) {
    createCompose(Ci.nsIMsgCompType.Draft);
  }
  for (let i = 0; i < NUM_EDIT_TEMPLATE; i++) {
    createCompose(Ci.nsIMsgCompType.EditTemplate);
  }

  // Did we count them correctly?
  const snapshot = histogram.snapshot();
  Assert.equal(
    snapshot.values[Ci.nsIMsgCompType.New],
    NUM_NEW,
    "nsIMsgCompType.New count must be correct"
  );
  Assert.equal(
    snapshot.values[Ci.nsIMsgCompType.Draft],
    NUM_DRAFT,
    "nsIMsgCompType.Draft count must be correct"
  );
  Assert.equal(
    snapshot.values[Ci.nsIMsgCompType.EditTemplate],
    NUM_EDIT_TEMPLATE,
    "nsIMsgCompType.EditTemplate count must be correct"
  );
});
