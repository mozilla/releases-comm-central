/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ModuleUtils.h"
#include "mozilla/TransactionManager.h"
#include "nsBaseCommandController.h"
#include "nsMsgBaseCID.h"
#include "nsSyncStreamListener.h"
#include "nsUserInfo.h"
#include "nsXULAppAPI.h"

using mozilla::TransactionManager;

NS_GENERIC_FACTORY_CONSTRUCTOR(nsBaseCommandController)
NS_DEFINE_NAMED_CID(NS_BASECOMMANDCONTROLLER_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(TransactionManager)
NS_DEFINE_NAMED_CID(NS_TRANSACTIONMANAGER_CID);

NS_DEFINE_NAMED_CID(NS_SYNCSTREAMLISTENER_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(nsUserInfo)
NS_DEFINE_NAMED_CID(NS_USERINFO_CID);

static nsresult CreateNewSyncStreamListener(nsISupports* aOuter, REFNSIID aIID,
                                            void** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = nullptr;

  if (aOuter) {
    return NS_ERROR_NO_AGGREGATION;
  }

  RefPtr<nsISyncStreamListener> inst = nsSyncStreamListener::Create();
  if (!inst) return NS_ERROR_NULL_POINTER;

  return inst->QueryInterface(aIID, aResult);
}

const mozilla::Module::CIDEntry kCommonCIDs[] = {
    {&kNS_BASECOMMANDCONTROLLER_CID, false, nullptr,
     nsBaseCommandControllerConstructor},
    {&kNS_TRANSACTIONMANAGER_CID, false, nullptr,
     TransactionManagerConstructor},
    {&kNS_SYNCSTREAMLISTENER_CID, false, nullptr, CreateNewSyncStreamListener},
    {&kNS_USERINFO_CID, false, nullptr, nsUserInfoConstructor},
    {nullptr}};

const mozilla::Module::ContractIDEntry kCommonContracts[] = {
    {NS_BASECOMMANDCONTROLLER_CONTRACTID, &kNS_BASECOMMANDCONTROLLER_CID},
    {NS_TRANSACTIONMANAGER_CONTRACTID, &kNS_TRANSACTIONMANAGER_CID},
    {NS_SYNCSTREAMLISTENER_CONTRACTID, &kNS_SYNCSTREAMLISTENER_CID},
    {NS_USERINFO_CONTRACTID, &kNS_USERINFO_CID},
    {nullptr}};

static const mozilla::Module kCommonModule = {mozilla::Module::kVersion,
                                              kCommonCIDs,
                                              kCommonContracts,
                                              nullptr,
                                              nullptr,
                                              nullptr,
                                              nullptr};

extern const mozilla::Module kCalBaseModule;
extern const mozilla::Module kMorkModule;
extern const mozilla::Module kLDAPProtocolModule;
#ifdef MOZ_THUNDERBIRD
extern const mozilla::Module kMailCompsModule;
#endif
extern const mozilla::Module kMailNewsModule;
extern const mozilla::Module kMailNewsImportModule;
#ifdef MOZ_MAPI_SUPPORT
extern const mozilla::Module kMAPIModule;
#endif
#ifdef MOZ_SUITE
extern const mozilla::Module kSuiteModule;
#endif

class ModulesInit {
 public:
  ModulesInit() {
    XRE_AddStaticComponent(&kCommonModule);
    XRE_AddStaticComponent(&kCalBaseModule);
    XRE_AddStaticComponent(&kMorkModule);
    XRE_AddStaticComponent(&kLDAPProtocolModule);
#ifdef MOZ_THUNDERBIRD
    XRE_AddStaticComponent(&kMailCompsModule);
#endif
    XRE_AddStaticComponent(&kMailNewsModule);
    XRE_AddStaticComponent(&kMailNewsImportModule);
#ifdef MOZ_MAPI_SUPPORT
    XRE_AddStaticComponent(&kMAPIModule);
#endif
#ifdef MOZ_SUITE
    XRE_AddStaticComponent(&kSuiteModule);
#endif
  }
};

ModulesInit gInit;
