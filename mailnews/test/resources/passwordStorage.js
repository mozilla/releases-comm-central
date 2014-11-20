if (typeof gDEPTH == "undefined")
  do_throw("gDEPTH must be defined when using passwordStorage.js");

Components.utils.import("resource://gre/modules/Services.jsm");

/**
 * Use the given storage database as the current signon database.
 * @returns Promise When the storage database is usable.
 */
function setupForPassword(storageName) {
  let keyDB = do_get_file(gDEPTH + "mailnews/data/key3.db");
  keyDB.copyTo(do_get_profile(), "key3.db");

  let signons = do_get_file(gDEPTH + "mailnews/data/" + storageName);
  signons.copyTo(do_get_profile(), "logins.json");
  return Services.logins.initializationPromise;
}
