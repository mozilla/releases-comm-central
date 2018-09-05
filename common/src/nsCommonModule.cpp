#include "mozilla/ModuleUtils.h"
#include "nsCommonBaseCID.h"
#include "nsComponentManagerExtra.h"
#include "nsTransactionManagerExtra.h"
#include "nsBaseCommandController.h"

NS_GENERIC_FACTORY_CONSTRUCTOR(nsComponentManagerExtra)
NS_DEFINE_NAMED_CID(NS_COMPONENTMANAGEREXTRA_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(nsTransactionManagerExtra)
NS_DEFINE_NAMED_CID(NS_TRANSACTIONMANAGEREXTRA_CID);

#define NS_BASECOMMANDCONTROLLER_CID \
  { 0xbf88b48c, 0xfd8e, 0x40b4, { 0xba, 0x36, 0xc7, 0xc3, 0xad, 0x6d, 0x8a, 0xc9 } }
#define NS_BASECOMMANDCONTROLLER_CONTRACTID \
  "@mozilla.org/embedcomp/base-command-controller;1"

NS_GENERIC_FACTORY_CONSTRUCTOR(nsBaseCommandController)
NS_DEFINE_NAMED_CID(NS_BASECOMMANDCONTROLLER_CID);

const mozilla::Module::CIDEntry kCommonCIDs[] = {
  { &kNS_COMPONENTMANAGEREXTRA_CID, false, nullptr, nsComponentManagerExtraConstructor },
  { &kNS_TRANSACTIONMANAGEREXTRA_CID, false, nullptr, nsTransactionManagerExtraConstructor },
  { &kNS_BASECOMMANDCONTROLLER_CID, false, nullptr, nsBaseCommandControllerConstructor },
  { nullptr }
};

const mozilla::Module::ContractIDEntry kCommonContracts[] = {
  { NS_COMPONENTMANAGEREXTRA_CONTRACTID, &kNS_COMPONENTMANAGEREXTRA_CID },
  { NS_TRANSACTIONMANAGEREXTRA_CONTRACTID, &kNS_TRANSACTIONMANAGEREXTRA_CID },
  { NS_BASECOMMANDCONTROLLER_CONTRACTID, &kNS_BASECOMMANDCONTROLLER_CID },
  { nullptr }
};

static const mozilla::Module kCommonModule = {
  mozilla::Module::kVersion,
  kCommonCIDs,
  kCommonContracts,
  nullptr,
  nullptr,
  nullptr,
  nullptr
};

NSMODULE_DEFN(nsCommonModule) = &kCommonModule;
