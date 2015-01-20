/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
    let event = createEventFromIcalString(
        "BEGIN:VEVENT\n" +
        "UID:182d2719-fe2a-44c1-9210-0286b16c0538\n" +
        "X-FOO;X-BAR=BAZ:QUUX\n" +
        "END:VEVENT");

    // Test getters for imported event
    do_check_eq(event.getProperty("X-FOO"), "QUUX");
    do_check_true(event.hasProperty("X-FOO"));
    do_check_eq(event.getPropertyParameter("X-FOO", "X-BAR"), "BAZ");
    do_check_true(event.hasPropertyParameter("X-FOO", "X-BAR"));

    // Test setters
    do_check_throws(function() {
      event.setPropertyParameter("X-UNKNOWN", "UNKNOWN", "VALUE");
    }, Components.results.NS_ERROR_XPC_JS_THREW_STRING);

    // More setters
    event.setPropertyParameter("X-FOO", "X-BAR", "FNORD");
    do_check_eq(event.getPropertyParameter("X-FOO", "X-BAR"), "FNORD");
    do_check_neq(event.icalString.match(/^X-FOO;X-BAR=FNORD:QUUX$/m), null);

    // Enumerator
    do_check_throws(function() {
      event.getParameterEnumerator("X-UNKNOWN");
    }, Components.results.NS_ERROR_XPC_JS_THREW_STRING);

    // More enumerator
    let enume = event.getParameterEnumerator("X-FOO");
    do_check_true(enume.hasMoreElements());
    let xbar = enume.getNext().QueryInterface(Components.interfaces.nsIProperty);
    do_check_eq(xbar.name, "X-BAR");
    do_check_eq(xbar.value, "FNORD");
    do_check_false(enume.hasMoreElements());

    // Deletion of parameters when deleting properties
    event.deleteProperty("X-FOO");
    do_check_false(event.hasProperty("X-FOO"));
    event.setProperty("X-FOO", "SNORK");
    do_check_eq(event.getProperty("X-FOO"), "SNORK");
    do_check_eq(event.getPropertyParameter("X-FOO", "X-BAR"), null);
}
