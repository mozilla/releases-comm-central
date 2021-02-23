/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsAbBaseCID_h__
#define nsAbBaseCID_h__

#include "nsISupports.h"
#include "nsIFactory.h"
#include "nsIComponentManager.h"

//
// The start of the contract ID for address book directory factories.
//
#define NS_AB_DIRECTORY_FACTORY_CONTRACTID_PREFIX \
  "@mozilla.org/addressbook/directory-factory;1?name="

//
// The start of the contract ID for address book directory types
//
#define NS_AB_DIRECTORY_TYPE_CONTRACTID_PREFIX \
  "@mozilla.org/addressbook/directory;1?type="

//
// nsAbManager
//
#define NS_ABMANAGER_CONTRACTID "@mozilla.org/abmanager;1"

//
// JS/SQLite address book
//
#define NS_ABJSDIRECTORY_CONTRACTID \
  NS_AB_DIRECTORY_TYPE_CONTRACTID_PREFIX "jsaddrbook"

//
// nsAddressBookDB
//
#define NS_ADDRDATABASE_CONTRACTID "@mozilla.org/addressbook/carddatabase;1"

#define NS_ADDRDATABASE_CID                                                    \
  {                                                                            \
    0x63187917, 0x1d19, 0x11d3, { 0xa3, 0x2, 0x0, 0x10, 0x83, 0x0, 0x3d, 0xc } \
  }

//
// nsAbCardProperty
//
#define NS_ABCARDPROPERTY_CONTRACTID "@mozilla.org/addressbook/cardproperty;1"
#define NS_ABCARDPROPERTY_CID                     \
  {                                               \
    0x2b722171, 0x2cea, 0x11d3, {                 \
      0x9e, 0xb, 0x0, 0xa0, 0xc9, 0x2b, 0x5f, 0xd \
    }                                             \
  }

//
// nsAbDirProperty
//
#define NS_ABDIRPROPERTY_CONTRACTID \
  "@mozilla.org/addressbook/directoryproperty;1"
#define NS_ABDIRPROPERTY_CID                      \
  {                                               \
    0x6fd8ec67, 0x3965, 0x11d3, {                 \
      0xa3, 0x16, 0x0, 0x10, 0x83, 0x0, 0x3d, 0xc \
    }                                             \
  }

//
// nsAbDirectoryProperties
//
#define NS_ABDIRECTORYPROPERTIES_CONTRACTID \
  "@mozilla.org/addressbook/properties;1"
#define NS_ABDIRECTORYPROPERTIES_CID                 \
  {                                                  \
    0x8b00a972, 0x1dd2, 0x11b2, {                    \
      0x9d, 0x9c, 0x9c, 0x37, 0x7a, 0x9c, 0x3d, 0xba \
    }                                                \
  }

//
// nsAbAddressCollector
//
#define NS_ABADDRESSCOLLECTOR_CONTRACTID \
  "@mozilla.org/addressbook/services/addressCollector;1"
#define NS_ABADDRESSCOLLECTOR_CID                    \
  {                                                  \
    0xe7702d5a, 0x99d8, 0x4648, {                    \
      0xba, 0xb7, 0x91, 0x9e, 0xa2, 0x9f, 0x30, 0xb6 \
    }                                                \
  }

//
// directory factory service
//
#define NS_ABDIRFACTORYSERVICE_CONTRACTID \
  "@mozilla.org/addressbook/directory-factory-service;1"

#define NS_ABDIRFACTORYSERVICE_CID                   \
  {                                                  \
    0xF8B212F2, 0x742B, 0x4A48, {                    \
      0xB7, 0xA0, 0x4C, 0x44, 0xD4, 0xDD, 0xB1, 0x21 \
    }                                                \
  }

#ifdef XP_WIN
//
// nsAbOutlookDirectory
//
#  define NS_ABOUTLOOKDIRECTORY_CONTRACTID \
    NS_AB_DIRECTORY_TYPE_CONTRACTID_PREFIX "moz-aboutlookdirectory"

#  define NS_ABOUTLOOKDIRECTORY_CID                    \
    {                                                  \
      0x9cc57822, 0x0599, 0x4c47, {                    \
        0xa3, 0x99, 0x1c, 0x6f, 0xa1, 0x85, 0xa0, 0x5c \
      }                                                \
    }

//
// Outlook directory factory
//
#  define NS_ABOUTLOOKINTERFACE_CONTRACTID \
    "@mozilla.org/addressbook/outlookinterface;1"

#  define NS_ABOUTLOOKINTERFACE_CID                    \
    {                                                  \
      0x558ccc0f, 0x2681, 0x4dac, {                    \
        0xa0, 0x66, 0xde, 0xbd, 0x8d, 0x26, 0xfa, 0xf6 \
      }                                                \
    }
