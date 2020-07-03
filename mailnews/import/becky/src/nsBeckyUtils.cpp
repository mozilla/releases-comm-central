/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCOMPtr.h"
#include "nsIFile.h"
#include "nsIDirectoryEnumerator.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsString.h"
#include "nsMsgI18N.h"
#include "nsNativeCharsetUtils.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsILineInputStream.h"
#include "nsIConverterInputStream.h"
#include "nsIConverterOutputStream.h"
#include "nsMsgI18N.h"
#include "nsNetUtil.h"
#include "nsIINIParser.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsMsgUtils.h"
#include "msgCore.h"
#include "nsIImportMail.h"
#include "nsThreadUtils.h"

#include "nsBeckyUtils.h"
#include "SpecialSystemDirectory.h"

nsresult nsBeckyUtils::FindUserDirectoryOnWindows7(nsIFile** aLocation) {
  NS_ENSURE_ARG_POINTER(aLocation);

  nsresult rv;
  nsCOMPtr<nsIFile> directory;
  rv = GetSpecialSystemDirectory(Win_Documents, getter_AddRefs(directory));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = directory->AppendNative("Becky"_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  bool exists = false;
  rv = directory->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!exists) return NS_ERROR_FILE_NOT_FOUND;

  bool isDirectory = false;
  rv = directory->IsDirectory(&isDirectory);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!isDirectory) return NS_ERROR_FILE_NOT_FOUND;

  directory.forget(aLocation);
  return NS_OK;
}

nsresult nsBeckyUtils::FindUserDirectoryOnWindowsXP(nsIFile** aLocation) {
  NS_ENSURE_ARG_POINTER(aLocation);

  nsresult rv;
  nsCOMPtr<nsIFile> directory =
      do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = directory->InitWithPath(u"C:\\Becky!"_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  bool exists = false;
  rv = directory->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!exists) return NS_ERROR_FILE_NOT_FOUND;

  bool isDirectory = false;
  rv = directory->IsDirectory(&isDirectory);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!isDirectory) return NS_ERROR_FILE_NOT_FOUND;

  nsCOMPtr<nsIDirectoryEnumerator> entries;
  rv = directory->GetDirectoryEntries(getter_AddRefs(entries));
  NS_ENSURE_SUCCESS(rv, rv);

  bool more;
  while (NS_SUCCEEDED(entries->HasMoreElements(&more)) && more) {
    nsCOMPtr<nsIFile> file;
    rv = entries->GetNextFile(getter_AddRefs(file));
    NS_ENSURE_SUCCESS(rv, rv);

    bool isDirectory = false;
    rv = file->IsDirectory(&isDirectory);
    NS_ENSURE_SUCCESS(rv, rv);

    if (isDirectory) {
      file.forget(aLocation);
      return NS_OK;
    }
  }

  directory.forget(aLocation);
  return NS_OK;
}

nsresult nsBeckyUtils::FindUserDirectory(nsIFile** aLocation) {
  nsresult rv = FindUserDirectoryOnWindows7(aLocation);
  if (rv == NS_ERROR_FILE_NOT_FOUND) {
    rv = FindUserDirectoryOnWindowsXP(aLocation);
  }
  return rv;
}

nsresult nsBeckyUtils::ConvertNativeStringToUTF8(const nsACString& aOriginal,
                                                 nsACString& _retval) {
  nsresult rv;
  nsAutoString unicodeString;
  rv = NS_CopyNativeToUnicode(aOriginal, unicodeString);
  NS_ENSURE_SUCCESS(rv, rv);

  CopyUTF16toUTF8(unicodeString, _retval);
  return NS_OK;
}

nsresult nsBeckyUtils::CreateLineInputStream(nsIFile* aFile,
                                             nsILineInputStream** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  nsCOMPtr<nsIInputStream> inputStream;
  nsresult rv = NS_NewLocalFileInputStream(getter_AddRefs(inputStream), aFile);
  NS_ENSURE_SUCCESS(rv, rv);

  return CallQueryInterface(inputStream, _retval);
}

nsresult nsBeckyUtils::GetFolderListFile(nsIFile* aLocation,
                                         nsIFile** _retval) {
  nsresult rv;
  nsCOMPtr<nsIFile> folderListFile;
  rv = aLocation->Clone(getter_AddRefs(folderListFile));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = folderListFile->Append(u"Folder.lst"_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  bool exists;
  rv = folderListFile->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!exists) return NS_ERROR_FILE_NOT_FOUND;

  folderListFile.forget(_retval);
  return NS_OK;
}

