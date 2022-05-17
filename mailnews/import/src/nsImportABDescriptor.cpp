/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nscore.h"
#include "nsImportABDescriptor.h"

////////////////////////////////////////////////////////////////////////

nsresult nsImportABDescriptor::Create(REFNSIID aIID, void** aResult) {
  RefPtr<nsImportABDescriptor> it = new nsImportABDescriptor();
  return it->QueryInterface(aIID, aResult);
}

NS_IMPL_ISUPPORTS(nsImportABDescriptor, nsIImportABDescriptor)

nsImportABDescriptor::nsImportABDescriptor()
    : mId(0), mRef(0), mSize(0), mImport(true) {}
