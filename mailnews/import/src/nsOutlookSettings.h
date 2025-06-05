/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_IMPORT_SRC_NSOUTLOOKSETTINGS_H_
#define COMM_MAILNEWS_IMPORT_SRC_NSOUTLOOKSETTINGS_H_

#include "nsIImportSettings.h"

class nsOutlookSettings : public nsIImportSettings {
 public:
  nsOutlookSettings();

  static nsresult Create(nsIImportSettings** aImport);

  // nsISupports interface
  NS_DECL_ISUPPORTS

  // nsIImportSettings interface
  NS_DECL_NSIIMPORTSETTINGS

 private:
  virtual ~nsOutlookSettings();
};

#endif  // COMM_MAILNEWS_IMPORT_SRC_NSOUTLOOKSETTINGS_H_
