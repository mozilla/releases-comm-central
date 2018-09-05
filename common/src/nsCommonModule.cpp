/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ModuleUtils.h"
#include "mozilla/TransactionManager.h"
#include "nsBaseCommandController.h"
#include "nsCommonBaseCID.h"
#include "nsComponentManagerExtra.h"

using mozilla::TransactionManager;

NS_GENERIC_FACTORY_CONSTRUCTOR(nsComponentManagerExtra)
NS_DEFINE_NAMED_CID(NS_COMPONENTMANAGEREXTRA_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(nsBaseCommandController)
NS_DEFINE_NAMED_CID(NS_BASECOMMANDCONTROLLER_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(TransactionManager)
NS_DEFINE_NAMED_CID(NS_TRANSACTIONMANAGER_CID);

const mozilla::Module::CIDEntry kCommonCIDs[] = {
  { &kNS_COMPONENTMANAGEREXTRA_CID, false, nullptr, nsComponentManagerExtraConstructor },
  { &kNS_BASECOMMANDCONTROLLER_CID, false, nullptr, nsBaseCommandControllerConstructor },
  { &kNS_TRANSACTIONMANAGER_CID, false, nullptr, TransactionManagerConstructor },
  { nullptr }
};

const mozilla::Module::ContractIDEntry kCommonContracts[] = {
  { NS_COMPONENTMANAGEREXTRA_CONTRACTID, &kNS_COMPONENTMANAGEREXTRA_CID },
  { NS_BASECOMMANDCONTROLLER_CONTRACTID, &kNS_BASECOMMANDCONTROLLER_CID },
  { NS_TRANSACTIONMANAGER_CONTRACTID, &kNS_TRANSACTIONMANAGER_CID },
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
