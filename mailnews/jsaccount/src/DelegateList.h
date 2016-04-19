/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _DelegateList_H_
#define _DelegateList_H_

#include "nsISupports.h"
#include "msgIDelegateList.h"
#include "nsDataHashtable.h"

namespace mozilla {
namespace mailnews {

// This class provides a list of method names to delegate to another object.
class DelegateList : public msgIDelegateList
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_MSGIDELEGATELIST
  DelegateList(const char *aWindowsPrefix) :
    mPrefix(aWindowsPrefix)
  { }
  nsDataHashtable<nsCStringHashKey, bool> mMethods;

protected:
  virtual ~DelegateList() { }
  nsCString mPrefix; // Windows decorated method prefix.
};

} // namespace mailnews
} // namespace mozilla

/*
 * This macro is used in forwarding functions.
 *   _interface: the interface being forwarded.
 *   _jsdelegate: the name of the JS pointer that implements a particular
 *                interface.
 *
 * You must follow the naming convention:
 *   1) use mCppBase as the name of the C++ base class instance.
 *   2) use mMethod as the name of the DelegateList object.
 **/

#define DELEGATE_JS(_interface, _jsdelegate) (\
    _jsdelegate && mMethods && \
    mMethods->Contains(nsLiteralCString(__FUNCTION__)) ? \
       _jsdelegate : nsCOMPtr<_interface>(do_QueryInterface(mCppBase)))

#endif
