/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

////////////////////////////////////////////////////////////////////////////////
// Core Module Include Files
////////////////////////////////////////////////////////////////////////////////
#include "nsCOMPtr.h"
#include "mozilla/ModuleUtils.h"

////////////////////////////////////////////////////////////////////////////////
// core import Include Files
////////////////////////////////////////////////////////////////////////////////
#include "nsImportService.h"

NS_DEFINE_NAMED_CID(NS_IMPORTSERVICE_CID);
////////////////////////////////////////////////////////////////////////////////
// text import Include Files
////////////////////////////////////////////////////////////////////////////////
#include "nsTextImport.h"

NS_DEFINE_NAMED_CID(NS_TEXTIMPORT_CID);

////////////////////////////////////////////////////////////////////////////////
// vCard import Include Files
////////////////////////////////////////////////////////////////////////////////
#include "nsVCardImport.h"

NS_DEFINE_NAMED_CID(NS_VCARDIMPORT_CID);

////////////////////////////////////////////////////////////////////////////////
// Mork import Include Files
////////////////////////////////////////////////////////////////////////////////
#include "MorkImport.h"

NS_DEFINE_NAMED_CID(MORKIMPORT_CID);

////////////////////////////////////////////////////////////////////////////////
// Apple Mail import Include Files
////////////////////////////////////////////////////////////////////////////////
#if defined(XP_MACOSX)
#  include "nsAppleMailImport.h"

NS_DEFINE_NAMED_CID(NS_APPLEMAILIMPORT_CID);
NS_DEFINE_NAMED_CID(NS_APPLEMAILIMPL_CID);
#endif

////////////////////////////////////////////////////////////////////////////////
// outlook import Include Files
////////////////////////////////////////////////////////////////////////////////
#ifdef XP_WIN
#  ifdef MOZ_MAPI_SUPPORT
#    include "nsOutlookImport.h"
#    include "nsOutlookStringBundle.h"
#  endif
#  include "nsWMImport.h"
#  include "nsWMStringBundle.h"

NS_DEFINE_NAMED_CID(NS_WMIMPORT_CID);
#  ifdef MOZ_MAPI_SUPPORT
NS_DEFINE_NAMED_CID(NS_OUTLOOKIMPORT_CID);
#  endif
#endif  // XP_WIN

////////////////////////////////////////////////////////////////////////////////
// becky import Include Files
////////////////////////////////////////////////////////////////////////////////
#ifdef XP_WIN
#  include "nsBeckyImport.h"
#  include "nsBeckyStringBundle.h"

NS_DEFINE_NAMED_CID(NS_BECKYIMPORT_CID);
#endif  // XP_WIN

////////////////////////////////////////////////////////////////////////////////
// core import factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsImportService)

////////////////////////////////////////////////////////////////////////////////
// text import factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsTextImport)

////////////////////////////////////////////////////////////////////////////////
// vcard import factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsVCardImport)

////////////////////////////////////////////////////////////////////////////////
// Mork import factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(MorkImport)

////////////////////////////////////////////////////////////////////////////////
// apple mail import factories
////////////////////////////////////////////////////////////////////////////////
#if defined(XP_MACOSX)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsAppleMailImportModule)
NS_GENERIC_FACTORY_CONSTRUCTOR_INIT(nsAppleMailImportMail, Initialize)
#endif

////////////////////////////////////////////////////////////////////////////////
// outlook import factories
////////////////////////////////////////////////////////////////////////////////
#ifdef XP_WIN
NS_GENERIC_FACTORY_CONSTRUCTOR(nsWMImport)
#  ifdef MOZ_MAPI_SUPPORT
NS_GENERIC_FACTORY_CONSTRUCTOR(nsOutlookImport)
#  endif
#endif  // XP_WIN
////////////////////////////////////////////////////////////////////////////////
// becky import factory
////////////////////////////////////////////////////////////////////////////////
#ifdef XP_WIN
NS_GENERIC_FACTORY_CONSTRUCTOR(nsBeckyImport)
#endif  // XP_WIN

