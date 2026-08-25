/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ctypes } = ChromeUtils.importESModule(
  "resource://gre/modules/ctypes.sys.mjs"
);

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

do_get_profile();

add_task(async function test_add_module() {
  const testModule = do_get_file(
    "../../../../../../security/manager/ssl/tests/unit/pkcs11testmodule/"
  );
  testModule.append(ctypes.libraryName("pkcs11testmodule"));
  const moduleLoadedPromise = TestUtils.topicObserved(
    "test-enterprisepolicies-securitydevices"
  );
  await setupPolicyEngineWithJson({
    policies: {
      SecurityDevices: {
        Add: {
          TestModule: testModule.path,
        },
      },
    },
  });

  equal(
    Services.policies.status,
    Ci.nsIEnterprisePolicies.ACTIVE,
    "Engine is active"
  );

  await moduleLoadedPromise;
  const pkcs11ModuleDB = Cc[
    "@mozilla.org/security/pkcs11moduledb;1"
  ].getService(Ci.nsIPKCS11ModuleDB);
  ok(
    (await pkcs11ModuleDB.listModules())
      .map(module => module.name)
      .includes("TestModule"),
    "Should have loaded 'TestModule'"
  );
});

add_task(async function test_delete_module() {
  const moduleUnloadedPromise = TestUtils.topicObserved(
    "test-enterprisepolicies-securitydevices"
  );
  await setupPolicyEngineWithJson({
    policies: {
      SecurityDevices: {
        Delete: ["TestModule"],
      },
    },
  });

  equal(
    Services.policies.status,
    Ci.nsIEnterprisePolicies.ACTIVE,
    "Engine is active"
  );

  await moduleUnloadedPromise;
  const pkcs11ModuleDB = Cc[
    "@mozilla.org/security/pkcs11moduledb;1"
  ].getService(Ci.nsIPKCS11ModuleDB);
  ok(
    !(await pkcs11ModuleDB.listModules())
      .map(module => module.name)
      .includes("TestModule"),
    "Should have unloaded 'TestModule'"
  );
});
