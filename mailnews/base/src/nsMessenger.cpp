/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "prsystem.h"

#include "nsMessenger.h"

// xpcom
#include "nsIComponentManager.h"
#include "nsLocalFile.h"
#include "nsDirectoryServiceDefs.h"
#include "mozilla/Path.h"
#include "mozilla/Components.h"
#include "mozilla/dom/LoadURIOptionsBinding.h"

// necko
#include "nsMimeTypes.h"
#include "nsIPrompt.h"
#include "nsIStreamListener.h"
#include "nsIStreamConverterService.h"
#include "nsNetUtil.h"
#include "nsIFileURL.h"
#include "nsIMIMEInfo.h"

/* for access to docshell */
#include "nsPIDOMWindow.h"
#include "nsIDocShell.h"
#include "nsIDocShellTreeItem.h"
#include "nsIWebNavigation.h"
#include "nsContentUtils.h"
#include "nsDocShellLoadState.h"
#include "mozilla/dom/Element.h"
#include "nsFrameLoader.h"
#include "mozilla/dom/Document.h"

// mail
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgMailSession.h"
#include "nsIMailboxUrl.h"
#include "nsIMsgFolder.h"
#include "nsMsgMessageFlags.h"
#include "nsIMsgIncomingServer.h"
#include "nsIMsgImapMailFolder.h"
#include "nsIMsgMessageService.h"

#include "nsIMsgHdr.h"

// draft/folders/sendlater/etc
#include "nsIMsgCopyService.h"
#include "nsIMsgCopyServiceListener.h"
#include "nsIUrlListener.h"
#include "UrlListener.h"

// undo
#include "nsITransaction.h"
#include "nsMsgTxn.h"

// Save As
#include "nsIStringBundle.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsCExternalHandlerService.h"
#include "nsIExternalProtocolService.h"
#include "nsIMIMEService.h"
#include "nsITransfer.h"

#define MESSENGER_SAVE_DIR_PREF_NAME "messenger.save.dir"
#define MIMETYPE_DELETED "text/x-moz-deleted"
#define ATTACHMENT_PERMISSION 00664

//
// Convert an nsString buffer to plain text...
//
#include "nsMsgUtils.h"
#include "nsIChannel.h"
#include "nsIOutputStream.h"
#include "nsIPrincipal.h"

#include "nsString.h"

#include "mozilla/dom/BrowserParent.h"

#include "mozilla/NullPrincipal.h"
#include "mozilla/JSONStringWriteFuncs.h"

using namespace mozilla;
using namespace mozilla::dom;

static void ConvertAndSanitizeFileName(const nsACString& displayName,
                                       nsString& aResult) {
  nsCString unescapedName;

  /* we need to convert the UTF-8 fileName to platform specific character set.
     The display name is in UTF-8 because it has been escaped from JS
  */
  MsgUnescapeString(displayName, 0, unescapedName);
  CopyUTF8toUTF16(unescapedName, aResult);

  // replace platform specific path separator and illegale characters to avoid
  // any confusion
  aResult.ReplaceChar(u"" FILE_PATH_SEPARATOR FILE_ILLEGAL_CHARACTERS, u'-');
}

// ***************************************************
// jefft - this is a rather obscured class serves for Save Message As File,
// Save Message As Template, and Save Attachment to a file
// It's used to save out a single item. If multiple items are to be saved,
// a nsSaveAllAttachmentsState should be set, which holds a list of items.
//
class nsSaveAllAttachmentsState;

class nsSaveMsgListener : public nsIUrlListener,
                          public nsIMsgCopyServiceListener,
                          public nsIStreamListener,
                          public nsICancelable {
  using PathChar = mozilla::filesystem::Path::value_type;

 public:
  nsSaveMsgListener(nsIFile* file, nsMessenger* aMessenger,
                    nsIUrlListener* aListener);

  NS_DECL_ISUPPORTS

  NS_DECL_NSIURLLISTENER
  NS_DECL_NSIMSGCOPYSERVICELISTENER
  NS_DECL_NSISTREAMLISTENER
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSICANCELABLE

  nsCOMPtr<nsIFile> m_file;
  nsCOMPtr<nsIOutputStream> m_outputStream;
  char m_dataBuffer[FILE_IO_BUFFER_SIZE];
  nsCOMPtr<nsIChannel> m_channel;
  nsCString m_templateUri;
  RefPtr<nsMessenger> m_messenger;
  nsSaveAllAttachmentsState* m_saveAllAttachmentsState;

  // rhp: For character set handling
  bool m_doCharsetConversion;
  nsString m_charset;
  enum { eUnknown, ePlainText, eHTML } m_outputFormat;
  nsCString m_msgBuffer;

  nsCString m_contentType;  // used only when saving attachment

  nsCOMPtr<nsITransfer> mTransfer;
  nsCOMPtr<nsIUrlListener> mListener;
  nsCOMPtr<nsIURI> mListenerUri;
  int64_t mProgress;
  int64_t mMaxProgress;
  bool mCanceled;
  bool mInitialized;
  bool mUrlHasStopped;
  bool mRequestHasStopped;
  nsresult InitializeDownload(nsIRequest* aRequest);

 private:
  virtual ~nsSaveMsgListener();
};

// This helper class holds a list of attachments to be saved and (optionally)
// detached. It's used by nsSaveMsgListener (which only sticks around for a
// single item, then passes the nsSaveAllAttachmentsState along to the next
// SaveAttachment() call).
class nsSaveAllAttachmentsState {
  using PathChar = mozilla::filesystem::Path::value_type;

 public:
  nsSaveAllAttachmentsState(const nsTArray<nsCString>& contentTypeArray,
                            const nsTArray<nsCString>& urlArray,
                            const nsTArray<nsCString>& displayNameArray,
                            const nsTArray<nsCString>& messageUriArray,
                            const PathChar* directoryName,
                            bool detachingAttachments,
                            nsIUrlListener* overallListener);
  virtual ~nsSaveAllAttachmentsState();

  uint32_t m_count;
  uint32_t m_curIndex;
  PathChar* m_directoryName;
  nsTArray<nsCString> m_contentTypeArray;
  nsTArray<nsCString> m_urlArray;
  nsTArray<nsCString> m_displayNameArray;
  nsTArray<nsCString> m_messageUriArray;
  bool m_detachingAttachments;
  // The listener to invoke when all the items have been saved.
  nsCOMPtr<nsIUrlListener> m_overallListener;
  // if detaching, do without warning? Will create unique files instead of
  // prompting if duplicate files exist.
  bool m_withoutWarning;
  // if detaching first, remember where we saved to.
  nsTArray<nsCString> m_savedFiles;
};

//
// nsMessenger
//
nsMessenger::nsMessenger() {}

nsMessenger::~nsMessenger() {}

NS_IMPL_ISUPPORTS(nsMessenger, nsIMessenger, nsISupportsWeakReference)

NS_IMETHODIMP nsMessenger::SetWindow(mozIDOMWindowProxy* aWin,
                                     nsIMsgWindow* aMsgWindow) {
  nsresult rv;

  nsCOMPtr<nsIMsgMailSession> mailSession =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  if (aWin) {
    aMsgWindow->GetTransactionManager(getter_AddRefs(mTxnMgr));
    mMsgWindow = aMsgWindow;
    mWindow = aWin;

    NS_ENSURE_TRUE(aWin, NS_ERROR_FAILURE);
    nsCOMPtr<nsPIDOMWindowOuter> win = nsPIDOMWindowOuter::From(aWin);
    mDocShell = win->GetDocShell();
  } else {
    mWindow = nullptr;
    mDocShell = nullptr;
  }

  return NS_OK;
}

NS_IMPL_ISUPPORTS(nsMessenger::nsFilePickerShownCallback,
                  nsIFilePickerShownCallback)
nsMessenger::nsFilePickerShownCallback::nsFilePickerShownCallback() {
  mResult = nsIFilePicker::returnOK;
  mPickerDone = false;
}

NS_IMETHODIMP
nsMessenger::nsFilePickerShownCallback::Done(
    nsIFilePicker::ResultCode aResult) {
  mResult = aResult;
  mPickerDone = true;
  return NS_OK;
}

nsresult nsMessenger::ShowPicker(nsIFilePicker* aPicker,
                                 nsIFilePicker::ResultCode* aResult) {
  nsCOMPtr<nsIFilePickerShownCallback> callback =
      new nsMessenger::nsFilePickerShownCallback();
  nsFilePickerShownCallback* cb =
      static_cast<nsFilePickerShownCallback*>(callback.get());

  nsresult rv;
  rv = aPicker->Open(callback);
  NS_ENSURE_SUCCESS(rv, rv);

  // Spin the event loop until the callback was called.
  nsCOMPtr<nsIThread> thread(do_GetCurrentThread());
  while (!cb->mPickerDone) {
    NS_ProcessNextEvent(thread, true);
  }

  *aResult = cb->mResult;
  return NS_OK;
}

