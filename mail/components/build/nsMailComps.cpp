/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ModuleUtils.h"
#include "nsMailMigrationCID.h"
#include "nsProfileMigrator.h"
#include "nsSeamonkeyProfileMigrator.h"

NS_GENERIC_FACTORY_CONSTRUCTOR(nsProfileMigrator)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsSeamonkeyProfileMigrator)

#ifdef XP_WIN

#  include "nsOutlookProfileMigrator.h"
NS_GENERIC_FACTORY_CONSTRUCTOR(nsOutlookProfileMigrator)

#  include "nsWindowsShellService.h"
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsWindowsShellService, Init)
#endif

#ifdef MOZ_WIDGET_GTK
#  include "nsGNOMEShellService.h"
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsGNOMEShellService, Init)
#endif
#ifdef XP_MACOSX
#  include "nsMacShellService.h"
NS_GENERIC_FACTORY_CONSTRUCTOR(nsMacShellService)
#endif

#if defined(XP_WIN)
#  include "nsMailWinSearchHelper.h"
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsMailWinSearchHelper, Init)
#endif

NS_DEFINE_NAMED_CID(NS_THUNDERBIRD_PROFILEIMPORT_CID);
NS_DEFINE_NAMED_CID(NS_SEAMONKEYPROFILEMIGRATOR_CID);

#ifdef XP_WIN
NS_DEFINE_NAMED_CID(NS_OUTLOOKPROFILEMIGRATOR_CID);
NS_DEFINE_NAMED_CID(NS_MAILWININTEGRATION_CID);
NS_DEFINE_NAMED_CID(NS_MAILWINSEARCHHELPER_CID);
#endif  // !XP_WIN

#ifdef MOZ_WIDGET_GTK
NS_DEFINE_NAMED_CID(NS_MAILGNOMEINTEGRATION_CID);
#endif

#ifdef XP_MACOSX
NS_DEFINE_NAMED_CID(NS_MAILMACINTEGRATION_CID);
#endif

const mozilla::Module::CIDEntry kMailCIDs[] = {
    {&kNS_THUNDERBIRD_PROFILEIMPORT_CID, false, NULL,
     nsProfileMigratorConstructor},
    {&kNS_SEAMONKEYPROFILEMIGRATOR_CID, false, NULL,
     nsSeamonkeyProfileMigratorConstructor},
#ifdef XP_WIN
    {&kNS_OUTLOOKPROFILEMIGRATOR_CID, false, NULL,
     nsOutlookProfileMigratorConstructor},
    {&kNS_MAILWININTEGRATION_CID, false, NULL,
     nsWindowsShellServiceConstructor},
    {&kNS_MAILWINSEARCHHELPER_CID, false, NULL,
     nsMailWinSearchHelperConstructor},
#endif  // !XP_WIN
#ifdef MOZ_WIDGET_GTK
    {&kNS_MAILGNOMEINTEGRATION_CID, false, NULL,
     nsGNOMEShellServiceConstructor},
#endif
#ifdef XP_MACOSX
    {&kNS_MAILMACINTEGRATION_CID, false, NULL, nsMacShellServiceConstructor},
#endif
    {NULL}};

const mozilla::Module::ContractIDEntry kMailContracts[] = {
    {NS_PROFILEMIGRATOR_CONTRACTID, &kNS_THUNDERBIRD_PROFILEIMPORT_CID},
    {NS_MAILPROFILEMIGRATOR_CONTRACTID_PREFIX "seamonkey",
     &kNS_SEAMONKEYPROFILEMIGRATOR_CID},
#ifdef XP_WIN
    {NS_MAILPROFILEMIGRATOR_CONTRACTID_PREFIX "outlook",
     &kNS_OUTLOOKPROFILEMIGRATOR_CID},
    {"@mozilla.org/mail/shell-service;1", &kNS_MAILWININTEGRATION_CID},
    {"@mozilla.org/mail/windows-search-helper;1", &kNS_MAILWINSEARCHHELPER_CID},
#endif  // !XP_WIN
#ifdef MOZ_WIDGET_GTK
    {"@mozilla.org/mail/shell-service;1", &kNS_MAILGNOMEINTEGRATION_CID},
#endif
#ifdef XP_MACOSX
    {"@mozilla.org/mail/shell-service;1", &kNS_MAILMACINTEGRATION_CID},
#endif
    {NULL}};

extern const mozilla::Module kMailCompsModule = {mozilla::Module::kVersion,
                                                 kMailCIDs, kMailContracts};
