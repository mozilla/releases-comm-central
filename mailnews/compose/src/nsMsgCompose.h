/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgCompose_H_
#define _nsMsgCompose_H_

#include "nsIMsgCompose.h"
#include "nsCOMArray.h"
#include "nsTObserverArray.h"
#include "nsWeakReference.h"
#include "nsMsgCompFields.h"
#include "nsIOutputStream.h"
#include "nsIMsgQuote.h"
#include "nsIMsgCopyServiceListener.h"
#include "nsIBaseWindow.h"
#include "nsIAbDirectory.h"
#include "nsIWebProgressListener.h"
#include "nsIMimeConverter.h"
#include "nsIMsgFolder.h"
#include "mozIDOMWindow.h"
#include "mozilla/dom/Element.h"

// Forward declares
class QuotingOutputStreamListener;
class nsMsgComposeSendListener;
class nsIEditor;
class nsIArray;
struct nsMsgMailList;

class nsMsgCompose : public nsIMsgCompose, public nsSupportsWeakReference {
 public:
  nsMsgCompose();

  /* this macro defines QueryInterface, AddRef and Release for this class */
  NS_DECL_THREADSAFE_ISUPPORTS

  /*** nsIMsgCompose pure virtual functions */
  NS_DECL_NSIMSGCOMPOSE

  /* nsIMsgSendListener interface */
  NS_DECL_NSIMSGSENDLISTENER

 protected:
  virtual ~nsMsgCompose();

  // Deal with quoting issues...
  nsresult QuoteOriginalMessage();  // New template
  nsresult SetQuotingToFollow(bool aVal);
  nsresult ConvertHTMLToText(nsIFile* aSigFile, nsString& aSigData);
  nsresult ConvertTextToHTML(nsIFile* aSigFile, nsString& aSigData);
  bool IsEmbeddedObjectSafe(const char* originalScheme,
                            const char* originalHost, const char* originalPath,
                            mozilla::dom::Element* element);
  nsresult TagEmbeddedObjects(nsIEditor* aEditor);

  nsCString mOriginalMsgURI;  // used so we can mark message disposition flags
                              // after we send the message

  int32_t mWhatHolder;

  nsresult LoadDataFromFile(nsIFile* file, nsString& sigData,
                            bool aAllowUTF8 = true, bool aAllowUTF16 = true);

  bool CheckIncludeSignaturePrefs(nsIMsgIdentity* identity);
  // m_folderName to store the value of the saved drafts folder.
  nsCString m_folderName;
  MOZ_CAN_RUN_SCRIPT void InsertDivWrappedTextAtSelection(
      const nsAString& aText, const nsAString& classStr);

 protected:
  nsresult CreateMessage(const nsACString& originalMsgURI, MSG_ComposeType type,
                         nsIMsgCompFields* compFields);
  void CleanUpRecipients(nsString& recipients);
  nsresult GetABDirAndMailLists(const nsACString& aDirUri,
                                nsCOMArray<nsIAbDirectory>& aDirArray,
                                nsTArray<nsMsgMailList>& aMailListArray);
  nsresult ResolveMailList(nsIAbDirectory* aMailList,
                           nsCOMArray<nsIAbDirectory>& allDirectoriesArray,
                           nsTArray<nsMsgMailList>& allMailListArray,
                           nsTArray<nsMsgMailList>& mailListResolved,
                           nsTArray<nsMsgRecipient>& aListMembers);
  void TagConvertible(mozilla::dom::Element* node, int32_t* _retval);
  MOZ_CAN_RUN_SCRIPT nsresult MoveToAboveQuote(void);
  MOZ_CAN_RUN_SCRIPT nsresult MoveToBeginningOfDocument(void);
  MOZ_CAN_RUN_SCRIPT nsresult MoveToEndOfDocument(void);
  nsresult ReplaceFileURLs(nsString& sigData);
  nsresult DataURLForFileURL(const nsAString& aFileURL, nsAString& aDataURL);

  /**
   * Given an nsIFile, attempts to read it into aString.
   *
   * Note: Use sparingly! This causes main-thread I/O, which causes jank and all
   * other bad things.
   */
  static nsresult SlurpFileToString(nsIFile* aFile, nsACString& aString);

// 3 = To, Cc, Bcc
#define MAX_OF_RECIPIENT_ARRAY 3
  typedef nsTArray<nsMsgRecipient> RecipientsArray[MAX_OF_RECIPIENT_ARRAY];
  /**
   * This method parses the compose fields and associates email addresses with
   * the relevant cards from the address books.
   */
  nsresult LookupAddressBook(RecipientsArray& recipientList);
  bool IsLastWindow();

  // Helper function. Parameters are not checked.
  bool mConvertStructs;  // for TagConvertible

  nsCOMPtr<nsIEditor> m_editor;
  mozIDOMWindowProxy* m_window;
  nsCOMPtr<nsIDocShell> mDocShell;
  nsCOMPtr<nsIBaseWindow> m_baseWindow;
  RefPtr<nsMsgCompFields> m_compFields;
  nsCOMPtr<nsIMsgIdentity> m_identity;
  bool m_composeHTML;
  RefPtr<QuotingOutputStreamListener> mQuoteStreamListener;
  nsCOMPtr<nsIOutputStream> mBaseStream;

