/* import-globals-from head_mailbase.js */

// alternate head to set maildir as default
load("head_mailbase.js");
info("Running test with maildir");
Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/maildirstore;1"
);
