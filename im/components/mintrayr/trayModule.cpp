/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ModuleUtils.h"
#include "nsIClassInfoImpl.h"

#include "trayToolkit.h"


// Need to import TrayServiceImpl from mintrayr so that the macro works
using mintrayr::TrayServiceImpl;

// Generic factory
NS_GENERIC_FACTORY_CONSTRUCTOR(TrayServiceImpl)
NS_DEFINE_NAMED_CID(TRAYITRAYSERVICE_IID);

static const mozilla::Module::CIDEntry kTrayIIDs[] = {
    { &kTRAYITRAYSERVICE_IID, true, 0, TrayServiceImplConstructor },
    { 0 }
};
static const mozilla::Module::ContractIDEntry kTrayContracts[] = {
    { TRAYSERVICE_CONTRACTID, &kTRAYITRAYSERVICE_IID },
    { 0 }
};
static const mozilla::Module::CategoryEntry kTrayCategories[] = {
    { 0 }
};
static const mozilla::Module kTrayModule = {
    mozilla::Module::kVersion,
    kTrayIIDs,
    kTrayContracts,
    kTrayCategories
};
NSMODULE_DEFN(trayModule) = &kTrayModule;
