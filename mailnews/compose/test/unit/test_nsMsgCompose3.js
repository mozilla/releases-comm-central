/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for increasing the popularity of contacts via
 * expandMailingLists.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var TESTS = [
  {
    email: "em@test.invalid",
    // TB 2 stored popularity as hex, so we need to check correct handling.
    prePopularity: "a",
    postPopularity: "11",
  },
  {
    email: "e@test.invalid",
    prePopularity: "0",
    postPopularity: "1",
  },
  {
    email: "e@test.invalid",
    prePopularity: "1",
    postPopularity: "2",
  },
  {
    email: "em@test.invalid",
    prePopularity: "11",
    postPopularity: "12",
  },
];

function checkPopulate(aTo, aCheckTo) {
  const msgCompose = Cc[
    "@mozilla.org/messengercompose/compose;1"
  ].createInstance(Ci.nsIMsgCompose);

  // Set up some basic fields for compose.
  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  fields.to = aTo;

  // Set up some params
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);

  params.composeFields = fields;

  msgCompose.initialize(params);

  Assert.ok(!msgCompose.expandMailingLists());

  Assert.equal(fields.to, aCheckTo);
}

function run_test() {
  loadABFile("../../../data/tb2hexpopularity", kPABData.fileName);

  // Check the popularity index on a couple of cards.
  const AB = MailServices.ab.getDirectory(kPABData.URI);

  for (let i = 0; i < TESTS.length; ++i) {
    let card = AB.cardForEmailAddress(TESTS[i].email);
    Assert.ok(!!card);

    // Thunderbird 2 stored its popularityIndexes as hex, hence when we read it
    // now we're going to get a hex value. The AB has a value of "a".
    Assert.equal(
      card.getProperty("PopularityIndex", -1),
      TESTS[i].prePopularity
    );

    // Call the check populate function.
    checkPopulate(TESTS[i].email, TESTS[i].email);

    // Now we've run check populate, check the popularityIndex has increased.
    card = AB.cardForEmailAddress(TESTS[i].email);
    Assert.ok(!!card);

    // Thunderbird 2 stored its popularityIndexes as hex, hence when we read it
    // now we're going to get a hex value. The AB has a value of "a".
    Assert.equal(
      card.getProperty("PopularityIndex", -1),
      TESTS[i].postPopularity
    );
  }
}
