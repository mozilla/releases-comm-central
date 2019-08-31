/**
 * Test indexing support for local junk.
 */

/* import-globals-from base_index_junk.js */
load("base_index_junk.js");

function run_test() {
  configure_message_injection({ mode: "local" });
  glodaHelperRunTests(tests);
}
