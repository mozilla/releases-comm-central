/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsImportABDescriptor_h___
#define nsImportABDescriptor_h___

#include "mozilla/Attributes.h"
#include "nscore.h"
#include "nsStringGlue.h"
#include "nsIImportABDescriptor.h"
#include "nsIFile.h"
#include "nsCOMPtr.h"

////////////////////////////////////////////////////////////////////////

class nsImportABDescriptor : public nsIImportABDescriptor
{
public:
  NS_DECL_THREADSAFE_ISUPPORTS

  NS_IMETHOD GetIdentifier(uint32_t *pIdentifier) override {
    *pIdentifier = mId;
    return NS_OK;
  }
  NS_IMETHOD SetIdentifier(uint32_t ident) override {
    mId = ident;
    return NS_OK;
  }

  NS_IMETHOD GetRef(uint32_t *pRef) override {
    *pRef = mRef;
    return NS_OK;
  }
  NS_IMETHOD SetRef(uint32_t ref) override {
    mRef = ref;
    return NS_OK;
  }

  /* attribute unsigned long size; */
  NS_IMETHOD GetSize(uint32_t *pSize) override {
    *pSize = mSize;
    return NS_OK;
  }
  NS_IMETHOD SetSize(uint32_t theSize) override {
    mSize = theSize;
    return NS_OK;
  }

  /* attribute AString displayName; */
  NS_IMETHOD GetPreferredName(nsAString &aName) override {
    aName = mDisplayName;
    return NS_OK;
  }
  NS_IMETHOD SetPreferredName(const nsAString &aName) override {
    mDisplayName = aName;
    return NS_OK;
  }

  /* readonly attribute nsIFile fileSpec; */
  NS_IMETHOD GetAbFile(nsIFile **aFile) override {
    if (!mFile)
      return NS_ERROR_NULL_POINTER;

    return mFile->Clone(aFile);
  }

  NS_IMETHOD SetAbFile(nsIFile *aFile) override {
    if (!aFile) {
      mFile = nullptr;
      return NS_OK;
    }

    return aFile->Clone(getter_AddRefs(mFile));
  }

  /* attribute boolean import; */
  NS_IMETHOD GetImport(bool *pImport) override {
    *pImport = mImport;
    return NS_OK;
  }
  NS_IMETHOD SetImport(bool doImport) override {
    mImport = doImport;
    return NS_OK;
  }

  nsImportABDescriptor();

  static NS_METHOD Create(nsISupports *aOuter, REFNSIID aIID, void **aResult);

private:
  virtual ~nsImportABDescriptor() {}
  uint32_t mId; // used by creator of the structure
  uint32_t mRef; // depth in the hierarchy
  nsString mDisplayName; // name of this mailbox
  nsCOMPtr<nsIFile> mFile; // source file (if applicable)
  uint32_t mSize; // size
  bool mImport; // import it or not?
};


#endif
