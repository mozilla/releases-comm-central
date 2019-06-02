/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ModuleUtils.h"
#include "mozilla/TransactionManager.h"
#include "nsBaseCommandController.h"
#include "nsCommonBaseCID.h"
#include "nsComponentManagerExtra.h"
#include "nsSyncStreamListener.h"
#include "nsSAXXMLReader.h"  // Sax parser.
#include "nsUserInfo.h"
#include "nsXULAppAPI.h"

using mozilla::TransactionManager;

NS_GENERIC_FACTORY_CONSTRUCTOR(nsComponentManagerExtra)
NS_DEFINE_NAMED_CID(NS_COMPONENTMANAGEREXTRA_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(nsBaseCommandController)
NS_DEFINE_NAMED_CID(NS_BASECOMMANDCONTROLLER_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(TransactionManager)
NS_DEFINE_NAMED_CID(NS_TRANSACTIONMANAGER_CID);

NS_DEFINE_NAMED_CID(NS_SYNCSTREAMLISTENER_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(nsSAXXMLReader)
NS_DEFINE_NAMED_CID(NS_SAXXMLREADER_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(nsUserInfo)
NS_DEFINE_NAMED_CID(NS_USERINFO_CID);

static nsresult CreateNewSyncStreamListener(nsISupports *aOuter, REFNSIID aIID,
                                            void **aResult) {
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
    {&kNS_COMPONENTMANAGEREXTRA_CID, false, nullptr,
     nsComponentManagerExtraConstructor},
    {&kNS_BASECOMMANDCONTROLLER_CID, false, nullptr,
     nsBaseCommandControllerConstructor},
    {&kNS_TRANSACTIONMANAGER_CID, false, nullptr,
     TransactionManagerConstructor},
    {&kNS_SYNCSTREAMLISTENER_CID, false, nullptr, CreateNewSyncStreamListener},
    {&kNS_SAXXMLREADER_CID, false, nullptr, nsSAXXMLReaderConstructor},
    {&kNS_USERINFO_CID, false, nullptr, nsUserInfoConstructor},
    {nullptr}};

const mozilla::Module::ContractIDEntry kCommonContracts[] = {
    {NS_COMPONENTMANAGEREXTRA_CONTRACTID, &kNS_COMPONENTMANAGEREXTRA_CID},
    {NS_BASECOMMANDCONTROLLER_CONTRACTID, &kNS_BASECOMMANDCONTROLLER_CID},
    {NS_TRANSACTIONMANAGER_CONTRACTID, &kNS_TRANSACTIONMANAGER_CID},
    {NS_SYNCSTREAMLISTENER_CONTRACTID, &kNS_SYNCSTREAMLISTENER_CID},
    {NS_SAXXMLREADER_CONTRACTID, &kNS_SAXXMLREADER_CID},
    {NS_USERINFO_CONTRACTID, &kNS_USERINFO_CID},
    {nullptr}};

static const mozilla::Module kCommonModule = {mozilla::Module::kVersion,
                                              kCommonCIDs,
                                              kCommonContracts,
                                              nullptr,
                                              nullptr,
                                              nullptr,
                                              nullptr};

#ifdef MOZ_CALENDAR
extern const mozilla::Module kCalBaseModule;
#endif
extern const mozilla::Module kMorkModule;
#ifdef MOZ_LDAP_XPCOM
extern const mozilla::Module kLDAPProtocolModule;
#endif
#ifdef MOZ_THUNDERBIRD
extern const mozilla::Module kMailCompsModule;
#endif
extern const mozilla::Module kMailNewsModule;
extern const mozilla::Module kMailNewsImportModule;
#ifdef MOZ_MAPI_SUPPORT
extern const mozilla::Module kMAPIModule;
#endif
extern const mozilla::Module kRDFModule;
#ifdef MOZ_SUITE
extern const mozilla::Module kSuiteModule;
#endif

class ModulesInit {
 public:
  ModulesInit() {
    XRE_AddStaticComponent(&kCommonModule);
#ifdef MOZ_CALENDAR
    XRE_AddStaticComponent(&kCalBaseModule);
#endif
    XRE_AddStaticComponent(&kMorkModule);
#ifdef MOZ_LDAP_XPCOM
    XRE_AddStaticComponent(&kLDAPProtocolModule);
#endif
#ifdef MOZ_THUNDERBIRD
    XRE_AddStaticComponent(&kMailCompsModule);
#endif
    XRE_AddStaticComponent(&kMailNewsModule);
    XRE_AddStaticComponent(&kMailNewsImportModule);
#ifdef MOZ_MAPI_SUPPORT
    XRE_AddStaticComponent(&kMAPIModule);
#endif
    XRE_AddStaticComponent(&kRDFModule);
#ifdef MOZ_SUITE
    XRE_AddStaticComponent(&kSuiteModule);
#endif
  }
};

ModulesInit gInit;
