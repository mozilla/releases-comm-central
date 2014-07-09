/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef nsCharsetConverterManager_h__
#define nsCharsetConverterManager_h__

#include "nsISupports.h"
#include "nsICharsetConverterManager.h"

#define NS_DATA_BUNDLE_CATEGORY     "uconv-charset-data"
#define NS_TITLE_BUNDLE_CATEGORY    "uconv-charset-titles"

class nsCharsetAlias;

class nsCharsetConverterManager : public nsICharsetConverterManager
{
  friend class nsCharsetAlias;

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSICHARSETCONVERTERMANAGER

public:
  nsCharsetConverterManager();

  static void Shutdown();

private:
  virtual ~nsCharsetConverterManager();

  static bool IsInternal(const nsACString& aCharset);
};

#endif // nsCharsetConverterManager_h__


