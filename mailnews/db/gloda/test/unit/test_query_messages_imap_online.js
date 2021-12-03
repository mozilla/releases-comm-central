/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Test query support for IMAP messages that aren't offline.
 */

/* import-globals-from base_query_messages.js */
load("base_query_messages.js");

expectFulltextResults = false;

function run_test() {
  configure_message_injection({ mode: "imap", offline: false });
  glodaHelperRunTests(tests);
}
