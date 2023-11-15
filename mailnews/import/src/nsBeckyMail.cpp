/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsString.h"
#include "nsCOMPtr.h"
#include "nsIFile.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsILineInputStream.h"
#include "nsNetUtil.h"
#include "nsIImportService.h"
#include "nsIImportMailboxDescriptor.h"
#include "nsIMsgHdr.h"
#include "nsIMsgFolder.h"
#include "nsIMsgPluggableStore.h"
#include "nsMsgUtils.h"
#include "nsMsgLocalFolderHdrs.h"
#include "nsMsgMessageFlags.h"
#include "nsTArray.h"
#include "nspr.h"
#include "nsThreadUtils.h"
#include "nsIDirectoryEnumerator.h"

#include "nsBeckyMail.h"
#include "nsBeckyUtils.h"
#include "nsBeckyStringBundle.h"

#define X_BECKY_STATUS_HEADER "X-Becky-Status"
#define X_BECKY_INCLUDE_HEADER "X-Becky-Include"

enum {
  BECKY_STATUS_READ = 1 << 0,
  BECKY_STATUS_FORWARDED = 1 << 1,
  BECKY_STATUS_REPLIED = 1 << 2
};

NS_IMPL_ISUPPORTS(nsBeckyMail, nsIImportMail)

nsresult nsBeckyMail::Create(nsIImportMail** aImport) {
  NS_ENSURE_ARG_POINTER(aImport);
  NS_ADDREF(*aImport = new nsBeckyMail());
  return NS_OK;
}

nsBeckyMail::nsBeckyMail() : mReadBytes(0) {}

nsBeckyMail::~nsBeckyMail() {}

NS_IMETHODIMP
nsBeckyMail::GetDefaultLocation(nsIFile** aLocation, bool* aFound,
                                bool* aUserVerify) {
  NS_ENSURE_ARG_POINTER(aFound);
  NS_ENSURE_ARG_POINTER(aLocation);
  NS_ENSURE_ARG_POINTER(aUserVerify);

  *aLocation = nullptr;
  *aUserVerify = true;
  *aFound = false;
  if (NS_SUCCEEDED(nsBeckyUtils::GetDefaultMailboxDirectory(aLocation)))
    *aFound = true;

  return NS_OK;
}

