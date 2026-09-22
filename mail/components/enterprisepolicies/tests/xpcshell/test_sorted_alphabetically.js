/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);
const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const POLICIES_URL = "resource:///modules/policies/Policies.sys.mjs";

function checkArrayIsSorted(array, msg) {
  let sorted = true;
  const sortedArray = array.slice().sort(function (a, b) {
    return a.localeCompare(b);
  });

  for (let i = 0; i < array.length; i++) {
    if (array[i] != sortedArray[i]) {
      sorted = false;
      break;
    }
  }
  ok(sorted, msg);
}

// Returns the policy names Policies.sys.mjs defines for the given
// MOZ_ENTERPRISE value. The file is evaluated in a sandbox because
// AppConstants is frozen and a module is only ever evaluated once, so
// importing it twice would give the build's own value both times.
function getPolicyNames(mozEnterprise) {
  const stream = NetUtil.newChannel({
    uri: POLICIES_URL,
    loadUsingSystemPrincipal: true,
  }).open();
  const source = NetUtil.readInputStreamToString(stream, stream.available(), {
    charset: "utf-8",
  });
  stream.close();

  const sandbox = Cu.Sandbox(
    Services.scriptSecurityManager.getSystemPrincipal(),
    { wantGlobalProperties: ["ChromeUtils"] }
  );
  Object.assign(sandbox, {
    Cc,
    Ci,
    Services,
    XPCOMUtils,
    AppConstants: { ...AppConstants, MOZ_ENTERPRISE: mozEnterprise },
  });

  // The sandbox provides what the module imports, so the imports are dropped
  // and the names are read back as the completion value.
  const script = source
    .replace(/^import\b[^;]*;/gm, "")
    .replace(/^export (var|let|const) /gm, "$1 ");

  return JSON.parse(
    Cu.evalInSandbox(
      `${script}\nJSON.stringify(Object.keys(Policies));`,
      sandbox,
      null,
      POLICIES_URL,
      1
    )
  );
}

add_task(async function test_schema_sorted() {
  const { schema } = ChromeUtils.importESModule(
    "resource:///modules/policies/schema.sys.mjs"
  );

  checkArrayIsSorted(
    Object.keys(schema.properties),
    "policies-schema.json is alphabetically sorted."
  );
});

// Object.keys() follows key creation order, and on enterprise builds the
// MOZ_ENTERPRISE block adds policies after the sorted object literal. Those
// builds are covered by test_enterprise_policies_sorted instead.
add_task(
  { skip_if: () => AppConstants.MOZ_ENTERPRISE },
  async function test_policies_sorted() {
    const { Policies } = ChromeUtils.importESModule(
      "resource:///modules/policies/Policies.sys.mjs"
    );

    checkArrayIsSorted(
      Object.keys(Policies),
      "Policies.sys.mjs is alphabetically sorted."
    );
  }
);

// Policies.sys.mjs has two sorted sections: the object literal shared with
// Firefox, and the MOZ_ENTERPRISE block that follows it. Loading the file with
// MOZ_ENTERPRISE off then on tells both apart, so each can be checked.
add_task(
  { skip_if: () => !AppConstants.MOZ_ENTERPRISE },
  async function test_enterprise_policies_sorted() {
    const { Policies } = ChromeUtils.importESModule(
      "resource:///modules/policies/Policies.sys.mjs"
    );

    const sharedNames = getPolicyNames(false);
    const enterpriseNames = getPolicyNames(true);
    const enterpriseOnlyNames = enterpriseNames.filter(
      name => !sharedNames.includes(name)
    );

    Assert.deepEqual(
      enterpriseNames,
      Object.keys(Policies),
      "The sandbox defines the same policies as the loaded module."
    );

    checkArrayIsSorted(
      sharedNames,
      `The policies shared with Firefox are alphabetically sorted.: ${sharedNames}`
    );
    checkArrayIsSorted(
      enterpriseOnlyNames,
      `The enterprise only policies are alphabetically sorted.: ${enterpriseOnlyNames}`
    );
  }
);

add_task(async function check_naming_conventions() {
  const { schema } = ChromeUtils.importESModule(
    "resource:///modules/policies/schema.sys.mjs"
  );
  equal(
    Object.keys(schema.properties).some(key => key.includes("__")),
    false,
    "Can't use __ in a policy name as it's used as a delimiter"
  );
});
