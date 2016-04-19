/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef _nsBeckyUtils_H__
#define _nsBeckyUtils_H__

class nsIFile;
class nsILineInputStream;
class nsIINIParser;

class nsBeckyUtils final {
public:
  static nsresult FindUserDirectoryOnWindows7(nsIFile **aLocation);
  static nsresult FindUserDirectoryOnWindowsXP(nsIFile **aLocation);
  static nsresult FindUserDirectory(nsIFile **aFile);
  static nsresult ConvertNativeStringToUTF8(const nsACString& aOriginal,
                                            nsACString& _retval);
  static nsresult CreateLineInputStream(nsIFile *aFile,
                                        nsILineInputStream **_retval);
  static nsresult GetDefaultMailboxDirectory(nsIFile **_retval);
  static nsresult GetFolderListFile(nsIFile *aLocation,
                                    nsIFile **_retval);
  static nsresult GetDefaultFolderName(nsIFile *aFolderListFile,
                                       nsACString& name);
  static nsresult GetDefaultMailboxINIFile(nsIFile **_retval);
  static nsresult GetMailboxINIFile(nsIFile *aDirectory, nsIFile **_retval);
  static nsresult CreateINIParserForFile(nsIFile *aFile,
                                         nsIINIParser **aParser);
  static nsresult GetMailboxNameFromINIFile(nsIFile *aFile, nsCString &aName);
  static nsresult ConvertToUTF8File(nsIFile *aSourceFile,
                                    nsIFile **_retval);
  static nsresult TranslateFolderName(const nsAString & aFolderName,
                                      nsAString & _retval);
};


#endif /* _nsBeckyUtils_H__ */
