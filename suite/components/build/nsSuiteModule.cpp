/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ModuleUtils.h"
#include "nsSuiteDirectoryProvider.h"
#include "nsThunderbirdProfileMigrator.h"
#include "nsSuiteMigrationCID.h"
#include "nsNetCID.h"
#include "nsFeedSniffer.h"

#if defined(XP_WIN)
#include "nsWindowsShellService.h"
#elif defined(XP_MACOSX)
#include "nsMacShellService.h"
#elif defined(MOZ_WIDGET_GTK)
#include "nsGNOMEShellService.h"
#endif

using namespace mozilla;
/////////////////////////////////////////////////////////////////////////////

#if defined(XP_WIN)
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsWindowsShellService, Init)
#elif defined(XP_MACOSX)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMacShellService)
#elif defined(MOZ_WIDGET_GTK)
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsGNOMEShellService, Init)
#endif
NS_GENERIC_FACTORY_CONSTRUCTOR(nsSuiteDirectoryProvider)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsThunderbirdProfileMigrator)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsFeedSniffer)

#if defined(XP_WIN)
NS_DEFINE_NAMED_CID(NS_SHELLSERVICE_CID);
#elif defined(XP_MACOSX)
NS_DEFINE_NAMED_CID(NS_SHELLSERVICE_CID);
#elif defined(MOZ_WIDGET_GTK)
NS_DEFINE_NAMED_CID(NS_SHELLSERVICE_CID);
#endif
NS_DEFINE_NAMED_CID(NS_SUITEDIRECTORYPROVIDER_CID);
NS_DEFINE_NAMED_CID(NS_THUNDERBIRDPROFILEMIGRATOR_CID);
NS_DEFINE_NAMED_CID(NS_FEEDSNIFFER_CID);

/////////////////////////////////////////////////////////////////////////////

static const mozilla::Module::CIDEntry kSuiteCIDs[] = {
#if defined(XP_WIN)
  { &kNS_SHELLSERVICE_CID, false, NULL, nsWindowsShellServiceConstructor },
#elif defined(XP_MACOSX)
  { &kNS_SHELLSERVICE_CID, false, NULL, nsMacShellServiceConstructor },
#elif defined(MOZ_WIDGET_GTK)
  { &kNS_SHELLSERVICE_CID, false, NULL, nsGNOMEShellServiceConstructor },
#endif
  { &kNS_SUITEDIRECTORYPROVIDER_CID, false, NULL, nsSuiteDirectoryProviderConstructor },
  { &kNS_THUNDERBIRDPROFILEMIGRATOR_CID, false, NULL, nsThunderbirdProfileMigratorConstructor },
  { &kNS_FEEDSNIFFER_CID, false, NULL, nsFeedSnifferConstructor },
  { NULL }
};

static const mozilla::Module::ContractIDEntry kSuiteContracts[] = {
#if defined(XP_WIN)
  { NS_SHELLSERVICE_CONTRACTID, &kNS_SHELLSERVICE_CID },
#elif defined(XP_MACOSX)
  { NS_SHELLSERVICE_CONTRACTID, &kNS_SHELLSERVICE_CID },
#elif defined(MOZ_WIDGET_GTK)
  { NS_SHELLSERVICE_CONTRACTID, &kNS_SHELLSERVICE_CID },
#endif
  { NS_SUITEDIRECTORYPROVIDER_CONTRACTID, &kNS_SUITEDIRECTORYPROVIDER_CID },
  { NS_SUITEPROFILEMIGRATOR_CONTRACTID_PREFIX "thunderbird", &kNS_THUNDERBIRDPROFILEMIGRATOR_CID },
  { NS_FEEDSNIFFER_CONTRACTID, &kNS_FEEDSNIFFER_CID },
  { NULL }
};

static const mozilla::Module::CategoryEntry kSuiteCategories[] = {
  { XPCOM_DIRECTORY_PROVIDER_CATEGORY, "suite-directory-provider", NS_SUITEDIRECTORYPROVIDER_CONTRACTID },
  { NS_CONTENT_SNIFFER_CATEGORY, "Feed Sniffer", NS_FEEDSNIFFER_CONTRACTID },
  { NULL }
};

extern const mozilla::Module kSuiteModule = {
  mozilla::Module::kVersion,
  kSuiteCIDs,
  kSuiteContracts,
  kSuiteCategories
};
