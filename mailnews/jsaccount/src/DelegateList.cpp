/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
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

NS_IMETHODIMP DelegateList::Add(const nsACString& aMethodName) {
  mMethods.InsertOrUpdate(aMethodName, true);
  return NS_OK;
}

}  // namespace mailnews
}  // namespace mozilla
