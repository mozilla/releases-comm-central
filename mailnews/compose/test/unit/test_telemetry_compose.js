/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to message composition.
 */

add_setup(function test_setup() {
  // FOG needs a profile directory to put its data in.
  do_get_profile();

  // FOG needs to be initialized in order for data to flow.
  Services.fog.initializeFOG();
});

/**
 * Check that we're counting HTML or Plain text when composing.
 */
add_task(async function test_compose_format() {
  Services.fog.testResetFOG();

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
  const htmlValue = Glean.compose.composeFormat.HTML.testGetValue();
  Assert.equal(
    htmlValue,
    NUM_HTML,
    "tb.compose_format metric should be correct for HTML"
  );
  const plainTextValue = Glean.compose.composeFormat.PlainText.testGetValue();
  Assert.equal(
    plainTextValue,
    NUM_PLAIN,
    "tb.compose_format metric should be correct for PlainText"
  );
});

/**
 * Check that we're counting compose type (new/reply/fwd etc) when composing.
 */
add_task(async function test_compose_type() {
  Services.fog.testResetFOG();

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
  Assert.equal(
    Glean.compose.composeType.New.testGetValue(),
    NUM_NEW,
    "nsIMsgCompType.New count must be correct"
  );

  Assert.equal(
    Glean.compose.composeType.Draft.testGetValue(),
    NUM_DRAFT,
    "nsIMsgCompType.Draft count must be correct"
  );

  Assert.equal(
    Glean.compose.composeType.EditTemplate.testGetValue(),
    NUM_EDIT_TEMPLATE,
    "nsIMsgCompType.EditTemplate count must be correct"
  );
});
