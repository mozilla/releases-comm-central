/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ModuleUtils.h"
#include "nsBaseCommandController.h"
#include "nsCommonBaseCID.h"
#include "nsComponentManagerExtra.h"
#include "nsTransactionManagerExtra.h"

NS_GENERIC_FACTORY_CONSTRUCTOR(nsComponentManagerExtra)
NS_DEFINE_NAMED_CID(NS_COMPONENTMANAGEREXTRA_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(nsTransactionManagerExtra)
NS_DEFINE_NAMED_CID(NS_TRANSACTIONMANAGEREXTRA_CID);

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
