/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* This list allows pre-existing or 'unfixable' JS issues to remain, while we
 * detect newly occurring issues in shipping JS. It is a list of regexes
 * matching files which have errors:
 */

requestLongerTimeout(2);
SimpleTest.requestCompleteLog();

const kAllowlist = new Set([
  /browser\/content\/browser\/places\/controller.js$/,
]);

const kESModuleList = new Set([
  /browser\/lockwise-card.js$/,
  /browser\/monitor-card.js$/,
  /browser\/proxy-card.js$/,
  /toolkit\/content\/global\/certviewer\/components\/.*\.js$/,
  /toolkit\/content\/global\/certviewer\/.*\.js$/,
  /toolkit\/content\/global\/ml\/transformers.*\.js$/,
  /chrome\/pdfjs\/content\/web\/.*\.js$/,
]);

// Normally we would use reflect.sys.mjs to get Reflect.parse. However, if
// we do that, then all the AST data is allocated in reflect.sys.mjs's
// zone. That exposes a bug in our GC. The GC collects reflect.sys.mjs's
// zone but not the zone in which our test code lives (since no new
// data is being allocated in it). The cross-compartment wrappers in
// our zone that point to the AST data never get collected, and so the
// AST data itself is never collected. We need to GC both zones at
// once to fix the problem.
const init = Cc["@mozilla.org/jsreflect;1"].createInstance();
init();

/**
 * Check if an error should be ignored due to matching one of the allowlist
 * objects defined in kAllowlist
 *
 * @param uri the uri to check against the allowlist
 * @returns true if the uri should be skipped, false otherwise.
 */
function uriIsAllowed(uri) {
  for (const allowlistItem of kAllowlist) {
    if (allowlistItem.test(uri.spec)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a URI should be parsed as an ES module.
 *
 * @param {nsIURI} uri - The uri to check against the ES module list
 * @returns {boolean} true if the uri should be parsed as a module, otherwise parse it as a script.
 */
function uriIsESModule(uri) {
  for (const allowlistItem of kESModuleList) {
    if (allowlistItem.test(uri.spec)) {
      return true;
    }
  }
  return uri.spec.endsWith(".mjs");
}

function parsePromise(uri, parseTarget) {
  const promise = new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", uri, true);
    xhr.onreadystatechange = function () {
      if (this.readyState == this.DONE) {
        const scriptText = this.responseText;
        try {
          info(`Checking ${parseTarget} ${uri}`);
          const parseOpts = {
            source: uri,
            target: parseTarget,
          };
          Reflect.parse(scriptText, parseOpts);
          resolve(true);
        } catch (ex) {
          const errorMsg = "Script error reading " + uri + ": " + ex;
          ok(false, errorMsg);
          resolve(false);
        }
      }
    };
    xhr.onerror = error => {
      ok(false, "XHR error reading " + uri + ": " + error);
      resolve(false);
    };
    xhr.overrideMimeType("application/javascript");
    xhr.send(null);
  });
  return promise;
}

add_task(async function checkAllTheJS() {
  // In debug builds, even on a fast machine, collecting the file list may take
  // more than 30 seconds, and parsing all files may take four more minutes.
  // For this reason, this test must be explicitly requested in debug builds by
  // using the "--setpref parse=<filter>" argument to mach.  You can specify:
  //  - A case-sensitive substring of the file name to test (slow).
  //  - A single absolute URI printed out by a previous run (fast).
  //  - An empty string to run the test on all files (slowest).
  const parseRequested = Services.prefs.prefHasUserValue("parse");
  const parseValue = parseRequested && Services.prefs.getCharPref("parse");
  if (SpecialPowers.isDebugBuild) {
    if (!parseRequested) {
      ok(
        true,
        "Test disabled on debug build. To run, execute: ./mach" +
          " mochitest-browser --setpref parse=<case_sensitive_filter>" +
          " browser/base/content/test/general/browser_parsable_script.js"
      );
      return;
    }
    // Request a 15 minutes timeout (30 seconds * 30) for debug builds.
    requestLongerTimeout(30);
  }

  let uris;
  // If an absolute URI is specified on the command line, use it immediately.
  if (parseValue && parseValue.includes(":")) {
    uris = [NetUtil.newURI(parseValue)];
  } else {
    const appDir = Services.dirsvc.get("GreD", Ci.nsIFile);
    // This asynchronously produces a list of URLs (sadly, mostly sync on our
    // test infrastructure because it runs against jarfiles there, and
    // our zipreader APIs are all sync)
    const startTimeMs = Date.now();
    info("Collecting URIs");
    uris = await generateURIsFromDirTree(appDir, [".js", ".mjs"]);
    info("Collected URIs in " + (Date.now() - startTimeMs) + "ms");

    // Apply the filter specified on the command line, if any.
    if (parseValue) {
      uris = uris.filter(uri => {
        if (uri.spec.includes(parseValue)) {
          return true;
        }
        info("Not checking filtered out " + uri.spec);
        return false;
      });
    }
  }

  // We create an array of promises so we can parallelize all our parsing
  // and file loading activity:
  await throttledMapPromises(uris, uri => {
    if (uriIsAllowed(uri)) {
      info("Not checking allowlisted " + uri.spec);
      return undefined;
    }
    let target = "script";
    if (uriIsESModule(uri)) {
      target = "module";
    }
    return parsePromise(uri.spec, target);
  });
  ok(true, "All files parsed");
});
