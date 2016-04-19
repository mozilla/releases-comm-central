/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DelegateList.h"

// This class is used within JsAccount to allow static storage of a list
// of methods to be overridden by JS implementations, in a way that can
// be stored and manipulated in JS, but used efficiently in C++.

namespace mozilla {
namespace mailnews {

NS_IMPL_ISUPPORTS(DelegateList, msgIDelegateList)

NS_IMETHODIMP DelegateList::Add(const char *aMethodName)
{
  // __FUNCTION__ is the undecorated function name in gcc, but decorated in
  // Windows. __func__ will resolve this when supported in VS 2015.
  nsCString prettyFunction;
#if defined (_MSC_VER)
  prettyFunction.Append(mPrefix);
#endif
  prettyFunction.Append(nsDependentCString(aMethodName));

  mMethods.Put(prettyFunction, true);
  return NS_OK;
}

} // namespace mailnews
} // namespace mozilla
