/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _DelegateList_H_
#define _DelegateList_H_

#include "nsISupports.h"
#include "msgIDelegateList.h"
#include "nsTHashMap.h"
#include "nsString.h"

namespace mozilla {
namespace mailnews {

// This class provides a list of method names to delegate to another object.
class DelegateList : public msgIDelegateList {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_MSGIDELEGATELIST
  DelegateList() {}
  nsTHashMap<nsCStringHashKey, bool> mMethods;

 protected:
  virtual ~DelegateList() {}
};

}  // namespace mailnews
}  // namespace mozilla

/*
 * This macro is used in forwarding functions.
 *   _jsdelegate: the name of the JS pointer that implements a particular
 *                interface.
 *   _jsmethods:  the DelegateList object
 *   _cppbase:    the C++ base instance (used when call not delegated to js)
 *
 **/

#define DELEGATE_JS(_jsdelegate, _jsmethods, _cppbase)      \
  (_jsdelegate && _jsmethods &&                             \
           _jsmethods->Contains(nsLiteralCString(__func__)) \
       ? _jsdelegate                                        \
       : (_cppbase))

#endif
