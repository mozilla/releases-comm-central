/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MorkImport_h___
#define MorkImport_h___

#include "nsIImportABFile.h"
#include "nsIImportModule.h"
#include "nsCOMPtr.h"
#include "nsIStringBundle.h"

#include "nsIFile.h"
#include "nsIAbDirectory.h"

#define MORKIMPORT_CID                               \
  { /* 54d48d9f-1bac-47be-9190-c4dc74e837e2 */       \
    0x54d48d9f, 0x1bac, 0x47be, {                    \
      0x91, 0x90, 0xc4, 0xdc, 0x74, 0xe8, 0x37, 0xe2 \
    }                                                \
  }

nsresult ReadMABToDirectory(nsIFile* oldFile, nsIAbDirectory* newDirectory);

class nsImportABFromMab : public nsIImportABFile {
 public:
  nsImportABFromMab();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIIMPORTABFILE

 protected:
  virtual ~nsImportABFromMab(){};
};

class MorkImport : public nsIImportModule {
 public:
  MorkImport();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIIMPORTMODULE

 protected:
  virtual ~MorkImport();
  nsCOMPtr<nsIStringBundle> mStringBundle;
};

#endif /* MorkImport_h___ */
