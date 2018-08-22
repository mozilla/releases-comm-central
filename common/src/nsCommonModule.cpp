#include "mozilla/ModuleUtils.h"
#include "nsCommonBaseCID.h"
#include "nsComponentManagerExtra.h"
#include "nsTransactionManagerExtra.h"

NS_GENERIC_FACTORY_CONSTRUCTOR(nsComponentManagerExtra)
NS_DEFINE_NAMED_CID(NS_COMPONENTMANAGEREXTRA_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(nsTransactionManagerExtra)
NS_DEFINE_NAMED_CID(NS_TRANSACTIONMANAGEREXTRA_CID);

const mozilla::Module::CIDEntry kCommonCIDs[] = {
  { &kNS_COMPONENTMANAGEREXTRA_CID, false, nullptr, nsComponentManagerExtraConstructor },
  { &kNS_TRANSACTIONMANAGEREXTRA_CID, false, nullptr, nsTransactionManagerExtraConstructor },
  { nullptr }
};

const mozilla::Module::ContractIDEntry kCommonContracts[] = {
  { NS_COMPONENTMANAGEREXTRA_CONTRACTID, &kNS_COMPONENTMANAGEREXTRA_CID },
  { NS_TRANSACTIONMANAGEREXTRA_CONTRACTID, &kNS_TRANSACTIONMANAGEREXTRA_CID },
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
