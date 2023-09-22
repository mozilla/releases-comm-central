/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
  const event = createEventFromIcalString(
    "BEGIN:VEVENT\n" +
      "UID:182d2719-fe2a-44c1-9210-0286b16c0538\n" +
      "X-FOO;X-BAR=BAZ:QUUX\n" +
      "END:VEVENT"
  );

  // Test getters for imported event
  equal(event.getProperty("X-FOO"), "QUUX");
  ok(event.hasProperty("X-FOO"));
  equal(event.getPropertyParameter("X-FOO", "X-BAR"), "BAZ");
  ok(event.hasPropertyParameter("X-FOO", "X-BAR"));

  // Test setters
  throws(() => {
    event.setPropertyParameter("X-UNKNOWN", "UNKNOWN", "VALUE");
  }, /Property X-UNKNOWN not set/);

  // More setters
  event.setPropertyParameter("X-FOO", "X-BAR", "FNORD");
  equal(event.getPropertyParameter("X-FOO", "X-BAR"), "FNORD");
  notEqual(event.icalString.match(/^X-FOO;X-BAR=FNORD:QUUX$/m), null);

  // Test we can get the parameter names
  throws(() => {
    event.getParameterNames("X-UNKNOWN");
  }, /Property X-UNKNOWN not set/);
  equal(event.getParameterNames("X-FOO").length, 1);
  ok(event.getParameterNames("X-FOO").includes("X-BAR"));

  // Deletion of parameters when deleting properties
  event.deleteProperty("X-FOO");
  ok(!event.hasProperty("X-FOO"));
  event.setProperty("X-FOO", "SNORK");
  equal(event.getProperty("X-FOO"), "SNORK");
  equal(event.getParameterNames("X-FOO").length, 0);
  equal(event.getPropertyParameter("X-FOO", "X-BAR"), null);
}