nsresult nsBeckyMail::CreateMailboxDescriptor(
    nsIImportMailboxDescriptor** aDescriptor) {
  nsresult rv;
  nsCOMPtr<nsIImportService> importService;
  importService = do_GetService(NS_IMPORTSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return importService->CreateNewMailboxDescriptor(aDescriptor);
}

nsresult nsBeckyMail::GetMailboxName(nsIFile* aMailbox, nsAString& aName) {
  nsCOMPtr<nsIFile> iniFile;
  nsBeckyUtils::GetMailboxINIFile(aMailbox, getter_AddRefs(iniFile));
  if (iniFile) {
    nsCOMPtr<nsIFile> convertedFile;
    nsBeckyUtils::ConvertToUTF8File(iniFile, getter_AddRefs(convertedFile));
    if (convertedFile) {
      nsAutoCString utf8Name;
      nsBeckyUtils::GetMailboxNameFromINIFile(convertedFile, utf8Name);
      convertedFile->Remove(false);
      CopyUTF8toUTF16(utf8Name, aName);
    }
  }

  if (aName.IsEmpty()) {
    nsAutoString name;
    aMailbox->GetLeafName(name);
    name.Trim("!", true, false);
    aName.Assign(name);
  }

  return NS_OK;
}

nsresult nsBeckyMail::AppendMailboxDescriptor(
    nsIFile* aEntry, const nsString& aName, uint32_t aDepth,
    nsTArray<RefPtr<nsIImportMailboxDescriptor>>& aCollected) {
  nsresult rv;
  nsCOMPtr<nsIImportMailboxDescriptor> descriptor;
  rv = CreateMailboxDescriptor(getter_AddRefs(descriptor));
  NS_ENSURE_SUCCESS(rv, rv);

  int64_t size;
  rv = aEntry->GetFileSize(&size);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = descriptor->SetSize(size);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = descriptor->SetDisplayName(aName.get());
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> mailboxFile;
  rv = descriptor->GetFile(getter_AddRefs(mailboxFile));
  NS_ENSURE_SUCCESS(rv, rv);

  descriptor->SetDepth(aDepth);

  mailboxFile->InitWithFile(aEntry);
  aCollected.AppendElement(descriptor);

  return NS_OK;
}

nsresult nsBeckyMail::CollectMailboxesInFolderListFile(
    nsIFile* aListFile, uint32_t aDepth,
    nsTArray<RefPtr<nsIImportMailboxDescriptor>>& aCollected) {
  nsresult rv;
  nsCOMPtr<nsILineInputStream> lineStream;
  rv = nsBeckyUtils::CreateLineInputStream(aListFile,
                                           getter_AddRefs(lineStream));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> parent;
  rv = aListFile->GetParent(getter_AddRefs(parent));
  NS_ENSURE_SUCCESS(rv, rv);

  bool more = true;
  nsAutoCString folderName;
  bool isEmpty = true;
  while (more && NS_SUCCEEDED(rv)) {
    rv = lineStream->ReadLine(folderName, &more);
    NS_ENSURE_SUCCESS(rv, rv);

    if (folderName.IsEmpty()) continue;

    nsCOMPtr<nsIFile> folder;
    rv = parent->Clone(getter_AddRefs(folder));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = folder->AppendNative(folderName);
    NS_ENSURE_SUCCESS(rv, rv);

    isEmpty = false;
    rv = CollectMailboxesInDirectory(folder, aDepth + 1, aCollected);
  }

  return isEmpty ? NS_ERROR_FILE_NOT_FOUND : NS_OK;
}

nsresult nsBeckyMail::CollectMailboxesInDirectory(
    nsIFile* aDirectory, uint32_t aDepth,
    nsTArray<RefPtr<nsIImportMailboxDescriptor>>& aCollected) {
  nsAutoString mailboxName;
  nsresult rv = GetMailboxName(aDirectory, mailboxName);
  NS_ENSURE_SUCCESS(rv, rv);

  if (aDepth != 0)
    AppendMailboxDescriptor(aDirectory, mailboxName, aDepth, aCollected);

  nsCOMPtr<nsIFile> folderListFile;
  rv = nsBeckyUtils::GetFolderListFile(aDirectory,
                                       getter_AddRefs(folderListFile));
  bool folderListExists = false;

  if (NS_SUCCEEDED(rv)) {
    rv = CollectMailboxesInFolderListFile(folderListFile, aDepth, aCollected);
    folderListExists = true;
  }

  nsCOMPtr<nsIDirectoryEnumerator> entries;
  rv = aDirectory->GetDirectoryEntries(getter_AddRefs(entries));
  NS_ENSURE_SUCCESS(rv, rv);

  bool more;
  while (NS_SUCCEEDED(entries->HasMoreElements(&more)) && more) {
    nsCOMPtr<nsIFile> file;
    rv = entries->GetNextFile(getter_AddRefs(file));
    NS_ENSURE_SUCCESS(rv, rv);

    nsAutoString name;
    rv = file->GetLeafName(name);
    NS_ENSURE_SUCCESS(rv, rv);

    if (StringEndsWith(name, u".bmf"_ns)) {
      AppendMailboxDescriptor(file, mailboxName, aDepth, aCollected);
    }

    // The Folder.lst file is not created if there is only one sub folder,
    // so we need to find the sub folder by our hands.
    // The folder name does not begin with # or ! maybe. Yes, maybe...
    if (!folderListExists) {
      if (StringBeginsWith(name, u"#"_ns) || StringBeginsWith(name, u"!"_ns))
        continue;

      bool isDirectory = false;
      rv = file->IsDirectory(&isDirectory);
      if (isDirectory) {
        CollectMailboxesInDirectory(file, aDepth + 1, aCollected);
        continue;
      }
    }
  }

  return NS_OK;
}

NS_IMETHODIMP
nsBeckyMail::FindMailboxes(
    nsIFile* aLocation, nsTArray<RefPtr<nsIImportMailboxDescriptor>>& boxes) {
  NS_ENSURE_ARG_POINTER(aLocation);

  boxes.Clear();
  nsresult rv = CollectMailboxesInDirectory(aLocation, 0, boxes);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

static nsresult GetBeckyStatusValue(const nsCString& aHeader,
                                    nsACString& aValue) {
  int32_t valueStartPosition;

  valueStartPosition = aHeader.FindChar(':');
  if (valueStartPosition < 0) return NS_ERROR_UNEXPECTED;

  valueStartPosition++;

  int32_t commaPosition = aHeader.FindChar(',', valueStartPosition);
  if (commaPosition < 0) return NS_ERROR_UNEXPECTED;

  nsAutoCString value(Substring(aHeader, valueStartPosition,
                                commaPosition - valueStartPosition));
  value.Trim(" \t");

  aValue.Assign(value);

  return NS_OK;
}

static nsresult GetBeckyIncludeValue(const nsCString& aHeader,
                                     nsACString& aValue) {
  int32_t valueStartPosition;

  valueStartPosition = aHeader.FindChar(':');
  if (valueStartPosition < 0) return NS_ERROR_FAILURE;

  valueStartPosition++;
  nsAutoCString value(Substring(aHeader, valueStartPosition));
  value.Trim(" \t");

  aValue.Assign(value);

  return NS_OK;
}

static bool ConvertBeckyStatusToMozillaStatus(
    const nsCString& aHeader, nsMsgMessageFlagType* aMozillaStatusFlag) {
  nsresult rv;
  nsAutoCString statusString;
  rv = GetBeckyStatusValue(aHeader, statusString);
  NS_ENSURE_SUCCESS(rv, false);

  nsresult errorCode;
  uint32_t beckyStatusFlag =
      static_cast<uint32_t>(statusString.ToInteger(&errorCode, 16));
  if (NS_FAILED(errorCode)) return false;

  if (beckyStatusFlag & BECKY_STATUS_READ)
    *aMozillaStatusFlag |= nsMsgMessageFlags::Read;
  if (beckyStatusFlag & BECKY_STATUS_FORWARDED)
    *aMozillaStatusFlag |= nsMsgMessageFlags::Forwarded;
  if (beckyStatusFlag & BECKY_STATUS_REPLIED)
    *aMozillaStatusFlag |= nsMsgMessageFlags::Replied;

  return true;
}

static inline bool CheckHeaderKey(const nsCString& aHeader,
                                  const char* aKeyString) {
  nsAutoCString key(StringHead(aHeader, aHeader.FindChar(':')));
  key.Trim(" \t");
  return key.Equals(aKeyString);
}

static inline bool IsBeckyStatusHeader(const nsCString& aHeader) {
  return CheckHeaderKey(aHeader, X_BECKY_STATUS_HEADER);
}

static inline bool IsBeckyIncludeLine(const nsCString& aLine) {
  return CheckHeaderKey(aLine, X_BECKY_INCLUDE_HEADER);
}

static inline bool IsEndOfHeaders(const nsCString& aLine) {
  return aLine.IsEmpty();
}

static inline bool IsEndOfMessage(const nsCString& aLine) {
  return aLine.EqualsLiteral(".");
}

class ImportMessageRunnable : public mozilla::Runnable {
 public:
  ImportMessageRunnable(nsIFile* aMessageFile, nsIMsgFolder* aFolder);
  NS_DECL_NSIRUNNABLE
  nsresult mResult;

 private:
  nsresult WriteHeaders(nsCString& aHeaders, nsIOutputStream* aOutputStream);
  nsresult HandleHeaderLine(const nsCString& aHeaderLine, nsACString& aHeaders);
  nsresult GetAttachmentFile(nsIFile* aMailboxFile, const nsCString& aHeader,
                             nsIFile** _retval);
  nsresult WriteAttachmentFile(nsIFile* aMailboxFile, const nsCString& aHeader,
                               nsIOutputStream* aOutputStream);

  nsCOMPtr<nsIFile> mMessageFile;
  nsCOMPtr<nsIMsgFolder> mFolder;
};

ImportMessageRunnable::ImportMessageRunnable(nsIFile* aMessageFile,
                                             nsIMsgFolder* aFolder)
    : mozilla::Runnable("ImportMessageRunnable"),
      mMessageFile(aMessageFile),
      mFolder(aFolder) {}

nsresult ImportMessageRunnable::WriteHeaders(nsCString& aHeaders,
                                             nsIOutputStream* aOutputStream) {
  nsresult rv;
  uint32_t writtenBytes = 0;

  rv = aOutputStream->Write(aHeaders.get(), aHeaders.Length(), &writtenBytes);
  NS_ENSURE_SUCCESS(rv, rv);
  rv =
      aOutputStream->Write(MSG_LINEBREAK, strlen(MSG_LINEBREAK), &writtenBytes);
  NS_ENSURE_SUCCESS(rv, rv);
  aHeaders.Truncate();

  return NS_OK;
}

nsresult ImportMessageRunnable::HandleHeaderLine(const nsCString& aHeaderLine,
                                                 nsACString& aHeaders) {
  aHeaders.Append(aHeaderLine);
  aHeaders.AppendLiteral(MSG_LINEBREAK);

  nsMsgMessageFlagType flag = 0;
  if (IsBeckyStatusHeader(aHeaderLine) &&
      ConvertBeckyStatusToMozillaStatus(aHeaderLine, &flag)) {
    char* statusLine;
    statusLine = PR_smprintf(X_MOZILLA_STATUS_FORMAT MSG_LINEBREAK, flag);
    aHeaders.Append(statusLine);
    PR_smprintf_free(statusLine);
    aHeaders.AppendLiteral(X_MOZILLA_KEYWORDS);
  }

  return NS_OK;
}

nsresult ImportMessageRunnable::GetAttachmentFile(nsIFile* aMailboxFile,
                                                  const nsCString& aHeader,
                                                  nsIFile** _retval) {
  nsresult rv;
  nsCOMPtr<nsIFile> attachmentFile;

  rv = aMailboxFile->Clone(getter_AddRefs(attachmentFile));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = attachmentFile->Append(u"#Attach"_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString nativeAttachmentPath;
  rv = GetBeckyIncludeValue(aHeader, nativeAttachmentPath);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = attachmentFile->AppendRelativeNativePath(nativeAttachmentPath);
  NS_ENSURE_SUCCESS(rv, rv);

  bool exists = false;
  attachmentFile->Exists(&exists);
  if (!exists) return NS_ERROR_FILE_NOT_FOUND;

  attachmentFile.forget(_retval);
  return NS_OK;
}

nsresult ImportMessageRunnable::WriteAttachmentFile(
    nsIFile* aMailboxFile, const nsCString& aHeader,
    nsIOutputStream* aOutputStream) {
  nsresult rv;
  nsCOMPtr<nsIFile> parentDirectory;
  rv = aMailboxFile->GetParent(getter_AddRefs(parentDirectory));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> attachmentFile;
  rv = GetAttachmentFile(parentDirectory, aHeader,
                         getter_AddRefs(attachmentFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIInputStream> inputStream;
  rv = NS_NewLocalFileInputStream(getter_AddRefs(inputStream), attachmentFile);
  NS_ENSURE_SUCCESS(rv, rv);

  char buffer[FILE_IO_BUFFER_SIZE];
  uint32_t readBytes = 0;
  uint32_t writtenBytes = 0;
  rv =
      aOutputStream->Write(MSG_LINEBREAK, strlen(MSG_LINEBREAK), &writtenBytes);
  while (NS_SUCCEEDED(inputStream->Read(buffer, sizeof(buffer), &readBytes)) &&
         readBytes > 0) {
    rv = aOutputStream->Write(buffer, readBytes, &writtenBytes);
    if (NS_FAILED(rv)) break;
  }

  return rv;
}

NS_IMETHODIMP ImportMessageRunnable::Run() {
  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  mResult = mFolder->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(mResult, NS_OK);

  nsCOMPtr<nsILineInputStream> lineStream;
  mResult = nsBeckyUtils::CreateLineInputStream(mMessageFile,
                                                getter_AddRefs(lineStream));
  NS_ENSURE_SUCCESS(mResult, NS_OK);

  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  nsCOMPtr<nsIOutputStream> outputStream;
  mResult = msgStore->GetNewMsgOutputStream(mFolder, getter_AddRefs(msgHdr),
                                            getter_AddRefs(outputStream));
  NS_ENSURE_SUCCESS(mResult, NS_OK);

  bool inHeader = true;
  bool more = true;
  nsAutoCString headers;
  while (NS_SUCCEEDED(mResult) && more) {
    nsAutoCString line;
    mResult = lineStream->ReadLine(line, &more);
    if (NS_FAILED(mResult)) break;

    if (inHeader) {
      if (IsEndOfHeaders(line)) {
        inHeader = false;
        mResult = WriteHeaders(headers, outputStream);
      } else {
        mResult = HandleHeaderLine(line, headers);
      }
    } else if (IsEndOfMessage(line)) {
      inHeader = true;
      mResult = msgStore->FinishNewMessage(outputStream, msgHdr);
      // outputStream is closed by FinishNewMessage().
      outputStream = nullptr;
      mResult = msgStore->GetNewMsgOutputStream(mFolder, getter_AddRefs(msgHdr),
                                                getter_AddRefs(outputStream));
    } else if (IsBeckyIncludeLine(line)) {
      mResult = WriteAttachmentFile(mMessageFile, line, outputStream);
    } else {
      uint32_t writtenBytes = 0;
      if (StringBeginsWith(line, ".."_ns))
        line.Cut(0, 1);
      else if (CheckHeaderKey(line, "From"))
        line.Insert('>', 0);

      line.AppendLiteral(MSG_LINEBREAK);
      mResult = outputStream->Write(line.get(), line.Length(), &writtenBytes);
    }
  }

  if (outputStream) {
    // DiscardNewMessage() closes outputStream.
    if (NS_FAILED(mResult))
      msgStore->DiscardNewMessage(outputStream, msgHdr);
    else
      outputStream->Close(); /* No check? */
  }

  return NS_OK;
}

static nsresult ProxyImportMessage(nsIFile* aMessageFile,
                                   nsIMsgFolder* aFolder) {
  RefPtr<ImportMessageRunnable> importMessage =
      new ImportMessageRunnable(aMessageFile, aFolder);
  nsresult rv = NS_DispatchAndSpinEventLoopUntilComplete(
      "ProxyImportMessage"_ns, mozilla::GetMainThreadSerialEventTarget(),
      do_AddRef(importMessage));
  NS_ENSURE_SUCCESS(rv, rv);
  return importMessage->mResult;
}

nsresult nsBeckyMail::ImportMailFile(nsIFile* aMailFile,
                                     nsIMsgFolder* aDestination) {
  int64_t size;
  aMailFile->GetFileSize(&size);
  if (size == 0) return NS_OK;

  return ProxyImportMessage(aMailFile, aDestination);
}

NS_IMETHODIMP
nsBeckyMail::ImportMailbox(nsIImportMailboxDescriptor* aSource,
                           nsIMsgFolder* aDestination, char16_t** aErrorLog,
                           char16_t** aSuccessLog, bool* aFatalError) {
  NS_ENSURE_ARG_POINTER(aSource);
  NS_ENSURE_ARG_POINTER(aDestination);
  NS_ENSURE_ARG_POINTER(aErrorLog);
  NS_ENSURE_ARG_POINTER(aSuccessLog);
  NS_ENSURE_ARG_POINTER(aFatalError);

  mReadBytes = 0;

  nsresult rv;
  nsCOMPtr<nsIFile> mailboxFolder;
  rv = aSource->GetFile(getter_AddRefs(mailboxFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = ImportMailFile(mailboxFolder, aDestination);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t finalSize;
  aSource->GetSize(&finalSize);
  mReadBytes = finalSize;

  nsAutoString name;
  aSource->GetDisplayName(getter_Copies(name));

  nsAutoString successMessage;
  AutoTArray<nsString, 1> format = {name};
  rv = nsBeckyStringBundle::FormatStringFromName("BeckyImportMailboxSuccess",
                                                 format, successMessage);
  successMessage.AppendLiteral("\n");
  *aSuccessLog = ToNewUnicode(successMessage);

  return rv;
}

NS_IMETHODIMP
nsBeckyMail::GetImportProgress(uint32_t* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = mReadBytes;
  return NS_OK;
}

NS_IMETHODIMP
nsBeckyMail::TranslateFolderName(const nsAString& aFolderName,
                                 nsAString& _retval) {
  return nsBeckyUtils::TranslateFolderName(aFolderName, _retval);
}