  nsCOMPtr<nsIMsgSend> mMsgSend;  // for composition back end
  nsCOMPtr<nsIMsgProgress>
      mProgress;  // use by the back end to report progress to the front end

  // Deal with quoting issues...
  nsString mCiteReference;
  nsCOMPtr<nsIMsgQuote> mQuote;
  bool mQuotingToFollow;  // Quoting indicator
  MSG_ComposeType mType;  // Message type
  bool mAutodetectCharset;
  bool mDeleteDraft;
  nsMsgDispositionState mDraftDisposition;
  nsCOMPtr<nsIMsgDBHdr> mOrigMsgHdr;

  nsString mSmtpPassword;
  nsCString mHtmlToQuote;

  nsTObserverArray<nsCOMPtr<nsIMsgComposeStateListener> > mStateListeners;
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener> > mExternalSendListeners;

  bool mAllowRemoteContent;
  MSG_DeliverMode mDeliverMode;  // nsIMsgCompDeliverMode long.

  friend class QuotingOutputStreamListener;
  friend class nsMsgComposeSendListener;

 private:
  void DeleteTmpAttachments();
  bool mTmpAttachmentsDeleted;
};

////////////////////////////////////////////////////////////////////////////////////
// THIS IS THE CLASS THAT IS THE STREAM Listener OF THE HTML OUTPUT
// FROM LIBMIME. THIS IS FOR QUOTING
////////////////////////////////////////////////////////////////////////////////////
class QuotingOutputStreamListener : public nsIMsgQuotingOutputStreamListener,
                                    public nsSupportsWeakReference {
 public:
  QuotingOutputStreamListener(nsIMsgDBHdr* origMsgHdr, bool quoteHeaders,
                              bool headersOnly, nsIMsgIdentity* identity,
                              nsIMsgQuote* msgQuote, bool quoteOriginal,
                              const nsACString& htmlToQuote);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER
  NS_DECL_NSIMSGQUOTINGOUTPUTSTREAMLISTENER

  nsresult SetComposeObj(nsIMsgCompose* obj);
  nsresult ConvertToPlainText(bool formatflowed, bool formatted,
                              bool disallowBreaks);
  MOZ_CAN_RUN_SCRIPT nsresult InsertToCompose(nsIEditor* aEditor,
                                              bool aHTMLEditor);
  nsresult AppendToMsgBody(const nsCString& inStr);

 private:
  virtual ~QuotingOutputStreamListener();
  nsWeakPtr mWeakComposeObj;
  nsString mMsgBody;
  nsString mCitePrefix;
  nsString mSignature;
  bool mQuoteHeaders;
  bool mHeadersOnly;
  nsCOMPtr<nsIMsgQuote> mQuote;
  nsCOMPtr<nsIMimeHeaders> mHeaders;
  nsCOMPtr<nsIMsgIdentity> mIdentity;
  nsCOMPtr<nsIMsgDBHdr> mOrigMsgHdr;
  nsString mCiteReference;
  nsCOMPtr<nsIMimeConverter> mMimeConverter;
  int32_t mUnicodeBufferCharacterLength;
  bool mQuoteOriginal;
  nsCString mHtmlToQuote;
};

////////////////////////////////////////////////////////////////////////////////////
// This is the listener class for the send operation. We have to create this
// class to listen for message send completion and eventually notify the caller
////////////////////////////////////////////////////////////////////////////////////
class nsMsgComposeSendListener : public nsIMsgComposeSendListener,
                                 public nsIMsgSendListener,
                                 public nsIMsgCopyServiceListener,
                                 public nsIWebProgressListener {
 public:
  nsMsgComposeSendListener(void);

  // nsISupports interface
  NS_DECL_ISUPPORTS

  // nsIMsgComposeSendListener interface
  NS_DECL_NSIMSGCOMPOSESENDLISTENER

  // nsIMsgSendListener interface
  NS_DECL_NSIMSGSENDLISTENER

  // nsIMsgCopyServiceListener interface
  NS_DECL_NSIMSGCOPYSERVICELISTENER

  // nsIWebProgressListener interface
  NS_DECL_NSIWEBPROGRESSLISTENER

  nsresult RemoveDraftOrTemplate(nsIMsgCompose* compObj, nsCString msgURI,
                                 bool isSaveTemplate);
  nsresult RemoveCurrentDraftMessage(nsIMsgCompose* compObj, bool calledByCopy,
                                     bool isSaveTemplate);
  nsresult GetMsgFolder(nsIMsgCompose* compObj, nsIMsgFolder** msgFolder);

 private:
  virtual ~nsMsgComposeSendListener();
  nsWeakPtr mWeakComposeObj;
  MSG_DeliverMode mDeliverMode;
};

/******************************************************************************
 * nsMsgMailList
 ******************************************************************************/
struct nsMsgMailList {
  explicit nsMsgMailList(nsIAbDirectory* directory);

  nsString mName;
  nsString mDescription;
  nsCOMPtr<nsIAbDirectory> mDirectory;
};

#endif /* _nsMsgCompose_H_ */