nsresult nsMessenger::PromptIfFileExists(nsIFile* file) {
  nsresult rv = NS_ERROR_FAILURE;
  bool exists;
  file->Exists(&exists);
  if (!exists) return NS_OK;

  nsCOMPtr<nsIPrompt> dialog(do_GetInterface(mDocShell));
  if (!dialog) return rv;
  nsAutoString path;
  bool dialogResult = false;
  nsString errorMessage;

  file->GetPath(path);
  AutoTArray<nsString, 1> pathFormatStrings = {path};

  if (!mStringBundle) {
    rv = InitStringBundle();
    NS_ENSURE_SUCCESS(rv, rv);
  }
  rv = mStringBundle->FormatStringFromName("fileExists", pathFormatStrings,
                                           errorMessage);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = dialog->Confirm(nullptr, errorMessage.get(), &dialogResult);
  NS_ENSURE_SUCCESS(rv, rv);

  if (dialogResult) return NS_OK;  // user says okay to replace

  // if we don't re-init the path for redisplay the picker will
  // show the full path, not just the file name
  nsCOMPtr<nsIFile> currentFile =
      do_CreateInstance("@mozilla.org/file/local;1");
  if (!currentFile) return NS_ERROR_FAILURE;

  rv = currentFile->InitWithPath(path);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoString leafName;
  currentFile->GetLeafName(leafName);
  if (!leafName.IsEmpty())
    path.Assign(leafName);  // path should be a copy of leafName

  nsCOMPtr<nsIFilePicker> filePicker =
      do_CreateInstance("@mozilla.org/filepicker;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsString saveAttachmentStr;
  GetString(u"SaveAttachment"_ns, saveAttachmentStr);

  nsCOMPtr<nsPIDOMWindowOuter> win = nsPIDOMWindowOuter::From(mWindow);
  filePicker->Init(win->GetBrowsingContext(), saveAttachmentStr,
                   nsIFilePicker::modeSave);
  filePicker->SetDefaultString(path);
  filePicker->AppendFilters(nsIFilePicker::filterAll);

  nsCOMPtr<nsIFile> lastSaveDir;
  rv = GetLastSaveDirectory(getter_AddRefs(lastSaveDir));
  if (NS_SUCCEEDED(rv) && lastSaveDir) {
    filePicker->SetDisplayDirectory(lastSaveDir);
  }

  nsIFilePicker::ResultCode dialogReturn;
  rv = ShowPicker(filePicker, &dialogReturn);
  if (NS_FAILED(rv) || dialogReturn == nsIFilePicker::returnCancel) {
    // XXX todo
    // don't overload the return value like this
    // change this function to have an out boolean
    // that we check to see if the user cancelled
    return NS_ERROR_FAILURE;
  }

  nsCOMPtr<nsIFile> localFile;

  rv = filePicker->GetFile(getter_AddRefs(localFile));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = SetLastSaveDirectory(localFile);
  NS_ENSURE_SUCCESS(rv, rv);

  // reset the file to point to the new path
  return file->InitWithFile(localFile);
}

NS_IMETHODIMP
nsMessenger::DetachAttachmentsWOPrompts(
    nsIFile* aDestFolder, const nsTArray<nsCString>& aContentTypeArray,
    const nsTArray<nsCString>& aUrlArray,
    const nsTArray<nsCString>& aDisplayNameArray,
    const nsTArray<nsCString>& aMessageUriArray, nsIUrlListener* aListener) {
  NS_ENSURE_ARG_POINTER(aDestFolder);
  MOZ_ASSERT(aContentTypeArray.Length() == aUrlArray.Length() &&
             aUrlArray.Length() == aDisplayNameArray.Length() &&
             aDisplayNameArray.Length() == aMessageUriArray.Length());

  if (!aContentTypeArray.Length()) return NS_OK;
  nsCOMPtr<nsIFile> attachmentDestination;
  nsresult rv = aDestFolder->Clone(getter_AddRefs(attachmentDestination));
  NS_ENSURE_SUCCESS(rv, rv);

  PathString path = attachmentDestination->NativePath();

  nsAutoString unescapedFileName;
  ConvertAndSanitizeFileName(aDisplayNameArray[0], unescapedFileName);
  rv = attachmentDestination->Append(unescapedFileName);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = attachmentDestination->CreateUnique(nsIFile::NORMAL_FILE_TYPE,
                                           ATTACHMENT_PERMISSION);
  NS_ENSURE_SUCCESS(rv, rv);

  // Set up to detach the attachments once they've been saved out.
  // NOTE: nsSaveAllAttachmentsState has a detach option, but I'd like to
  // phase it out, so we set up a listener to call DetachAttachments()
  // instead.
  UrlListener* listener = new UrlListener;
  nsSaveAllAttachmentsState* saveState = new nsSaveAllAttachmentsState(
      aContentTypeArray, aUrlArray, aDisplayNameArray, aMessageUriArray,
      path.get(),
      false,  // detach = false
      listener);

  // Note: saveState is kept in existence by SaveAttachment() until after
  // the last item is saved.
  listener->mStopFn = [saveState, self = RefPtr<nsMessenger>(this),
                       originalListener = nsCOMPtr<nsIUrlListener>(aListener)](
                          nsIURI* url, nsresult status) -> nsresult {
    if (NS_SUCCEEDED(status)) {
      status = self->DetachAttachments(
          saveState->m_contentTypeArray, saveState->m_urlArray,
          saveState->m_displayNameArray, saveState->m_messageUriArray,
          &saveState->m_savedFiles, originalListener,
          saveState->m_withoutWarning);
    }
    if (NS_FAILED(status) && originalListener) {
      return originalListener->OnStopRunningUrl(nullptr, status);
    }
    return NS_OK;
  };

  // This method is used in filters, where we don't want to warn
  saveState->m_withoutWarning = true;

  rv = SaveAttachment(attachmentDestination, aUrlArray[0], aMessageUriArray[0],
                      aContentTypeArray[0], saveState, nullptr);
  return rv;
}

// Internal helper for Saving attachments.
// It handles a single attachment, but multiple attachments can be saved
// by passing in an nsSaveAllAttachmentsState. In this case, SaveAttachment()
// will be called for each attachment, and the saveState keeps track of which
// one we're up to.
//
// aListener is invoked to cover this single attachment save.
// If a saveState is used, it can also contain a nsIUrlListener which
// will be invoked when _all_ the saves are complete.
//
// SaveAttachment() takes ownership of the saveState passed in.
// If SaveAttachment() fails, then
// saveState->m_overallListener->OnStopRunningUrl()
// will be invoked and saveState itself will be deleted.
//
// Even though SaveAttachment() takes ownership of saveState,
// nsSaveMsgListener is responsible for finally deleting it when the
// last save operation successfully completes.
//
// Yes, this is convoluted. Bug 1788159 covers simplifying all this stuff.
nsresult nsMessenger::SaveAttachment(nsIFile* aFile, const nsACString& aURL,
                                     const nsACString& aMessageUri,
                                     const nsACString& aContentType,
                                     nsSaveAllAttachmentsState* saveState,
                                     nsIUrlListener* aListener) {
  nsCOMPtr<nsIMsgMessageService> messageService;
  nsCOMPtr<nsIMsgMessageFetchPartService> fetchService;
  nsAutoCString urlString;
  nsAutoCString fullMessageUri(aMessageUri);

  nsresult rv = NS_OK;

  // This instance will be held onto by the listeners, and will be released once
  // the transfer has been completed.
  RefPtr<nsSaveMsgListener> saveListener(
      new nsSaveMsgListener(aFile, this, aListener));

  saveListener->m_contentType = aContentType;
  if (saveState) {
    if (saveState->m_overallListener && saveState->m_curIndex == 0) {
      // This is the first item, so tell the caller we're starting.
      saveState->m_overallListener->OnStartRunningUrl(nullptr);
    }
    saveListener->m_saveAllAttachmentsState = saveState;
    // Record the resultant file:// URL for each saved attachment as we go
    // along. It'll be used later if we want to also detach them from the email.
    // Placeholder text will be inserted into the email to replace the
    // removed attachment pointing at it's final resting place.
    nsCOMPtr<nsIURI> outputURI;
    rv = NS_NewFileURI(getter_AddRefs(outputURI), aFile);
    if (NS_SUCCEEDED(rv)) {
      nsAutoCString fileUriSpec;
      rv = outputURI->GetSpec(fileUriSpec);
      if NS_SUCCEEDED (rv) {
        saveState->m_savedFiles.AppendElement(fileUriSpec);
      }
    }
  }

  nsCOMPtr<nsIURI> URL;
  if (NS_SUCCEEDED(rv)) {
    urlString = aURL;
    // strip out ?type=application/x-message-display because it confuses libmime

    int32_t typeIndex = urlString.Find("?type=application/x-message-display");
    if (typeIndex != kNotFound) {
      urlString.Cut(typeIndex,
                    sizeof("?type=application/x-message-display") - 1);
      // we also need to replace the next '&' with '?'
      int32_t firstPartIndex = urlString.FindChar('&');
      if (firstPartIndex != kNotFound) urlString.SetCharAt('?', firstPartIndex);
    }

    urlString.ReplaceSubstring("/;section", "?section");
    rv = NS_NewURI(getter_AddRefs(URL), urlString);
  }

  if (NS_SUCCEEDED(rv)) {
    rv = GetMessageServiceFromURI(aMessageUri, getter_AddRefs(messageService));
    if (NS_SUCCEEDED(rv)) {
      RefPtr<nsIStreamListener> streamListener = saveListener;

      fetchService = do_QueryInterface(messageService);
      nsCOMPtr<nsIURI> dummyNull;
      if (fetchService) {
        // If the message service has a fetch part service then we know we can
        // fetch mime parts...
        int32_t partPos = urlString.FindChar('?');
        if (partPos == kNotFound) return NS_ERROR_FAILURE;
        fullMessageUri.Append(Substring(urlString, partPos));
        rv = fetchService->FetchMimePart(URL, fullMessageUri, streamListener,
                                         mMsgWindow, saveListener,
                                         getter_AddRefs(dummyNull));
      } else {
        rv = messageService->StreamMessage(fullMessageUri, streamListener,
                                           mMsgWindow, nullptr, false, ""_ns,
                                           false, getter_AddRefs(dummyNull));
      }
    }  // if we got a message service
  }  // if we created a url

  if (NS_FAILED(rv)) {
    if (saveState) {
      // If we had a listener, make sure it sees the failure!
      if (saveState->m_overallListener) {
        saveState->m_overallListener->OnStopRunningUrl(nullptr, rv);
      }
      // Ugh. Ownership is all over the place here!
      // Usually nsSaveMsgListener is responsible for cleaning up
      // nsSaveAllAttachmentsState... but we're not getting
      // that far, so have to clean it up here!
      delete saveState;
      saveListener->m_saveAllAttachmentsState = nullptr;
    }
    Alert("saveAttachmentFailed");
  }
  return rv;
}

NS_IMETHODIMP
nsMessenger::SaveAttachment(const nsACString& aContentType,
                            const nsACString& aURL,
                            const nsACString& aDisplayName,
                            const nsACString& aMessageUri,
                            bool aIsExternalAttachment) {
  return SaveOneAttachment(aContentType, aURL, aDisplayName, aMessageUri,
                           false);
}

nsresult nsMessenger::SaveOneAttachment(const nsACString& aContentType,
                                        const nsACString& aURL,
                                        const nsACString& aDisplayName,
                                        const nsACString& aMessageUri,
                                        bool detaching) {
  nsresult rv = NS_ERROR_OUT_OF_MEMORY;
  nsCOMPtr<nsIFilePicker> filePicker =
      do_CreateInstance("@mozilla.org/filepicker;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsIFilePicker::ResultCode dialogResult;
  nsCOMPtr<nsIFile> localFile;
  nsCOMPtr<nsIFile> lastSaveDir;
  nsCString filePath;
  nsString saveAttachmentStr;
  nsString defaultDisplayString;
  ConvertAndSanitizeFileName(aDisplayName, defaultDisplayString);

  if (detaching) {
    GetString(u"DetachAttachment"_ns, saveAttachmentStr);
  } else {
    GetString(u"SaveAttachment"_ns, saveAttachmentStr);
  }
  nsCOMPtr<nsPIDOMWindowOuter> win = nsPIDOMWindowOuter::From(mWindow);
  filePicker->Init(win->GetBrowsingContext(), saveAttachmentStr,
                   nsIFilePicker::modeSave);
  filePicker->SetDefaultString(defaultDisplayString);

  // Check if the attachment file name has an extension (which must not
  // contain spaces) and set it as the default extension for the attachment.
  int32_t extensionIndex = defaultDisplayString.RFindChar('.');
  if (extensionIndex > 0 &&
      defaultDisplayString.FindChar(' ', extensionIndex) == kNotFound) {
    nsString extension;
    extension = Substring(defaultDisplayString, extensionIndex + 1);
    filePicker->SetDefaultExtension(extension);
    if (!mStringBundle) {
      rv = InitStringBundle();
      NS_ENSURE_SUCCESS(rv, rv);
    }

    nsString filterName;
    AutoTArray<nsString, 1> extensionParam = {extension};
    rv = mStringBundle->FormatStringFromName("saveAsType", extensionParam,
                                             filterName);
    NS_ENSURE_SUCCESS(rv, rv);

    extension.InsertLiteral(u"*.", 0);
    filePicker->AppendFilter(filterName, extension);
  }

  filePicker->AppendFilters(nsIFilePicker::filterAll);

  rv = GetLastSaveDirectory(getter_AddRefs(lastSaveDir));
  if (NS_SUCCEEDED(rv) && lastSaveDir)
    filePicker->SetDisplayDirectory(lastSaveDir);

  rv = ShowPicker(filePicker, &dialogResult);
  if (NS_FAILED(rv) || dialogResult == nsIFilePicker::returnCancel) return rv;

  rv = filePicker->GetFile(getter_AddRefs(localFile));
  NS_ENSURE_SUCCESS(rv, rv);

  SetLastSaveDirectory(localFile);

  PathString dirName = localFile->NativePath();

  AutoTArray<nsCString, 1> contentTypeArray = {
      PromiseFlatCString(aContentType)};
  AutoTArray<nsCString, 1> urlArray = {PromiseFlatCString(aURL)};
  AutoTArray<nsCString, 1> displayNameArray = {
      PromiseFlatCString(aDisplayName)};
  AutoTArray<nsCString, 1> messageUriArray = {PromiseFlatCString(aMessageUri)};
  nsSaveAllAttachmentsState* saveState = new nsSaveAllAttachmentsState(
      contentTypeArray, urlArray, displayNameArray, messageUriArray,
      dirName.get(), detaching, nullptr);

  // SaveAttachment takes ownership of saveState.
  return SaveAttachment(localFile, aURL, aMessageUri, aContentType, saveState,
                        nullptr);
}

NS_IMETHODIMP
nsMessenger::SaveAllAttachments(const nsTArray<nsCString>& contentTypeArray,
                                const nsTArray<nsCString>& urlArray,
                                const nsTArray<nsCString>& displayNameArray,
                                const nsTArray<nsCString>& messageUriArray) {
  uint32_t len = contentTypeArray.Length();
  NS_ENSURE_TRUE(urlArray.Length() == len, NS_ERROR_INVALID_ARG);
  NS_ENSURE_TRUE(displayNameArray.Length() == len, NS_ERROR_INVALID_ARG);
  NS_ENSURE_TRUE(messageUriArray.Length() == len, NS_ERROR_INVALID_ARG);
  if (len == 0) {
    return NS_OK;
  }
  return SaveAllAttachments(contentTypeArray, urlArray, displayNameArray,
                            messageUriArray, false);
}

nsresult nsMessenger::SaveAllAttachments(
    const nsTArray<nsCString>& contentTypeArray,
    const nsTArray<nsCString>& urlArray,
    const nsTArray<nsCString>& displayNameArray,
    const nsTArray<nsCString>& messageUriArray, bool detaching,
    nsIUrlListener* aListener) {
  nsresult rv = NS_ERROR_OUT_OF_MEMORY;
  nsCOMPtr<nsIFilePicker> filePicker =
      do_CreateInstance("@mozilla.org/filepicker;1", &rv);
  nsCOMPtr<nsIFile> localFile;
  nsCOMPtr<nsIFile> lastSaveDir;
  nsIFilePicker::ResultCode dialogResult;
  nsString saveAttachmentStr;

  NS_ENSURE_SUCCESS(rv, rv);
  if (detaching) {
    GetString(u"DetachAllAttachments"_ns, saveAttachmentStr);
  } else {
    GetString(u"SaveAllAttachments"_ns, saveAttachmentStr);
  }
  nsCOMPtr<nsPIDOMWindowOuter> win = nsPIDOMWindowOuter::From(mWindow);
  filePicker->Init(win->GetBrowsingContext(), saveAttachmentStr,
                   nsIFilePicker::modeGetFolder);

  rv = GetLastSaveDirectory(getter_AddRefs(lastSaveDir));
  if (NS_SUCCEEDED(rv) && lastSaveDir)
    filePicker->SetDisplayDirectory(lastSaveDir);

  rv = ShowPicker(filePicker, &dialogResult);
  if (NS_FAILED(rv) || dialogResult == nsIFilePicker::returnCancel) return rv;

  rv = filePicker->GetFile(getter_AddRefs(localFile));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = SetLastSaveDirectory(localFile);
  NS_ENSURE_SUCCESS(rv, rv);

  PathString dirName = localFile->NativePath();

  nsString unescapedName;
  ConvertAndSanitizeFileName(displayNameArray[0], unescapedName);
  rv = localFile->Append(unescapedName);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = PromptIfFileExists(localFile);
  NS_ENSURE_SUCCESS(rv, rv);

  nsSaveAllAttachmentsState* saveState = new nsSaveAllAttachmentsState(
      contentTypeArray, urlArray, displayNameArray, messageUriArray,
      dirName.get(), detaching, nullptr);
  // SaveAttachment takes ownership of saveState.
  rv = SaveAttachment(localFile, urlArray[0], messageUriArray[0],
                      contentTypeArray[0], saveState, aListener);
  return rv;
}

enum MESSENGER_SAVEAS_FILE_TYPE {
  EML_FILE_TYPE = 0,
  HTML_FILE_TYPE = 1,
  TEXT_FILE_TYPE = 2,
  ANY_FILE_TYPE = 3
};
#define HTML_FILE_EXTENSION ".htm"
#define HTML_FILE_EXTENSION2 ".html"
#define TEXT_FILE_EXTENSION ".txt"

/**
 * Adjust the file name, removing characters from the middle of the name if
 * the name would otherwise be too long - too long for what file systems
 * usually support.
 */
nsresult nsMessenger::AdjustFileIfNameTooLong(nsIFile* aFile) {
  NS_ENSURE_ARG_POINTER(aFile);
  nsAutoString path;
  nsresult rv = aFile->GetPath(path);
  NS_ENSURE_SUCCESS(rv, rv);
  // Most common file systems have a max filename length of 255. On windows, the
  // total path length is (at least for all practical purposees) limited to 255.
  // Let's just don't allow paths longer than that elsewhere either for
  // simplicity.
  uint32_t MAX = 255;
  if (path.Length() > MAX) {
    nsAutoString leafName;
    rv = aFile->GetLeafName(leafName);
    NS_ENSURE_SUCCESS(rv, rv);

    uint32_t pathLengthUpToLeaf = path.Length() - leafName.Length();
    if (pathLengthUpToLeaf >= MAX - 8) {  // want at least 8 chars for name
      return NS_ERROR_FILE_NAME_TOO_LONG;
    }
    uint32_t x = MAX - pathLengthUpToLeaf;  // x = max leaf size
    nsAutoString truncatedLeaf;
    truncatedLeaf.Append(Substring(leafName, 0, x / 2));
    truncatedLeaf.AppendLiteral("...");
    truncatedLeaf.Append(
        Substring(leafName, leafName.Length() - x / 2 + 3, leafName.Length()));
    rv = aFile->SetLeafName(truncatedLeaf);
  }
  return rv;
}

NS_IMETHODIMP
nsMessenger::SaveAs(const nsACString& aURI, bool aAsFile,
                    nsIMsgIdentity* aIdentity, const nsAString& aMsgFilename,
                    bool aBypassFilePicker) {
  nsCOMPtr<nsIMsgMessageService> messageService;
  nsCOMPtr<nsIUrlListener> urlListener;
  RefPtr<nsSaveMsgListener> saveListener;
  nsCOMPtr<nsIStreamListener> convertedListener;
  int32_t saveAsFileType = EML_FILE_TYPE;

  nsresult rv = GetMessageServiceFromURI(aURI, getter_AddRefs(messageService));
  if (NS_FAILED(rv)) goto done;

  if (aAsFile) {
    nsCOMPtr<nsIFile> saveAsFile;
    // show the file picker if BypassFilePicker is not specified (null) or false
    if (!aBypassFilePicker) {
      rv = GetSaveAsFile(aMsgFilename, &saveAsFileType,
                         getter_AddRefs(saveAsFile));
      // A null saveAsFile means that the user canceled the save as
      if (NS_FAILED(rv) || !saveAsFile) goto done;
    } else {
      saveAsFile = new nsLocalFile();
      rv = saveAsFile->InitWithPath(aMsgFilename);
      if (NS_FAILED(rv)) goto done;
      if (StringEndsWith(aMsgFilename,
                         NS_LITERAL_STRING_FROM_CSTRING(TEXT_FILE_EXTENSION),
                         nsCaseInsensitiveStringComparator))
        saveAsFileType = TEXT_FILE_TYPE;
      else if ((StringEndsWith(
                   aMsgFilename,
                   NS_LITERAL_STRING_FROM_CSTRING(HTML_FILE_EXTENSION),
                   nsCaseInsensitiveStringComparator)) ||
               (StringEndsWith(
                   aMsgFilename,
                   NS_LITERAL_STRING_FROM_CSTRING(HTML_FILE_EXTENSION2),
                   nsCaseInsensitiveStringComparator)))
        saveAsFileType = HTML_FILE_TYPE;
      else
        saveAsFileType = EML_FILE_TYPE;
    }

    rv = AdjustFileIfNameTooLong(saveAsFile);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = PromptIfFileExists(saveAsFile);
    if (NS_FAILED(rv)) {
      goto done;
    }

    // After saveListener goes out of scope, the listener will be owned by
    // whoever the listener is registered with, usually a URL.
    saveListener = new nsSaveMsgListener(saveAsFile, this, nullptr);
    rv = saveListener->QueryInterface(NS_GET_IID(nsIUrlListener),
                                      getter_AddRefs(urlListener));
    if (NS_FAILED(rv)) goto done;

    if (saveAsFileType == EML_FILE_TYPE) {
      rv = messageService->SaveMessageToDisk(aURI, saveAsFile, false,
                                             urlListener, true, mMsgWindow);
    } else {
      nsAutoCString urlString(aURI);

      // we can't go RFC822 to TXT until bug #1775 is fixed
      // so until then, do the HTML to TXT conversion in
      // nsSaveMsgListener::OnStopRequest(), see ConvertBufToPlainText()
      //
      // Setup the URL for a "Save As..." Operation...
      // For now, if this is a save as TEXT operation, then do
      // a "printing" operation
      if (saveAsFileType == TEXT_FILE_TYPE) {
        saveListener->m_outputFormat = nsSaveMsgListener::ePlainText;
        saveListener->m_doCharsetConversion = true;
        urlString.AppendLiteral("?header=print");
      } else {
        saveListener->m_outputFormat = nsSaveMsgListener::eHTML;
        saveListener->m_doCharsetConversion = false;
        urlString.AppendLiteral("?header=saveas");
      }

      nsCOMPtr<nsIURI> url;
      rv = NS_NewURI(getter_AddRefs(url), urlString);
      NS_ASSERTION(NS_SUCCEEDED(rv), "NS_NewURI failed");
      if (NS_FAILED(rv)) goto done;

      nsCOMPtr<nsIPrincipal> nullPrincipal =
          NullPrincipal::CreateWithoutOriginAttributes();

      saveListener->m_channel = nullptr;
      rv = NS_NewInputStreamChannel(
          getter_AddRefs(saveListener->m_channel), url, nullptr, nullPrincipal,
          nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
          nsIContentPolicy::TYPE_OTHER);
      NS_ASSERTION(NS_SUCCEEDED(rv), "NS_NewChannel failed");
      if (NS_FAILED(rv)) goto done;

      nsCOMPtr<nsIStreamConverterService> streamConverterService =
          do_GetService("@mozilla.org/streamConverters;1");
      nsCOMPtr<nsISupports> channelSupport =
          do_QueryInterface(saveListener->m_channel);

      // we can't go RFC822 to TXT until bug #1775 is fixed
      // so until then, do the HTML to TXT conversion in
      // nsSaveMsgListener::OnStopRequest(), see ConvertBufToPlainText()
      rv = streamConverterService->AsyncConvertData(
          MESSAGE_RFC822, TEXT_HTML, saveListener, channelSupport,
          getter_AddRefs(convertedListener));
      NS_ASSERTION(NS_SUCCEEDED(rv), "AsyncConvertData failed");
      if (NS_FAILED(rv)) goto done;

      nsCOMPtr<nsIURI> dummyNull;
      rv = messageService->StreamMessage(urlString, convertedListener,
                                         mMsgWindow, urlListener, false, ""_ns,
                                         false, getter_AddRefs(dummyNull));
    }
  } else {
    // ** save as Template
    nsCOMPtr<nsIFile> tmpFile;
    nsresult rv = GetSpecialDirectoryWithFileName(NS_OS_TEMP_DIR, "nsmail.tmp",
                                                  getter_AddRefs(tmpFile));

    NS_ENSURE_SUCCESS(rv, rv);

    // For temp file, we should use restrictive 00600 instead of
    // ATTACHMENT_PERMISSION
    rv = tmpFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 00600);
    if (NS_FAILED(rv)) goto done;

    // The saveListener is owned by whoever we ultimately register the
    // listener with, generally a URL.
    saveListener = new nsSaveMsgListener(tmpFile, this, nullptr);

    if (aIdentity)
      rv = aIdentity->GetStationeryFolder(saveListener->m_templateUri);
    if (NS_FAILED(rv)) goto done;

    bool needDummyHeader =
        StringBeginsWith(saveListener->m_templateUri, "mailbox://"_ns);
    bool canonicalLineEnding =
        StringBeginsWith(saveListener->m_templateUri, "imap://"_ns);

    rv = saveListener->QueryInterface(NS_GET_IID(nsIUrlListener),
                                      getter_AddRefs(urlListener));
    if (NS_FAILED(rv)) goto done;

    rv = messageService->SaveMessageToDisk(aURI, tmpFile, needDummyHeader,
                                           urlListener, canonicalLineEnding,
                                           mMsgWindow);
  }

done:
  if (NS_FAILED(rv)) {
    Alert("saveMessageFailed");
  }
  return rv;
}

nsresult nsMessenger::GetSaveAsFile(const nsAString& aMsgFilename,
                                    int32_t* aSaveAsFileType,
                                    nsIFile** aSaveAsFile) {
  nsresult rv;
  nsCOMPtr<nsIFilePicker> filePicker =
      do_CreateInstance("@mozilla.org/filepicker;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsString saveMailAsStr;
  GetString(u"SaveMailAs"_ns, saveMailAsStr);
  nsCOMPtr<nsPIDOMWindowOuter> win = nsPIDOMWindowOuter::From(mWindow);
  filePicker->Init(win->GetBrowsingContext(), saveMailAsStr,
                   nsIFilePicker::modeSave);

  // if we have a non-null filename use it, otherwise use default save message
  // one
  if (aMsgFilename.IsEmpty()) {
    nsString saveMsgStr;
    GetString(u"defaultSaveMessageAsFileName"_ns, saveMsgStr);
    filePicker->SetDefaultString(saveMsgStr);
  } else {
    filePicker->SetDefaultString(aMsgFilename);
  }

  // because we will be using GetFilterIndex()
  // we must call AppendFilters() one at a time,
  // in MESSENGER_SAVEAS_FILE_TYPE order
  nsString emlFilesStr;
  GetString(u"EMLFiles"_ns, emlFilesStr);
  filePicker->AppendFilter(emlFilesStr, u"*.eml"_ns);
  filePicker->AppendFilters(nsIFilePicker::filterHTML);
  filePicker->AppendFilters(nsIFilePicker::filterText);
  filePicker->AppendFilters(nsIFilePicker::filterAll);

  // Save as the "All Files" file type by default. We want to save as .eml by
  // default, but the filepickers on some platforms don't switch extensions
  // based on the file type selected (bug 508597).
  filePicker->SetFilterIndex(ANY_FILE_TYPE);
  // Yes, this is fine even if we ultimately save as HTML or text. On Windows,
  // this actually is a boolean telling the file picker to automatically add
  // the correct extension depending on the filter. On Mac or Linux this is a
  // no-op.
  filePicker->SetDefaultExtension(u"eml"_ns);

  nsIFilePicker::ResultCode dialogResult;

  nsCOMPtr<nsIFile> lastSaveDir;
  rv = GetLastSaveDirectory(getter_AddRefs(lastSaveDir));
  if (NS_SUCCEEDED(rv) && lastSaveDir)
    filePicker->SetDisplayDirectory(lastSaveDir);

  nsCOMPtr<nsIFile> localFile;
  rv = ShowPicker(filePicker, &dialogResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (dialogResult == nsIFilePicker::returnCancel) {
    // We'll indicate this by setting the outparam to null.
    *aSaveAsFile = nullptr;
    return NS_OK;
  }

  rv = filePicker->GetFile(getter_AddRefs(localFile));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = SetLastSaveDirectory(localFile);
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t selectedSaveAsFileType;
  rv = filePicker->GetFilterIndex(&selectedSaveAsFileType);
  NS_ENSURE_SUCCESS(rv, rv);

  // If All Files was selected, look at the extension
  if (selectedSaveAsFileType == ANY_FILE_TYPE) {
    nsAutoString fileName;
    rv = localFile->GetLeafName(fileName);
    NS_ENSURE_SUCCESS(rv, rv);

    if (StringEndsWith(fileName,
                       NS_LITERAL_STRING_FROM_CSTRING(HTML_FILE_EXTENSION),
                       nsCaseInsensitiveStringComparator) ||
        StringEndsWith(fileName,
                       NS_LITERAL_STRING_FROM_CSTRING(HTML_FILE_EXTENSION2),
                       nsCaseInsensitiveStringComparator))
      *aSaveAsFileType = HTML_FILE_TYPE;
    else if (StringEndsWith(fileName,
                            NS_LITERAL_STRING_FROM_CSTRING(TEXT_FILE_EXTENSION),
                            nsCaseInsensitiveStringComparator))
      *aSaveAsFileType = TEXT_FILE_TYPE;
    else
      // The default is .eml
      *aSaveAsFileType = EML_FILE_TYPE;
  } else {
    *aSaveAsFileType = selectedSaveAsFileType;
  }

  if (dialogResult == nsIFilePicker::returnReplace) {
    // be extra safe and only delete when the file is really a file
    bool isFile;
    rv = localFile->IsFile(&isFile);
    if (NS_SUCCEEDED(rv) && isFile) {
      rv = localFile->Remove(false /* recursive delete */);
      NS_ENSURE_SUCCESS(rv, rv);
    } else {
      // We failed, or this isn't a file. We can't do anything about it.
      return NS_ERROR_FAILURE;
    }
  }

  *aSaveAsFile = nullptr;
  localFile.forget(aSaveAsFile);
  return NS_OK;
}

/**
 * Show a Save All dialog allowing the user to pick which folder to save
 * messages to.
 * @param [out] aSaveDir directory to save to. Will be null on cancel.
 */
nsresult nsMessenger::GetSaveToDir(nsIFile** aSaveDir) {
  nsresult rv;
  nsCOMPtr<nsIFilePicker> filePicker =
      do_CreateInstance("@mozilla.org/filepicker;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsString chooseFolderStr;
  GetString(u"ChooseFolder"_ns, chooseFolderStr);
  nsCOMPtr<nsPIDOMWindowOuter> win = nsPIDOMWindowOuter::From(mWindow);
  filePicker->Init(win->GetBrowsingContext(), chooseFolderStr,
                   nsIFilePicker::modeGetFolder);

  nsCOMPtr<nsIFile> lastSaveDir;
  rv = GetLastSaveDirectory(getter_AddRefs(lastSaveDir));
  if (NS_SUCCEEDED(rv) && lastSaveDir)
    filePicker->SetDisplayDirectory(lastSaveDir);

  nsIFilePicker::ResultCode dialogResult;
  rv = ShowPicker(filePicker, &dialogResult);
  if (NS_FAILED(rv) || dialogResult == nsIFilePicker::returnCancel) {
    // We'll indicate this by setting the outparam to null.
    *aSaveDir = nullptr;
    return NS_OK;
  }

  nsCOMPtr<nsIFile> dir;
  rv = filePicker->GetFile(getter_AddRefs(dir));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = SetLastSaveDirectory(dir);
  NS_ENSURE_SUCCESS(rv, rv);

  *aSaveDir = nullptr;
  dir.forget(aSaveDir);
  return NS_OK;
}

NS_IMETHODIMP
nsMessenger::SaveMessages(const nsTArray<nsString>& aFilenameArray,
                          const nsTArray<nsCString>& aMessageUriArray) {
  MOZ_ASSERT(aFilenameArray.Length() == aMessageUriArray.Length());

  nsresult rv;

  nsCOMPtr<nsIFile> saveDir;
  rv = GetSaveToDir(getter_AddRefs(saveDir));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!saveDir)  // A null saveDir means that the user canceled the save.
    return NS_OK;

  for (uint32_t i = 0; i < aFilenameArray.Length(); i++) {
    nsCOMPtr<nsIFile> saveToFile = new nsLocalFile();
    rv = saveToFile->InitWithFile(saveDir);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = saveToFile->Append(aFilenameArray[i]);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = AdjustFileIfNameTooLong(saveToFile);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = PromptIfFileExists(saveToFile);
    if (NS_FAILED(rv)) continue;

    nsCOMPtr<nsIMsgMessageService> messageService;
    nsCOMPtr<nsIUrlListener> urlListener;

    rv = GetMessageServiceFromURI(aMessageUriArray[i],
                                  getter_AddRefs(messageService));
    if (NS_FAILED(rv)) {
      Alert("saveMessageFailed");
      return rv;
    }

    RefPtr<nsSaveMsgListener> saveListener =
        new nsSaveMsgListener(saveToFile, this, nullptr);

    rv = saveListener->QueryInterface(NS_GET_IID(nsIUrlListener),
                                      getter_AddRefs(urlListener));
    if (NS_FAILED(rv)) {
      Alert("saveMessageFailed");
      return rv;
    }

    // Ok, now save the message.
    rv = messageService->SaveMessageToDisk(
        aMessageUriArray[i], saveToFile, false, urlListener, true, mMsgWindow);
    if (NS_FAILED(rv)) {
      Alert("saveMessageFailed");
      return rv;
    }
  }
  return rv;
}

nsresult nsMessenger::Alert(const char* stringName) {
  nsresult rv = NS_OK;

  if (mDocShell) {
    nsCOMPtr<nsIPrompt> dialog(do_GetInterface(mDocShell));

    if (dialog) {
      nsString alertStr;
      GetString(NS_ConvertASCIItoUTF16(stringName), alertStr);
      rv = dialog->Alert(nullptr, alertStr.get());
    }
  }
  return rv;
}

NS_IMETHODIMP
nsMessenger::MsgHdrFromURI(const nsACString& aUri, nsIMsgDBHdr** aMsgHdr) {
  NS_ENSURE_ARG_POINTER(aMsgHdr);
  nsCOMPtr<nsIMsgMessageService> msgService;
  nsresult rv;

  rv = GetMessageServiceFromURI(aUri, getter_AddRefs(msgService));
  NS_ENSURE_SUCCESS(rv, rv);
  return msgService->MessageURIToMsgHdr(aUri, aMsgHdr);
}

NS_IMETHODIMP nsMessenger::GetUndoTransactionType(uint32_t* txnType) {
  NS_ENSURE_TRUE(txnType && mTxnMgr, NS_ERROR_NULL_POINTER);
  *txnType = nsMessenger::eUnknown;
  nsCOMPtr<nsITransaction> txn;
  nsresult rv = mTxnMgr->PeekUndoStack(getter_AddRefs(txn));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!txn) {
    return NS_OK;  // Nothing to undo.
  }
  // Manager holds nsITransactions, but txnType is added by nsIMsgTxn.
  nsCOMPtr<nsIMsgTxn> msgTxn = do_QueryInterface(txn, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return msgTxn->GetTxnType(txnType);
}

NS_IMETHODIMP nsMessenger::CanUndo(bool* bValue) {
  NS_ENSURE_TRUE(bValue && mTxnMgr, NS_ERROR_NULL_POINTER);

  nsresult rv;
  *bValue = false;
  int32_t count = 0;
  rv = mTxnMgr->GetNumberOfUndoItems(&count);
  if (NS_SUCCEEDED(rv) && count > 0) *bValue = true;
  return rv;
}

NS_IMETHODIMP nsMessenger::GetRedoTransactionType(uint32_t* txnType) {
  NS_ENSURE_TRUE(txnType && mTxnMgr, NS_ERROR_NULL_POINTER);

  *txnType = nsMessenger::eUnknown;
  nsCOMPtr<nsITransaction> txn;
  nsresult rv = mTxnMgr->PeekRedoStack(getter_AddRefs(txn));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!txn) {
    return NS_OK;  // Nothing to redo.
  }
  // Manager holds nsITransactions, but txnType is added by nsIMsgTxn.
  nsCOMPtr<nsIMsgTxn> msgTxn = do_QueryInterface(txn, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  return msgTxn->GetTxnType(txnType);
}

NS_IMETHODIMP nsMessenger::CanRedo(bool* bValue) {
  NS_ENSURE_TRUE(bValue && mTxnMgr, NS_ERROR_NULL_POINTER);

  nsresult rv;
  *bValue = false;
  int32_t count = 0;
  rv = mTxnMgr->GetNumberOfRedoItems(&count);
  if (NS_SUCCEEDED(rv) && count > 0) *bValue = true;
  return rv;
}

MOZ_CAN_RUN_SCRIPT_BOUNDARY NS_IMETHODIMP
nsMessenger::Undo(nsIMsgWindow* msgWindow) {
  nsresult rv = NS_OK;
  if (mTxnMgr) {
    int32_t numTxn = 0;
    rv = mTxnMgr->GetNumberOfUndoItems(&numTxn);
    if (NS_SUCCEEDED(rv) && numTxn > 0) {
      nsCOMPtr<nsITransaction> txn;
      rv = mTxnMgr->PeekUndoStack(getter_AddRefs(txn));
      if (NS_SUCCEEDED(rv) && txn) {
        static_cast<nsMsgTxn*>(static_cast<nsITransaction*>(txn.get()))
            ->SetMsgWindow(msgWindow);
      }
      nsCOMPtr<nsITransactionManager> txnMgr = mTxnMgr;
      txnMgr->UndoTransaction();
    }
  }
  return rv;
}

MOZ_CAN_RUN_SCRIPT_BOUNDARY NS_IMETHODIMP
nsMessenger::Redo(nsIMsgWindow* msgWindow) {
  nsresult rv = NS_OK;
  if (mTxnMgr) {
    int32_t numTxn = 0;
    rv = mTxnMgr->GetNumberOfRedoItems(&numTxn);
    if (NS_SUCCEEDED(rv) && numTxn > 0) {
      nsCOMPtr<nsITransaction> txn;
      rv = mTxnMgr->PeekRedoStack(getter_AddRefs(txn));
      if (NS_SUCCEEDED(rv) && txn) {
        static_cast<nsMsgTxn*>(static_cast<nsITransaction*>(txn.get()))
            ->SetMsgWindow(msgWindow);
      }
      nsCOMPtr<nsITransactionManager> txnMgr = mTxnMgr;
      txnMgr->RedoTransaction();
    }
  }
  return rv;
}

NS_IMETHODIMP
nsMessenger::GetTransactionManager(nsITransactionManager** aTxnMgr) {
  NS_ENSURE_TRUE(mTxnMgr && aTxnMgr, NS_ERROR_NULL_POINTER);
  NS_ADDREF(*aTxnMgr = mTxnMgr);
  return NS_OK;
}

nsSaveMsgListener::nsSaveMsgListener(nsIFile* aFile, nsMessenger* aMessenger,
                                     nsIUrlListener* aListener) {
  m_file = aFile;
  m_messenger = aMessenger;
  mListener = aListener;
  mUrlHasStopped = false;
  mRequestHasStopped = false;

  // rhp: for charset handling
  m_doCharsetConversion = false;
  m_saveAllAttachmentsState = nullptr;
  mProgress = 0;
  mMaxProgress = -1;
  mCanceled = false;
  m_outputFormat = eUnknown;
  mInitialized = false;
}

nsSaveMsgListener::~nsSaveMsgListener() {}

//
// nsISupports
//
NS_IMPL_ISUPPORTS(nsSaveMsgListener, nsIUrlListener, nsIMsgCopyServiceListener,
                  nsIStreamListener, nsIRequestObserver, nsICancelable)

NS_IMETHODIMP
nsSaveMsgListener::Cancel(nsresult status) {
  mCanceled = true;
  return NS_OK;
}

//
// nsIUrlListener
//
NS_IMETHODIMP
nsSaveMsgListener::OnStartRunningUrl(nsIURI* url) {
  if (mListener) mListener->OnStartRunningUrl(url);
  return NS_OK;
}

NS_IMETHODIMP
nsSaveMsgListener::OnStopRunningUrl(nsIURI* url, nsresult exitCode) {
  nsresult rv = exitCode;
  mUrlHasStopped = true;

  // ** save as template goes here
  if (!m_templateUri.IsEmpty()) {
    nsCOMPtr<nsIMsgFolder> templateFolder;
    rv = GetOrCreateFolder(m_templateUri, getter_AddRefs(templateFolder));
    if (NS_FAILED(rv)) goto done;
    nsCOMPtr<nsIMsgCopyService> copyService =
        do_GetService("@mozilla.org/messenger/messagecopyservice;1");
    if (copyService) {
      nsCOMPtr<nsIFile> clone;
      m_file->Clone(getter_AddRefs(clone));
      rv = copyService->CopyFileMessage(clone, templateFolder, nullptr, true,
                                        nsMsgMessageFlags::Read, EmptyCString(),
                                        this, nullptr);
      // Clear this so we don't end up in a loop if OnStopRunningUrl gets
      // called again.
      m_templateUri.Truncate();
    }
  } else if (m_outputStream && mRequestHasStopped) {
    m_outputStream->Close();
    m_outputStream = nullptr;
  }

done:
  if (NS_FAILED(rv)) {
    if (m_file) m_file->Remove(false);
    if (m_messenger) m_messenger->Alert("saveMessageFailed");
  }

  if (mRequestHasStopped && mListener)
    mListener->OnStopRunningUrl(url, exitCode);
  else
    mListenerUri = url;

  nsCOMPtr<nsIObserverService> obs = services::GetObserverService();
  obs->NotifyObservers(nullptr, "message-saved", nullptr);

  return rv;
}

NS_IMETHODIMP
nsSaveMsgListener::OnStartCopy(void) { return NS_OK; }

NS_IMETHODIMP
nsSaveMsgListener::OnProgress(uint32_t aProgress, uint32_t aProgressMax) {
  return NS_OK;
}

NS_IMETHODIMP
nsSaveMsgListener::SetMessageKey(nsMsgKey aKey) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsSaveMsgListener::GetMessageId(nsACString& aMessageId) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsSaveMsgListener::OnStopCopy(nsresult aStatus) {
  if (m_file) m_file->Remove(false);
  return aStatus;
}

// initializes the progress window if we are going to show one
// and for OSX, sets creator flags on the output file
nsresult nsSaveMsgListener::InitializeDownload(nsIRequest* aRequest) {
  nsresult rv = NS_OK;

  mInitialized = true;
  nsCOMPtr<nsIChannel> channel(do_QueryInterface(aRequest));

  if (!channel) return rv;

  // Get the max progress from the URL if we haven't already got it.
  if (mMaxProgress == -1) {
    nsCOMPtr<nsIURI> uri;
    channel->GetURI(getter_AddRefs(uri));
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl(do_QueryInterface(uri));
    if (mailnewsUrl) mailnewsUrl->GetMaxProgress(&mMaxProgress);
  }

  if (!m_contentType.IsEmpty()) {
    nsCOMPtr<nsIMIMEService> mimeService(
        do_GetService(NS_MIMESERVICE_CONTRACTID));
    nsCOMPtr<nsIMIMEInfo> mimeinfo;

    mimeService->GetFromTypeAndExtension(m_contentType, EmptyCString(),
                                         getter_AddRefs(mimeinfo));

    // create a download progress window

    // Set saveToDisk explicitly to avoid launching the saved file.
    // See
    // https://hg.mozilla.org/mozilla-central/file/814a6f071472/toolkit/components/jsdownloads/src/DownloadLegacy.js#l164
    mimeinfo->SetPreferredAction(nsIHandlerInfo::saveToDisk);

    // When we don't allow warnings, also don't show progress, as this
    //  is an environment (typically filters) where we don't want
    //  interruption.
    bool allowProgress = true;
    if (m_saveAllAttachmentsState)
      allowProgress = !m_saveAllAttachmentsState->m_withoutWarning;
    if (allowProgress) {
      nsCOMPtr<nsITransfer> tr = do_CreateInstance(NS_TRANSFER_CONTRACTID, &rv);
      if (tr && m_file) {
        PRTime timeDownloadStarted = PR_Now();

        nsCOMPtr<nsIURI> outputURI;
        NS_NewFileURI(getter_AddRefs(outputURI), m_file);

        nsCOMPtr<nsIURI> url;
        channel->GetURI(getter_AddRefs(url));
        rv = tr->Init(url, nullptr, outputURI, EmptyString(), mimeinfo,
                      timeDownloadStarted, nullptr, this, false,
                      nsITransfer::DOWNLOAD_ACCEPTABLE, nullptr, false);

        // now store the web progresslistener
        mTransfer = tr;
      }
    }
  }
  return rv;
}

NS_IMETHODIMP
nsSaveMsgListener::OnStartRequest(nsIRequest* request) {
  if (m_file)
    MsgNewBufferedFileOutputStream(getter_AddRefs(m_outputStream), m_file, -1,
                                   ATTACHMENT_PERMISSION);
  if (!m_outputStream) {
    mCanceled = true;
    if (m_messenger) m_messenger->Alert("saveAttachmentFailed");
  }
  return NS_OK;
}

NS_IMETHODIMP
nsSaveMsgListener::OnStopRequest(nsIRequest* request, nsresult status) {
  nsresult rv = NS_OK;
  mRequestHasStopped = true;

  // rhp: If we are doing the charset conversion magic, this is different
  // processing, otherwise, its just business as usual.
  // If we need text/plain, then we need to convert the HTML and then convert
  // to the systems charset.
  if (m_doCharsetConversion && m_outputStream) {
    // For HTML, code is emitted immediately in OnDataAvailable.
    MOZ_ASSERT(m_outputFormat == ePlainText,
               "For HTML, m_doCharsetConversion shouldn't be set");
    NS_ConvertUTF8toUTF16 utf16Buffer(m_msgBuffer);
    ConvertBufToPlainText(utf16Buffer, false, false, false);

    nsCString outCString;
    // NS_CopyUnicodeToNative() doesn't return an error, so we have no choice
    // but to always use UTF-8.
    CopyUTF16toUTF8(utf16Buffer, outCString);
    uint32_t writeCount;
    rv = m_outputStream->Write(outCString.get(), outCString.Length(),
                               &writeCount);
    if (outCString.Length() != writeCount) rv = NS_ERROR_FAILURE;
  }

  if (m_outputStream) {
    m_outputStream->Close();
    m_outputStream = nullptr;
  }

  // Are there more attachments to deal with?
  nsSaveAllAttachmentsState* state = m_saveAllAttachmentsState;
  if (state) {
    state->m_curIndex++;
    if (!mCanceled && state->m_curIndex < state->m_count) {
      // Yes, start on the next attachment.
      uint32_t i = state->m_curIndex;
      nsString unescapedName;
      nsCOMPtr<nsIFile> localFile;
      rv =
          NS_NewPathStringLocalFile(DependentPathString(state->m_directoryName),
                                    getter_AddRefs(localFile));
      if (NS_FAILED(rv)) goto done;
      if (localFile->NativePath().IsEmpty()) {
        rv = NS_ERROR_FAILURE;
        goto done;
      }

      ConvertAndSanitizeFileName(state->m_displayNameArray[i], unescapedName);
      rv = localFile->Append(unescapedName);
      if (NS_FAILED(rv)) goto done;

      // When we are running with no warnings (typically filters and other
      // automatic uses), then don't prompt for duplicates, but create a unique
      // file instead.
      if (!state->m_withoutWarning) {
        rv = m_messenger->PromptIfFileExists(localFile);
        if (NS_FAILED(rv)) goto done;
      } else {
        rv = localFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE,
                                     ATTACHMENT_PERMISSION);
        if (NS_FAILED(rv)) goto done;
      }
      // Start the next attachment saving.
      // NOTE: null listener passed in on subsequent saves! The original
      // listener will already have been invoked.
      // See Bug 1789565
      rv = m_messenger->SaveAttachment(
          localFile, state->m_urlArray[i], state->m_messageUriArray[i],
          state->m_contentTypeArray[i], state, nullptr);
      if (NS_FAILED(rv)) {
        // If SaveAttachment() fails, state will have been deleted, and
        // m_overallListener->OnStopRunningUrl() will have been called.
        state = nullptr;
        m_saveAllAttachmentsState = nullptr;
      }
    done:
      if (NS_FAILED(rv) && state) {
        if (state->m_overallListener) {
          state->m_overallListener->OnStopRunningUrl(nullptr, rv);
        }
        delete state;
        m_saveAllAttachmentsState = nullptr;
      }
    } else {
      // All attachments have been saved.
      if (state->m_overallListener) {
        state->m_overallListener->OnStopRunningUrl(
            nullptr, mCanceled ? NS_ERROR_FAILURE : NS_OK);
      }
      // Check if we're supposed to be detaching attachments after saving them.
      if (state->m_detachingAttachments && !mCanceled) {
        m_messenger->DetachAttachments(
            state->m_contentTypeArray, state->m_urlArray,
            state->m_displayNameArray, state->m_messageUriArray,
            &state->m_savedFiles, nullptr, state->m_withoutWarning);
      }
      delete m_saveAllAttachmentsState;
      m_saveAllAttachmentsState = nullptr;
    }
  }

  if (mTransfer) {
    mTransfer->OnProgressChange64(nullptr, nullptr, mMaxProgress, mMaxProgress,
                                  mMaxProgress, mMaxProgress);
    mTransfer->OnStateChange(nullptr, nullptr,
                             nsIWebProgressListener::STATE_STOP |
                                 nsIWebProgressListener::STATE_IS_NETWORK,
                             NS_OK);
    mTransfer = nullptr;  // break any circular dependencies between the
                          // progress dialog and use
  }

  if (mUrlHasStopped && mListener)
    mListener->OnStopRunningUrl(mListenerUri, rv);

  return NS_OK;
}

NS_IMETHODIMP
nsSaveMsgListener::OnDataAvailable(nsIRequest* request,
                                   nsIInputStream* inStream, uint64_t srcOffset,
                                   uint32_t count) {
  nsresult rv = NS_ERROR_FAILURE;
  // first, check to see if we've been canceled....
  if (mCanceled)  // then go cancel our underlying channel too
    return request->Cancel(NS_BINDING_ABORTED);

  if (!mInitialized) InitializeDownload(request);

  if (m_outputStream) {
    mProgress += count;
    uint64_t available;
    uint32_t readCount, maxReadCount = sizeof(m_dataBuffer);
    uint32_t writeCount;
    rv = inStream->Available(&available);
    while (NS_SUCCEEDED(rv) && available) {
      if (maxReadCount > available) maxReadCount = (uint32_t)available;
      rv = inStream->Read(m_dataBuffer, maxReadCount, &readCount);

      // rhp:
      // Ok, now we do one of two things. If we are sending out HTML, then
      // just write it to the HTML stream as it comes along...but if this is
      // a save as TEXT operation, we need to buffer this up for conversion
      // when we are done. When the stream converter for HTML-TEXT gets in
      // place, this magic can go away.
      //
      if (NS_SUCCEEDED(rv)) {
        if ((m_doCharsetConversion) && (m_outputFormat == ePlainText))
          m_msgBuffer.Append(Substring(m_dataBuffer, m_dataBuffer + readCount));
        else
          rv = m_outputStream->Write(m_dataBuffer, readCount, &writeCount);

        available -= readCount;
      }
    }

    if (NS_SUCCEEDED(rv) && mTransfer)  // Send progress notification.
      mTransfer->OnProgressChange64(nullptr, request, mProgress, mMaxProgress,
                                    mProgress, mMaxProgress);
  }
  return rv;
}

#define MESSENGER_STRING_URL "chrome://messenger/locale/messenger.properties"

nsresult nsMessenger::InitStringBundle() {
  if (mStringBundle) return NS_OK;

  const char propertyURL[] = MESSENGER_STRING_URL;
  nsCOMPtr<nsIStringBundleService> sBundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(sBundleService, NS_ERROR_UNEXPECTED);
  return sBundleService->CreateBundle(propertyURL,
                                      getter_AddRefs(mStringBundle));
}

void nsMessenger::GetString(const nsString& aStringName, nsString& aValue) {
  nsresult rv;
  aValue.Truncate();

  if (!mStringBundle) InitStringBundle();

  if (mStringBundle)
    rv = mStringBundle->GetStringFromName(
        NS_ConvertUTF16toUTF8(aStringName).get(), aValue);
  else
    rv = NS_ERROR_FAILURE;

  if (NS_FAILED(rv) || aValue.IsEmpty()) aValue = aStringName;
  return;
}

nsSaveAllAttachmentsState::nsSaveAllAttachmentsState(
    const nsTArray<nsCString>& contentTypeArray,
    const nsTArray<nsCString>& urlArray,
    const nsTArray<nsCString>& displayNameArray,
    const nsTArray<nsCString>& messageUriArray, const PathChar* dirName,
    bool detachingAttachments, nsIUrlListener* overallListener)
    : m_contentTypeArray(contentTypeArray.Clone()),
      m_urlArray(urlArray.Clone()),
      m_displayNameArray(displayNameArray.Clone()),
      m_messageUriArray(messageUriArray.Clone()),
      m_detachingAttachments(detachingAttachments),
      m_overallListener(overallListener),
      m_withoutWarning(false) {
  m_count = contentTypeArray.Length();
  m_curIndex = 0;
  m_directoryName = NS_xstrdup(dirName);
}

nsSaveAllAttachmentsState::~nsSaveAllAttachmentsState() {
  free(m_directoryName);
}

nsresult nsMessenger::GetLastSaveDirectory(nsIFile** aLastSaveDir) {
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // this can fail, and it will, on the first time we call it, as there is no
  // default for this pref.
  nsCOMPtr<nsIFile> localFile;
  rv = prefBranch->GetComplexValue(MESSENGER_SAVE_DIR_PREF_NAME,
                                   NS_GET_IID(nsIFile),
                                   getter_AddRefs(localFile));
  if (NS_SUCCEEDED(rv)) localFile.forget(aLastSaveDir);
  return rv;
}

nsresult nsMessenger::SetLastSaveDirectory(nsIFile* aLocalFile) {
  NS_ENSURE_ARG_POINTER(aLocalFile);
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // if the file is a directory, just use it for the last dir chosen
  // otherwise, use the parent of the file as the last dir chosen.
  // IsDirectory() will return error on saving a file, as the
  // file doesn't exist yet.
  bool isDirectory;
  rv = aLocalFile->IsDirectory(&isDirectory);
  if (NS_SUCCEEDED(rv) && isDirectory) {
    rv = prefBranch->SetComplexValue(MESSENGER_SAVE_DIR_PREF_NAME,
                                     NS_GET_IID(nsIFile), aLocalFile);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    nsCOMPtr<nsIFile> parent;
    rv = aLocalFile->GetParent(getter_AddRefs(parent));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = prefBranch->SetComplexValue(MESSENGER_SAVE_DIR_PREF_NAME,
                                     NS_GET_IID(nsIFile), parent);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMessenger::FormatFileSize(uint64_t aSize, bool aUseKB,
                            nsAString& aFormattedSize) {
  return ::FormatFileSize(aSize, aUseKB, aFormattedSize);
}

///////////////////////////////////////////////////////////////////////////////
// Detach/Delete Attachments
///////////////////////////////////////////////////////////////////////////////

static const char* GetAttachmentPartId(const char* aAttachmentUrl) {
  static const char partIdPrefix[] = "part=";
  const char* partId = PL_strstr(aAttachmentUrl, partIdPrefix);
  return partId ? (partId + sizeof(partIdPrefix) - 1) : nullptr;
}

static int CompareAttachmentPartId(const char* aAttachUrlLeft,
                                   const char* aAttachUrlRight) {
  // part ids are numbers separated by periods, like "1.2.3.4".
  // we sort by doing a numerical comparison on each item in turn. e.g. "1.4" <
  // "1.25" shorter entries come before longer entries. e.g. "1.4" < "1.4.1.2"
  // return values:
  //  -2  left is a parent of right
  //  -1  left is less than right
  //   0  left == right
  //   1  right is greater than left
  //   2  right is a parent of left

  const char* partIdLeft = GetAttachmentPartId(aAttachUrlLeft);
  const char* partIdRight = GetAttachmentPartId(aAttachUrlRight);

  // for detached attachments the URL does not contain any "part=xx"
  if (!partIdLeft) partIdLeft = "0";

  if (!partIdRight) partIdRight = "0";

  long idLeft, idRight;
  do {
    MOZ_ASSERT(partIdLeft && IS_DIGIT(*partIdLeft),
               "Invalid character in part id string");
    MOZ_ASSERT(partIdRight && IS_DIGIT(*partIdRight),
               "Invalid character in part id string");

    // if the part numbers are different then the numerically smaller one is
    // first
    char* fixConstLoss;
    idLeft = strtol(partIdLeft, &fixConstLoss, 10);
    partIdLeft = fixConstLoss;
    idRight = strtol(partIdRight, &fixConstLoss, 10);
    partIdRight = fixConstLoss;
    if (idLeft != idRight) return idLeft < idRight ? -1 : 1;

    // if one part id is complete but the other isn't, then the shortest one
    // is first (parents before children)
    if (*partIdLeft != *partIdRight) return *partIdRight ? -2 : 2;

    // if both part ids are complete (*partIdLeft == *partIdRight now) then
    // they are equal
    if (!*partIdLeft) return 0;

    MOZ_ASSERT(*partIdLeft == '.', "Invalid character in part id string");
    MOZ_ASSERT(*partIdRight == '.', "Invalid character in part id string");

    ++partIdLeft;
    ++partIdRight;
  } while (true);
}

// ------------------------------------

// struct on purpose -> show that we don't ever want a vtable
struct msgAttachment {
  msgAttachment(const nsACString& aContentType, const nsACString& aUrl,
                const nsACString& aDisplayName, const nsACString& aMessageUri)
      : mContentType(aContentType),
        mUrl(aUrl),
        mDisplayName(aDisplayName),
        mMessageUri(aMessageUri) {}

  nsCString mContentType;
  nsCString mUrl;
  nsCString mDisplayName;
  nsCString mMessageUri;
};

// ------------------------------------

class nsAttachmentState {
 public:
  nsAttachmentState();
  nsresult Init(const nsTArray<nsCString>& aContentTypeArray,
                const nsTArray<nsCString>& aUrlArray,
                const nsTArray<nsCString>& aDisplayNameArray,
                const nsTArray<nsCString>& aMessageUriArray);
  nsresult PrepareForAttachmentDelete();

 private:
  static int CompareAttachmentsByPartId(const void* aLeft, const void* aRight);

 public:
  uint32_t mCurIndex;
  nsTArray<msgAttachment> mAttachmentArray;
};

nsAttachmentState::nsAttachmentState() : mCurIndex(0) {}

nsresult nsAttachmentState::Init(const nsTArray<nsCString>& aContentTypeArray,
                                 const nsTArray<nsCString>& aUrlArray,
                                 const nsTArray<nsCString>& aDisplayNameArray,
                                 const nsTArray<nsCString>& aMessageUriArray) {
  MOZ_ASSERT(aContentTypeArray.Length() > 0);
  MOZ_ASSERT(aContentTypeArray.Length() == aUrlArray.Length() &&
             aUrlArray.Length() == aDisplayNameArray.Length() &&
             aDisplayNameArray.Length() == aMessageUriArray.Length());

  uint32_t count = aContentTypeArray.Length();
  mCurIndex = 0;
  mAttachmentArray.Clear();
  mAttachmentArray.SetCapacity(count);

  for (uint32_t u = 0; u < count; ++u) {
    mAttachmentArray.AppendElement(
        msgAttachment(aContentTypeArray[u], aUrlArray[u], aDisplayNameArray[u],
                      aMessageUriArray[u]));
  }

  return NS_OK;
}

nsresult nsAttachmentState::PrepareForAttachmentDelete() {
  // this must be called before any processing
  if (mCurIndex != 0) return NS_ERROR_FAILURE;

  // this prepares the attachment list for use in deletion. In order to prepare,
  // we sort the attachments in numerical ascending order on their part id,
  // remove all duplicates and remove any subparts which will be removed
  // automatically by the removal of the parent.
  //
  // e.g. the attachment list processing (showing only part ids)
  // before: 1.11, 1.3, 1.2, 1.2.1.3, 1.4.1.2
  // sorted: 1.2, 1.2.1.3, 1.3, 1.4.1.2, 1.11
  // after:  1.2, 1.3, 1.4.1.2, 1.11

  // sort
  qsort(mAttachmentArray.Elements(), mAttachmentArray.Length(),
        sizeof(msgAttachment), CompareAttachmentsByPartId);

  // remove duplicates and sub-items
  int nCompare;
  for (uint32_t u = 1; u < mAttachmentArray.Length();) {
    nCompare = ::CompareAttachmentPartId(mAttachmentArray[u - 1].mUrl.get(),
                                         mAttachmentArray[u].mUrl.get());
    if (nCompare == 0 ||
        nCompare == -2)  // [u-1] is the same as or a parent of [u]
    {
      // shuffle the array down (and thus keeping the sorted order)
      mAttachmentArray.RemoveElementAt(u);
    } else {
      ++u;
    }
  }

  return NS_OK;
}

// Static compare callback for sorting.
int nsAttachmentState::CompareAttachmentsByPartId(const void* aLeft,
                                                  const void* aRight) {
  msgAttachment& attachLeft = *((msgAttachment*)aLeft);
  msgAttachment& attachRight = *((msgAttachment*)aRight);
  return ::CompareAttachmentPartId(attachLeft.mUrl.get(),
                                   attachRight.mUrl.get());
}

// ------------------------------------
// Helper class to coordinate deleting attachments from a message.
//
// Implementation notes:
// The basic technique is to use nsIMsgMessageService.streamMessage() to
// stream the message through a streamconverter which is set up to strip
// out the attachments. The result is written out to a temporary file,
// which is then copied over the old message using
// nsIMsgCopyService.copyFileMessage() and the old message deleted with
// nsIMsgFolder.deleteMessages(). Phew.
//
// The nsIStreamListener, nsIUrlListener and nsIMsgCopyServiceListener
// inheritances here are just unfortunately-exposed implementation details.
// And they are a bit of a mess. Some are used multiple times, for different
// phases of the operation. So we use m_state to keep track.
class AttachmentDeleter : public nsIStreamListener,
                          public nsIUrlListener,
                          public nsIMsgCopyServiceListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSISTREAMLISTENER
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSIURLLISTENER
  NS_DECL_NSIMSGCOPYSERVICELISTENER

 public:
  AttachmentDeleter();
  nsresult StartProcessing(nsMessenger* aMessenger, nsIMsgWindow* aMsgWindow,
                           nsAttachmentState* aAttach, bool aSaveFirst);

 public:
  nsAttachmentState* mAttach;                // list of attachments to process
  bool mSaveFirst;                           // detach (true) or delete (false)
  nsCOMPtr<nsIFile> mMsgFile;                // temporary file (processed mail)
  nsCOMPtr<nsIOutputStream> mMsgFileStream;  // temporary file (processed mail)
  nsCOMPtr<nsIMsgMessageService> mMessageService;  // original message service
  nsCOMPtr<nsIMsgDBHdr> mOriginalMessage;          // original message header
  nsCOMPtr<nsIMsgFolder> mMessageFolder;           // original message folder
  nsCOMPtr<nsIMessenger> mMessenger;               // our messenger instance
  nsCOMPtr<nsIMsgWindow> mMsgWindow;               // our UI window
  nsMsgKey mOriginalMessageKey;                    // old message key
  nsMsgKey mNewMessageKey;                         // new message key
  uint32_t mOrigMsgFlags;

  enum {
    eStarting,
    eCopyingNewMsg,
    eUpdatingFolder,  // for IMAP
    eDeletingOldMessage,
    eSelectingNewMessage
  } m_state;
  // temp
  nsTArray<nsCString> mDetachedFileUris;

  // The listener to invoke when the full operation is complete.
  nsCOMPtr<nsIUrlListener> mListener;

 private:
  nsresult InternalStartProcessing(nsMessenger* aMessenger,
                                   nsIMsgWindow* aMsgWindow,
                                   nsAttachmentState* aAttach, bool aSaveFirst);
  nsresult DeleteOriginalMessage();
  virtual ~AttachmentDeleter();
};

//
// nsISupports
//
NS_IMPL_ISUPPORTS(AttachmentDeleter, nsIStreamListener, nsIRequestObserver,
                  nsIUrlListener, nsIMsgCopyServiceListener)

//
// nsIRequestObserver
//
NS_IMETHODIMP
AttachmentDeleter::OnStartRequest(nsIRequest* aRequest) {
  // called when we start processing the StreamMessage request.
  // This is called after OnStartRunningUrl().
  return NS_OK;
}

NS_IMETHODIMP
AttachmentDeleter::OnStopRequest(nsIRequest* aRequest, nsresult aStatusCode) {
  // called when we have completed processing the StreamMessage request.
  // This is called before OnStopRunningUrl(). This means that we have now
  // received all data of the message and we have completed processing.
  // We now start to copy the processed message from the temporary file
  // back into the message store, replacing the original message.

  mMessageFolder->CopyDataDone();
  if (NS_FAILED(aStatusCode)) return aStatusCode;

  // copy the file back into the folder. Note: setting msgToReplace only copies
  // metadata, so we do the delete ourselves
  nsCOMPtr<nsIMsgCopyServiceListener> listenerCopyService;
  nsresult rv = this->QueryInterface(NS_GET_IID(nsIMsgCopyServiceListener),
                                     getter_AddRefs(listenerCopyService));
  NS_ENSURE_SUCCESS(rv, rv);

  mMsgFileStream->Close();
  mMsgFileStream = nullptr;
  mNewMessageKey = nsMsgKey_None;
  nsCOMPtr<nsIMsgCopyService> copyService =
      do_GetService("@mozilla.org/messenger/messagecopyservice;1");
  m_state = eCopyingNewMsg;
  // clone file because nsIFile on Windows caches the wrong file size.
  nsCOMPtr<nsIFile> clone;
  mMsgFile->Clone(getter_AddRefs(clone));
  if (copyService) {
    nsCString originalKeys;
    mOriginalMessage->GetStringProperty("keywords", originalKeys);
    rv = copyService->CopyFileMessage(clone, mMessageFolder, mOriginalMessage,
                                      false, mOrigMsgFlags, originalKeys,
                                      listenerCopyService, mMsgWindow);
  }
  return rv;
}

//
// nsIStreamListener
//

NS_IMETHODIMP
AttachmentDeleter::OnDataAvailable(nsIRequest* aRequest,
                                   nsIInputStream* aInStream,
                                   uint64_t aSrcOffset, uint32_t aCount) {
  if (!mMsgFileStream) return NS_ERROR_NULL_POINTER;
  return mMessageFolder->CopyDataToOutputStreamForAppend(aInStream, aCount,
                                                         mMsgFileStream);
}

//
// nsIUrlListener
//

NS_IMETHODIMP
AttachmentDeleter::OnStartRunningUrl(nsIURI* aUrl) {
  // called when we start processing the StreamMessage request. This is
  // called before OnStartRequest().
  return NS_OK;
}

nsresult AttachmentDeleter::DeleteOriginalMessage() {
  nsCOMPtr<nsIMsgCopyServiceListener> listenerCopyService;
  QueryInterface(NS_GET_IID(nsIMsgCopyServiceListener),
                 getter_AddRefs(listenerCopyService));

  mOriginalMessage->SetUint32Property("attachmentDetached", 1);
  RefPtr<nsIMsgDBHdr> doomed(mOriginalMessage);
  mOriginalMessage = nullptr;
  m_state = eDeletingOldMessage;
  return mMessageFolder->DeleteMessages({doomed},             // messages
                                        mMsgWindow,           // msgWindow
                                        true,                 // deleteStorage
                                        false,                // isMove
                                        listenerCopyService,  // listener
                                        false);               // allowUndo
}

// This is called (potentially) multiple times.
// Firstly, as a result of StreamMessage() (when the message is being passed
// through a streamconverter to strip the attachments).
// Secondly, after the DeleteMessages() call. But maybe not for IMAP?
// Maybe also after CopyFileMessage()? Gah.
NS_IMETHODIMP
AttachmentDeleter::OnStopRunningUrl(nsIURI* aUrl, nsresult aExitCode) {
  nsresult rv = NS_OK;
  if (mOriginalMessage && m_state == eUpdatingFolder) {
    // DeleteOriginalMessage will set m_state eDeletingOldMessage.
    rv = DeleteOriginalMessage();
  }
  return rv;
}

//
// nsIMsgCopyServiceListener
//

NS_IMETHODIMP
AttachmentDeleter::OnStartCopy(void) {
  // never called?
  return NS_OK;
}

NS_IMETHODIMP
AttachmentDeleter::OnProgress(uint32_t aProgress, uint32_t aProgressMax) {
  // never called?
  return NS_OK;
}

NS_IMETHODIMP
AttachmentDeleter::SetMessageKey(nsMsgKey aKey) {
  // called during the copy of the modified message back into the message
  // store to notify us of the message key of the newly created message.
  mNewMessageKey = aKey;

  nsCString folderURI;
  nsresult rv = mMessageFolder->GetURI(folderURI);
  NS_ENSURE_SUCCESS(rv, rv);

  mozilla::JSONStringWriteFunc<nsCString> jsonString;
  mozilla::JSONWriter data(jsonString);
  data.Start();
  data.IntProperty("oldMessageKey", mOriginalMessageKey);
  data.IntProperty("newMessageKey", aKey);
  data.StringProperty("folderURI", folderURI);
  data.End();

  nsCOMPtr<nsIObserverService> obs = services::GetObserverService();
  if (obs) {
    obs->NotifyObservers(nullptr, "attachment-delete-msgkey-changed",
                         NS_ConvertUTF8toUTF16(jsonString.StringCRef()).get());
  }
  return NS_OK;
}

NS_IMETHODIMP
AttachmentDeleter::GetMessageId(nsACString& aMessageId) {
  // never called?
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
AttachmentDeleter::OnStopCopy(nsresult aStatus) {
  // This is called via `CopyFileMessage()` and `DeleteMessages()`.
  // `m_state` tells us which callback it is.
  if (m_state == eDeletingOldMessage) {
    m_state = eSelectingNewMessage;

    // OK... that's it. The entire operation is now done.
    // (there may still be another call to OnStopRunningUrl(), but that'll be
    // a no-op in this state).
    if (mListener) {
      mListener->OnStopRunningUrl(nullptr, aStatus);
    }
    return NS_OK;
  }

  const nsACString& messageUri = mAttach->mAttachmentArray[0].mMessageUri;
  if (mOriginalMessage &&
      !Substring(messageUri, 0, 13).EqualsLiteral("imap-message:")) {
    // For non-IMAP messages, the original is deleted here.
    return DeleteOriginalMessage();
  }

  // For imap, that happens in `OnStopRunningUrl()` which isn't called for
  // pop3 messages.

  // Arrange for the message to be deleted in the next `OnStopRunningUrl()`
  // call.
  m_state = eUpdatingFolder;
  nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(mMessageFolder);
  return imapFolder->UpdateFolderWithListener(nullptr, this);
}

//
// local methods
//

AttachmentDeleter::AttachmentDeleter()
    : mAttach(nullptr),
      mSaveFirst(false),
      mOriginalMessageKey(nsMsgKey_None),
      mNewMessageKey(nsMsgKey_None),
      mOrigMsgFlags(0),
      m_state(eStarting) {}

AttachmentDeleter::~AttachmentDeleter() {
  if (mAttach) {
    delete mAttach;
  }
  if (mMsgFileStream) {
    mMsgFileStream->Close();
    mMsgFileStream = nullptr;
  }
  if (mMsgFile) {
    mMsgFile->Remove(false);
  }
}

nsresult AttachmentDeleter::StartProcessing(nsMessenger* aMessenger,
                                            nsIMsgWindow* aMsgWindow,
                                            nsAttachmentState* aAttach,
                                            bool detaching) {
  if (mListener) {
    mListener->OnStartRunningUrl(nullptr);
  }

  nsresult rv =
      InternalStartProcessing(aMessenger, aMsgWindow, aAttach, detaching);
  if (NS_FAILED(rv)) {
    if (mListener) {
      mListener->OnStopRunningUrl(nullptr, rv);
    }
  }
  return rv;
}

nsresult AttachmentDeleter::InternalStartProcessing(nsMessenger* aMessenger,
                                                    nsIMsgWindow* aMsgWindow,
                                                    nsAttachmentState* aAttach,
                                                    bool detaching) {
  aMessenger->QueryInterface(NS_GET_IID(nsIMessenger),
                             getter_AddRefs(mMessenger));
  mMsgWindow = aMsgWindow;
  mAttach = aAttach;

  nsresult rv;

  // all attachments refer to the same message
  const nsCString& messageUri = mAttach->mAttachmentArray[0].mMessageUri;

  // get the message service, original message and folder for this message
  rv = GetMessageServiceFromURI(messageUri, getter_AddRefs(mMessageService));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mMessageService->MessageURIToMsgHdr(messageUri,
                                           getter_AddRefs(mOriginalMessage));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mOriginalMessage->GetMessageKey(&mOriginalMessageKey);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = mOriginalMessage->GetFolder(getter_AddRefs(mMessageFolder));
  NS_ENSURE_SUCCESS(rv, rv);
  mOriginalMessage->GetFlags(&mOrigMsgFlags);

  // ensure that we can store and delete messages in this folder, if we
  // can't then we can't do attachment deleting
  bool canDelete = false;
  mMessageFolder->GetCanDeleteMessages(&canDelete);
  bool canFile = false;
  mMessageFolder->GetCanFileMessages(&canFile);
  if (!canDelete || !canFile) return NS_ERROR_FAILURE;

  // create an output stream on a temporary file. This stream will save the
  // modified message data to a file which we will later use to replace the
  // existing message. The file is removed in the destructor.
  rv = GetSpecialDirectoryWithFileName(NS_OS_TEMP_DIR, "nsmail.tmp",
                                       getter_AddRefs(mMsgFile));
  NS_ENSURE_SUCCESS(rv, rv);

  // For temp file, we should use restrictive 00600 instead of
  // ATTACHMENT_PERMISSION
  rv = mMsgFile->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 00600);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = MsgNewBufferedFileOutputStream(getter_AddRefs(mMsgFileStream), mMsgFile,
                                      -1, ATTACHMENT_PERMISSION);

  // Create the additional header for data conversion. This will tell the stream
  // converter which MIME emitter we want to use, and it will tell the MIME
  // emitter which attachments should be deleted.
  // It also supplies the path of the already-saved attachments, so that
  // path can be noted in the message, where those attachements are removed.
  // The X-Mozilla-External-Attachment-URL header will be added, with the
  // location of the saved attachment.
  const char* partId;
  const char* nextField;
  nsAutoCString sHeader("attach&del=");
  nsAutoCString detachToHeader("&detachTo=");
  for (uint32_t u = 0; u < mAttach->mAttachmentArray.Length(); ++u) {
    if (u > 0) {
      sHeader.Append(',');
      if (detaching) detachToHeader.Append(',');
    }
    partId = GetAttachmentPartId(mAttach->mAttachmentArray[u].mUrl.get());
    if (partId) {
      nextField = PL_strchr(partId, '&');
      sHeader.Append(partId, nextField ? nextField - partId : -1);
    }
    if (detaching) {
      // The URI can contain commas, so percent-encode those first.
      nsAutoCString uri(mDetachedFileUris[u]);
      int ind = uri.FindChar(',');
      while (ind != kNotFound) {
        uri.Replace(ind, 1, "%2C");
        ind = uri.FindChar(',');
      }
      detachToHeader.Append(uri);
    }
  }

  if (detaching) sHeader.Append(detachToHeader);
  // stream this message to our listener converting it via the attachment mime
  // converter. The listener will just write the converted message straight to
  // disk.
  nsCOMPtr<nsISupports> listenerSupports;
  rv = this->QueryInterface(NS_GET_IID(nsISupports),
                            getter_AddRefs(listenerSupports));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIUrlListener> listenerUrlListener =
      do_QueryInterface(listenerSupports, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURI> dummyNull;
  rv = mMessageService->StreamMessage(messageUri, this, mMsgWindow,
                                      listenerUrlListener, true, sHeader, false,
                                      getter_AddRefs(dummyNull));
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

// ------------------------------------

NS_IMETHODIMP
nsMessenger::DetachAttachment(const nsACString& aContentType,
                              const nsACString& aURL,
                              const nsACString& aDisplayName,
                              const nsACString& aMessageUri, bool aSaveFirst,
                              bool withoutWarning = false) {
  if (aSaveFirst)
    return SaveOneAttachment(aContentType, aURL, aDisplayName, aMessageUri,
                             true);
  AutoTArray<nsCString, 1> contentTypeArray = {
      PromiseFlatCString(aContentType)};
  AutoTArray<nsCString, 1> urlArray = {PromiseFlatCString(aURL)};
  AutoTArray<nsCString, 1> displayNameArray = {
      PromiseFlatCString(aDisplayName)};
  AutoTArray<nsCString, 1> messageUriArray = {PromiseFlatCString(aMessageUri)};
  return DetachAttachments(contentTypeArray, urlArray, displayNameArray,
                           messageUriArray, nullptr, nullptr, withoutWarning);
}

NS_IMETHODIMP
nsMessenger::DetachAllAttachments(const nsTArray<nsCString>& aContentTypeArray,
                                  const nsTArray<nsCString>& aUrlArray,
                                  const nsTArray<nsCString>& aDisplayNameArray,
                                  const nsTArray<nsCString>& aMessageUriArray,
                                  bool aSaveFirst, bool withoutWarning = false,
                                  nsIUrlListener* aListener = nullptr) {
  NS_ENSURE_ARG_MIN(aContentTypeArray.Length(), 1);
  MOZ_ASSERT(aContentTypeArray.Length() == aUrlArray.Length() &&
             aUrlArray.Length() == aDisplayNameArray.Length() &&
             aDisplayNameArray.Length() == aMessageUriArray.Length());

  if (aSaveFirst)
    return SaveAllAttachments(aContentTypeArray, aUrlArray, aDisplayNameArray,
                              aMessageUriArray, true, aListener);
  else
    return DetachAttachments(aContentTypeArray, aUrlArray, aDisplayNameArray,
                             aMessageUriArray, nullptr, aListener,
                             withoutWarning);
}

nsresult nsMessenger::DetachAttachments(
    const nsTArray<nsCString>& aContentTypeArray,
    const nsTArray<nsCString>& aUrlArray,
    const nsTArray<nsCString>& aDisplayNameArray,
    const nsTArray<nsCString>& aMessageUriArray,
    nsTArray<nsCString>* saveFileUris, nsIUrlListener* aListener,
    bool withoutWarning) {
  // if withoutWarning no dialog for user
  if (!withoutWarning && NS_FAILED(PromptIfDeleteAttachments(
                             saveFileUris != nullptr, aDisplayNameArray)))
    return NS_OK;

  nsresult rv = NS_OK;

  // ensure that our arguments are valid
  //  char * partId;
  for (uint32_t u = 0; u < aContentTypeArray.Length(); ++u) {
    // ensure all of the message URI are the same, we cannot process
    // attachments from different messages
    if (u > 0 && aMessageUriArray[0] != aMessageUriArray[u]) {
      rv = NS_ERROR_INVALID_ARG;
      break;
    }

    // ensure that we don't have deleted messages in this list
    if (aContentTypeArray[u].EqualsLiteral(MIMETYPE_DELETED)) {
      rv = NS_ERROR_INVALID_ARG;
      break;
    }

    // for the moment we prevent any attachments other than root level
    // attachments being deleted (i.e. you can't delete attachments from a
    // email forwarded as an attachment). We do this by ensuring that the
    // part id only has a single period in it (e.g. "1.2").
    // TODO: support non-root level attachment delete
    //    partId = ::GetAttachmentPartId(aUrlArray[u]);
    //    if (!partId || PL_strchr(partId, '.') != PL_strrchr(partId, '.'))
    //    {
    //      rv = NS_ERROR_INVALID_ARG;
    //      break;
    //    }
  }
  if (NS_FAILED(rv)) {
    Alert("deleteAttachmentFailure");
    return rv;
  }

  // TODO: ensure that nothing else is processing this message uri at the same
  // time

  // TODO: if any of the selected attachments are messages that contain other
  // attachments we need to warn the user that all sub-attachments of those
  // messages will also be deleted. Best to display a list of them.

  RefPtr<AttachmentDeleter> deleter = new AttachmentDeleter;
  deleter->mListener = aListener;
  if (saveFileUris) {
    deleter->mDetachedFileUris = saveFileUris->Clone();
  }
  // create the attachments for use by the deleter
  nsAttachmentState* attach = new nsAttachmentState;
  rv = attach->Init(aContentTypeArray, aUrlArray, aDisplayNameArray,
                    aMessageUriArray);
  if (NS_SUCCEEDED(rv)) rv = attach->PrepareForAttachmentDelete();
  if (NS_FAILED(rv)) {
    delete attach;
    return rv;
  }

  // initialize our deleter with the attachments and details. The deleter
  // takes ownership of 'attach' immediately irrespective of the return value
  // (error or not).
  return deleter->StartProcessing(this, mMsgWindow, attach,
                                  saveFileUris != nullptr);
}

nsresult nsMessenger::PromptIfDeleteAttachments(
    bool aSaveFirst, const nsTArray<nsCString>& aDisplayNameArray) {
  nsresult rv = NS_ERROR_FAILURE;

  nsCOMPtr<nsIPrompt> dialog(do_GetInterface(mDocShell));
  if (!dialog) return rv;

  if (!mStringBundle) {
    rv = InitStringBundle();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // create the list of attachments we are removing
  nsString displayString;
  nsString attachmentList;
  for (uint32_t u = 0; u < aDisplayNameArray.Length(); ++u) {
    ConvertAndSanitizeFileName(aDisplayNameArray[u], displayString);
    attachmentList.Append(displayString);
    attachmentList.Append(char16_t('\n'));
  }
  AutoTArray<nsString, 1> formatStrings = {attachmentList};

  // format the message and display
  nsString promptMessage;
  const char* propertyName =
      aSaveFirst ? "detachAttachments" : "deleteAttachments";
  rv = mStringBundle->FormatStringFromName(propertyName, formatStrings,
                                           promptMessage);
  NS_ENSURE_SUCCESS(rv, rv);

  bool dialogResult = false;
  rv = dialog->Confirm(nullptr, promptMessage.get(), &dialogResult);
  NS_ENSURE_SUCCESS(rv, rv);

  return dialogResult ? NS_OK : NS_ERROR_FAILURE;
}