static const mozilla::Module::CategoryEntry kMailNewsImportCategories[] = {
    {"mailnewsimport", "text", "@mozilla.org/import/import-text;1"},
    {"mailnewsimport", "vcard", "@mozilla.org/import/import-vcard;1"},
    {"mailnewsimport", "mork", "@mozilla.org/import/import-mork;1"},
#ifdef XP_WIN
    {"mailnewsimport", "winlivemail", "@mozilla.org/import/import-wm;1"},
    {"mailnewsimport", "becky", "@mozilla.org/import/import-becky;1"},
#  ifdef MOZ_MAPI_SUPPORT
    {"mailnewsimport", "outlook", "@mozilla.org/import/import-outlook;1"},
#  endif
#endif
#if defined(XP_MACOSX)
    {"mailnewsimport", "applemail", "@mozilla.org/import/import-applemail;1"},
#endif
    {NULL}};

const mozilla::Module::CIDEntry kMailNewsImportCIDs[] = {
    {&kNS_IMPORTSERVICE_CID, false, NULL, nsImportServiceConstructor},
    {&kNS_TEXTIMPORT_CID, false, NULL, nsTextImportConstructor},
    {&kNS_VCARDIMPORT_CID, false, NULL, nsVCardImportConstructor},
    {&kMORKIMPORT_CID, false, NULL, MorkImportConstructor},
#if defined(XP_MACOSX)
    {&kNS_APPLEMAILIMPORT_CID, false, NULL, nsAppleMailImportModuleConstructor},
    {&kNS_APPLEMAILIMPL_CID, false, NULL, nsAppleMailImportMailConstructor},
#endif

#ifdef XP_WIN
    {&kNS_WMIMPORT_CID, false, NULL, nsWMImportConstructor},
    {&kNS_BECKYIMPORT_CID, false, NULL, nsBeckyImportConstructor},
#  ifdef MOZ_MAPI_SUPPORT
    {&kNS_OUTLOOKIMPORT_CID, false, NULL, nsOutlookImportConstructor},
#  endif
#endif
    {NULL}};

const mozilla::Module::ContractIDEntry kMailNewsImportContracts[] = {
    {NS_IMPORTSERVICE_CONTRACTID, &kNS_IMPORTSERVICE_CID},
    {"@mozilla.org/import/import-text;1", &kNS_TEXTIMPORT_CID},
    {"@mozilla.org/import/import-vcard;1", &kNS_VCARDIMPORT_CID},
    {"@mozilla.org/import/import-mork;1", &kMORKIMPORT_CID},
#if defined(XP_MACOSX)
    {"@mozilla.org/import/import-applemail;1", &kNS_APPLEMAILIMPORT_CID},
    {NS_APPLEMAILIMPL_CONTRACTID, &kNS_APPLEMAILIMPL_CID},
#endif

#ifdef XP_WIN
    {"@mozilla.org/import/import-wm;1", &kNS_WMIMPORT_CID},
    {"@mozilla.org/import/import-becky;1", &kNS_BECKYIMPORT_CID},
#  ifdef MOZ_MAPI_SUPPORT
    {"@mozilla.org/import/import-outlook;1", &kNS_OUTLOOKIMPORT_CID},
#  endif
#endif
    {NULL}};

static void importModuleDtor() {
#ifdef XP_WIN
  nsWMStringBundle::Cleanup();
  nsBeckyStringBundle::Cleanup();
#  ifdef MOZ_MAPI_SUPPORT
  nsOutlookStringBundle::Cleanup();
#  endif
#endif
}

extern const mozilla::Module kMailNewsImportModule = {mozilla::Module::kVersion,
                                                      kMailNewsImportCIDs,
                                                      kMailNewsImportContracts,
                                                      kMailNewsImportCategories,
                                                      NULL,
                                                      NULL,
                                                      importModuleDtor};
