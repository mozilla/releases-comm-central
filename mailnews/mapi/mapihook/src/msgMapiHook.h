/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPIHOOK_H_
#define COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPIHOOK_H_

#include "prtypes.h"

class nsMapiHook {
 public:
  static bool DisplayLoginDialog(bool aLogin, char16_t** aUsername,
                                 char16_t** aPassword);
  static bool VerifyUserName(const nsCString& aUsername, nsCString& aIdKey);

  static bool IsBlindSendAllowed();
  static nsresult BlindSendMail(unsigned long aSession,
                                nsIMsgCompFields* aCompFields);
  static nsresult ShowComposerWindow(unsigned long aSession,
                                     nsIMsgCompFields* aCompFields);
  static nsresult PopulateCompFieldsWithConversion(
      lpnsMapiMessage aMessage, nsIMsgCompFields* aCompFields);
  static nsresult PopulateCompFieldsW(lpnsMapiMessageW aMessage,
                                      nsIMsgCompFields* aCompFields);
  static nsresult PopulateCompFieldsForSendDocs(nsIMsgCompFields* aCompFields,
                                                ULONG aFlags, LPSTR aDelimChar,
                                                LPSTR aFilePaths);
  static nsresult HandleAttachments(nsIMsgCompFields* aCompFields,
                                    int32_t aFileCount, lpnsMapiFileDesc aFiles,
                                    bool aIsUTF8);
  static nsresult HandleAttachmentsW(nsIMsgCompFields* aCompFields,
                                     int32_t aFileCount,
                                     lpnsMapiFileDescW aFiles);
  static void CleanUp();

  static bool isMapiService;
};

#endif  // COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPIHOOK_H_
