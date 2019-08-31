/* import-globals-from head_server.js */
load("head_server.js");

info("Running test with maildir");

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/maildirstore;1"
);
