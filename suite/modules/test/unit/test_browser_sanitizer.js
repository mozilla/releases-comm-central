ChromeUtils.import("resource:///modules/Sanitizer.jsm", this);
ChromeUtils.defineModuleGetter(this, "FormHistory",
                               "resource://gre/modules/FormHistory.jsm");

var sanTests = {
  cache: {
    desc: "Cache",
    async setup() {
      var entry = null;
      this.cs = Services.cache.createSession("SanitizerTest", Ci.nsICache.STORE_ANYWHERE, true);
      entry = await promiseOpenCacheEntry("http://santizer.test", Ci.nsICache.ACCESS_READ_WRITE, this.cs);
      entry.setMetaDataElement("Foo", "Bar");
      entry.markValid();
      entry.close();
    },

    async check(aShouldBeCleared) {
      let entry = null;
      entry = await promiseOpenCacheEntry("http://santizer.test", Ci.nsICache.ACCESS_READ, this.cs);

      if (entry) {
        entry.close();
      }

      Assert.equal(!entry, aShouldBeCleared);
    }
  },

  offlineApps: {
    desc: "Offline app cache",
    async setup() {
      //XXX test offline DOMStorage
      var entry = null;
      this.cs = Services.cache.createSession("SanitizerTest", Ci.nsICache.STORE_OFFLINE, true);
      entry = await promiseOpenCacheEntry("http://santizer.test", Ci.nsICache.ACCESS_READ_WRITE, this.cs);
      entry.setMetaDataElement("Foo", "Bar");
      entry.markValid();
      entry.close();
    },

    async check(aShouldBeCleared) {
      var entry = null;
      entry = await promiseOpenCacheEntry("http://santizer.test", Ci.nsICache.ACCESS_READ, this.cs);
      if (entry) {
        entry.close();
      }

      Assert.equal(!entry, aShouldBeCleared);
    }
  },

  cookies: {
    desc: "Cookie",
    setup: function() {
      Services.prefs.setIntPref("network.cookie.cookieBehavior", 0);
      this.uri = Services.io.newURI("http://sanitizer.test/");
      this.cs = Cc["@mozilla.org/cookieService;1"]
                  .getService(Ci.nsICookieService);
      this.cs.setCookieString(this.uri, null, "Sanitizer!", null);
    },

    check: function(aShouldBeCleared) {
      if (aShouldBeCleared)
        Assert.notEqual(this.cs.getCookieString(this.uri, null), "Sanitizer!");
      else
        Assert.equal(this.cs.getCookieString(this.uri, null), "Sanitizer!");
    }
  },

  history: {
    desc: "History",
    async setup() {
      var uri = Services.io.newURI("http://sanitizer.test/");
      await promiseAddVisits({
        uri: uri,
        title: "Sanitizer!"
      });
    },

    check: function(aShouldBeCleared) {
      var rv = false;
      var history = Cc["@mozilla.org/browser/nav-history-service;1"]
                      .getService(Ci.nsINavHistoryService);
      var options = history.getNewQueryOptions();
      var query = history.getNewQuery();
      query.searchTerms = "Sanitizer!";
      var results = history.executeQuery(query, options).root;
      results.containerOpen = true;
      for (var i = 0; i < results.childCount; i++) {
        if (results.getChild(i).uri == "http://sanitizer.test/") {
          rv = true;
          break;
        }
      }

      // Close container after reading from it
      results.containerOpen = false;

      Assert.equal(rv, !aShouldBeCleared);
    }
  },

  urlbar: {
    desc: "Location bar history",
    setup: function() {
      // Create urlbarhistory file first otherwise tests will fail.
      var file = Services.dirsvc.get("ProfD", Ci.nsIFile);
      file.append("urlbarhistory.sqlite");
      if (!file.exists()) {
        var connection = Cc["@mozilla.org/storage/service;1"]
                           .getService(Ci.mozIStorageService)
                           .openDatabase(file);
        connection.createTable("urlbarhistory", "url TEXT");
        connection.executeSimpleSQL(
          "INSERT INTO urlbarhistory (url) VALUES ('Sanitizer')");
        connection.close();
      }

      // Open location dialog.
      Services.prefs.setStringPref("general.open_location.last_url", "Sanitizer!");
    },

    check: function(aShouldBeCleared) {
      let locData;
      try {
        locData = Services.prefs.getStringPref("general.open_location.last_url");
      } catch(ex) {}

      Assert.equal(locData == "Sanitizer!", !aShouldBeCleared);

      var file = Cc["@mozilla.org/file/directory_service;1"]
                   .getService(Ci.nsIProperties)
                   .get("ProfD", Ci.nsIFile);
      file.append("urlbarhistory.sqlite");

      var connection = Cc["@mozilla.org/storage/service;1"]
                         .getService(Ci.mozIStorageService)
                         .openDatabase(file);
      var urlbar = connection.tableExists("urlbarhistory");
      if (urlbar) {
        var handle = connection.createStatement(
          "SELECT url FROM urlbarhistory");
        if (handle.executeStep())
          urlbar = (handle.getString(0) == "Sanitizer");
        handle.reset();
        handle.finalize();
      }
      connection.close();

      Assert.equal(urlbar, !aShouldBeCleared);
    }
  },

  formdata: {
    desc: "Form history",
    async setup() {
      // Adds a form entry to history.
      function promiseAddFormEntry(aName, aValue) {
        return new Promise((resolve, reject) =>
          FormHistory.update({ op: "add", fieldname: aName, value: aValue },
                             { handleError(error) {
                                 reject();
                                 throw new Error("Error occurred updating form history: " + error);
                               },
                               handleCompletion(reason) {
                                 resolve();
                               }
                             })
        )
      }
      await promiseAddFormEntry("Sanitizer", "Foo");
    },
    async check(aShouldBeCleared) {
      // Check if a form name exists.
      function formNameExists(aName) {
        return new Promise((resolve, reject) => {
          let count = 0;
          FormHistory.count({ fieldname: aName },
                            { handleResult: result => count = result,
                              handleError(error) {
                                reject(error);
                                throw new Error("Error occurred searching form history: " + error);
                              },
                              handleCompletion(reason) {
                                if (!reason) {
                                  resolve(count);
                                }
                              }
                            });
        });
      }

      // Checking for Sanitizer form history entry creation.
      let exists = await formNameExists("Sanitizer");
      Assert.equal(exists, !aShouldBeCleared);
    }
  },

  downloads: {
    desc: "Download",
    setup: function() {
      var uri = Services.io.newURI("http://sanitizer.test/");
      var file = Services.dirsvc.get("TmpD", Ci.nsIFile);
      file.append("sanitizer.file");
      file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, parseInt("0666", 8));
      var dest = Services.io.newFileURI(file);

      this.dm = Cc["@mozilla.org/download-manager;1"]
                  .getService(Ci.nsIDownloadManager);

      const nsIWBP = Ci.nsIWebBrowserPersist;
      var persist = Cc["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
                      .createInstance(nsIWBP);
      persist.persistFlags = nsIWBP.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
                             nsIWBP.PERSIST_FLAGS_BYPASS_CACHE |
                             nsIWBP.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;

      this.dl = this.dm.addDownload(this.dm.DOWNLOAD_CANCELED, uri, dest,
                                    "Sanitizer!", null,
                                    Math.round(Date.now() * 1000), null,
                                    persist, false);

      // Stupid DM...
      this.dm.cancelDownload(this.dl.id);
    },

    check: function(aShouldBeCleared) {
      var dl = null;
      try {
        dl = this.dm.getDownload(this.dl.id);
      } catch(ex) {}

      if (aShouldBeCleared)
        Assert.equal(!dl, aShouldBeCleared)
      else
        Assert.equal(dl.displayName, "Sanitizer!");
    }
  },

  passwords: {
    desc: "Login manager",
    setup: function() {
      this.pm = Cc["@mozilla.org/login-manager;1"]
                  .getService(Ci.nsILoginManager);
      var info = Components.Constructor("@mozilla.org/login-manager/loginInfo;1",
                                        Ci.nsILoginInfo, "init");
      var login = new info("http://sanitizer.test", null, "Rick Astley Fan Club",
                           "dolske", "iliketurtles1", "", "");
      this.pm.addLogin(login);
    },

    check: function(aShouldBeCleared) {
      let rv = false;
      let logins = this.pm.findLogins({}, "http://sanitizer.test", null, "Rick Astley Fan Club");
      for (var i = 0; i < logins.length; i++) {
        if (logins[i].username == "dolske") {
          rv = true;
          break;
        }
      }

      Assert.equal(rv, !aShouldBeCleared);
    }
  },

  sessions: {
    desc: "HTTP auth session",
    setup: function() {
      this.authMgr = Cc["@mozilla.org/network/http-auth-manager;1"]
                       .getService(Ci.nsIHttpAuthManager);

      this.authMgr.setAuthIdentity("http", "sanitizer.test", 80, "basic", "Sanitizer",
                                   "", "Foo", "fooo", "foo12");
    },

    check: function(aShouldBeCleared) {
      var domain = {};
      var user = {};
      var password = {};

      try {
        this.authMgr.getAuthIdentity("http", "sanitizer.test", 80, "basic", "Sanitizer",
                                     "", domain, user, password);
      } catch(ex) {}

      Assert.equal(domain.value == "Foo", !aShouldBeCleared);
    }
  }
}

async function fullSanitize() {
  info("Now doing a full sanitize run");
  var prefs = Services.prefs.getBranch("privacy.clearOnShutdown.");

  Services.prefs.setBoolPref("privacy.sanitize.promptOnSanitize", false);

  for (var testName in sanTests) {
    var test = sanTests[testName];
    await test.setup();
    prefs.setBoolPref(testName, true);
  }

  Sanitizer.sanitize();

  for (var testName in sanTests) {
    var test = sanTests[testName];
    await test.check(true);
    info(test.desc + " data cleared by full sanitize");
    try {
      prefs.clearUserPref(testName);
    } catch (ex) {}
  }

  try {
    Services.prefs.clearUserPref("privacy.sanitize.promptOnSanitize");
  } catch(ex) {}
}

function run_test()
{
  run_next_test();
}

add_task(async function test_browser_sanitizer()
{
  for (var testName in sanTests) {
    let test = sanTests[testName];
    dump("\nExecuting test: " + testName + "\n" + "*** " + test.desc + "\n");
    await test.setup();
    await test.check(false);

    Sanitizer.items[testName].clear();
    info(test.desc + " data cleared");

    await test.check(true);
  }
});

add_task(fullSanitize);
