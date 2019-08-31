/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Test query support for local messages.
 */

/* import-globals-from base_query_messages.js */
load("base_query_messages.js");

function run_test() {
  configure_message_injection({ mode: "local" });
  glodaHelperRunTests(tests);
}
