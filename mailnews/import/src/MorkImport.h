/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_IMPORT_SRC_MORKIMPORT_H_
#define COMM_MAILNEWS_IMPORT_SRC_MORKIMPORT_H_

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

#endif  // COMM_MAILNEWS_IMPORT_SRC_MORKIMPORT_H_