#endif

//
//  Addressbook Query support
//
#define NS_ABDIRECTORYQUERYARGUMENTS_CONTRACTID \
  "@mozilla.org/addressbook/directory/query-arguments;1"

#define NS_ABDIRECTORYQUERYARGUMENTS_CID             \
  {                                                  \
    0xf7dc2aeb, 0x8e62, 0x4750, {                    \
      0x96, 0x5c, 0x24, 0xb9, 0xe0, 0x9e, 0xd8, 0xd2 \
    }                                                \
  }

#define NS_BOOLEANCONDITIONSTRING_CONTRACTID \
  "@mozilla.org/boolean-expression/condition-string;1"

#define NS_BOOLEANCONDITIONSTRING_CID                \
  {                                                  \
    0xca1944a9, 0x527e, 0x4c77, {                    \
      0x89, 0x5d, 0xd0, 0x46, 0x6d, 0xd4, 0x1c, 0xf5 \
    }                                                \
  }

#define NS_BOOLEANEXPRESSION_CONTRACTID \
  "@mozilla.org/boolean-expression/n-peer;1"

#define NS_BOOLEANEXPRESSION_CID                     \
  {                                                  \
    0x2c2e75c8, 0x6f56, 0x4a50, {                    \
      0xaf, 0x1c, 0x72, 0xaf, 0x5d, 0x0e, 0x8d, 0x41 \
    }                                                \
  }

#define NS_ABDIRECTORYQUERYPROXY_CONTRACTID \
  "@mozilla.org/addressbook/directory-query/proxy;1"

#define NS_ABDIRECTORYQUERYPROXY_CID                 \
  {                                                  \
    0xE162E335, 0x541B, 0x43B4, {                    \
      0xAA, 0xEA, 0xFE, 0x59, 0x1E, 0x24, 0x0C, 0xAF \
    }                                                \
  }

// nsAbLDAPDirectory
//
#define NS_ABLDAPDIRECTORY_CONTRACTID \
  NS_AB_DIRECTORY_TYPE_CONTRACTID_PREFIX "moz-abldapdirectory"

#define NS_ABLDAPDIRECTORY_CID                       \
  {                                                  \
    0x783E2777, 0x66D7, 0x4826, {                    \
      0x9E, 0x4B, 0x8A, 0xB5, 0x8C, 0x22, 0x8A, 0x52 \
    }                                                \
  }

// nsAbLDAPDirectoryQuery
//
#define NS_ABLDAPDIRECTORYQUERY_CONTRACTID \
  "@mozilla.org/addressbook/ldap-directory-query;1"

#define NS_ABLDAPDIRECTORYQUERY_CID                  \
  {                                                  \
    0x783E2777, 0x66D7, 0x4826, {                    \
      0x9E, 0x4B, 0x8A, 0xB5, 0x8C, 0x22, 0x8A, 0x53 \
    }                                                \
  }

//
// LDAP directory factory
//
#define NS_ABLDAPDIRFACTORY_CONTRACTID \
  NS_AB_DIRECTORY_FACTORY_CONTRACTID_PREFIX "moz-abldapdirectory"

#define NS_ABLDAPDIRFACTORY_CID                      \
  {                                                  \
    0x8e3701af, 0x8828, 0x426c, {                    \
      0x84, 0xac, 0x12, 0x48, 0x25, 0xc7, 0x78, 0xf8 \
    }                                                \
  }

//
// LDAP autocomplete directory factory
//
#define NS_ABLDAPACDIRFACTORY_CONTRACTID \
  NS_AB_DIRECTORY_FACTORY_CONTRACTID_PREFIX "ldap"
#define NS_ABLDAPSACDIRFACTORY_CONTRACTID \
  NS_AB_DIRECTORY_FACTORY_CONTRACTID_PREFIX "ldaps"

// nsAbLDAPAutoCompFormatter
#define NS_ABLDAPAUTOCOMPFORMATTER_CID               \
  {                                                  \
    0x4e276d6d, 0x9981, 0x46b4, {                    \
      0x90, 0x70, 0x92, 0xf3, 0x44, 0xac, 0x5f, 0x5a \
    }                                                \
  }

#define NS_ABLDAPAUTOCOMPFORMATTER_CONTRACTID \
  "@mozilla.org/ldap-autocomplete-formatter;1?type=addrbook"

// nsAbLDAPReplicationService
#define NS_ABLDAP_REPLICATIONSERVICE_CID             \
  {                                                  \
    0xece81280, 0x2639, 0x11d6, {                    \
      0xb7, 0x91, 0x00, 0xb0, 0xd0, 0x6e, 0x5f, 0x27 \
    }                                                \
  }

#define NS_ABLDAP_REPLICATIONSERVICE_CONTRACTID \
  "@mozilla.org/addressbook/ldap-replication-service;1"

