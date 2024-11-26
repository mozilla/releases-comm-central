/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nscore.h"
#include "nsImportMailboxDescriptor.h"
#include "nsComponentManagerUtils.h"

////////////////////////////////////////////////////////////////////////

nsresult nsImportMailboxDescriptor::Create(REFNSIID aIID, void** aResult) {
  RefPtr<nsImportMailboxDescriptor> it = new nsImportMailboxDescriptor();
  return it->QueryInterface(aIID, aResult);
}

NS_IMPL_ISUPPORTS(nsImportMailboxDescriptor, nsIImportMailboxDescriptor)

nsImportMailboxDescriptor::nsImportMailboxDescriptor() {
  m_import = true;
  m_size = 0;
  m_depth = 0;
  m_id = 0;
}
