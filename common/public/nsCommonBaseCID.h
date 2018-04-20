/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsgCommonBaseCID_h__
#define nsgCommonBaseCID_h__

#include "nsISupports.h"
#include "nsIFactory.h"
#include "nsIComponentManager.h"

// nsComponentManagerExtra
#define NS_COMPONENTMANAGEREXTRA_CONTRACTID \
  "@mozilla.org/component-manager-extra;1"

#define NS_COMPONENTMANAGEREXTRA_CID \
{ /* b4359b53-3060-46ff-ad42-e67eea6ccf59 */ \
 0xb4359b53, 0x3060, 0x46ff, \
 {0xad, 0x42, 0xe6, 0x7e, 0xea, 0x6c, 0xcf, 0x59}}

#endif // nsCommonBaseCID_h__
