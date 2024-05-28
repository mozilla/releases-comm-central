/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MorkImport_h___
#define MorkImport_h___

#include "nsIImportABFile.h"
#include "nsIFile.h"
#include "nsIAbDirectory.h"

nsresult ReadMABToDirectory(nsIFile* oldFile, nsIAbDirectory* newDirectory);

class nsImportABFromMab : public nsIImportABFile {
 public:
  nsImportABFromMab();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIIMPORTABFILE

 protected:
  virtual ~nsImportABFromMab() {};
};

#endif /* MorkImport_h___ */
