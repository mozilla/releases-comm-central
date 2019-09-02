/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsLDAPBERValue.h"
#include "nsMemory.h"
#include "nsString.h"

NS_IMPL_ISUPPORTS(nsLDAPBERValue, nsILDAPBERValue)

nsLDAPBERValue::nsLDAPBERValue() : mValue(0), mSize(0) {}

nsLDAPBERValue::~nsLDAPBERValue() {
  if (mValue) {
    free(mValue);
  }
}

// Array<octet> get();
NS_IMETHODIMP
nsLDAPBERValue::Get(nsTArray<uint8_t>& aRetVal) {
  if (mSize > 0) {
    aRetVal.ReplaceElementsAt(0, aRetVal.Length(), mValue, mSize);
  } else {
    aRetVal.SetLength(0);
  }
  return NS_OK;
}

// void set(in Array<octet> aValue);
NS_IMETHODIMP
nsLDAPBERValue::Set(nsTArray<uint8_t> const& aValue) {
  return SetRaw(aValue.Length(), aValue.Elements());
}

nsresult nsLDAPBERValue::SetRaw(uint32_t aCount, const uint8_t* aValue) {
  // get rid of any old value being held here
  //
  if (mValue) {
    free(mValue);
  }

  // if this is a non-zero value, allocate a buffer and copy
  //
  if (aCount) {
    // get a buffer to hold a copy of this data
    //
    mValue = static_cast<uint8_t*>(moz_xmalloc(aCount));
    if (!mValue) {
      return NS_ERROR_OUT_OF_MEMORY;
    }

    // copy the data and return
    //
    memcpy(mValue, aValue, aCount);
  } else {
    // otherwise just set it to null
    //
    mValue = 0;
  }

  mSize = aCount;
  return NS_OK;
}

// void setFromUTF8(in AUTF8String aValue);
//
NS_IMETHODIMP
nsLDAPBERValue::SetFromUTF8(const nsACString& aValue) {
  // get rid of any old value being held here
  //
  if (mValue) {
    free(mValue);
  }

  // copy the data and return
  //
  mSize = aValue.Length();
  if (mSize) {
    mValue = reinterpret_cast<uint8_t*>(ToNewCString(aValue));
  } else {
    mValue = 0;
  }
  return NS_OK;
}
