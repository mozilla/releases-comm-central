/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsWMUtils_h___
#define nsWMUtils_h___

#include <windows.h>
#include "nsIWindowsRegKey.h"

class nsWMUtils {
 public:
  static nsresult FindWMKey(nsIWindowsRegKey** aKey);
  static nsresult GetRootFolder(nsIFile** aRootFolder);
  static nsresult GetOEAccountFiles(nsCOMArray<nsIFile>& aFileArray);
  static nsresult GetOEAccountFilesInFolder(nsIFile* aFolder,
                                            nsCOMArray<nsIFile>& aFileArray);
  static nsresult MakeXMLdoc(mozilla::dom::Document** aXmlDoc, nsIFile* aFile);
  static nsresult GetValueForTag(mozilla::dom::Document* aXmlDoc,
                                 const char* aTagName, nsAString& aValue);
};

#endif /* nsWMUtils_h___ */
