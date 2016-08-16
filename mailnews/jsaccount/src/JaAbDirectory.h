/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _JaAbDirectory_H_
#define _JaAbDirectory_H_

#include "DelegateList.h"
#include "msgIOverride.h"
#include "nsAbDirProperty.h"
#include "nsAutoPtr.h"
#include "nsDataHashtable.h"
#include "nsIInterfaceRequestor.h"

namespace mozilla {
namespace mailnews {

/* Header file */

// This class is an XPCOM component, usable in JS, that calls the methods
// in the C++ base class (bypassing any JS override).
class JaBaseCppAbDirectory : public nsAbDirProperty,
                             public nsIInterfaceRequestor
{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIINTERFACEREQUESTOR
  JaBaseCppAbDirectory() { }

protected:
  virtual ~JaBaseCppAbDirectory() { }

};

class JaCppAbDirectoryDelegator : public JaBaseCppAbDirectory,
                                  public msgIOverride
{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_MSGIOVERRIDE

  NS_FORWARD_NSIABDIRECTORY(DELEGATE_JS(nsIAbDirectory, mJsIAbDirectory)->)
  NS_FORWARD_NSIABCOLLECTION(DELEGATE_JS(nsIAbCollection, mJsIAbCollection)->)
  NS_FORWARD_NSIABITEM(DELEGATE_JS(nsIAbItem, mJsIAbItem)->)
  NS_FORWARD_NSIINTERFACEREQUESTOR(DELEGATE_JS(nsIInterfaceRequestor, mJsIInterfaceRequestor)->)

  JaCppAbDirectoryDelegator();

private:
  virtual ~JaCppAbDirectoryDelegator() {
  }

  class Super : public nsIAbDirectory,
                public nsIInterfaceRequestor
  {
    public:
      Super(JaCppAbDirectoryDelegator* aFakeThis) {mFakeThis = aFakeThis;}
      NS_DECL_ISUPPORTS
      NS_FORWARD_NSIABDIRECTORY(mFakeThis->JaBaseCppAbDirectory::)
      NS_FORWARD_NSIABCOLLECTION(mFakeThis->JaBaseCppAbDirectory::)
      NS_FORWARD_NSIABITEM(mFakeThis->JaBaseCppAbDirectory::)
      NS_FORWARD_NSIINTERFACEREQUESTOR(mFakeThis->JaBaseCppAbDirectory::)
    private:
      virtual ~Super() {}
      JaCppAbDirectoryDelegator* mFakeThis;
  };

  // Interfaces that may be overridden by JS.
  nsCOMPtr<nsIAbDirectory> mJsIAbDirectory;
  nsCOMPtr<nsIAbCollection> mJsIAbCollection;
  nsCOMPtr<nsIAbItem> mJsIAbItem;
  nsCOMPtr<nsIInterfaceRequestor> mJsIInterfaceRequestor;

  nsCOMPtr<nsISupports> mJsISupports;

  // Class to bypass JS delegates. nsCOMPtr for when we do cycle collection.
  nsCOMPtr<nsIAbDirectory> mCppBase;

  RefPtr<DelegateList> mDelegateList;
  nsDataHashtable<nsCStringHashKey, bool>* mMethods;

};

} // namespace mailnews
} // namespace mozilla

#endif
