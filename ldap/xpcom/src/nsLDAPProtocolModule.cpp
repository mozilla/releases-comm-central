/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIClassInfoImpl.h"
#include "mozilla/ModuleUtils.h"

#include "nsLDAPURL.h"
#ifdef MOZ_PREF_EXTENSIONS
#  include "nsLDAPSyncQuery.h"
#endif

// use the default constructor
//
NS_GENERIC_FACTORY_CONSTRUCTOR(nsLDAPURL)
#ifdef MOZ_PREF_EXTENSIONS
NS_GENERIC_FACTORY_CONSTRUCTOR(nsLDAPSyncQuery)
#endif

NS_DEFINE_NAMED_CID(NS_LDAPURL_CID);
#ifdef MOZ_PREF_EXTENSIONS
NS_DEFINE_NAMED_CID(NS_LDAPSYNCQUERY_CID);
#endif

// a table of the CIDs implemented by this module
//

const mozilla::Module::CIDEntry kLDAPProtocolCIDs[] = {
    {&kNS_LDAPURL_CID, false, NULL, nsLDAPURLConstructor},
#ifdef MOZ_PREF_EXTENSIONS
    {&kNS_LDAPSYNCQUERY_CID, false, NULL, nsLDAPSyncQueryConstructor},
#endif
    {NULL}};

const mozilla::Module::ContractIDEntry kLDAPProtocolContracts[] = {
    {"@mozilla.org/network/ldap-url;1", &kNS_LDAPURL_CID},
#ifdef MOZ_PREF_EXTENSIONS
    {"@mozilla.org/ldapsyncquery;1", &kNS_LDAPSYNCQUERY_CID},
#endif
    {NULL}};

extern const mozilla::Module kLDAPProtocolModule = {mozilla::Module::kVersion,
                                                    kLDAPProtocolCIDs,
                                                    kLDAPProtocolContracts,
                                                    NULL,
                                                    NULL,
                                                    NULL,
                                                    NULL};
