/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
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
#include "nsImportMimeEncode.h"
#include "nsImportStringBundle.h"

NS_DEFINE_NAMED_CID(NS_IMPORTSERVICE_CID);
NS_DEFINE_NAMED_CID(NS_IMPORTMIMEENCODE_CID);
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
// Apple Mail import Include Files
////////////////////////////////////////////////////////////////////////////////
#if defined(XP_MACOSX)
#include "nsAppleMailImport.h"

NS_DEFINE_NAMED_CID(NS_APPLEMAILIMPORT_CID);
NS_DEFINE_NAMED_CID(NS_APPLEMAILIMPL_CID);
#endif

////////////////////////////////////////////////////////////////////////////////
// outlook import Include Files
////////////////////////////////////////////////////////////////////////////////
#ifdef XP_WIN
#include "nsOEImport.h"
#include "nsOEStringBundle.h"
#ifdef MOZ_MAPI_SUPPORT
#include "nsOutlookImport.h"
#include "nsOutlookStringBundle.h"
#endif
#include "nsWMImport.h"
#include "nsWMStringBundle.h"

NS_DEFINE_NAMED_CID(NS_OEIMPORT_CID);
NS_DEFINE_NAMED_CID(NS_WMIMPORT_CID);
#ifdef MOZ_MAPI_SUPPORT
NS_DEFINE_NAMED_CID(NS_OUTLOOKIMPORT_CID);
#endif
#endif // XP_WIN

////////////////////////////////////////////////////////////////////////////////
// becky import Include Files
////////////////////////////////////////////////////////////////////////////////
#ifdef XP_WIN
#include "nsBeckyImport.h"
#include "nsBeckyStringBundle.h"

NS_DEFINE_NAMED_CID(NS_BECKYIMPORT_CID);
#endif // XP_WIN

////////////////////////////////////////////////////////////////////////////////
// core import factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsImportService)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsIImportMimeEncodeImpl)

////////////////////////////////////////////////////////////////////////////////
// text import factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsTextImport)

////////////////////////////////////////////////////////////////////////////////
// vcard import factories
////////////////////////////////////////////////////////////////////////////////
NS_GENERIC_FACTORY_CONSTRUCTOR(nsVCardImport)

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
NS_GENERIC_FACTORY_CONSTRUCTOR(nsOEImport)
NS_GENERIC_FACTORY_CONSTRUCTOR(nsWMImport)
#ifdef MOZ_MAPI_SUPPORT
NS_GENERIC_FACTORY_CONSTRUCTOR(nsOutlookImport)
#endif
#endif // XP_WIN
////////////////////////////////////////////////////////////////////////////////
// becky import factory
////////////////////////////////////////////////////////////////////////////////
#ifdef XP_WIN
NS_GENERIC_FACTORY_CONSTRUCTOR(nsBeckyImport)
#endif // XP_WIN

static const mozilla::Module::CategoryEntry kMailNewsImportCategories[] = {
  // XXX These CIDs should match the explicit CIDs defined in the header files,
  // or be changed so that they are contract IDs (with appropriate code updates)
  { "mailnewsimport", "{A5991D01-ADA7-11d3-A9C2-00A0CC26DA63}", NS_IMPORT_ADDRESS_STR },
  { "mailnewsimport", "{0eb034a3-964a-4e2f-92eb-cc55d9ae9dd2}", NS_IMPORT_ADDRESS_STR },
#ifdef XP_WIN
  { "mailnewsimport", "{42bc82bc-8e9f-4597-8b6e-e529daaf3af1}", kWMSupportsString },
  { "mailnewsimport", "{be0bc880-1742-11d3-a206-00a0cc26da63}", kOESupportsString },
  { "mailnewsimport", "{7952a6cf-2442-4c04-9f02-150b15a0a841}", kBeckySupportsString },
#ifdef MOZ_MAPI_SUPPORT
  { "mailnewsimport", "{1DB469A0-8B00-11d3-A206-00A0CC26DA63}", kOutlookSupportsString },
#endif
#endif
#if defined(XP_MACOSX)
  { "mailnewsimport", "{6d3f101c-70ec-4e04-b68d-9908d1aeddf3}", kAppleMailSupportsString },
#endif
  { NULL }
};

const mozilla::Module::CIDEntry kMailNewsImportCIDs[] = {
  { &kNS_IMPORTSERVICE_CID, false, NULL, nsImportServiceConstructor },
  { &kNS_IMPORTMIMEENCODE_CID, false, NULL, nsIImportMimeEncodeImplConstructor },
  { &kNS_TEXTIMPORT_CID, false, NULL, nsTextImportConstructor },
  { &kNS_VCARDIMPORT_CID, false, NULL, nsVCardImportConstructor },
#if defined(XP_MACOSX)
  { &kNS_APPLEMAILIMPORT_CID, false, NULL, nsAppleMailImportModuleConstructor },
  { &kNS_APPLEMAILIMPL_CID, false, NULL, nsAppleMailImportMailConstructor },
#endif

#ifdef XP_WIN
  { &kNS_OEIMPORT_CID, false, NULL, nsOEImportConstructor },
  { &kNS_WMIMPORT_CID, false, NULL, nsWMImportConstructor },
  { &kNS_BECKYIMPORT_CID, false, NULL, nsBeckyImportConstructor },
#ifdef MOZ_MAPI_SUPPORT
  { &kNS_OUTLOOKIMPORT_CID, false, NULL, nsOutlookImportConstructor },
#endif
#endif
  { NULL }
};

const mozilla::Module::ContractIDEntry kMailNewsImportContracts[] = {
  { NS_IMPORTSERVICE_CONTRACTID, &kNS_IMPORTSERVICE_CID },
  { "@mozilla.org/import/import-mimeencode;1", &kNS_IMPORTMIMEENCODE_CID },
  { "@mozilla.org/import/import-text;1", &kNS_TEXTIMPORT_CID },
  { "@mozilla.org/import/import-vcard;1", &kNS_VCARDIMPORT_CID },
#if defined(XP_MACOSX)
  { "@mozilla.org/import/import-applemail;1", &kNS_APPLEMAILIMPORT_CID },
  { NS_APPLEMAILIMPL_CONTRACTID, &kNS_APPLEMAILIMPL_CID },
#endif

#ifdef XP_WIN
  { "@mozilla.org/import/import-oe;1", &kNS_OEIMPORT_CID },
  { "@mozilla.org/import/import-wm;1", &kNS_WMIMPORT_CID },
  { "@mozilla.org/import/import-becky;1", &kNS_BECKYIMPORT_CID },
#ifdef MOZ_MAPI_SUPPORT
  { "@mozilla.org/import/import-outlook;1", &kNS_OUTLOOKIMPORT_CID },
#endif
#endif
  { NULL }
};


static void importModuleDtor()
{
#ifdef XP_WIN

    nsOEStringBundle::Cleanup();
    nsWMStringBundle::Cleanup();
    nsBeckyStringBundle::Cleanup();
#ifdef MOZ_MAPI_SUPPORT
    nsOutlookStringBundle::Cleanup();
#endif
#endif
}

static const mozilla::Module kMailNewsImportModule = {
  mozilla::Module::kVersion,
  kMailNewsImportCIDs,
  kMailNewsImportContracts,
  kMailNewsImportCategories,
  NULL,
  NULL,
  importModuleDtor
};

NSMODULE_DEFN(nsImportServiceModule) = &kMailNewsImportModule;