// nsAbLDAPReplicationQuery
#define NS_ABLDAP_REPLICATIONQUERY_CID               \
  {                                                  \
    0x5414fff0, 0x263b, 0x11d6, {                    \
      0xb7, 0x91, 0x00, 0xb0, 0xd0, 0x6e, 0x5f, 0x27 \
    }                                                \
  }

#define NS_ABLDAP_REPLICATIONQUERY_CONTRACTID \
  "@mozilla.org/addressbook/ldap-replication-query;1"

// nsAbLDAPChangeLogQuery
#define NS_ABLDAP_CHANGELOGQUERY_CID                \
  {                                                 \
    0x63e11d51, 0x3c9b, 0x11d6, {                   \
      0xb7, 0xb9, 0x0, 0xb0, 0xd0, 0x6e, 0x5f, 0x27 \
    }                                               \
  }

#define NS_ABLDAP_CHANGELOGQUERY_CONTRACTID \
  "@mozilla.org/addressbook/ldap-changelog-query;1"

// nsAbLDAPProcessReplicationData
#define NS_ABLDAP_PROCESSREPLICATIONDATA_CID         \
  {                                                  \
    0x5414fff1, 0x263b, 0x11d6, {                    \
      0xb7, 0x91, 0x00, 0xb0, 0xd0, 0x6e, 0x5f, 0x27 \
    }                                                \
  }

#define NS_ABLDAP_PROCESSREPLICATIONDATA_CONTRACTID \
  "@mozilla.org/addressbook/ldap-process-replication-data;1"

// nsAbLDAPProcessChangeLogData
#define NS_ABLDAP_PROCESSCHANGELOGDATA_CID          \
  {                                                 \
    0x63e11d52, 0x3c9b, 0x11d6, {                   \
      0xb7, 0xb9, 0x0, 0xb0, 0xd0, 0x6e, 0x5f, 0x27 \
    }                                               \
  }

#define NS_ABLDAP_PROCESSCHANGELOGDATA_CONTRACTID \
  "@mozilla.org/addressbook/ldap-process-changelog-data;1"

#ifdef XP_MACOSX
//
// nsAbOSXDirectory
//
#  define NS_ABOSXDIRECTORY_PREFIX "moz-abosxdirectory"
#  define NS_ABOSXCARD_PREFIX "moz-abosxcard"

#  define NS_ABOSXDIRECTORY_CONTRACTID \
    NS_AB_DIRECTORY_TYPE_CONTRACTID_PREFIX NS_ABOSXDIRECTORY_PREFIX

#  define NS_ABOSXDIRECTORY_CID                        \
    {                                                  \
      0x83781cc6, 0xc682, 0x11d6, {                    \
        0xbd, 0xeb, 0x00, 0x05, 0x02, 0x49, 0x67, 0xb8 \
      }                                                \
    }

//
// nsAbOSXCard
//
#  define NS_ABOSXCARD_CONTRACTID \
    NS_AB_DIRECTORY_TYPE_CONTRACTID_PREFIX NS_ABOSXCARD_PREFIX

#  define NS_ABOSXCARD_CID                             \
    {                                                  \
      0x89bbf582, 0xc682, 0x11d6, {                    \
        0xbc, 0x9d, 0x00, 0x05, 0x02, 0x49, 0x67, 0xb8 \
      }                                                \
    }

//
// OS X directory factory
//
#  define NS_ABOSXDIRFACTORY_CONTRACTID \
    NS_AB_DIRECTORY_FACTORY_CONTRACTID_PREFIX NS_ABOSXDIRECTORY_PREFIX

#  define NS_ABOSXDIRFACTORY_CID                       \
    {                                                  \
      0x90efe2fe, 0xc682, 0x11d6, {                    \
        0x9c, 0x83, 0x00, 0x05, 0x02, 0x49, 0x67, 0xb8 \
      }                                                \
    }
#endif

#define NS_MSGVCARDSERVICE_CID                       \
  {                                                  \
    0x3c4ac0da, 0x2cda, 0x4018, {                    \
      0x95, 0x51, 0xe1, 0x58, 0xb2, 0xe1, 0x22, 0xd3 \
    }                                                \
  }

#define NS_MSGVCARDSERVICE_CONTRACTID \
  "@mozilla.org/addressbook/msgvcardservice;1"

#define NS_ABLDIFSERVICE_CID                         \
  {                                                  \
    0xdb6f46da, 0x8de3, 0x478d, {                    \
      0xb5, 0x39, 0x80, 0x13, 0x98, 0x65, 0x6c, 0xf6 \
    }                                                \
  }

#define NS_ABLDIFSERVICE_CONTRACTID "@mozilla.org/addressbook/abldifservice;1"

#endif  // nsAbBaseCID_h__
