load("head_server.js");

info("Running test with maildir");

Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                           "@mozilla.org/msgstore/maildirstore;1");
