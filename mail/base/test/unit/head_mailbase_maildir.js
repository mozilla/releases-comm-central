// alternate head to set maildir as default
load("head_mailbase.js");
do_print("Running test with maildir");
Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                           "@mozilla.org/msgstore/maildirstore;1");