nsresult nsBeckyUtils::GetDefaultFolderName(nsIFile* aFolderListFile,
                                            nsACString& name) {
  nsresult rv;
  nsCOMPtr<nsILineInputStream> lineStream;
  rv = CreateLineInputStream(aFolderListFile, getter_AddRefs(lineStream));
  NS_ENSURE_SUCCESS(rv, rv);

  bool more = true;
  rv = lineStream->ReadLine(name, &more);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

nsresult nsBeckyUtils::GetDefaultMailboxDirectory(nsIFile** _retval) {
  nsCOMPtr<nsIFile> userDirectory;
  nsresult rv = FindUserDirectory(getter_AddRefs(userDirectory));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> folderListFile;
  rv = GetFolderListFile(userDirectory, getter_AddRefs(folderListFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString defaultFolderName;
  rv = GetDefaultFolderName(folderListFile, defaultFolderName);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = userDirectory->AppendNative(defaultFolderName);
  NS_ENSURE_SUCCESS(rv, rv);

  bool exists;
  rv = userDirectory->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!exists) return NS_ERROR_FILE_NOT_FOUND;

  bool isDirectory = false;
  rv = userDirectory->IsDirectory(&isDirectory);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!isDirectory) return NS_ERROR_FILE_NOT_FOUND;

  userDirectory.forget(_retval);
  return NS_OK;
}

nsresult nsBeckyUtils::GetDefaultMailboxINIFile(nsIFile** _retval) {
  nsresult rv;
  nsCOMPtr<nsIFile> mailboxDirectory;
  rv = GetDefaultMailboxDirectory(getter_AddRefs(mailboxDirectory));
  NS_ENSURE_SUCCESS(rv, rv);

  return GetMailboxINIFile(mailboxDirectory, _retval);
}

nsresult nsBeckyUtils::GetMailboxINIFile(nsIFile* aDirectory,
                                         nsIFile** _retval) {
  nsresult rv;
  nsCOMPtr<nsIFile> target;
  rv = aDirectory->Clone(getter_AddRefs(target));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = target->Append(u"Mailbox.ini"_ns);
  NS_ENSURE_SUCCESS(rv, rv);
  bool exists;
  rv = target->Exists(&exists);
  if (!exists) return NS_ERROR_FILE_NOT_FOUND;

  target.forget(_retval);
  return NS_OK;
}

nsresult nsBeckyUtils::CreateINIParserForFile(nsIFile* aFile,
                                              nsIINIParser** aParser) {
  nsresult rv;
  nsCOMPtr<nsIINIParserFactory> factory =
      do_GetService("@mozilla.org/xpcom/ini-processor-factory;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return factory->CreateINIParser(aFile, aParser);
}

nsresult nsBeckyUtils::GetMailboxNameFromINIFile(nsIFile* aFile,
                                                 nsCString& aName) {
  nsresult rv;
  nsCOMPtr<nsIINIParser> parser;
  rv = CreateINIParserForFile(aFile, getter_AddRefs(parser));
  NS_ENSURE_SUCCESS(rv, rv);

  return parser->GetString("Account"_ns, "Name"_ns, aName);
}

nsresult nsBeckyUtils::ConvertToUTF8File(nsIFile* aSourceFile,
                                         nsIFile** _retval) {
  nsresult rv;
  nsCOMPtr<nsIFile> convertedFile;
  rv = GetSpecialDirectoryWithFileName(NS_OS_TEMP_DIR,
                                       "thunderbird-becky-import",
                                       getter_AddRefs(convertedFile));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = convertedFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIInputStream> source;
  rv = NS_NewLocalFileInputStream(getter_AddRefs(source), aSourceFile);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString sourceCharset;
  rv = MsgDetectCharsetFromFile(aSourceFile, sourceCharset);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIOutputStream> destination;
  rv = NS_NewLocalFileOutputStream(getter_AddRefs(destination), convertedFile);
  NS_ENSURE_SUCCESS(rv, rv);

  const uint32_t kBlock = 8192;

  nsCOMPtr<nsIConverterInputStream> convertedInput =
      do_CreateInstance("@mozilla.org/intl/converter-input-stream;1");
  convertedInput->Init(source, sourceCharset.get(), kBlock, 0x0000);

  nsCOMPtr<nsIConverterOutputStream> convertedOutput =
      do_CreateInstance("@mozilla.org/intl/converter-output-stream;1");
  convertedOutput->Init(destination, "UTF-8");

  char16_t* line = (char16_t*)moz_xmalloc(kBlock);
  uint32_t readBytes = kBlock;
  bool writtenBytes;
  while (readBytes == kBlock) {
    rv = convertedInput->Read(line, kBlock, &readBytes);
    rv = convertedOutput->Write(readBytes, line, &writtenBytes);
  }
  convertedOutput->Close();
  convertedInput->Close();

  convertedFile.forget(_retval);
  return NS_OK;
}

nsresult nsBeckyUtils::TranslateFolderName(const nsAString& aFolderName,
                                           nsAString& _retval) {
  if (aFolderName.LowerCaseEqualsLiteral("!trash"))
    _retval = NS_LITERAL_STRING_FROM_CSTRING(kDestTrashFolderName);
  else if (aFolderName.LowerCaseEqualsLiteral("!!!!inbox"))
    _retval = NS_LITERAL_STRING_FROM_CSTRING(kDestInboxFolderName);
  else if (aFolderName.LowerCaseEqualsLiteral("!!!!outbox"))
    _retval = NS_LITERAL_STRING_FROM_CSTRING(kDestSentFolderName);
  else if (aFolderName.LowerCaseEqualsLiteral("!!!!unsent"))
    _retval = NS_LITERAL_STRING_FROM_CSTRING(kDestUnsentMessagesFolderName);
  else
    _retval = aFolderName;

  return NS_OK;
}
