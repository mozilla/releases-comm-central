/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsgCommonBaseCID_h__
#define nsgCommonBaseCID_h__

#include "nsISupports.h"
#include "nsIFactory.h"
#include "nsIComponentManager.h"

// nsComponentManagerExtra
#define NS_COMPONENTMANAGEREXTRA_CONTRACTID "@mozilla.org/component-manager-extra;1"
#define NS_COMPONENTMANAGEREXTRA_CID \
  { 0xb4359b53, 0x3060, 0x46ff, { 0xad, 0x42, 0xe6, 0x7e, 0xea, 0x6c, 0xcf, 0x59 } }

// nsTransactionManagerExtra
#define NS_TRANSACTIONMANAGEREXTRA_CONTRACTID "@mozilla.org/transaction-manager-extra;1"
#define NS_TRANSACTIONMANAGEREXTRA_CID \
  { 0x837d20c4, 0x7cbd, 0x4c42, { 0x9f, 0xf9, 0x86, 0x46, 0x6d, 0x4e, 0xd5, 0xfd } }

#define NS_BASECOMMANDCONTROLLER_CONTRACTID "@mozilla.org/embedcomp/base-command-controller;1"
#define NS_BASECOMMANDCONTROLLER_CID \
  { 0xbf88b48c, 0xfd8e, 0x40b4, { 0xba, 0x36, 0xc7, 0xc3, 0xad, 0x6d, 0x8a, 0xc9 } }

#endif // nsCommonBaseCID_h__
