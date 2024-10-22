/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgCompose.h"
#include "MailNewsTypes.h"
#include "mozilla/dom/Document.h"
#include "nsPIDOMWindow.h"
#include "mozIDOMWindow.h"
#include "nsIMsgMessageService.h"
#include "nsISelectionController.h"
#include "nsMsgI18N.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIDocumentEncoder.h"  // for editor output flags
#include "nsMsgCompUtils.h"
#include "nsComposeStrings.h"
#include "nsIMsgSend.h"
#include "nsMailHeaders.h"
#include "nsMsgPrompts.h"
#include "nsMimeTypes.h"
#include "mozilla/Encoding.h"
#include "nsIHTMLEditor.h"
#include "nsIEditor.h"
#include "plstr.h"
#include "prmem.h"
#include "nsIDocShell.h"
#include "nsCExternalHandlerService.h"
#include "nsIMIMEService.h"
#include "nsIDocShellTreeItem.h"
#include "nsIDocShellTreeOwner.h"
#include "nsIWindowMediator.h"
#include "mozilla/intl/AppDateTimeFormat.h"
#include "nsIMsgComposeService.h"
#include "nsIMsgComposeProgressParams.h"
#include "nsMsgUtils.h"
#include "nsIMsgImapMailFolder.h"
#include "nsImapCore.h"
#include "nsUnicharUtils.h"
#include "nsNetUtil.h"
#include "nsIDocumentViewer.h"
#include "nsIMsgMdnGenerator.h"
#include "plbase64.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgAttachment.h"
#include "nsIMsgProgress.h"
#include "nsMsgFolderFlags.h"
#include "nsMsgMessageFlags.h"
#include "nsIMsgDatabase.h"
#include "nsArrayUtils.h"
#include "nsIMsgWindow.h"
#include "nsITextToSubURI.h"
#include "nsIAbManager.h"
#include "nsCRT.h"
#include "mozilla/HTMLEditor.h"
#include "mozilla/Components.h"
#include "mozilla/Services.h"
#include "mozilla/mailnews/MimeHeaderParser.h"
#include "mozilla/Preferences.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/glean/GleanMetrics.h"
#include "mozilla/dom/HTMLAnchorElement.h"
#include "mozilla/dom/HTMLImageElement.h"
#include "mozilla/dom/Selection.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/dom/Promise-inl.h"  // IWYU pragma: keep
#include "mozilla/Utf8.h"
#include "nsStreamConverter.h"
#include "nsIObserverService.h"
#include "nsIProtocolHandler.h"
#include "nsContentUtils.h"
#include "nsStreamUtils.h"
#include "nsIFileURL.h"
#include "nsTextNode.h"  // from dom/base
#include "nsIParserUtils.h"
#include "nsIStringBundle.h"

using namespace mozilla;
using namespace mozilla::dom;
using namespace mozilla::mailnews;

LazyLogModule Compose("Compose");

static nsresult GetReplyHeaderInfo(int32_t* reply_header_type,
                                   nsString& reply_header_authorwrote,
                                   nsString& reply_header_ondateauthorwrote,
                                   nsString& reply_header_authorwroteondate,
                                   nsString& reply_header_originalmessage) {
  nsresult rv;
  *reply_header_type = 0;
  nsCOMPtr<nsIPrefBranch> prefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  // If fetching any of the preferences fails,
  // we return early with header_type = 0 meaning "no header".
  rv = NS_GetLocalizedUnicharPreference(
      prefBranch, "mailnews.reply_header_authorwrotesingle",
      reply_header_authorwrote);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = NS_GetLocalizedUnicharPreference(
      prefBranch, "mailnews.reply_header_ondateauthorwrote",
      reply_header_ondateauthorwrote);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = NS_GetLocalizedUnicharPreference(
      prefBranch, "mailnews.reply_header_authorwroteondate",
      reply_header_authorwroteondate);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = NS_GetLocalizedUnicharPreference(prefBranch,
                                        "mailnews.reply_header_originalmessage",
                                        reply_header_originalmessage);
  NS_ENSURE_SUCCESS(rv, rv);

  return prefBranch->GetIntPref("mailnews.reply_header_type",
                                reply_header_type);
}

static void TranslateLineEnding(nsString& data) {
  char16_t* rPtr;  // Read pointer
  char16_t* wPtr;  // Write pointer
  char16_t* sPtr;  // Start data pointer
  char16_t* ePtr;  // End data pointer

  rPtr = wPtr = sPtr = data.BeginWriting();
  ePtr = rPtr + data.Length();

  while (rPtr < ePtr) {
    if (*rPtr == nsCRT::CR) {
      *wPtr = nsCRT::LF;
      if (rPtr + 1 < ePtr && *(rPtr + 1) == nsCRT::LF) rPtr++;
    } else
      *wPtr = *rPtr;

    rPtr++;
    wPtr++;
  }

  data.SetLength(wPtr - sPtr);
}

nsMsgCompose::nsMsgCompose() {
  mQuotingToFollow = false;
  mAllowRemoteContent = false;
  mWhatHolder = 1;
  m_window = nullptr;
  m_editor = nullptr;
  mQuoteStreamListener = nullptr;
  mAutodetectCharset = false;
  mDeleteDraft = false;
  m_compFields =
      nullptr;  // m_compFields will be set during nsMsgCompose::Initialize
  mType = nsIMsgCompType::New;

  // For TagConvertible
  // Read and cache pref
  mConvertStructs = false;
  nsCOMPtr<nsIPrefBranch> prefBranch(do_GetService(NS_PREFSERVICE_CONTRACTID));
  if (prefBranch)
    prefBranch->GetBoolPref("converter.html2txt.structs", &mConvertStructs);

  m_composeHTML = false;

  mTmpAttachmentsDeleted = false;
  mDraftDisposition = nsIMsgFolder::nsMsgDispositionState_None;
  mDeliverMode = 0;
}

nsMsgCompose::~nsMsgCompose() {
  MOZ_LOG(Compose, LogLevel::Debug, ("~nsMsgCompose()"));
  if (!m_compFields) {
    // Uhoh. We're in an uninitialized state. Maybe initialize() failed, or
    // was never even called.
    return;
  }
  m_window = nullptr;
  if (!mMsgSend) {
    // This dtor can be called before mMsgSend->CreateAndSendMessage returns,
    // tmp attachments are needed to create the message, so don't delete them.
    DeleteTmpAttachments();
  }
}

/* the following macro actually implement addref, release and query interface
 * for our component. */
NS_IMPL_ISUPPORTS(nsMsgCompose, nsIMsgCompose, nsIMsgSendListener,
                  nsISupportsWeakReference)

//
// Once we are here, convert the data which we know to be UTF-8 to UTF-16
// for insertion into the editor
//
nsresult GetChildOffset(nsINode* aChild, nsINode* aParent, int32_t& aOffset) {
  NS_ASSERTION((aChild && aParent), "bad args");

  if (!aChild || !aParent) return NS_ERROR_NULL_POINTER;

  nsINodeList* childNodes = aParent->ChildNodes();
  for (uint32_t i = 0; i < childNodes->Length(); i++) {
    nsINode* childNode = childNodes->Item(i);
    if (childNode == aChild) {
      aOffset = i;
      return NS_OK;
    }
  }

  return NS_ERROR_NULL_POINTER;
}

nsresult GetNodeLocation(nsINode* inChild, nsCOMPtr<nsINode>* outParent,
                         int32_t* outOffset) {
  NS_ASSERTION((outParent && outOffset), "bad args");
  nsresult result = NS_ERROR_NULL_POINTER;
  if (inChild && outParent && outOffset) {
    nsCOMPtr<nsINode> inChild2 = inChild;
    *outParent = inChild2->GetParentNode();
    if (*outParent) {
      result = GetChildOffset(inChild2, *outParent, *outOffset);
    }
  }

  return result;
}

bool nsMsgCompose::IsEmbeddedObjectSafe(const char* originalScheme,
                                        const char* originalHost,
                                        const char* originalPath,
                                        Element* element) {
  nsresult rv;

  nsAutoCString objURL;

  if (!originalScheme || !originalPath)  // Having a null host is OK.
    return false;

  RefPtr<HTMLImageElement> image = HTMLImageElement::FromNode(element);
  RefPtr<HTMLAnchorElement> anchor = HTMLAnchorElement::FromNode(element);

  if (image) {
    nsAutoString src;
    image->GetSrc(src);
    objURL = NS_ConvertUTF16toUTF8(src);
  } else if (anchor) {
    anchor->GetHref(objURL);
  } else {
    return false;
  }

  if (!objURL.IsEmpty()) {
    nsCOMPtr<nsIURI> uri;
    rv = NS_NewURI(getter_AddRefs(uri), objURL);
    if (NS_SUCCEEDED(rv) && uri) {
      nsAutoCString scheme;
      rv = uri->GetScheme(scheme);
      if (NS_SUCCEEDED(rv) &&
          scheme.Equals(originalScheme, nsCaseInsensitiveCStringComparator)) {
        nsAutoCString host;
        rv = uri->GetAsciiHost(host);
        // mailbox url don't have a host therefore don't be too strict.
        if (NS_SUCCEEDED(rv) &&
            (host.IsEmpty() || originalHost ||
             host.Equals(originalHost, nsCaseInsensitiveCStringComparator))) {
          nsAutoCString path;
          rv = uri->GetPathQueryRef(path);
          if (NS_SUCCEEDED(rv)) {
            nsAutoCString orgPath(originalPath);
            MsgRemoveQueryPart(orgPath);
            MsgRemoveQueryPart(path);
            // mailbox: and JS Account URLs have a message number in
            // the query part of "path query ref". We removed this so
            // we're not comparing down to the message but down to the folder.
            // Code in the frontend (in the "error" event listener in
            // MsgComposeCommands.js that deals with unblocking images) will
            // prompt if a part of another message is referenced.
            // A saved message opened for reply or forwarding has a
            // mailbox: URL.
            // imap: URLs don't have the message number in the query, so we do
            // compare it here.
            // news: URLs use group and key in the query, but it's OK to compare
            // without them.
            return path.Equals(orgPath, nsCaseInsensitiveCStringComparator);
          }
        }
      }
    }
  }

  return false;
}

/* The purpose of this function is to mark any embedded object that wasn't a
   RFC822 part of the original message as moz-do-not-send. That will prevent us
   to attach data not specified by the user or not present in the original
   message.
*/
nsresult nsMsgCompose::TagEmbeddedObjects(nsIEditor* aEditor) {
  nsresult rv = NS_OK;
  uint32_t count;
  uint32_t i;

  if (!aEditor) return NS_ERROR_FAILURE;

  nsCOMPtr<Document> document;
  aEditor->GetDocument(getter_AddRefs(document));
  if (!document) return NS_ERROR_FAILURE;
  nsCOMPtr<nsIArray> aNodeList = GetEmbeddedObjects(document);
  if (!aNodeList) return NS_ERROR_FAILURE;

  if (NS_FAILED(aNodeList->GetLength(&count))) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIURI> originalUrl;
  nsCString originalScheme;
  nsCString originalHost;
  nsCString originalPath;

  // first, convert the rdf original msg uri into a url that represents the
  // message...
  nsCOMPtr<nsIMsgMessageService> msgService;
  rv = GetMessageServiceFromURI(mOriginalMsgURI, getter_AddRefs(msgService));
  if (NS_SUCCEEDED(rv)) {
    rv = msgService->GetUrlForUri(mOriginalMsgURI, nullptr,
                                  getter_AddRefs(originalUrl));
    if (NS_SUCCEEDED(rv) && originalUrl) {
      originalUrl->GetScheme(originalScheme);
      originalUrl->GetAsciiHost(originalHost);
      originalUrl->GetPathQueryRef(originalPath);
    }
  }

  // Then compare the url of each embedded objects with the original message.
  // If they a not coming from the original message, they should not be sent
  // with the message.
  for (i = 0; i < count; i++) {
    nsCOMPtr<Element> domElement = do_QueryElementAt(aNodeList, i);
    if (!domElement) continue;
    if (IsEmbeddedObjectSafe(originalScheme.get(), originalHost.get(),
                             originalPath.get(), domElement))
      continue;  // Don't need to tag this object, it's safe to send it.

    // The source of this object should not be sent with the message.
    IgnoredErrorResult rv2;
    domElement->SetAttribute(u"moz-do-not-send"_ns, u"true"_ns, rv2);
  }

  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::GetAllowRemoteContent(bool* aAllowRemoteContent) {
  NS_ENSURE_ARG_POINTER(aAllowRemoteContent);
  *aAllowRemoteContent = mAllowRemoteContent;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::SetAllowRemoteContent(bool aAllowRemoteContent) {
  mAllowRemoteContent = aAllowRemoteContent;
  return NS_OK;
}

void nsMsgCompose::InsertDivWrappedTextAtSelection(const nsAString& aText,
                                                   const nsAString& classStr) {
  NS_ASSERTION(m_editor,
               "InsertDivWrappedTextAtSelection called, but no editor exists");
  if (!m_editor) return;

  RefPtr<Element> divElem;
  nsCOMPtr<nsIHTMLEditor> htmlEditor(do_QueryInterface(m_editor));

  nsresult rv =
      htmlEditor->CreateElementWithDefaults(u"div"_ns, getter_AddRefs(divElem));

  NS_ENSURE_SUCCESS_VOID(rv);

  // We need the document
  nsCOMPtr<Document> doc;
  rv = m_editor->GetDocument(getter_AddRefs(doc));
  NS_ENSURE_SUCCESS_VOID(rv);

  // Break up the text by newlines, and then insert text nodes followed
  // by <br> nodes.
  int32_t start = 0;
  int32_t end = aText.Length();

  for (;;) {
    int32_t delimiter = aText.FindChar('\n', start);
    if (delimiter == kNotFound) delimiter = end;

    RefPtr<nsTextNode> textNode =
        doc->CreateTextNode(Substring(aText, start, delimiter - start));

    IgnoredErrorResult rv2;
    divElem->AppendChild(*textNode, rv2);
    if (rv2.Failed()) {
      return;
    }

    // Now create and insert a BR
    RefPtr<Element> brElem;
    rv =
        htmlEditor->CreateElementWithDefaults(u"br"_ns, getter_AddRefs(brElem));
    NS_ENSURE_SUCCESS_VOID(rv);
    divElem->AppendChild(*brElem, rv2);
    if (rv2.Failed()) {
      return;
    }

    if (delimiter == end) break;
    start = ++delimiter;
    if (start == end) break;
  }

  htmlEditor->InsertElementAtSelection(divElem, true);
  nsCOMPtr<nsINode> parent;
  int32_t offset;

  rv = GetNodeLocation(divElem, address_of(parent), &offset);
  if (NS_SUCCEEDED(rv)) {
    RefPtr<Selection> selection;
    m_editor->GetSelection(getter_AddRefs(selection));

    if (selection) selection->CollapseInLimiter(parent, offset + 1);
  }
  if (divElem) {
    RefPtr<Element> divElem2 = divElem;
    IgnoredErrorResult rv2;
    divElem2->SetAttribute(u"class"_ns, classStr, rv2);
  }
}

/*
 * The following function replaces <plaintext> tags with <x-plaintext>.
 * <plaintext> is a funny beast: It leads to everything following it
 * being displayed verbatim, even a </plaintext> tag is ignored.
 */
static void remove_plaintext_tag(nsString& body) {
  // Replace all <plaintext> and </plaintext> tags.
  int32_t index = 0;
  bool replaced = false;
  while ((index = body.LowerCaseFindASCII("<plaintext", index)) != kNotFound) {
    body.Insert(u"x-", index + 1);
    index += 12;
    replaced = true;
  }
  if (replaced) {
    index = 0;
    while ((index = body.LowerCaseFindASCII("</plaintext", index)) !=
           kNotFound) {
      body.Insert(u"x-", index + 2);
      index += 13;
    }
  }
}

static void remove_conditional_CSS(const nsAString& in, nsAString& out) {
  nsCOMPtr<nsIParserUtils> parserUtils =
      do_GetService(NS_PARSERUTILS_CONTRACTID);
  parserUtils->RemoveConditionalCSS(in, out);
}

MOZ_CAN_RUN_SCRIPT_BOUNDARY NS_IMETHODIMP
nsMsgCompose::ConvertAndLoadComposeWindow(nsString& aPrefix, nsString& aBuf,
                                          nsString& aSignature, bool aQuoted,
                                          bool aHTMLEditor) {
  NS_ASSERTION(m_editor, "ConvertAndLoadComposeWindow but no editor");
  NS_ENSURE_TRUE(m_editor && m_identity, NS_ERROR_NOT_INITIALIZED);

  // First, get the nsIEditor interface for future use
  nsCOMPtr<nsINode> nodeInserted;

  TranslateLineEnding(aPrefix);
  TranslateLineEnding(aBuf);
  TranslateLineEnding(aSignature);

  m_editor->EnableUndo(false);

  // Ok - now we need to figure out the charset of the aBuf we are going to send
  // into the editor shell. There are I18N calls to sniff the data and then we
  // need to call the new routine in the editor that will allow us to send in
  // the charset
  //

  // Now, insert it into the editor...
  RefPtr<HTMLEditor> htmlEditor = m_editor->AsHTMLEditor();
  int32_t reply_on_top = 0;
  bool sig_bottom = true;
  m_identity->GetReplyOnTop(&reply_on_top);
  m_identity->GetSigBottom(&sig_bottom);
  bool sigOnTop = (reply_on_top == 1 && !sig_bottom);
  bool isForwarded = (mType == nsIMsgCompType::ForwardInline);

  // When in paragraph mode, don't call InsertLineBreak() since that inserts
  // a full paragraph instead of just a line break since we switched
  // the default paragraph separator to "p".
  bool paragraphMode =
      mozilla::Preferences::GetBool("mail.compose.default_to_paragraph", false);

  if (aQuoted) {
    if (!aPrefix.IsEmpty()) {
      if (!aHTMLEditor) aPrefix.AppendLiteral("\n");

      int32_t reply_on_top = 0;
      m_identity->GetReplyOnTop(&reply_on_top);
      if (reply_on_top == 1) {
        // HTML editor eats one line break but not a whole paragraph.
        if (aHTMLEditor && !paragraphMode) htmlEditor->InsertLineBreak();

        // add one newline if a signature comes before the quote, two otherwise
        bool includeSignature = true;
        bool sig_bottom = true;
        bool attachFile = false;
        nsString prefSigText;

        m_identity->GetSigOnReply(&includeSignature);
        m_identity->GetSigBottom(&sig_bottom);
        m_identity->GetHtmlSigText(prefSigText);
        nsresult rv = m_identity->GetAttachSignature(&attachFile);
        if (!paragraphMode || !aHTMLEditor) {
          if (includeSignature && !sig_bottom &&
              ((NS_SUCCEEDED(rv) && attachFile) || !prefSigText.IsEmpty()))
            htmlEditor->InsertLineBreak();
          else {
            htmlEditor->InsertLineBreak();
            htmlEditor->InsertLineBreak();
          }
        }
      }

      InsertDivWrappedTextAtSelection(aPrefix, u"moz-cite-prefix"_ns);
    }

    if (!aBuf.IsEmpty()) {
      // This leaves the caret at the right place to insert a bottom signature.
      if (aHTMLEditor) {
        nsAutoString body(aBuf);
        remove_plaintext_tag(body);
        htmlEditor->InsertAsCitedQuotation(body, mCiteReference, true,
                                           getter_AddRefs(nodeInserted));
      } else {
        htmlEditor->InsertAsQuotation(aBuf, getter_AddRefs(nodeInserted));
      }
    }

    (void)TagEmbeddedObjects(htmlEditor);

    if (!aSignature.IsEmpty()) {
      // we cannot add it on top earlier, because TagEmbeddedObjects will mark
      // all images in the signature as "moz-do-not-send"
      if (sigOnTop) MoveToBeginningOfDocument();

      if (aHTMLEditor) {
        bool oldAllow;
        GetAllowRemoteContent(&oldAllow);
        SetAllowRemoteContent(true);
        htmlEditor->InsertHTML(aSignature);
        SetAllowRemoteContent(oldAllow);
      } else {
        htmlEditor->InsertLineBreak();
        InsertDivWrappedTextAtSelection(aSignature, u"moz-signature"_ns);
      }

      if (sigOnTop) htmlEditor->EndOfDocument();
    }
  } else {
    if (aHTMLEditor) {
      if (isForwarded &&
          Substring(aBuf, 0, sizeof(MIME_FORWARD_HTML_PREFIX) - 1)
              .EqualsLiteral(MIME_FORWARD_HTML_PREFIX)) {
        // We assign the opening tag inside "<HTML><BODY><BR><BR>" before the
        // two <br> elements.
        // This is a bit hacky but we know that the MIME code prepares the
        // forwarded content like this:
        // <HTML><BODY><BR><BR> + forwarded header + header table.
        // Note: We only do this when we prepare the message to be forwarded,
        // a re-opened saved draft of a forwarded message does not repeat this.
        nsString divTag;
        divTag.AssignLiteral("<div class=\"moz-forward-container\">");
        aBuf.Insert(divTag, sizeof(MIME_FORWARD_HTML_PREFIX) - 1 - 8);
      }
      remove_plaintext_tag(aBuf);

      bool stripConditionalCSS = mozilla::Preferences::GetBool(
          "mail.html_sanitize.drop_conditional_css", true);

      if (stripConditionalCSS) {
        nsString newBody;
        remove_conditional_CSS(aBuf, newBody);
        htmlEditor->RebuildDocumentFromSource(newBody);
      } else {
        htmlEditor->RebuildDocumentFromSource(aBuf);
      }

      // When forwarding a message as inline, or editing as new (which could
      // contain unsanitized remote content), tag any embedded objects
      // with moz-do-not-send=true so they don't get attached upon send.
      if (isForwarded || mType == nsIMsgCompType::EditAsNew)
        (void)TagEmbeddedObjects(htmlEditor);

      if (!aSignature.IsEmpty()) {
        if (isForwarded && sigOnTop) {
          // Use our own function, nsEditor::BeginningOfDocument() would
          // position into the <div class="moz-forward-container"> we've just
          // created.
          MoveToBeginningOfDocument();
        } else {
          // Use our own function, nsEditor::EndOfDocument() would position
          // into the <div class="moz-forward-container"> we've just created.
          MoveToEndOfDocument();
        }

        bool oldAllow;
        GetAllowRemoteContent(&oldAllow);
        SetAllowRemoteContent(true);
        htmlEditor->InsertHTML(aSignature);
        SetAllowRemoteContent(oldAllow);

        if (isForwarded && sigOnTop) htmlEditor->EndOfDocument();
      } else
        htmlEditor->EndOfDocument();
    } else {
      bool sigOnTopInserted = false;
      if (isForwarded && sigOnTop && !aSignature.IsEmpty()) {
        htmlEditor->InsertLineBreak();
        InsertDivWrappedTextAtSelection(aSignature, u"moz-signature"_ns);
        htmlEditor->EndOfDocument();
        sigOnTopInserted = true;
      }

      if (!aBuf.IsEmpty()) {
        nsresult rv;
        RefPtr<Element> divElem;
        RefPtr<Element> extraBr;

        if (isForwarded) {
          // Special treatment for forwarded messages: Part 1.
          // Create a <div> of the required class.
          rv = htmlEditor->CreateElementWithDefaults(u"div"_ns,
                                                     getter_AddRefs(divElem));
          NS_ENSURE_SUCCESS(rv, rv);

          nsAutoString attributeName;
          nsAutoString attributeValue;
          attributeName.AssignLiteral("class");
          attributeValue.AssignLiteral("moz-forward-container");
          IgnoredErrorResult rv1;
          divElem->SetAttribute(attributeName, attributeValue, rv1);

          // We can't insert an empty <div>, so fill it with something.
          rv = htmlEditor->CreateElementWithDefaults(u"br"_ns,
                                                     getter_AddRefs(extraBr));
          NS_ENSURE_SUCCESS(rv, rv);

          ErrorResult rv2;
          divElem->AppendChild(*extraBr, rv2);
          if (rv2.Failed()) {
            return rv2.StealNSResult();
          }

          // Insert the non-empty <div> into the DOM.
          rv = htmlEditor->InsertElementAtSelection(divElem, false);
          NS_ENSURE_SUCCESS(rv, rv);

          // Position into the div, so out content goes there.
          RefPtr<Selection> selection;
          htmlEditor->GetSelection(getter_AddRefs(selection));
          rv = selection->CollapseInLimiter(divElem, 0);
          NS_ENSURE_SUCCESS(rv, rv);
        }

        rv = htmlEditor->InsertTextWithQuotations(aBuf);
        NS_ENSURE_SUCCESS(rv, rv);

        if (isForwarded) {
          // Special treatment for forwarded messages: Part 2.
          if (sigOnTopInserted) {
            // Sadly the M-C editor inserts a <br> between the <div> for the
            // signature and this <div>, so remove the <br> we don't want.
            nsCOMPtr<nsINode> brBeforeDiv;
            nsAutoString tagLocalName;
            brBeforeDiv = divElem->GetPreviousSibling();
            if (brBeforeDiv) {
              tagLocalName = brBeforeDiv->LocalName();
              if (tagLocalName.EqualsLiteral("br")) {
                rv = htmlEditor->DeleteNode(brBeforeDiv, false, 1);
                NS_ENSURE_SUCCESS(rv, rv);
              }
            }
          }

          // Clean up the <br> we inserted.
          rv = htmlEditor->DeleteNode(extraBr, false, 1);
          NS_ENSURE_SUCCESS(rv, rv);
        }

        // Use our own function instead of nsEditor::EndOfDocument() because
        // we don't want to position at the end of the div we've just created.
        // It's OK to use, even if we're not forwarding and didn't create a
        // <div>.
        rv = MoveToEndOfDocument();
        NS_ENSURE_SUCCESS(rv, rv);
      }

      if ((!isForwarded || !sigOnTop) && !aSignature.IsEmpty()) {
        htmlEditor->InsertLineBreak();
        InsertDivWrappedTextAtSelection(aSignature, u"moz-signature"_ns);
      }
    }
  }

  if (aBuf.IsEmpty())
    htmlEditor->BeginningOfDocument();
  else {
    switch (reply_on_top) {
      // This should set the cursor after the body but before the sig
      case 0: {
        if (!htmlEditor) {
          htmlEditor->BeginningOfDocument();
          break;
        }

        RefPtr<Selection> selection;
        nsCOMPtr<nsINode> parent;
        int32_t offset;
        nsresult rv;

        // get parent and offset of mailcite
        rv = GetNodeLocation(nodeInserted, address_of(parent), &offset);
        if (NS_FAILED(rv) || (!parent)) {
          htmlEditor->BeginningOfDocument();
          break;
        }

        // get selection
        htmlEditor->GetSelection(getter_AddRefs(selection));
        if (!selection) {
          htmlEditor->BeginningOfDocument();
          break;
        }

        // place selection after mailcite
        selection->CollapseInLimiter(parent, offset + 1);

        // insert a break at current selection
        if (!paragraphMode || !aHTMLEditor) htmlEditor->InsertLineBreak();

        // i'm not sure if you need to move the selection back to before the
        // break. expirement.
        selection->CollapseInLimiter(parent, offset + 1);

        break;
      }

      case 2: {
        nsCOMPtr<nsIEditor> editor(htmlEditor);  // Strong reference.
        editor->SelectAll();
        break;
      }

      // This should set the cursor to the top!
      default: {
        MoveToBeginningOfDocument();
        break;
      }
    }
  }

  nsCOMPtr<nsISelectionController> selCon;
  htmlEditor->GetSelectionController(getter_AddRefs(selCon));

  if (selCon)
    selCon->ScrollSelectionIntoView(
        nsISelectionController::SELECTION_NORMAL,
        nsISelectionController::SELECTION_ANCHOR_REGION,
        nsISelectionController::SCROLL_SYNCHRONOUS);

  htmlEditor->EnableUndo(true);
  SetBodyModified(false);

  return NS_OK;
}

/**
 * Check the identity pref to include signature on replies and forwards.
 */
bool nsMsgCompose::CheckIncludeSignaturePrefs(nsIMsgIdentity* identity) {
  bool includeSignature = true;
  switch (mType) {
    case nsIMsgCompType::ForwardInline:
    case nsIMsgCompType::ForwardAsAttachment:
      identity->GetSigOnForward(&includeSignature);
      break;
    case nsIMsgCompType::Reply:
    case nsIMsgCompType::ReplyAll:
    case nsIMsgCompType::ReplyToList:
    case nsIMsgCompType::ReplyToGroup:
    case nsIMsgCompType::ReplyToSender:
    case nsIMsgCompType::ReplyToSenderAndGroup:
      identity->GetSigOnReply(&includeSignature);
      break;
  }
  return includeSignature;
}

nsresult nsMsgCompose::SetQuotingToFollow(bool aVal) {
  mQuotingToFollow = aVal;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::GetQuotingToFollow(bool* quotingToFollow) {
  NS_ENSURE_ARG(quotingToFollow);
  *quotingToFollow = mQuotingToFollow;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::Initialize(nsIMsgComposeParams* aParams,
                         mozIDOMWindowProxy* aWindow, nsIDocShell* aDocShell) {
  NS_ENSURE_ARG_POINTER(aParams);
  nsresult rv;

  aParams->GetIdentity(getter_AddRefs(m_identity));

  if (aWindow) {
    m_window = aWindow;
    nsCOMPtr<nsPIDOMWindowOuter> window = nsPIDOMWindowOuter::From(aWindow);
    NS_ENSURE_TRUE(window, NS_ERROR_FAILURE);

    nsCOMPtr<nsIDocShellTreeItem> treeItem = window->GetDocShell();
    nsCOMPtr<nsIDocShellTreeOwner> treeOwner;
    rv = treeItem->GetTreeOwner(getter_AddRefs(treeOwner));
    if (NS_FAILED(rv)) return rv;

    m_baseWindow = do_QueryInterface(treeOwner);
  }

  aParams->GetAutodetectCharset(&mAutodetectCharset);

  MSG_ComposeFormat format;
  aParams->GetFormat(&format);

  MSG_ComposeType type;
  aParams->GetType(&type);

  nsCString originalMsgURI;
  aParams->GetOriginalMsgURI(originalMsgURI);
  aParams->GetOrigMsgHdr(getter_AddRefs(mOrigMsgHdr));

  nsCOMPtr<nsIMsgCompFields> composeFields;
  aParams->GetComposeFields(getter_AddRefs(composeFields));

  nsCOMPtr<nsIMsgComposeService> composeService =
      do_GetService("@mozilla.org/messengercompose;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = composeService->DetermineComposeHTML(m_identity, format, &m_composeHTML);
  NS_ENSURE_SUCCESS(rv, rv);

#ifndef MOZ_SUITE
  if (m_composeHTML) {
    mozilla::glean::compose::compose_format.Get("HTML"_ns).Add(1);
  } else {
    mozilla::glean::compose::compose_format.Get("PlainText"_ns).Add(1);
  }

  nsAutoCString gleanCompType;
  switch (type) {
    case nsIMsgCompType::New:
      gleanCompType = "New"_ns;
      break;
    case nsIMsgCompType::Reply:
      gleanCompType = "Reply"_ns;
      break;
    case nsIMsgCompType::ReplyAll:
      gleanCompType = "ReplyAll"_ns;
      break;
    case nsIMsgCompType::ForwardAsAttachment:
      gleanCompType = "ForwardAsAttachment"_ns;
      break;
    case nsIMsgCompType::ForwardInline:
      gleanCompType = "ForwardInline"_ns;
      break;
    case nsIMsgCompType::NewsPost:
      gleanCompType = "NewsPost"_ns;
      break;
    case nsIMsgCompType::ReplyToSender:
      gleanCompType = "ReplyToSender"_ns;
      break;
    case nsIMsgCompType::ReplyToGroup:
      gleanCompType = "ReplyToGroup"_ns;
      break;
    case nsIMsgCompType::ReplyToSenderAndGroup:
      gleanCompType = "ReplyToSenderAndGroup"_ns;
      break;
    case nsIMsgCompType::Draft:
      gleanCompType = "Draft"_ns;
      break;
    case nsIMsgCompType::Template:
      gleanCompType = "Template"_ns;
      break;
    case nsIMsgCompType::MailToUrl:
      gleanCompType = "MailToUrl"_ns;
      break;
    case nsIMsgCompType::ReplyWithTemplate:
      gleanCompType = "ReplyWithTemplate"_ns;
      break;
    case nsIMsgCompType::ReplyToList:
      gleanCompType = "ReplyToList"_ns;
      break;
    case nsIMsgCompType::Redirect:
      gleanCompType = "Redirect"_ns;
      break;
    case nsIMsgCompType::EditAsNew:
      gleanCompType = "EditAsNew"_ns;
      break;
    case nsIMsgCompType::EditTemplate:
      gleanCompType = "EditTemplate"_ns;
      break;
    default:
      NS_WARNING("Unexpected compose type");
      break;
  }
  if (!gleanCompType.IsEmpty()) {
    mozilla::glean::compose::compose_type.Get(gleanCompType).Add(1);
  }
#endif

  if (composeFields) {
    nsAutoCString draftId;  // will get set for drafts and templates
    rv = composeFields->GetDraftId(draftId);
    NS_ENSURE_SUCCESS(rv, rv);

    // Set return receipt flag and type, and if we should attach a vCard
    // by checking the identity prefs - but don't clobber the values for
    // drafts and templates as they were set up already by mime when
    // initializing the message.
    if (m_identity && draftId.IsEmpty() && type != nsIMsgCompType::Template) {
      bool requestReturnReceipt = false;
      rv = m_identity->GetRequestReturnReceipt(&requestReturnReceipt);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = composeFields->SetReturnReceipt(requestReturnReceipt);
      NS_ENSURE_SUCCESS(rv, rv);

      int32_t receiptType = nsIMsgMdnGenerator::eDntType;
      rv = m_identity->GetReceiptHeaderType(&receiptType);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = composeFields->SetReceiptHeaderType(receiptType);
      NS_ENSURE_SUCCESS(rv, rv);

      bool requestDSN = false;
      rv = m_identity->GetRequestDSN(&requestDSN);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = composeFields->SetDSN(requestDSN);
      NS_ENSURE_SUCCESS(rv, rv);

      bool attachVCard;
      rv = m_identity->GetAttachVCard(&attachVCard);
      NS_ENSURE_SUCCESS(rv, rv);
      rv = composeFields->SetAttachVCard(attachVCard);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  nsCOMPtr<nsIMsgSendListener> externalSendListener;
  aParams->GetSendListener(getter_AddRefs(externalSendListener));
  if (externalSendListener) AddMsgSendListener(externalSendListener);

  nsString smtpPassword;
  aParams->GetSmtpPassword(smtpPassword);
  mSmtpPassword = smtpPassword;

  aParams->GetHtmlToQuote(mHtmlToQuote);

  if (aDocShell) {
    mDocShell = aDocShell;
    // register the compose object with the compose service
    rv = composeService->RegisterComposeDocShell(aDocShell, this);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return CreateMessage(originalMsgURI, type, composeFields);
}

NS_IMETHODIMP
nsMsgCompose::RegisterStateListener(
    nsIMsgComposeStateListener* aStateListener) {
  NS_ENSURE_ARG_POINTER(aStateListener);
  mStateListeners.AppendElement(aStateListener);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::UnregisterStateListener(
    nsIMsgComposeStateListener* aStateListener) {
  NS_ENSURE_ARG_POINTER(aStateListener);
  return mStateListeners.RemoveElement(aStateListener) ? NS_OK
                                                       : NS_ERROR_FAILURE;
}

// Added to allow easier use of the nsIMsgSendListener
NS_IMETHODIMP nsMsgCompose::AddMsgSendListener(
    nsIMsgSendListener* aMsgSendListener) {
  NS_ENSURE_ARG_POINTER(aMsgSendListener);
  mExternalSendListeners.AppendElement(aMsgSendListener);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::RemoveMsgSendListener(
    nsIMsgSendListener* aMsgSendListener) {
  NS_ENSURE_ARG_POINTER(aMsgSendListener);
  return mExternalSendListeners.RemoveElement(aMsgSendListener)
             ? NS_OK
             : NS_ERROR_FAILURE;
}

NS_IMETHODIMP
nsMsgCompose::SendMsgToServer(MSG_DeliverMode deliverMode,
                              nsIMsgIdentity* identity, const char* accountKey,
                              Promise** aPromise) {
  nsresult rv = NS_OK;

  // clear saved message id if sending, so we don't send out the same
  // message-id.
  if (deliverMode == nsIMsgCompDeliverMode::Now ||
      deliverMode == nsIMsgCompDeliverMode::Later ||
      deliverMode == nsIMsgCompDeliverMode::Background)
    m_compFields->SetMessageId("");

  if (m_compFields && identity) {
    // Pref values are supposed to be stored as UTF-8, so no conversion
    nsCString email;
    nsString fullName;
    nsString organization;

    identity->GetEmail(email);
    identity->GetFullName(fullName);
    identity->GetOrganization(organization);

    const char* pFrom = m_compFields->GetFrom();
    if (!pFrom || !*pFrom) {
      nsCString sender;
      MakeMimeAddress(NS_ConvertUTF16toUTF8(fullName), email, sender);
      m_compFields->SetFrom(sender.IsEmpty() ? email.get() : sender.get());
    }

    m_compFields->SetOrganization(organization);

    // We need an nsIMsgSend instance to send the message. Allow extensions
    // to override the default SMTP sender by observing mail-set-sender.
    mMsgSend = nullptr;
    mDeliverMode = deliverMode;  // save for possible access by observer.

    // Allow extensions to specify an outgoing server.
    nsCOMPtr<nsIObserverService> observerService =
        mozilla::services::GetObserverService();
    NS_ENSURE_STATE(observerService);

    // Assemble a string with sending parameters.
    nsAutoString sendParms;

    // First parameter: account key. This may be null.
    sendParms.AppendASCII(accountKey && *accountKey ? accountKey : "");
    sendParms.Append(',');

    // Second parameter: deliverMode.
    sendParms.AppendInt(deliverMode);
    sendParms.Append(',');

    // Third parameter: identity (as identity key).
    nsAutoCString identityKey;
    identity->GetKey(identityKey);
    sendParms.AppendASCII(identityKey.get());

    observerService->NotifyObservers(NS_ISUPPORTS_CAST(nsIMsgCompose*, this),
                                     "mail-set-sender", sendParms.get());

    if (!mMsgSend)
      mMsgSend = do_CreateInstance("@mozilla.org/messengercompose/send;1");

    if (mMsgSend) {
      nsString bodyString;
      rv = m_compFields->GetBody(bodyString);
      NS_ENSURE_SUCCESS(rv, rv);

      // Create the listener for the send operation...
      nsCOMPtr<nsIMsgComposeSendListener> composeSendListener =
          do_CreateInstance(
              "@mozilla.org/messengercompose/composesendlistener;1");
      if (!composeSendListener) return NS_ERROR_OUT_OF_MEMORY;

      // right now, AutoSaveAsDraft is identical to SaveAsDraft as
      // far as the msg send code is concerned. This way, we don't have
      // to add an nsMsgDeliverMode for autosaveasdraft, and add cases for
      // it in the msg send code.
      if (deliverMode == nsIMsgCompDeliverMode::AutoSaveAsDraft)
        deliverMode = nsIMsgCompDeliverMode::SaveAsDraft;

      // When saving a draft, ensure each instance has a new messageId generated
      // so imap search finds a unique match. This is needed for non-UIDPLUS
      // imap servers.
      if (deliverMode == nsIMsgCompDeliverMode::SaveAsDraft ||
          deliverMode == nsIMsgCompDeliverMode::SaveAsTemplate)
        m_compFields->SetMessageId("");

      RefPtr<nsIMsgCompose> msgCompose(this);
      composeSendListener->SetMsgCompose(msgCompose);
      composeSendListener->SetDeliverMode(deliverMode);

      if (mProgress) {
        nsCOMPtr<nsIWebProgressListener> progressListener =
            do_QueryInterface(composeSendListener);
        mProgress->RegisterListener(progressListener);
      }

      // If we are composing HTML, then this should be sent as
      // multipart/related which means we pass the editor into the
      // backend...if not, just pass nullptr
      //
      nsCOMPtr<nsIMsgSendListener> sendListener =
          do_QueryInterface(composeSendListener);
      RefPtr<mozilla::dom::Promise> promise;
      rv = mMsgSend->CreateAndSendMessage(
          m_composeHTML ? m_editor.get() : nullptr, identity, accountKey,
          m_compFields, false, false, (nsMsgDeliverMode)deliverMode, nullptr,
          m_composeHTML ? TEXT_HTML : TEXT_PLAIN, bodyString, m_window,
          mProgress, sendListener, mSmtpPassword, mOriginalMsgURI, mType,
          getter_AddRefs(promise));
      promise.forget(aPromise);
    } else
      rv = NS_ERROR_FAILURE;
  } else
    rv = NS_ERROR_NOT_INITIALIZED;

  return rv;
}

NS_IMETHODIMP nsMsgCompose::SendMsg(MSG_DeliverMode deliverMode,
                                    nsIMsgIdentity* identity,
                                    const char* accountKey,
                                    nsIMsgWindow* aMsgWindow,
                                    nsIMsgProgress* progress,
                                    Promise** aPromise) {
  NS_ENSURE_TRUE(m_compFields, NS_ERROR_NOT_INITIALIZED);
  nsresult rv = NS_OK;

  // Set content type based on which type of compose window we had.
  nsString contentType = (m_composeHTML) ? u"text/html"_ns : u"text/plain"_ns;
  nsString msgBody;
  if (m_editor) {
    // Reset message body previously stored in the compose fields
    m_compFields->SetBody(EmptyString());

    uint32_t flags = nsIDocumentEncoder::OutputCRLineBreak |
                     nsIDocumentEncoder::OutputLFLineBreak;

    if (m_composeHTML) {
      flags |= nsIDocumentEncoder::OutputFormatted |
               nsIDocumentEncoder::OutputDisallowLineBreaking;
    } else {
      bool flowed, formatted;
      GetSerialiserFlags(&flowed, &formatted);
      if (flowed) flags |= nsIDocumentEncoder::OutputFormatFlowed;
      if (formatted) flags |= nsIDocumentEncoder::OutputFormatted;
      flags |= nsIDocumentEncoder::OutputDisallowLineBreaking;
      // Don't lose NBSP in the plain text encoder.
      flags |= nsIDocumentEncoder::OutputPersistNBSP;
    }
    nsresult rv = m_editor->OutputToString(contentType, flags, msgBody);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    m_compFields->GetBody(msgBody);
  }
  if (!msgBody.IsEmpty()) {
    // Ensure body ends in CRLF to avoid SMTP server timeout when sent.
    if (!StringEndsWith(msgBody, u"\r\n"_ns)) msgBody.AppendLiteral("\r\n");
    bool isAsciiOnly = mozilla::IsAsciiNullTerminated(
        static_cast<const char16_t*>(msgBody.get()));

    if (m_compFields->GetForceMsgEncoding()) {
      isAsciiOnly = false;
    }

    m_compFields->SetBodyIsAsciiOnly(isAsciiOnly);
    m_compFields->SetBody(msgBody);
  }

  // Let's open the progress dialog
  if (progress) {
    mProgress = progress;

    if (m_window && deliverMode != nsIMsgCompDeliverMode::AutoSaveAsDraft) {
      nsAutoString msgSubject;
      m_compFields->GetSubject(msgSubject);

      bool showProgress = false;
      nsCOMPtr<nsIPrefBranch> prefBranch(
          do_GetService(NS_PREFSERVICE_CONTRACTID));
      if (prefBranch) {
        prefBranch->GetBoolPref("mailnews.show_send_progress", &showProgress);
        if (showProgress) {
          nsCOMPtr<nsIMsgComposeProgressParams> params = do_CreateInstance(
              "@mozilla.org/messengercompose/composeprogressparameters;1", &rv);
          if (NS_FAILED(rv) || !params) return NS_ERROR_FAILURE;

          params->SetSubject(msgSubject.get());
          params->SetDeliveryMode(deliverMode);

          mProgress->OpenProgressDialog(
              m_window, aMsgWindow,
              "chrome://messenger/content/messengercompose/sendProgress.xhtml",
              false, params);
        }
      }
    }

    mProgress->OnStateChange(nullptr, nullptr,
                             nsIWebProgressListener::STATE_START, NS_OK);
  }

  bool attachVCard = false;
  m_compFields->GetAttachVCard(&attachVCard);

  if (attachVCard && identity &&
      (deliverMode == nsIMsgCompDeliverMode::Now ||
       deliverMode == nsIMsgCompDeliverMode::Later ||
       deliverMode == nsIMsgCompDeliverMode::Background)) {
    nsCString escapedVCard;
    // make sure, if there is no card, this returns an empty string, or
    // NS_ERROR_FAILURE
    rv = identity->GetEscapedVCard(escapedVCard);

    if (NS_SUCCEEDED(rv) && !escapedVCard.IsEmpty()) {
      nsCString vCardUrl;
      vCardUrl = "data:text/vcard;charset=utf-8;base64,";
      nsCString unescapedData;
      MsgUnescapeString(escapedVCard, 0, unescapedData);
      char* result = PL_Base64Encode(unescapedData.get(), 0, nullptr);
      vCardUrl += result;
      PR_Free(result);

      nsCOMPtr<nsIMsgAttachment> attachment =
          do_CreateInstance("@mozilla.org/messengercompose/attachment;1", &rv);
      if (NS_SUCCEEDED(rv) && attachment) {
        // [comment from 4.x]
        // Send the vCard out with a filename which distinguishes this user.
        // e.g. jsmith.vcf The main reason to do this is for interop with
        // Eudora, which saves off the attachments separately from the message
        // body
        nsCString userid;
        (void)identity->GetEmail(userid);
        int32_t index = userid.FindChar('@');
        if (index != kNotFound) userid.SetLength(index);

        if (userid.IsEmpty())
          attachment->SetName(u"vcard.vcf"_ns);
        else {
          // Replace any dot with underscore to stop vCards
          // generating false positives with some heuristic scanners
          userid.ReplaceChar('.', '_');
          userid.AppendLiteral(".vcf");
          attachment->SetName(NS_ConvertASCIItoUTF16(userid));
        }

        attachment->SetUrl(vCardUrl);
        m_compFields->AddAttachment(attachment);
      }
    }
  }

  // Save the identity being sent for later use.
  m_identity = identity;

  RefPtr<mozilla::dom::Promise> promise;
  rv = SendMsgToServer(deliverMode, identity, accountKey,
                       getter_AddRefs(promise));

  RefPtr<nsMsgCompose> self = this;
  auto handleFailure = [self = std::move(self), deliverMode](nsresult rv) {
    self->NotifyStateListeners(
        nsIMsgComposeNotificationType::ComposeProcessDone, rv);
    nsCOMPtr<nsIMsgSendReport> sendReport;
    if (self->mMsgSend)
      self->mMsgSend->GetSendReport(getter_AddRefs(sendReport));
    if (sendReport) {
      nsresult theError;
      sendReport->DisplayReport(self->m_window, true, true, &theError);
    } else {
      // If we come here it's because we got an error before we could initialize
      // a send report! Let's try our best...
      switch (deliverMode) {
        case nsIMsgCompDeliverMode::Later:
          nsMsgDisplayMessageByName(self->m_window, "unableToSendLater");
          break;
        case nsIMsgCompDeliverMode::AutoSaveAsDraft:
        case nsIMsgCompDeliverMode::SaveAsDraft:
          nsMsgDisplayMessageByName(self->m_window, "unableToSaveDraft");
          break;
        case nsIMsgCompDeliverMode::SaveAsTemplate:
          nsMsgDisplayMessageByName(self->m_window, "unableToSaveTemplate");
          break;

        default:
          nsMsgDisplayMessageByName(self->m_window, "sendFailed");
          break;
      }
    }
    if (self->mProgress) self->mProgress->CloseProgressDialog(true);

    self->DeleteTmpAttachments();
  };
  if (promise) {
    promise->AddCallbacksWithCycleCollectedArgs(
        [self = RefPtr(this)](JSContext*, JS::Handle<JS::Value> aValue,
                              ErrorResult&) { self->DeleteTmpAttachments(); },
        [handleFailure](JSContext*, JS::Handle<JS::Value> aValue,
                        ErrorResult&) {
          handleFailure(Promise::TryExtractNSResultFromRejectionValue(aValue));
        });
    promise.forget(aPromise);
  } else if (NS_FAILED(rv)) {
    handleFailure(rv);
  }

  return rv;
}

NS_IMETHODIMP nsMsgCompose::GetDeleteDraft(bool* aDeleteDraft) {
  NS_ENSURE_ARG_POINTER(aDeleteDraft);
  *aDeleteDraft = mDeleteDraft;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::SetDeleteDraft(bool aDeleteDraft) {
  mDeleteDraft = aDeleteDraft;
  return NS_OK;
}

bool nsMsgCompose::IsLastWindow() {
  nsresult rv;
  bool more;
  nsCOMPtr<nsIWindowMediator> windowMediator =
      do_GetService(NS_WINDOWMEDIATOR_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsISimpleEnumerator> windowEnumerator;
    rv = windowMediator->GetEnumerator(nullptr,
                                       getter_AddRefs(windowEnumerator));
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsISupports> isupports;

      if (NS_SUCCEEDED(windowEnumerator->GetNext(getter_AddRefs(isupports))))
        if (NS_SUCCEEDED(windowEnumerator->HasMoreElements(&more)))
          return !more;
    }
  }
  return true;
}

NS_IMETHODIMP nsMsgCompose::CloseWindow(void) {
  nsresult rv;

  nsCOMPtr<nsIMsgComposeService> composeService =
      do_GetService("@mozilla.org/messengercompose;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // unregister the compose object with the compose service
  rv = composeService->UnregisterComposeDocShell(mDocShell);
  NS_ENSURE_SUCCESS(rv, rv);
  mDocShell = nullptr;

  // ensure that the destructor of nsMsgSend is invoked to remove
  // temporary files.
  mMsgSend = nullptr;

  // We are going away for real, we need to do some clean up first
  if (m_baseWindow) {
    if (m_editor) {
      // The editor will be destroyed during the close window.
      // Set it to null to be sure we won't use it anymore.
      m_editor = nullptr;
    }
    nsCOMPtr<nsIBaseWindow> window = m_baseWindow.forget();
    rv = window->Destroy();
  }

  m_window = nullptr;
  return rv;
}

nsresult nsMsgCompose::Abort() {
  if (mMsgSend) mMsgSend->Abort();

  if (mProgress) mProgress->CloseProgressDialog(true);

  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::GetEditor(nsIEditor** aEditor) {
  NS_IF_ADDREF(*aEditor = m_editor);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::SetEditor(nsIEditor* aEditor) {
  m_editor = aEditor;
  return NS_OK;
}

// This used to be called BEFORE editor was created
//  (it did the loadURI that triggered editor creation)
// It is called from JS after editor creation
//  (loadURI is done in JS)
MOZ_CAN_RUN_SCRIPT_BOUNDARY NS_IMETHODIMP nsMsgCompose::InitEditor(
    nsIEditor* aEditor, mozIDOMWindowProxy* aContentWindow) {
  NS_ENSURE_ARG_POINTER(aEditor);
  NS_ENSURE_ARG_POINTER(aContentWindow);
  nsresult rv;

  m_editor = aEditor;

  aEditor->SetDocumentCharacterSet("UTF-8"_ns);

  nsCOMPtr<nsPIDOMWindowOuter> window =
      nsPIDOMWindowOuter::From(aContentWindow);

  nsIDocShell* docShell = window->GetDocShell();
  NS_ENSURE_TRUE(docShell, NS_ERROR_UNEXPECTED);

  bool quotingToFollow = false;
  GetQuotingToFollow(&quotingToFollow);
  if (quotingToFollow)
    return BuildQuotedMessageAndSignature();
  else {
    NotifyStateListeners(nsIMsgComposeNotificationType::ComposeFieldsReady,
                         NS_OK);
    rv = BuildBodyMessageAndSignature();
    NotifyStateListeners(nsIMsgComposeNotificationType::ComposeBodyReady,
                         NS_OK);
    return rv;
  }
}

nsresult nsMsgCompose::GetBodyModified(bool* modified) {
  nsresult rv;

  if (!modified) return NS_ERROR_NULL_POINTER;

  *modified = true;

  if (m_editor) {
    rv = m_editor->GetDocumentModified(modified);
    if (NS_FAILED(rv)) *modified = true;
  }

  return NS_OK;
}

MOZ_CAN_RUN_SCRIPT_BOUNDARY nsresult
nsMsgCompose::SetBodyModified(bool modified) {
  nsresult rv = NS_OK;

  if (m_editor) {
    nsCOMPtr<nsIEditor> editor(m_editor);  // Strong reference.
    if (modified) {
      int32_t modCount = 0;
      editor->GetModificationCount(&modCount);
      if (modCount == 0) editor->IncrementModificationCount(1);
    } else
      editor->ResetModificationCount();
  }

  return rv;
}

NS_IMETHODIMP
nsMsgCompose::GetDomWindow(mozIDOMWindowProxy** aDomWindow) {
  NS_IF_ADDREF(*aDomWindow = m_window);
  return NS_OK;
}

nsresult nsMsgCompose::GetCompFields(nsIMsgCompFields** aCompFields) {
  NS_IF_ADDREF(*aCompFields = (nsIMsgCompFields*)m_compFields);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::GetComposeHTML(bool* aComposeHTML) {
  *aComposeHTML = m_composeHTML;
  return NS_OK;
}

nsresult nsMsgCompose::GetWrapLength(int32_t* aWrapLength) {
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv)) return rv;

  return prefBranch->GetIntPref("mailnews.wraplength", aWrapLength);
}

nsresult nsMsgCompose::CreateMessage(const nsACString& originalMsgURI,
                                     MSG_ComposeType type,
                                     nsIMsgCompFields* compFields) {
  nsresult rv = NS_OK;
  mType = type;
  mDraftDisposition = nsIMsgFolder::nsMsgDispositionState_None;

  mDeleteDraft = (type == nsIMsgCompType::Draft);
  nsAutoCString msgUri(originalMsgURI);
  bool fileUrl = StringBeginsWith(msgUri, "file:"_ns);
  int32_t typeIndex = msgUri.Find("type=application/x-message-display");
  if (typeIndex != kNotFound && typeIndex > 0) {
    // Strip out type=application/x-message-display because it confuses libmime.
    msgUri.Cut(typeIndex, sizeof("type=application/x-message-display"));
    if (fileUrl)  // we're dealing with an .eml file msg
    {
      // We have now removed the type from the uri. Make sure we don't have
      // an uri with "&&" now. If we do, remove the second '&'.
      if (msgUri.CharAt(typeIndex) == '&') msgUri.Cut(typeIndex, 1);
      // Remove possible trailing '?'.
      if (msgUri.CharAt(msgUri.Length() - 1) == '?')
        msgUri.Cut(msgUri.Length() - 1, 1);
    } else  // we're dealing with a message/rfc822 attachment
    {
      // nsURLFetcher will check for "realtype=message/rfc822" and will set the
      // content type to message/rfc822 in the forwarded message.
      msgUri.AppendLiteral("&realtype=message/rfc822");
    }
  }

  if (compFields) {
    m_compFields = reinterpret_cast<nsMsgCompFields*>(compFields);
  } else {
    m_compFields = new nsMsgCompFields();
  }

  if (m_identity && mType != nsIMsgCompType::Draft) {
    // Setup reply-to field.
    nsCString replyTo;
    m_identity->GetReplyTo(replyTo);
    if (!replyTo.IsEmpty()) {
      nsCString resultStr;
      RemoveDuplicateAddresses(nsDependentCString(m_compFields->GetReplyTo()),
                               replyTo, resultStr);
      if (!resultStr.IsEmpty()) {
        replyTo.Append(',');
        replyTo.Append(resultStr);
      }
      m_compFields->SetReplyTo(replyTo.get());
    }

    // Setup auto-Cc field.
    bool doCc;
    m_identity->GetDoCc(&doCc);
    if (doCc) {
      nsCString ccList;
      m_identity->GetDoCcList(ccList);

      nsCString resultStr;
      RemoveDuplicateAddresses(nsDependentCString(m_compFields->GetCc()),
                               ccList, resultStr);
      if (!resultStr.IsEmpty()) {
        ccList.Append(',');
        ccList.Append(resultStr);
      }
      m_compFields->SetCc(ccList.get());
    }

    // Setup auto-Bcc field.
    bool doBcc;
    m_identity->GetDoBcc(&doBcc);
    if (doBcc) {
      nsCString bccList;
      m_identity->GetDoBccList(bccList);

      nsCString resultStr;
      RemoveDuplicateAddresses(nsDependentCString(m_compFields->GetBcc()),
                               bccList, resultStr);
      if (!resultStr.IsEmpty()) {
        bccList.Append(',');
        bccList.Append(resultStr);
      }
      m_compFields->SetBcc(bccList.get());
    }
  }

  if (mType == nsIMsgCompType::Draft) {
    nsCString curDraftIdURL;
    rv = m_compFields->GetDraftId(curDraftIdURL);
    // Skip if no draft id (probably a new draft msg).
    if (NS_SUCCEEDED(rv) && !curDraftIdURL.IsEmpty()) {
      nsCOMPtr<nsIMsgDBHdr> msgDBHdr;
      rv = GetMsgDBHdrFromURI(curDraftIdURL, getter_AddRefs(msgDBHdr));
      NS_ASSERTION(NS_SUCCEEDED(rv),
                   "CreateMessage can't get msg header DB interface pointer.");
      if (msgDBHdr) {
        nsCString queuedDisposition;
        msgDBHdr->GetStringProperty(QUEUED_DISPOSITION_PROPERTY,
                                    queuedDisposition);
        // We need to retrieve the original URI from the database so we can
        // set the disposition flags correctly if the draft is a reply or
        // forwarded message.
        nsCString originalMsgURIfromDB;
        msgDBHdr->GetStringProperty(ORIG_URI_PROPERTY, originalMsgURIfromDB);
        mOriginalMsgURI = originalMsgURIfromDB;
        if (!queuedDisposition.IsEmpty()) {
          if (queuedDisposition.EqualsLiteral("replied"))
            mDraftDisposition = nsIMsgFolder::nsMsgDispositionState_Replied;
          else if (queuedDisposition.EqualsLiteral("forward"))
            mDraftDisposition = nsIMsgFolder::nsMsgDispositionState_Forwarded;
          else if (queuedDisposition.EqualsLiteral("redirected"))
            mDraftDisposition = nsIMsgFolder::nsMsgDispositionState_Redirected;
        }
      }
    } else {
      NS_WARNING("CreateMessage can't get draft id");
    }
  }

  // If we don't have an original message URI, nothing else to do...
  if (msgUri.IsEmpty()) return NS_OK;

  // store the original message URI so we can extract it after we send the
  // message to properly mark any disposition flags like replied or forwarded on
  // the message.
  if (mOriginalMsgURI.IsEmpty()) mOriginalMsgURI = msgUri;

  nsCOMPtr<nsIPrefBranch> prefs(do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  // "Forward inline" and "Reply with template" processing.
  // Note the early return at the end of the block.
  if (type == nsIMsgCompType::ForwardInline ||
      type == nsIMsgCompType::ReplyWithTemplate) {
    // We want to treat this message as a reference too
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    rv = GetMsgDBHdrFromURI(msgUri, getter_AddRefs(msgHdr));
    if (NS_SUCCEEDED(rv)) {
      nsAutoCString messageId;
      msgHdr->GetMessageId(messageId);

      nsAutoCString reference;
      // When forwarding we only use the original message for "References:" -
      // recipients don't have the other messages anyway.
      // For reply with template we want to preserve all the references.
      if (type == nsIMsgCompType::ReplyWithTemplate) {
        uint16_t numReferences = 0;
        msgHdr->GetNumReferences(&numReferences);
        for (int32_t i = 0; i < numReferences; i++) {
          nsAutoCString ref;
          msgHdr->GetStringReference(i, ref);
          if (!ref.IsEmpty()) {
            reference.Append('<');
            reference.Append(ref);
            reference.AppendLiteral("> ");
          }
        }
        reference.Trim(" ", false, true);
      }
      msgHdr->GetMessageId(messageId);
      reference.Append('<');
      reference.Append(messageId);
      reference.Append('>');
      m_compFields->SetReferences(reference.get());

      if (type == nsIMsgCompType::ForwardInline) {
        nsString subject;
        msgHdr->GetMime2DecodedSubject(subject);
        nsCString fwdPrefix;
        prefs->GetCharPrefWithDefault("mail.forward_subject_prefix", "Fwd"_ns,
                                      1, fwdPrefix);
        nsString unicodeFwdPrefix;
        CopyUTF8toUTF16(fwdPrefix, unicodeFwdPrefix);
        unicodeFwdPrefix.AppendLiteral(": ");
        subject.Insert(unicodeFwdPrefix, 0);
        m_compFields->SetSubject(subject);
      }
    }

    // Early return for "ForwardInline" and "ReplyWithTemplate" processing.
    return NS_OK;
  }

  // All other processing.

  // Note the following:
  // LoadDraftOrTemplate() is run in nsMsgComposeService::OpenComposeWindow()
  // for five compose types: ForwardInline, ReplyWithTemplate (both covered
  // in the code block above) and Draft, Template and Redirect. For these
  // compose types, the charset is already correct (incl. MIME-applied override)
  // unless the default charset should be used.

  bool isFirstPass = true;
  char* uriList = ToNewCString(msgUri);
  char* uri = uriList;
  char* nextUri;
  do {
    nextUri = strstr(uri, "://");
    if (nextUri) {
      // look for next ://, and then back up to previous ','
      nextUri = strstr(nextUri + 1, "://");
      if (nextUri) {
        *nextUri = '\0';
        char* saveNextUri = nextUri;
        nextUri = strrchr(uri, ',');
        if (nextUri) *nextUri = '\0';
        *saveNextUri = ':';
      }
    }

    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    if (mOrigMsgHdr)
      msgHdr = mOrigMsgHdr;
    else {
      rv = GetMsgDBHdrFromURI(nsDependentCString(uri), getter_AddRefs(msgHdr));
      NS_ENSURE_SUCCESS(rv, rv);
    }
    if (msgHdr) {
      nsString subject;
      rv = msgHdr->GetMime2DecodedSubject(subject);
      if (NS_FAILED(rv)) return rv;

      // Check if (was: is present in the subject
      int32_t wasOffset = subject.RFind(u" (was:"_ns);
      bool strip = true;

      if (wasOffset >= 0) {
        // Check the number of references, to check if was: should be stripped
        // First, assume that it should be stripped; the variable will be set to
        // false later if stripping should not happen.
        uint16_t numRef;
        msgHdr->GetNumReferences(&numRef);
        if (numRef) {
          // If there are references, look for the first message in the thread
          // firstly, get the database via the folder
          nsCOMPtr<nsIMsgFolder> folder;
          msgHdr->GetFolder(getter_AddRefs(folder));
          if (folder) {
            nsCOMPtr<nsIMsgDatabase> db;
            folder->GetMsgDatabase(getter_AddRefs(db));

            if (db) {
              nsAutoCString reference;
              msgHdr->GetStringReference(0, reference);

              nsCOMPtr<nsIMsgDBHdr> refHdr;
              db->GetMsgHdrForMessageID(reference.get(),
                                        getter_AddRefs(refHdr));

              if (refHdr) {
                nsCString refSubject;
                rv = refHdr->GetSubject(refSubject);
                if (NS_SUCCEEDED(rv)) {
                  if (refSubject.Find(" (was:") >= 0) strip = false;
                }
              }
            }
          }
        } else
          strip = false;
      }

      if (strip && wasOffset >= 0) {
        // Strip off the "(was: old subject)" part
        subject.Assign(Substring(subject, 0, wasOffset));
      }

      switch (type) {
        default:
          break;
        case nsIMsgCompType::Draft:
        case nsIMsgCompType::Template:
        case nsIMsgCompType::EditTemplate:
        case nsIMsgCompType::EditAsNew: {
          // If opening from file, preseve the subject already present, since
          // we can't get a subject from db there.
          if (mOriginalMsgURI.Find("&realtype=message/rfc822") != -1) {
            break;
          }
          // Otherwise, set up the subject from db, with possible modifications.
          uint32_t flags;
          msgHdr->GetFlags(&flags);
          if (flags & nsMsgMessageFlags::HasRe) {
            subject.InsertLiteral(u"Re: ", 0);
          }
          // Set subject from db, where it's already decrypted. The raw
          // header may be encrypted.
          m_compFields->SetSubject(subject);
          break;
        }
        case nsIMsgCompType::Reply:
        case nsIMsgCompType::ReplyAll:
        case nsIMsgCompType::ReplyToList:
        case nsIMsgCompType::ReplyToGroup:
        case nsIMsgCompType::ReplyToSender:
        case nsIMsgCompType::ReplyToSenderAndGroup: {
          if (!isFirstPass)  // safeguard, just in case...
          {
            PR_Free(uriList);
            return rv;
          }
          mQuotingToFollow = true;

          subject.InsertLiteral(u"Re: ", 0);
          m_compFields->SetSubject(subject);

          // Setup quoting callbacks for later...
          mWhatHolder = 1;
          break;
        }
        case nsIMsgCompType::ForwardAsAttachment: {
          // Add the forwarded message in the references, first
          nsAutoCString messageId;
          msgHdr->GetMessageId(messageId);
          if (isFirstPass) {
            nsAutoCString reference;
            reference.Append('<');
            reference.Append(messageId);
            reference.Append('>');
            m_compFields->SetReferences(reference.get());
          } else {
            nsAutoCString references;
            m_compFields->GetReferences(getter_Copies(references));
            references.AppendLiteral(" <");
            references.Append(messageId);
            references.Append('>');
            m_compFields->SetReferences(references.get());
          }

          uint32_t flags;
          msgHdr->GetFlags(&flags);
          if (flags & nsMsgMessageFlags::HasRe)
            subject.InsertLiteral(u"Re: ", 0);

          // Setup quoting callbacks for later...
          mQuotingToFollow =
              false;  // We don't need to quote the original message.
          nsCOMPtr<nsIMsgAttachment> attachment = do_CreateInstance(
              "@mozilla.org/messengercompose/attachment;1", &rv);
          if (NS_SUCCEEDED(rv) && attachment) {
            bool addExtension = true;
            nsString sanitizedSubj;
            prefs->GetBoolPref("mail.forward_add_extension", &addExtension);

            // copy subject string to sanitizedSubj, use default if empty
            if (subject.IsEmpty()) {
              nsresult rv;
              nsCOMPtr<nsIStringBundleService> bundleService =
                  mozilla::components::StringBundle::Service();
              NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
              nsCOMPtr<nsIStringBundle> composeBundle;
              rv = bundleService->CreateBundle(
                  "chrome://messenger/locale/messengercompose/"
                  "composeMsgs.properties",
                  getter_AddRefs(composeBundle));
              NS_ENSURE_SUCCESS(rv, rv);
              composeBundle->GetStringFromName("messageAttachmentSafeName",
                                               sanitizedSubj);
            } else
              sanitizedSubj.Assign(subject);

            // set the file size
            uint32_t messageSize;
            msgHdr->GetMessageSize(&messageSize);
            attachment->SetSize(messageSize);

            // change all '.' to '_'  see bug #271211
            sanitizedSubj.ReplaceChar(u".", u'_');
            if (addExtension) sanitizedSubj.AppendLiteral(".eml");
            attachment->SetName(sanitizedSubj);
            attachment->SetUrl(nsDependentCString(uri));
            m_compFields->AddAttachment(attachment);
          }

          if (isFirstPass) {
            nsCString fwdPrefix;
            prefs->GetCharPrefWithDefault("mail.forward_subject_prefix",
                                          "Fwd"_ns, 1, fwdPrefix);
            nsString unicodeFwdPrefix;
            CopyUTF8toUTF16(fwdPrefix, unicodeFwdPrefix);
            unicodeFwdPrefix.AppendLiteral(": ");
            subject.Insert(unicodeFwdPrefix, 0);
            m_compFields->SetSubject(subject);
          }
          break;
        }
        case nsIMsgCompType::Redirect: {
          // For a redirect, set the Reply-To: header to what was in the
          // original From: header...
          nsAutoCString author;
          msgHdr->GetAuthor(author);
          m_compFields->SetSubject(subject);
          m_compFields->SetReplyTo(author.get());

          // ... and empty out the various recipient headers
          nsAutoString empty;
          m_compFields->SetTo(empty);
          m_compFields->SetCc(empty);
          m_compFields->SetBcc(empty);
          m_compFields->SetNewsgroups(empty);
          m_compFields->SetFollowupTo(empty);

          // Add the redirected message in the references so that threading
          // will work when the new recipient eventually replies to the
          // original sender.
          nsAutoCString messageId;
          msgHdr->GetMessageId(messageId);
          if (isFirstPass) {
            nsAutoCString reference;
            reference.Append('<');
            reference.Append(messageId);
            reference.Append('>');
            m_compFields->SetReferences(reference.get());
          } else {
            nsAutoCString references;
            m_compFields->GetReferences(getter_Copies(references));
            references.AppendLiteral(" <");
            references.Append(messageId);
            references.Append('>');
            m_compFields->SetReferences(references.get());
          }
          break;
        }
      }
    }
    isFirstPass = false;
    if (nextUri) {
      // `nextUri` can be a null pointer if `strstr` did not find `://` in the
      // URI earlier. Only increment it if that is not the case, to avoid
      // undefined behaviors.
      uri = nextUri + 1;
    }
  } while (nextUri);
  PR_Free(uriList);
  return rv;
}

NS_IMETHODIMP nsMsgCompose::GetProgress(nsIMsgProgress** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  NS_IF_ADDREF(*_retval = mProgress);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::GetMessageSend(nsIMsgSend** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  NS_IF_ADDREF(*_retval = mMsgSend);
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::SetMessageSend(nsIMsgSend* aMsgSend) {
  mMsgSend = aMsgSend;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::ClearMessageSend() {
  mMsgSend = nullptr;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::SetCiteReference(nsString citeReference) {
  mCiteReference = citeReference;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::SetSavedFolderURI(const nsACString& folderURI) {
  m_folderName = folderURI;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::GetSavedFolderURI(nsACString& folderURI) {
  folderURI = m_folderName;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::GetOriginalMsgURI(nsACString& originalMsgURI) {
  originalMsgURI = mOriginalMsgURI;
  return NS_OK;
}

////////////////////////////////////////////////////////////////////////////////////
// THIS IS THE CLASS THAT IS THE STREAM CONSUMER OF THE HTML OUTPUT
// FROM LIBMIME. THIS IS FOR QUOTING
////////////////////////////////////////////////////////////////////////////////////
QuotingOutputStreamListener::~QuotingOutputStreamListener() {}

QuotingOutputStreamListener::QuotingOutputStreamListener(
    nsIMsgDBHdr* origMsgHdr, bool quoteHeaders, bool headersOnly,
    nsIMsgIdentity* identity, nsIMsgQuote* msgQuote, bool quoteOriginal,
    const nsACString& htmlToQuote) {
  nsresult rv;
  mQuoteHeaders = quoteHeaders;
  mHeadersOnly = headersOnly;
  mIdentity = identity;
  mOrigMsgHdr = origMsgHdr;
  mUnicodeBufferCharacterLength = 0;
  mQuoteOriginal = quoteOriginal;
  mHtmlToQuote = htmlToQuote;
  mQuote = msgQuote;

  if (!mHeadersOnly || !mHtmlToQuote.IsEmpty()) {
    // Get header type, locale and strings from pref.
    int32_t replyHeaderType;
    nsString replyHeaderAuthorWrote;
    nsString replyHeaderOnDateAuthorWrote;
    nsString replyHeaderAuthorWroteOnDate;
    nsString replyHeaderOriginalmessage;
    GetReplyHeaderInfo(
        &replyHeaderType, replyHeaderAuthorWrote, replyHeaderOnDateAuthorWrote,
        replyHeaderAuthorWroteOnDate, replyHeaderOriginalmessage);

    // For the built message body...
    if (origMsgHdr && !quoteHeaders) {
      // Setup the cite information....
      nsCString myGetter;
      if (NS_SUCCEEDED(origMsgHdr->GetMessageId(myGetter))) {
        if (!myGetter.IsEmpty()) {
          nsAutoCString buf;
          mCiteReference.AssignLiteral("mid:");
          MsgEscapeURL(myGetter,
                       nsINetUtil::ESCAPE_URL_FILE_BASENAME |
                           nsINetUtil::ESCAPE_URL_FORCED,
                       buf);
          mCiteReference.Append(NS_ConvertASCIItoUTF16(buf));
        }
      }

      bool citingHeader;  // Do we have a header needing to cite any info from
                          // original message?
      bool headerDate;    // Do we have a header needing to cite date/time from
                          // original message?
      switch (replyHeaderType) {
        case 0:  // No reply header at all (actually the "---- original message
                 // ----" string, which is kinda misleading. TODO: Should there
                 // be a "really no header" option?
          mCitePrefix.Assign(replyHeaderOriginalmessage);
          citingHeader = false;
          headerDate = false;
          break;

        case 2:  // Insert both the original author and date in the reply header
                 // (date followed by author)
          mCitePrefix.Assign(replyHeaderOnDateAuthorWrote);
          citingHeader = true;
          headerDate = true;
          break;

        case 3:  // Insert both the original author and date in the reply header
                 // (author followed by date)
          mCitePrefix.Assign(replyHeaderAuthorWroteOnDate);
          citingHeader = true;
          headerDate = true;
          break;

        case 4:  // TODO bug 107884: implement a more featureful user specified
                 // header
        case 1:
        default:  // Default is to only show the author.
          mCitePrefix.Assign(replyHeaderAuthorWrote);
          citingHeader = true;
          headerDate = false;
          break;
      }

      if (citingHeader) {
        int32_t placeholderIndex = kNotFound;

        if (headerDate) {
          PRTime originalMsgDate;
          rv = origMsgHdr->GetDate(&originalMsgDate);
          if (NS_SUCCEEDED(rv)) {
            nsAutoString citeDatePart;
            if ((placeholderIndex = mCitePrefix.Find(u"#2")) != kNotFound) {
              mozilla::intl::DateTimeFormat::StyleBag style;
              style.date =
                  mozilla::Some(mozilla::intl::DateTimeFormat::Style::Short);
              rv = mozilla::intl::AppDateTimeFormat::Format(
                  style, originalMsgDate, citeDatePart);
              if (NS_SUCCEEDED(rv))
                mCitePrefix.Replace(placeholderIndex, 2, citeDatePart);
            }
            if ((placeholderIndex = mCitePrefix.Find(u"#3")) != kNotFound) {
              mozilla::intl::DateTimeFormat::StyleBag style;
              style.time =
                  mozilla::Some(mozilla::intl::DateTimeFormat::Style::Short);
              rv = mozilla::intl::AppDateTimeFormat::Format(
                  style, originalMsgDate, citeDatePart);
              if (NS_SUCCEEDED(rv))
                mCitePrefix.Replace(placeholderIndex, 2, citeDatePart);
            }
          }
        }

        if ((placeholderIndex = mCitePrefix.Find(u"#1")) != kNotFound) {
          nsAutoCString author;
          rv = origMsgHdr->GetAuthor(author);
          if (NS_SUCCEEDED(rv)) {
            nsAutoString citeAuthor;
            ExtractName(EncodedHeader(author), citeAuthor);
            mCitePrefix.Replace(placeholderIndex, 2, citeAuthor);
          }
        }
      }
    }

    // This should not happen, but just in case.
    if (mCitePrefix.IsEmpty()) {
      mCitePrefix.AppendLiteral("\n\n");
      mCitePrefix.Append(replyHeaderOriginalmessage);
      mCitePrefix.AppendLiteral("\n");
    }
  }
}

/**
 * The formatflowed parameter directs if formatflowed should be used in the
 * conversion. format=flowed (RFC 2646) is a way to represent flow in a plain
 * text mail, without disturbing the plain text.
 */
nsresult QuotingOutputStreamListener::ConvertToPlainText(bool formatflowed,
                                                         bool formatted,
                                                         bool disallowBreaks) {
  nsresult rv =
      ConvertBufToPlainText(mMsgBody, formatflowed, formatted, disallowBreaks);
  NS_ENSURE_SUCCESS(rv, rv);
  return ConvertBufToPlainText(mSignature, formatflowed, formatted,
                               disallowBreaks);
}

NS_IMETHODIMP QuotingOutputStreamListener::OnStartRequest(nsIRequest* request) {
  return NS_OK;
}

MOZ_CAN_RUN_SCRIPT_BOUNDARY NS_IMETHODIMP
QuotingOutputStreamListener::OnStopRequest(nsIRequest* request,
                                           nsresult status) {
  nsresult rv = NS_OK;

  if (!mHtmlToQuote.IsEmpty()) {
    // If we had a selection in the original message to quote, we can add
    // it now that we are done ignoring the original body of the message
    mHeadersOnly = false;
    rv = AppendToMsgBody(mHtmlToQuote);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsCOMPtr<nsIMsgCompose> compose = do_QueryReferent(mWeakComposeObj);
  NS_ENSURE_TRUE(compose, NS_ERROR_NULL_POINTER);

  MSG_ComposeType type;
  compose->GetType(&type);

  // Assign cite information if available...
  if (!mCiteReference.IsEmpty()) compose->SetCiteReference(mCiteReference);

  bool overrideReplyTo =
      mozilla::Preferences::GetBool("mail.override_list_reply_to", true);

  if (mHeaders &&
      (type == nsIMsgCompType::Reply || type == nsIMsgCompType::ReplyAll ||
       type == nsIMsgCompType::ReplyToList ||
       type == nsIMsgCompType::ReplyToSender ||
       type == nsIMsgCompType::ReplyToGroup ||
       type == nsIMsgCompType::ReplyToSenderAndGroup) &&
      mQuoteOriginal) {
    nsCOMPtr<nsIMsgCompFields> compFields;
    compose->GetCompFields(getter_AddRefs(compFields));
    if (compFields) {
      nsAutoString from;
      nsAutoString to;
      nsAutoString cc;
      nsAutoString bcc;
      nsAutoString replyTo;
      nsAutoString mailReplyTo;
      nsAutoString mailFollowupTo;
      nsAutoString newgroups;
      nsAutoString followUpTo;
      nsAutoString messageId;
      nsAutoString references;
      nsAutoString listPost;

      nsCString outCString;  // Temp helper string.

      bool needToRemoveDup = false;
      if (!mMimeConverter) {
        mMimeConverter =
            do_GetService("@mozilla.org/messenger/mimeconverter;1", &rv);
        NS_ENSURE_SUCCESS(rv, rv);
      }
      nsCString charset("UTF-8");

      mHeaders->ExtractHeader(HEADER_FROM, true, outCString);
      nsMsgI18NConvertRawBytesToUTF16(outCString, charset, from);

      mHeaders->ExtractHeader(HEADER_TO, true, outCString);
      nsMsgI18NConvertRawBytesToUTF16(outCString, charset, to);

      mHeaders->ExtractHeader(HEADER_CC, true, outCString);
      nsMsgI18NConvertRawBytesToUTF16(outCString, charset, cc);

      mHeaders->ExtractHeader(HEADER_BCC, true, outCString);
      nsMsgI18NConvertRawBytesToUTF16(outCString, charset, bcc);

      mHeaders->ExtractHeader(HEADER_MAIL_FOLLOWUP_TO, true, outCString);
      nsMsgI18NConvertRawBytesToUTF16(outCString, charset, mailFollowupTo);

      mHeaders->ExtractHeader(HEADER_REPLY_TO, false, outCString);
      nsMsgI18NConvertRawBytesToUTF16(outCString, charset, replyTo);

      mHeaders->ExtractHeader(HEADER_MAIL_REPLY_TO, true, outCString);
      nsMsgI18NConvertRawBytesToUTF16(outCString, charset, mailReplyTo);

      mHeaders->ExtractHeader(HEADER_NEWSGROUPS, false, outCString);
      if (!outCString.IsEmpty())
        mMimeConverter->DecodeMimeHeader(outCString.get(), charset.get(), false,
                                         true, newgroups);

      mHeaders->ExtractHeader(HEADER_FOLLOWUP_TO, false, outCString);
      if (!outCString.IsEmpty())
        mMimeConverter->DecodeMimeHeader(outCString.get(), charset.get(), false,
                                         true, followUpTo);

      mHeaders->ExtractHeader(HEADER_MESSAGE_ID, false, outCString);
      if (!outCString.IsEmpty())
        mMimeConverter->DecodeMimeHeader(outCString.get(), charset.get(), false,
                                         true, messageId);

      mHeaders->ExtractHeader(HEADER_REFERENCES, false, outCString);
      if (!outCString.IsEmpty())
        mMimeConverter->DecodeMimeHeader(outCString.get(), charset.get(), false,
                                         true, references);

      mHeaders->ExtractHeader(HEADER_LIST_POST, true, outCString);
      if (!outCString.IsEmpty())
        mMimeConverter->DecodeMimeHeader(outCString.get(), charset.get(), false,
                                         true, listPost);
      if (!listPost.IsEmpty()) {
        int32_t startPos = listPost.Find(u"<mailto:");
        int32_t endPos = listPost.FindChar('>', startPos);
        // Extract the e-mail address.
        if (endPos > startPos) {
          const uint32_t mailtoLen = strlen("<mailto:");
          listPost = Substring(listPost, startPos + mailtoLen,
                               endPos - (startPos + mailtoLen));
        }
      }

      nsCString fromEmailAddress;
      ExtractEmail(EncodedHeaderW(from), fromEmailAddress);

      nsTArray<nsCString> toEmailAddresses;
      ExtractEmails(EncodedHeaderW(to), UTF16ArrayAdapter<>(toEmailAddresses));

      nsTArray<nsCString> ccEmailAddresses;
      ExtractEmails(EncodedHeaderW(cc), UTF16ArrayAdapter<>(ccEmailAddresses));

      nsCOMPtr<nsIPrefBranch> prefs(
          do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
      NS_ENSURE_SUCCESS(rv, rv);
      bool replyToSelfCheckAll = false;
      prefs->GetBoolPref("mailnews.reply_to_self_check_all_ident",
                         &replyToSelfCheckAll);

      nsCOMPtr<nsIMsgAccountManager> accountManager =
          do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
      NS_ENSURE_SUCCESS(rv, rv);

      nsTArray<RefPtr<nsIMsgIdentity>> identities;
      nsCString accountKey;
      mOrigMsgHdr->GetAccountKey(getter_Copies(accountKey));
      if (replyToSelfCheckAll) {
        // Check all available identities if the pref was set.
        accountManager->GetAllIdentities(identities);
      } else if (!accountKey.IsEmpty()) {
        // Check headers to see which account the message came in from
        // (only works for pop3).
        nsCOMPtr<nsIMsgAccount> account;
        accountManager->GetAccount(accountKey, getter_AddRefs(account));
        if (account) {
          rv = account->GetIdentities(identities);
          NS_ENSURE_SUCCESS(rv, rv);
        }
      } else {
        // Check identities only for the server of the folder that the message
        // is in.
        nsCOMPtr<nsIMsgFolder> msgFolder;
        rv = mOrigMsgHdr->GetFolder(getter_AddRefs(msgFolder));

        if (NS_SUCCEEDED(rv) && msgFolder) {
          nsCOMPtr<nsIMsgIncomingServer> nsIMsgIncomingServer;
          rv = msgFolder->GetServer(getter_AddRefs(nsIMsgIncomingServer));

          if (NS_SUCCEEDED(rv) && nsIMsgIncomingServer) {
            rv = accountManager->GetIdentitiesForServer(nsIMsgIncomingServer,
                                                        identities);
            NS_ENSURE_SUCCESS(rv, rv);
          }
        }
      }

      bool isReplyToSelf = false;
      nsCOMPtr<nsIMsgIdentity> selfIdentity;
      if (!identities.IsEmpty()) {
        nsTArray<nsCString> toEmailAddressesLower(toEmailAddresses.Length());
        for (auto email : toEmailAddresses) {
          ToLowerCase(email);
          toEmailAddressesLower.AppendElement(email);
        }
        nsTArray<nsCString> ccEmailAddressesLower(ccEmailAddresses.Length());
        for (auto email : ccEmailAddresses) {
          ToLowerCase(email);
          ccEmailAddressesLower.AppendElement(email);
        }

        // Go through the identities to see if any of them is the author of
        // the email.
        for (auto lookupIdentity : identities) {
          selfIdentity = lookupIdentity;

          nsCString curIdentityEmail;
          lookupIdentity->GetEmail(curIdentityEmail);

          // See if it's a reply to own message, but not a reply between
          // identities.
          if (curIdentityEmail.Equals(fromEmailAddress,
                                      nsCaseInsensitiveCStringComparator)) {
            isReplyToSelf = true;
            // For a true reply-to-self, none of your identities are normally in
            // To or Cc. We need to avoid doing a reply-to-self for people that
            // have multiple identities set and sometimes *uses* the other
            // identity and sometimes *mails* the other identity.
            // E.g. husband+wife or own-email+company-role-mail.
            for (auto lookupIdentity2 : identities) {
              nsCString curIdentityEmail2;
              lookupIdentity2->GetEmail(curIdentityEmail2);
              ToLowerCase(curIdentityEmail2);
              if (toEmailAddressesLower.Contains(curIdentityEmail2)) {
                // However, "From:me To:me" should be treated as
                // reply-to-self if we have a Bcc. If we don't have a Bcc we
                // might have the case of a generated mail of the style
                // "From:me To:me Reply-To:customer". Then we need to to do a
                // normal reply to the customer.
                isReplyToSelf = !bcc.IsEmpty();  // true if bcc is set
                break;
              } else if (ccEmailAddressesLower.Contains(curIdentityEmail2)) {
                // If you auto-Cc yourself your email would be in Cc - but we
                // can't detect why it is in Cc so lets just treat it like a
                // normal reply.
                isReplyToSelf = false;
                break;
              }
            }
            break;
          }
        }
      }
      if (type == nsIMsgCompType::ReplyToSenderAndGroup ||
          type == nsIMsgCompType::ReplyToSender ||
          type == nsIMsgCompType::Reply) {
        if (isReplyToSelf) {
          // Cast to concrete class. We *only* what to change m_identity, not
          // all the things compose->SetIdentity would do.
          nsMsgCompose* _compose = static_cast<nsMsgCompose*>(compose.get());
          _compose->m_identity = selfIdentity;
          compFields->SetFrom(from);
          compFields->SetTo(to);
          compFields->SetReplyTo(replyTo);
        } else if (!mailReplyTo.IsEmpty()) {
          // handle Mail-Reply-To (http://cr.yp.to/proto/replyto.html)
          compFields->SetTo(mailReplyTo);
          needToRemoveDup = true;
        } else if (!replyTo.IsEmpty()) {
          // default reply behaviour then

          if (overrideReplyTo && !listPost.IsEmpty() &&
              replyTo.Find(listPost) != kNotFound) {
            // Reply-To munging in this list post. Reply to From instead,
            // as the user can choose Reply List if that's what he wants.
            compFields->SetTo(from);
          } else {
            compFields->SetTo(replyTo);
          }
          needToRemoveDup = true;
        } else {
          compFields->SetTo(from);
        }
      } else if (type == nsIMsgCompType::ReplyAll) {
        if (isReplyToSelf) {
          // Cast to concrete class. We *only* what to change m_identity, not
          // all the things compose->SetIdentity would do.
          nsMsgCompose* _compose = static_cast<nsMsgCompose*>(compose.get());
          _compose->m_identity = selfIdentity;
          compFields->SetFrom(from);
          compFields->SetTo(to);
          compFields->SetCc(cc);
          // In case it's a reply to self, but it's not the actual source of the
          // sent message, then we won't know the Bcc header. So set it only if
          // it's not empty. If you have auto-bcc and removed the auto-bcc for
          // the original mail, you will have to do it manually for this reply
          // too.
          if (!bcc.IsEmpty()) compFields->SetBcc(bcc);
          compFields->SetReplyTo(replyTo);
          needToRemoveDup = true;
        } else if (mailFollowupTo.IsEmpty()) {
          // default reply-all behaviour then

          nsAutoString allTo;
          if (!replyTo.IsEmpty()) {
            allTo.Assign(replyTo);
            needToRemoveDup = true;
            if (overrideReplyTo && !listPost.IsEmpty() &&
                replyTo.Find(listPost) != kNotFound) {
              // Reply-To munging in this list. Add From to recipients, it's the
              // lesser evil...
              allTo.AppendLiteral(", ");
              allTo.Append(from);
            }
          } else {
            allTo.Assign(from);
          }

          allTo.AppendLiteral(", ");
          allTo.Append(to);
          compFields->SetTo(allTo);

          nsAutoString allCc;
          compFields->GetCc(allCc);  // auto-cc
          if (!allCc.IsEmpty()) allCc.AppendLiteral(", ");
          allCc.Append(cc);
          compFields->SetCc(allCc);

          needToRemoveDup = true;
        } else {
          // Handle Mail-Followup-To (http://cr.yp.to/proto/replyto.html)
          compFields->SetTo(mailFollowupTo);
          needToRemoveDup = true;  // To remove possible self from To.

          // If Cc is set a this point it's auto-Ccs, so we'll just keep those.
        }
      } else if (type == nsIMsgCompType::ReplyToList) {
        compFields->SetTo(listPost);
      }

      if (!newgroups.IsEmpty()) {
        if ((type != nsIMsgCompType::Reply) &&
            (type != nsIMsgCompType::ReplyToSender))
          compFields->SetNewsgroups(newgroups);
        if (type == nsIMsgCompType::ReplyToGroup)
          compFields->SetTo(EmptyString());
      }

      if (!followUpTo.IsEmpty()) {
        // Handle "followup-to: poster" magic keyword here
        if (followUpTo.EqualsLiteral("poster")) {
          nsCOMPtr<mozIDOMWindowProxy> domWindow;
          compose->GetDomWindow(getter_AddRefs(domWindow));
          NS_ENSURE_TRUE(domWindow, NS_ERROR_FAILURE);
          nsMsgDisplayMessageByName(domWindow, "followupToSenderMessage");

          if (!replyTo.IsEmpty()) {
            compFields->SetTo(replyTo);
          } else {
            // If reply-to is empty, use the From header to fetch the original
            // sender's email.
            compFields->SetTo(from);
          }

          // Clear the newsgroup: header field, because followup-to: poster
          // only follows up to the original sender
          if (!newgroups.IsEmpty()) compFields->SetNewsgroups(EmptyString());
        } else  // Process "followup-to: newsgroup-content" here
        {
          if (type != nsIMsgCompType::ReplyToSender)
            compFields->SetNewsgroups(followUpTo);
          if (type == nsIMsgCompType::Reply) {
            compFields->SetTo(EmptyString());
          }
        }
      }

      if (!references.IsEmpty()) references.Append(char16_t(' '));
      references += messageId;
      compFields->SetReferences(NS_LossyConvertUTF16toASCII(references).get());

      nsAutoCString resultStr;

      // Cast interface to concrete class that has direct field getters etc.
      nsMsgCompFields* _compFields =
          static_cast<nsMsgCompFields*>(compFields.get());

      // Remove duplicate addresses between To && Cc.
      if (needToRemoveDup) {
        nsCString addressesToRemoveFromCc;
        if (mIdentity) {
          bool removeMyEmailInCc = true;
          nsCString myEmail;
          // Get senders address from composeField or from identity,
          nsAutoCString sender(_compFields->GetFrom());
          ExtractEmail(EncodedHeader(sender), myEmail);
          if (myEmail.IsEmpty()) mIdentity->GetEmail(myEmail);

          // Remove my own address from To, unless it's a reply to self.
          if (!isReplyToSelf) {
            RemoveDuplicateAddresses(nsDependentCString(_compFields->GetTo()),
                                     myEmail, resultStr);
            _compFields->SetTo(resultStr.get());
          }
          addressesToRemoveFromCc.Assign(_compFields->GetTo());

          // Remove own address from CC unless we want it in there
          // through the automatic-CC-to-self (see bug 584962). There are
          // three cases:
          // - user has no automatic CC
          // - user has automatic CC but own email is not in it
          // - user has automatic CC and own email in it
          // Only in the last case do we want our own email address to stay
          // in the CC list.
          bool automaticCc;
          mIdentity->GetDoCc(&automaticCc);
          if (automaticCc) {
            nsCString autoCcList;
            mIdentity->GetDoCcList(autoCcList);
            nsTArray<nsCString> autoCcEmailAddresses;
            ExtractEmails(EncodedHeader(autoCcList),
                          UTF16ArrayAdapter<>(autoCcEmailAddresses));
            if (autoCcEmailAddresses.Contains(myEmail)) {
              removeMyEmailInCc = false;
            }
          }

          if (removeMyEmailInCc) {
            addressesToRemoveFromCc.AppendLiteral(", ");
            addressesToRemoveFromCc.Append(myEmail);
          }
        }
        RemoveDuplicateAddresses(nsDependentCString(_compFields->GetCc()),
                                 addressesToRemoveFromCc, resultStr);
        _compFields->SetCc(resultStr.get());
        if (_compFields->GetBcc()) {
          // Remove addresses already in Cc from Bcc.
          RemoveDuplicateAddresses(nsDependentCString(_compFields->GetBcc()),
                                   nsDependentCString(_compFields->GetCc()),
                                   resultStr);
          if (!resultStr.IsEmpty()) {
            // Remove addresses already in To from Bcc.
            RemoveDuplicateAddresses(
                resultStr, nsDependentCString(_compFields->GetTo()), resultStr);
          }
          _compFields->SetBcc(resultStr.get());
        }
      }
    }
  }

  if (mQuoteOriginal)
    compose->NotifyStateListeners(
        nsIMsgComposeNotificationType::ComposeFieldsReady, NS_OK);

  if (!mHeadersOnly) mMsgBody.AppendLiteral("</html>");

  // Now we have an HTML representation of the quoted message.
  // If we are in plain text mode, we need to convert this to plain
  // text before we try to insert it into the editor. If we don't, we
  // just get lots of HTML text in the message...not good.
  //
  // XXX not m_composeHTML? /BenB
  bool composeHTML = true;
  compose->GetComposeHTML(&composeHTML);
  if (!composeHTML) {
    // Downsampling.

    // In plain text quotes we always allow line breaking to not end up with
    // long lines. The quote is inserted into a span with style
    // "white-space: pre;" which isn't be wrapped.
    // Update: Bug 387687 changed this to "white-space: pre-wrap;".
    // Note that the body of the plain text message is wrapped since it uses
    // "white-space: pre-wrap; width: 72ch;".
    // Look at it in the DOM Inspector to see it.
    //
    // If we're using format flowed, we need to pass it so the encoder
    // can add a space at the end.
    nsCOMPtr<nsIPrefBranch> pPrefBranch(
        do_GetService(NS_PREFSERVICE_CONTRACTID));
    bool flowed = false;
    if (pPrefBranch) {
      pPrefBranch->GetBoolPref("mailnews.send_plaintext_flowed", &flowed);
    }

    rv = ConvertToPlainText(flowed,
                            true,    // formatted
                            false);  // allow line breaks
    NS_ENSURE_SUCCESS(rv, rv);
  }

  compose->ProcessSignature(mIdentity, true, &mSignature);

  nsCOMPtr<nsIEditor> editor;
  if (NS_SUCCEEDED(compose->GetEditor(getter_AddRefs(editor))) && editor) {
    if (mQuoteOriginal)
      compose->ConvertAndLoadComposeWindow(mCitePrefix, mMsgBody, mSignature,
                                           true, composeHTML);
    else
      InsertToCompose(editor, composeHTML);
  }

  if (mQuoteOriginal)
    compose->NotifyStateListeners(
        nsIMsgComposeNotificationType::ComposeBodyReady, NS_OK);
  return rv;
}

NS_IMETHODIMP QuotingOutputStreamListener::OnDataAvailable(
    nsIRequest* request, nsIInputStream* inStr, uint64_t sourceOffset,
    uint32_t count) {
  nsresult rv = NS_OK;
  NS_ENSURE_ARG(inStr);

  if (mHeadersOnly) return rv;

  char* newBuf = (char*)PR_Malloc(count + 1);
  if (!newBuf) return NS_ERROR_FAILURE;

  uint32_t numWritten = 0;
  rv = inStr->Read(newBuf, count, &numWritten);
  if (rv == NS_BASE_STREAM_WOULD_BLOCK) rv = NS_OK;
  newBuf[numWritten] = '\0';
  if (NS_SUCCEEDED(rv) && numWritten > 0) {
    rv = AppendToMsgBody(nsDependentCString(newBuf, numWritten));
  }

  PR_FREEIF(newBuf);
  return rv;
}

nsresult QuotingOutputStreamListener::AppendToMsgBody(const nsCString& inStr) {
  nsresult rv = NS_OK;
  if (!inStr.IsEmpty()) {
    nsAutoString tmp;
    rv = UTF_8_ENCODING->DecodeWithoutBOMHandling(inStr, tmp);
    if (NS_SUCCEEDED(rv)) mMsgBody.Append(tmp);
  }
  return rv;
}

nsresult QuotingOutputStreamListener::SetComposeObj(nsIMsgCompose* obj) {
  mWeakComposeObj = do_GetWeakReference(obj);
  return NS_OK;
}

NS_IMETHODIMP
QuotingOutputStreamListener::SetMimeHeaders(nsIMimeHeaders* headers) {
  mHeaders = headers;
  return NS_OK;
}

nsresult QuotingOutputStreamListener::InsertToCompose(nsIEditor* aEditor,
                                                      bool aHTMLEditor) {
  NS_ENSURE_ARG(aEditor);
  nsCOMPtr<nsINode> nodeInserted;

  TranslateLineEnding(mMsgBody);

  // Now, insert it into the editor...
  aEditor->EnableUndo(true);

  nsCOMPtr<nsIMsgCompose> compose = do_QueryReferent(mWeakComposeObj);
  if (!mMsgBody.IsEmpty() && compose) {
    compose->SetAllowRemoteContent(true);
    if (!mCitePrefix.IsEmpty()) {
      if (!aHTMLEditor) mCitePrefix.AppendLiteral("\n");
      aEditor->InsertText(mCitePrefix);
    }

    RefPtr<mozilla::HTMLEditor> htmlEditor = aEditor->AsHTMLEditor();
    if (aHTMLEditor) {
      nsAutoString body(mMsgBody);
      remove_plaintext_tag(body);
      htmlEditor->InsertAsCitedQuotation(body, EmptyString(), true,
                                         getter_AddRefs(nodeInserted));
    } else {
      htmlEditor->InsertAsQuotation(mMsgBody, getter_AddRefs(nodeInserted));
    }
    compose->SetAllowRemoteContent(false);
  }

  RefPtr<Selection> selection;
  nsCOMPtr<nsINode> parent;
  int32_t offset;
  nsresult rv;

  // get parent and offset of mailcite
  rv = GetNodeLocation(nodeInserted, address_of(parent), &offset);
  NS_ENSURE_SUCCESS(rv, rv);

  // get selection
  aEditor->GetSelection(getter_AddRefs(selection));
  if (selection) {
    // place selection after mailcite
    selection->CollapseInLimiter(parent, offset + 1);
    // insert a break at current selection
    aEditor->InsertLineBreak();
    selection->CollapseInLimiter(parent, offset + 1);
  }
  nsCOMPtr<nsISelectionController> selCon;
  aEditor->GetSelectionController(getter_AddRefs(selCon));

  if (selCon)
    // After ScrollSelectionIntoView(), the pending notifications might be
    // flushed and PresShell/PresContext/Frames may be dead. See bug 418470.
    selCon->ScrollSelectionIntoView(
        nsISelectionController::SELECTION_NORMAL,
        nsISelectionController::SELECTION_ANCHOR_REGION,
        nsISelectionController::SCROLL_SYNCHRONOUS);

  return NS_OK;
}

/**
 * Returns true if the domain is a match for the given the domain list.
 * Subdomains are also considered to match.
 * @param aDomain - the domain name to check
 * @param aDomainList - a comma separated string of domain names
 */
bool IsInDomainList(const nsAString& aDomain, const nsAString& aDomainList) {
  if (aDomain.IsEmpty() || aDomainList.IsEmpty()) return false;

  // Check plain text domains.
  int32_t left = 0;
  int32_t right = 0;
  while (right != (int32_t)aDomainList.Length()) {
    right = aDomainList.FindChar(',', left);
    if (right == kNotFound) right = aDomainList.Length();
    nsDependentSubstring domain = Substring(aDomainList, left, right);

    if (aDomain.Equals(domain, nsCaseInsensitiveStringComparator)) return true;

    nsAutoString dotDomain;
    dotDomain.Assign(u'.');
    dotDomain.Append(domain);
    if (StringEndsWith(aDomain, dotDomain, nsCaseInsensitiveStringComparator))
      return true;

    left = right + 1;
  }
  return false;
}

NS_IMPL_ISUPPORTS(QuotingOutputStreamListener,
                  nsIMsgQuotingOutputStreamListener, nsIRequestObserver,
                  nsIStreamListener, nsISupportsWeakReference)

////////////////////////////////////////////////////////////////////////////////////
// END OF QUOTING LISTENER
////////////////////////////////////////////////////////////////////////////////////

/* attribute MSG_ComposeType type; */
NS_IMETHODIMP nsMsgCompose::SetType(MSG_ComposeType aType) {
  mType = aType;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::GetType(MSG_ComposeType* aType) {
  NS_ENSURE_ARG_POINTER(aType);

  *aType = mType;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::QuoteMessage(const nsACString& msgURI) {
  nsresult rv;
  mQuotingToFollow = false;

  // Create a mime parser (nsIStreamConverter)!
  mQuote = do_CreateInstance("@mozilla.org/messengercompose/quoting;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  rv = GetMsgDBHdrFromURI(msgURI, getter_AddRefs(msgHdr));

  // Create the consumer output stream.. this will receive all the HTML from
  // libmime
  mQuoteStreamListener =
      new QuotingOutputStreamListener(msgHdr, false, !mHtmlToQuote.IsEmpty(),
                                      m_identity, mQuote, false, mHtmlToQuote);

  mQuoteStreamListener->SetComposeObj(this);

  rv = mQuote->QuoteMessage(msgURI, false, mQuoteStreamListener,
                            mAutodetectCharset, false, msgHdr);
  return rv;
}

nsresult nsMsgCompose::QuoteOriginalMessage()  // New template
{
  nsresult rv;

  mQuotingToFollow = false;

  // Create a mime parser (nsIStreamConverter)!
  mQuote = do_CreateInstance("@mozilla.org/messengercompose/quoting;1", &rv);
  if (NS_FAILED(rv) || !mQuote) return NS_ERROR_FAILURE;

  bool bAutoQuote = true;
  m_identity->GetAutoQuote(&bAutoQuote);

  nsCOMPtr<nsIMsgDBHdr> originalMsgHdr = mOrigMsgHdr;
  if (!originalMsgHdr) {
    rv = GetMsgDBHdrFromURI(mOriginalMsgURI, getter_AddRefs(originalMsgHdr));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsAutoCString msgUri(mOriginalMsgURI);
  bool fileUrl = StringBeginsWith(msgUri, "file:"_ns);
  if (fileUrl) {
    msgUri.Replace(0, 5, "mailbox:"_ns);
    msgUri.AppendLiteral("?number=0");
  }

  // Create the consumer output stream.. this will receive all the HTML from
  // libmime
  mQuoteStreamListener = new QuotingOutputStreamListener(
      originalMsgHdr, mWhatHolder != 1, !bAutoQuote || !mHtmlToQuote.IsEmpty(),
      m_identity, mQuote, true, mHtmlToQuote);

  mQuoteStreamListener->SetComposeObj(this);

  rv = mQuote->QuoteMessage(msgUri, mWhatHolder != 1, mQuoteStreamListener,
                            mAutodetectCharset, !bAutoQuote, originalMsgHdr);
  return rv;
}

// CleanUpRecipient will remove un-necessary "<>" when a recipient as an address
// without name
void nsMsgCompose::CleanUpRecipients(nsString& recipients) {
  uint16_t i;
  bool startANewRecipient = true;
  bool removeBracket = false;
  nsAutoString newRecipient;
  char16_t aChar;

  for (i = 0; i < recipients.Length(); i++) {
    aChar = recipients[i];
    switch (aChar) {
      case '<':
        if (startANewRecipient)
          removeBracket = true;
        else
          newRecipient += aChar;
        startANewRecipient = false;
        break;

      case '>':
        if (removeBracket)
          removeBracket = false;
        else
          newRecipient += aChar;
        break;

      case ' ':
        newRecipient += aChar;
        break;

      case ',':
        newRecipient += aChar;
        startANewRecipient = true;
        removeBracket = false;
        break;

      default:
        newRecipient += aChar;
        startANewRecipient = false;
        break;
    }
  }
  recipients = newRecipient;
}

NS_IMETHODIMP nsMsgCompose::RememberQueuedDisposition() {
  // need to find the msg hdr in the saved folder and then set a property on
  // the header that we then look at when we actually send the message.
  nsresult rv;
  nsAutoCString dispositionSetting;

  if (mType == nsIMsgCompType::Reply || mType == nsIMsgCompType::ReplyAll ||
      mType == nsIMsgCompType::ReplyToList ||
      mType == nsIMsgCompType::ReplyToGroup ||
      mType == nsIMsgCompType::ReplyToSender ||
      mType == nsIMsgCompType::ReplyToSenderAndGroup) {
    dispositionSetting.AssignLiteral("replied");
  } else if (mType == nsIMsgCompType::ForwardAsAttachment ||
             mType == nsIMsgCompType::ForwardInline) {
    dispositionSetting.AssignLiteral("forwarded");
  } else if (mType == nsIMsgCompType::Redirect) {
    dispositionSetting.AssignLiteral("redirected");
  } else if (mType == nsIMsgCompType::Draft) {
    nsAutoCString curDraftIdURL;
    rv = m_compFields->GetDraftId(curDraftIdURL);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!curDraftIdURL.IsEmpty()) {
      nsCOMPtr<nsIMsgDBHdr> draftHdr;
      rv = GetMsgDBHdrFromURI(curDraftIdURL, getter_AddRefs(draftHdr));
      NS_ENSURE_SUCCESS(rv, rv);
      draftHdr->GetStringProperty(QUEUED_DISPOSITION_PROPERTY,
                                  dispositionSetting);
    }
  }

  nsMsgKey msgKey;
  if (mMsgSend) {
    mMsgSend->GetMessageKey(&msgKey);
    nsCString identityKey;

    m_identity->GetKey(identityKey);

    nsCOMPtr<nsIMsgFolder> folder;
    rv = GetOrCreateFolder(m_folderName, getter_AddRefs(folder));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    rv = folder->GetMessageHeader(msgKey, getter_AddRefs(msgHdr));
    NS_ENSURE_SUCCESS(rv, rv);

    uint32_t pseudoHdrProp = 0;
    msgHdr->GetUint32Property("pseudoHdr", &pseudoHdrProp);
    if (pseudoHdrProp) {
      // Use SetAttributeOnPendingHdr for IMAP pseudo headers, as those
      // will get deleted (and properties set using SetStringProperty lost.)
      nsCOMPtr<nsIMsgFolder> folder;
      rv = msgHdr->GetFolder(getter_AddRefs(folder));
      NS_ENSURE_SUCCESS(rv, rv);
      nsCOMPtr<nsIMsgDatabase> msgDB;
      rv = folder->GetMsgDatabase(getter_AddRefs(msgDB));
      NS_ENSURE_SUCCESS(rv, rv);

      nsCString messageId;
      mMsgSend->GetMessageId(messageId);
      msgHdr->SetMessageId(messageId);
      if (!mOriginalMsgURI.IsEmpty()) {
        msgDB->SetAttributeOnPendingHdr(msgHdr, ORIG_URI_PROPERTY,
                                        mOriginalMsgURI.get());
        if (!dispositionSetting.IsEmpty())
          msgDB->SetAttributeOnPendingHdr(msgHdr, QUEUED_DISPOSITION_PROPERTY,
                                          dispositionSetting.get());
      }
      msgDB->SetAttributeOnPendingHdr(msgHdr, HEADER_X_MOZILLA_IDENTITY_KEY,
                                      identityKey.get());
    } else if (msgHdr) {
      if (!mOriginalMsgURI.IsEmpty()) {
        msgHdr->SetStringProperty(ORIG_URI_PROPERTY, mOriginalMsgURI);
        if (!dispositionSetting.IsEmpty())
          msgHdr->SetStringProperty(QUEUED_DISPOSITION_PROPERTY,
                                    dispositionSetting);
      }
      msgHdr->SetStringProperty(HEADER_X_MOZILLA_IDENTITY_KEY, identityKey);
    }
  }
  return NS_OK;
}

nsresult nsMsgCompose::ProcessReplyFlags() {
  nsresult rv;
  // check to see if we were doing a reply or a forward, if we were, set the
  // answered field flag on the message folder for this URI.
  if (mType == nsIMsgCompType::Reply || mType == nsIMsgCompType::ReplyAll ||
      mType == nsIMsgCompType::ReplyToList ||
      mType == nsIMsgCompType::ReplyToGroup ||
      mType == nsIMsgCompType::ReplyToSender ||
      mType == nsIMsgCompType::ReplyToSenderAndGroup ||
      mType == nsIMsgCompType::ForwardAsAttachment ||
      mType == nsIMsgCompType::ForwardInline ||
      mType == nsIMsgCompType::Redirect ||
      mDraftDisposition != nsIMsgFolder::nsMsgDispositionState_None) {
    if (!mOriginalMsgURI.IsEmpty()) {
      nsCString msgUri(mOriginalMsgURI);
      char* newStr = msgUri.BeginWriting();
      char* uri;
      while (nullptr != (uri = NS_strtok(",", &newStr))) {
        nsCOMPtr<nsIMsgDBHdr> msgHdr;
        rv =
            GetMsgDBHdrFromURI(nsDependentCString(uri), getter_AddRefs(msgHdr));
        NS_ENSURE_SUCCESS(rv, rv);
        if (msgHdr) {
          // get the folder for the message resource
          nsCOMPtr<nsIMsgFolder> msgFolder;
          msgHdr->GetFolder(getter_AddRefs(msgFolder));
          if (msgFolder) {
            // If it's a draft with disposition, default to replied, otherwise,
            // check if it's a forward.
            nsMsgDispositionState dispositionSetting =
                nsIMsgFolder::nsMsgDispositionState_Replied;
            if (mDraftDisposition != nsIMsgFolder::nsMsgDispositionState_None)
              dispositionSetting = mDraftDisposition;
            else if (mType == nsIMsgCompType::ForwardAsAttachment ||
                     mType == nsIMsgCompType::ForwardInline)
              dispositionSetting =
                  nsIMsgFolder::nsMsgDispositionState_Forwarded;
            else if (mType == nsIMsgCompType::Redirect)
              dispositionSetting =
                  nsIMsgFolder::nsMsgDispositionState_Redirected;

            msgFolder->AddMessageDispositionState(msgHdr, dispositionSetting);
            if (mType != nsIMsgCompType::ForwardAsAttachment)
              break;  // just safeguard
          }
        }
      }
    }
  }

  return NS_OK;
}
NS_IMETHODIMP nsMsgCompose::OnStartSending(const char* aMsgID,
                                           uint32_t aMsgSize) {
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener>>::ForwardIterator iter(
      mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore()) {
    externalSendListener = iter.GetNext();
    externalSendListener->OnStartSending(aMsgID, aMsgSize);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::OnSendProgress(const char* aMsgID,
                                           uint32_t aProgress,
                                           uint32_t aProgressMax) {
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener>>::ForwardIterator iter(
      mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore()) {
    externalSendListener = iter.GetNext();
    externalSendListener->OnSendProgress(aMsgID, aProgress, aProgressMax);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::OnStatus(const char* aMsgID, const char16_t* aMsg) {
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener>>::ForwardIterator iter(
      mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore()) {
    externalSendListener = iter.GetNext();
    externalSendListener->OnStatus(aMsgID, aMsg);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::OnStopSending(const char* aMsgID, nsresult aStatus,
                                          const char16_t* aMsg,
                                          nsIFile* returnFile) {
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener>>::ForwardIterator iter(
      mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore()) {
    externalSendListener = iter.GetNext();
    externalSendListener->OnStopSending(aMsgID, aStatus, aMsg, returnFile);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::OnTransportSecurityError(const char* msgID, nsresult status,
                                       nsITransportSecurityInfo* secInfo,
                                       nsACString const& location) {
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener>>::ForwardIterator iter(
      mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore()) {
    externalSendListener = iter.GetNext();
    externalSendListener->OnTransportSecurityError(msgID, status, secInfo,
                                                   location);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::OnSendNotPerformed(const char* aMsgID,
                                               nsresult aStatus) {
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener>>::ForwardIterator iter(
      mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore()) {
    externalSendListener = iter.GetNext();
    externalSendListener->OnSendNotPerformed(aMsgID, aStatus);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::OnGetDraftFolderURI(const char* aMsgID,
                                                const nsACString& aFolderURI) {
  m_folderName = aFolderURI;
  nsTObserverArray<nsCOMPtr<nsIMsgSendListener>>::ForwardIterator iter(
      mExternalSendListeners);
  nsCOMPtr<nsIMsgSendListener> externalSendListener;

  while (iter.HasMore()) {
    externalSendListener = iter.GetNext();
    externalSendListener->OnGetDraftFolderURI(aMsgID, aFolderURI);
  }
  return NS_OK;
}

////////////////////////////////////////////////////////////////////////////////////
// This is the listener class for both the send operation and the copy
// operation. We have to create this class to listen for message send completion
// and deal with failures in both send and copy operations
////////////////////////////////////////////////////////////////////////////////////
NS_IMPL_ADDREF(nsMsgComposeSendListener)
NS_IMPL_RELEASE(nsMsgComposeSendListener)

/*
NS_IMPL_QUERY_INTERFACE(nsMsgComposeSendListener,
                         nsIMsgComposeSendListener,
                         nsIMsgSendListener,
                         nsIMsgCopyServiceListener,
                         nsIWebProgressListener)
*/
NS_INTERFACE_MAP_BEGIN(nsMsgComposeSendListener)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIMsgComposeSendListener)
  NS_INTERFACE_MAP_ENTRY(nsIMsgComposeSendListener)
  NS_INTERFACE_MAP_ENTRY(nsIMsgSendListener)
  NS_INTERFACE_MAP_ENTRY(nsIMsgCopyServiceListener)
  NS_INTERFACE_MAP_ENTRY(nsIWebProgressListener)
NS_INTERFACE_MAP_END

nsMsgComposeSendListener::nsMsgComposeSendListener(void) { mDeliverMode = 0; }

nsMsgComposeSendListener::~nsMsgComposeSendListener(void) {}

NS_IMETHODIMP nsMsgComposeSendListener::SetMsgCompose(nsIMsgCompose* obj) {
  mWeakComposeObj = do_GetWeakReference(obj);
  return NS_OK;
}

NS_IMETHODIMP nsMsgComposeSendListener::SetDeliverMode(
    MSG_DeliverMode deliverMode) {
  mDeliverMode = deliverMode;
  return NS_OK;
}

nsresult nsMsgComposeSendListener::OnStartSending(const char* aMsgID,
                                                  uint32_t aMsgSize) {
  nsresult rv;
  nsCOMPtr<nsIMsgSendListener> composeSendListener =
      do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnStartSending(aMsgID, aMsgSize);

  return NS_OK;
}

nsresult nsMsgComposeSendListener::OnSendProgress(const char* aMsgID,
                                                  uint32_t aProgress,
                                                  uint32_t aProgressMax) {
  nsresult rv;
  nsCOMPtr<nsIMsgSendListener> composeSendListener =
      do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnSendProgress(aMsgID, aProgress, aProgressMax);
  return NS_OK;
}

nsresult nsMsgComposeSendListener::OnStatus(const char* aMsgID,
                                            const char16_t* aMsg) {
  nsresult rv;
  nsCOMPtr<nsIMsgSendListener> composeSendListener =
      do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnStatus(aMsgID, aMsg);
  return NS_OK;
}

nsresult nsMsgComposeSendListener::OnSendNotPerformed(const char* aMsgID,
                                                      nsresult aStatus) {
  // since OnSendNotPerformed is called in the case where the user aborts the
  // operation by closing the compose window, we need not do the stuff required
  // for closing the windows. However we would need to do the other operations
  // as below.

  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgCompose> msgCompose = do_QueryReferent(mWeakComposeObj, &rv);
  if (msgCompose)
    msgCompose->NotifyStateListeners(
        nsIMsgComposeNotificationType::ComposeProcessDone, aStatus);

  nsCOMPtr<nsIMsgSendListener> composeSendListener =
      do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnSendNotPerformed(aMsgID, aStatus);

  return rv;
}

NS_IMETHODIMP
nsMsgComposeSendListener::OnTransportSecurityError(
    const char* msgID, nsresult status, nsITransportSecurityInfo* secInfo,
    nsACString const& location) {
  nsresult rv;
  nsCOMPtr<nsIMsgSendListener> composeSendListener =
      do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnTransportSecurityError(msgID, status, secInfo,
                                                  location);

  return NS_OK;
}

nsresult nsMsgComposeSendListener::OnStopSending(const char* aMsgID,
                                                 nsresult aStatus,
                                                 const char16_t* aMsg,
                                                 nsIFile* returnFile) {
  nsresult rv = NS_OK;

  nsCOMPtr<nsIMsgCompose> msgCompose = do_QueryReferent(mWeakComposeObj, &rv);
  if (msgCompose) {
    nsCOMPtr<nsIMsgProgress> progress;
    msgCompose->GetProgress(getter_AddRefs(progress));

    if (NS_SUCCEEDED(aStatus)) {
      nsCOMPtr<nsIMsgCompFields> compFields;
      msgCompose->GetCompFields(getter_AddRefs(compFields));

      // only process the reply flags if we successfully sent the message
      msgCompose->ProcessReplyFlags();

      // See if there is a composer window
      bool hasDomWindow = true;
      nsCOMPtr<mozIDOMWindowProxy> domWindow;
      rv = msgCompose->GetDomWindow(getter_AddRefs(domWindow));
      if (NS_FAILED(rv) || !domWindow) hasDomWindow = false;

      // Close the window ONLY if we are not going to do a save operation
      nsAutoString fieldsFCC;
      if (NS_SUCCEEDED(compFields->GetFcc(fieldsFCC))) {
        if (!fieldsFCC.IsEmpty()) {
          if (fieldsFCC.LowerCaseEqualsLiteral("nocopy://")) {
            msgCompose->NotifyStateListeners(
                nsIMsgComposeNotificationType::ComposeProcessDone, NS_OK);
            if (progress) {
              progress->UnregisterListener(this);
              progress->CloseProgressDialog(false);
            }
            if (hasDomWindow) msgCompose->CloseWindow();
          }
        }
      } else {
        msgCompose->NotifyStateListeners(
            nsIMsgComposeNotificationType::ComposeProcessDone, NS_OK);
        if (progress) {
          progress->UnregisterListener(this);
          progress->CloseProgressDialog(false);
        }
        if (hasDomWindow)
          msgCompose->CloseWindow();  // if we fail on the simple GetFcc call,
                                      // close the window to be safe and avoid
                                      // windows hanging around to prevent the
                                      // app from exiting.
      }

      // Remove the current draft msg when sending draft is done.
      bool deleteDraft;
      msgCompose->GetDeleteDraft(&deleteDraft);
      if (deleteDraft) RemoveCurrentDraftMessage(msgCompose, false, false);
    } else {
      msgCompose->NotifyStateListeners(
          nsIMsgComposeNotificationType::ComposeProcessDone, aStatus);
      if (progress) {
        progress->CloseProgressDialog(true);
        progress->UnregisterListener(this);
      }
    }
  }

  nsCOMPtr<nsIMsgSendListener> composeSendListener =
      do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnStopSending(aMsgID, aStatus, aMsg, returnFile);

  return rv;
}

nsresult nsMsgComposeSendListener::OnGetDraftFolderURI(
    const char* aMsgID, const nsACString& aFolderURI) {
  nsresult rv;
  nsCOMPtr<nsIMsgSendListener> composeSendListener =
      do_QueryReferent(mWeakComposeObj, &rv);
  if (NS_SUCCEEDED(rv) && composeSendListener)
    composeSendListener->OnGetDraftFolderURI(aMsgID, aFolderURI);

  return NS_OK;
}

nsresult nsMsgComposeSendListener::OnStartCopy() { return NS_OK; }

nsresult nsMsgComposeSendListener::OnProgress(uint32_t aProgress,
                                              uint32_t aProgressMax) {
  return NS_OK;
}

nsresult nsMsgComposeSendListener::OnStopCopy(nsresult aStatus) {
  nsresult rv = NS_OK;
  nsCOMPtr<nsIMsgCompose> msgCompose = do_QueryReferent(mWeakComposeObj, &rv);
  if (msgCompose) {
    if (mDeliverMode == nsIMsgSend::nsMsgQueueForLater ||
        mDeliverMode == nsIMsgSend::nsMsgDeliverBackground ||
        mDeliverMode == nsIMsgSend::nsMsgSaveAsDraft) {
      msgCompose->RememberQueuedDisposition();
    }

    // Ok, if we are here, we are done with the send/copy operation so
    // we have to do something with the window....SHOW if failed, Close
    // if succeeded

    nsCOMPtr<nsIMsgProgress> progress;
    msgCompose->GetProgress(getter_AddRefs(progress));
    if (progress) {
      // Unregister ourself from msg compose progress
      progress->UnregisterListener(this);
      progress->CloseProgressDialog(NS_FAILED(aStatus));
    }

    msgCompose->NotifyStateListeners(
        nsIMsgComposeNotificationType::ComposeProcessDone, aStatus);

    if (NS_SUCCEEDED(aStatus)) {
      // We should only close the window if we are done. Things like templates
      // and drafts aren't done so their windows should stay open
      if (mDeliverMode == nsIMsgSend::nsMsgSaveAsDraft ||
          mDeliverMode == nsIMsgSend::nsMsgSaveAsTemplate) {
        msgCompose->NotifyStateListeners(
            nsIMsgComposeNotificationType::SaveInFolderDone, aStatus);
        // Remove the current draft msg when saving as draft/template is done.
        msgCompose->SetDeleteDraft(true);
        RemoveCurrentDraftMessage(
            msgCompose, true, mDeliverMode == nsIMsgSend::nsMsgSaveAsTemplate);
      } else {
        // Remove (possible) draft if we're in send later mode
        if (mDeliverMode == nsIMsgSend::nsMsgQueueForLater ||
            mDeliverMode == nsIMsgSend::nsMsgDeliverBackground) {
          msgCompose->SetDeleteDraft(true);
          RemoveCurrentDraftMessage(msgCompose, true, false);
        }
        msgCompose->CloseWindow();
      }
    }
    msgCompose->ClearMessageSend();
  }

  return rv;
}

nsresult nsMsgComposeSendListener::GetMsgFolder(nsIMsgCompose* compObj,
                                                nsIMsgFolder** msgFolder) {
  nsCString folderUri;

  nsresult rv = compObj->GetSavedFolderURI(folderUri);
  NS_ENSURE_SUCCESS(rv, rv);

  return GetOrCreateFolder(folderUri, msgFolder);
}

nsresult nsMsgComposeSendListener::RemoveDraftOrTemplate(nsIMsgCompose* compObj,
                                                         nsCString msgURI,
                                                         bool isSaveTemplate) {
  nsresult rv;
  nsCOMPtr<nsIMsgFolder> msgFolder;
  nsCOMPtr<nsIMsgDBHdr> msgDBHdr;
  rv = GetMsgDBHdrFromURI(msgURI, getter_AddRefs(msgDBHdr));
  NS_ASSERTION(
      NS_SUCCEEDED(rv),
      "RemoveDraftOrTemplate can't get msg header DB interface pointer");
  if (NS_SUCCEEDED(rv) && msgDBHdr) {
    do {  // Break on failure or removal not needed.
      // Get the folder for the message resource.
      rv = msgDBHdr->GetFolder(getter_AddRefs(msgFolder));
      NS_ASSERTION(
          NS_SUCCEEDED(rv),
          "RemoveDraftOrTemplate can't get msg folder interface pointer");
      if (NS_FAILED(rv) || !msgFolder) break;

      // Only do this if it's a drafts or templates folder.
      uint32_t flags;
      msgFolder->GetFlags(&flags);
      if (!(flags & (nsMsgFolderFlags::Drafts | nsMsgFolderFlags::Templates)))
        break;
      // Only delete a template when saving a new one, never delete a template
      // when sending.
      if (!isSaveTemplate && (flags & nsMsgFolderFlags::Templates)) break;

      // Only remove if the message is actually in the db. It might have only
      // been in the use cache.
      nsMsgKey key;
      rv = msgDBHdr->GetMessageKey(&key);
      if (NS_FAILED(rv)) break;
      nsCOMPtr<nsIMsgDatabase> db;
      msgFolder->GetMsgDatabase(getter_AddRefs(db));
      if (!db) break;
      bool containsKey = false;
      db->ContainsKey(key, &containsKey);
      if (!containsKey) break;

      // Ready to delete the msg.
      rv = msgFolder->DeleteMessages({&*msgDBHdr}, nullptr, true, false,
                                     nullptr, false /*allowUndo*/);
      NS_ASSERTION(NS_SUCCEEDED(rv),
                   "RemoveDraftOrTemplate can't delete message");
    } while (false);
  } else {
    // If we get here we have the case where the draft folder is on the server
    // and it's not currently open (in thread pane), so draft msgs are saved to
    // the server but they're not in our local DB. In this case,
    // GetMsgDBHdrFromURI() will never find the msg. If the draft folder is a
    // local one then we'll not get here because the draft msgs are saved to the
    // local folder and are in local DB. Make sure the msg folder is imap.  Even
    // if we get here due to DB errors (worst case), we should still try to
    // delete msg on the server because that's where the master copy of the msgs
    // are stored, if draft folder is on the server. For local case, since DB is
    // bad we can't do anything with it anyway so it'll be noop in this case.
    rv = GetMsgFolder(compObj, getter_AddRefs(msgFolder));
    if (NS_SUCCEEDED(rv) && msgFolder) {
      nsCOMPtr<nsIMsgImapMailFolder> imapFolder = do_QueryInterface(msgFolder);
      NS_ASSERTION(imapFolder,
                   "The draft folder MUST be an imap folder in order to mark "
                   "the msg delete!");
      if (NS_SUCCEEDED(rv) && imapFolder) {
        // Only do this if it's a drafts or templates folder.
        uint32_t flags;
        msgFolder->GetFlags(&flags);
        if (!(flags & (nsMsgFolderFlags::Drafts | nsMsgFolderFlags::Templates)))
          return NS_OK;
        // Only delete a template when saving a new one, never delete a template
        // when sending.
        if (!isSaveTemplate && (flags & nsMsgFolderFlags::Templates))
          return NS_OK;

        const char* str = PL_strchr(msgURI.get(), '#');
        NS_ASSERTION(str, "Failed to get current draft id url");
        if (str) {
          nsAutoCString srcStr(str + 1);
          nsresult err;
          nsMsgKey messageID = srcStr.ToInteger(&err);
          if (messageID != nsMsgKey_None) {
            rv = imapFolder->StoreImapFlags(kImapMsgDeletedFlag, true,
                                            {messageID}, nullptr);
          }
        }
      }
    }
  }

  return rv;
}

/**
 * Remove the current draft message since a new one will be saved.
 * When we're coming to save a template, also delete the original template.
 * This is necessary since auto-save doesn't delete the original template.
 */
nsresult nsMsgComposeSendListener::RemoveCurrentDraftMessage(
    nsIMsgCompose* compObj, bool calledByCopy, bool isSaveTemplate) {
  nsresult rv;
  nsCOMPtr<nsIMsgCompFields> compFields = nullptr;

  rv = compObj->GetCompFields(getter_AddRefs(compFields));
  NS_ASSERTION(NS_SUCCEEDED(rv),
               "RemoveCurrentDraftMessage can't get compose fields");
  if (NS_FAILED(rv) || !compFields) return rv;

  nsCString curDraftIdURL;
  rv = compFields->GetDraftId(curDraftIdURL);

  // Skip if no draft id (probably a new draft msg).
  if (NS_SUCCEEDED(rv) && !curDraftIdURL.IsEmpty()) {
    rv = RemoveDraftOrTemplate(compObj, curDraftIdURL, isSaveTemplate);
    if (NS_FAILED(rv)) NS_WARNING("Removing current draft failed");
  } else {
    NS_WARNING("RemoveCurrentDraftMessage can't get draft id");
  }

  if (isSaveTemplate) {
    nsCString templateIdURL;
    rv = compFields->GetTemplateId(templateIdURL);
    if (NS_SUCCEEDED(rv) && !templateIdURL.Equals(curDraftIdURL)) {
      // Above we deleted an auto-saved draft, so here we need to delete
      // the original template.
      rv = RemoveDraftOrTemplate(compObj, templateIdURL, isSaveTemplate);
      if (NS_FAILED(rv)) NS_WARNING("Removing original template failed");
    }
  }

  // Now get the new uid so that next save will remove the right msg
  // regardless whether or not the exiting msg can be deleted.
  if (calledByCopy) {
    nsMsgKey newUid = 0;
    nsCOMPtr<nsIMsgFolder> savedToFolder;
    nsCOMPtr<nsIMsgSend> msgSend;
    rv = compObj->GetMessageSend(getter_AddRefs(msgSend));
    NS_ASSERTION(msgSend, "RemoveCurrentDraftMessage msgSend is null.");
    if (NS_FAILED(rv) || !msgSend) return rv;

    rv = msgSend->GetMessageKey(&newUid);
    NS_ENSURE_SUCCESS(rv, rv);

    // Make sure we have a folder interface pointer
    rv = GetMsgFolder(compObj, getter_AddRefs(savedToFolder));

    // Reset draft (uid) url with the new uid.
    if (savedToFolder && newUid != nsMsgKey_None) {
      uint32_t folderFlags;
      savedToFolder->GetFlags(&folderFlags);
      if (folderFlags &
          (nsMsgFolderFlags::Drafts | nsMsgFolderFlags::Templates)) {
        nsCString newDraftIdURL;
        rv = savedToFolder->GenerateMessageURI(newUid, newDraftIdURL);
        NS_ENSURE_SUCCESS(rv, rv);
        compFields->SetDraftId(newDraftIdURL);
        if (isSaveTemplate) compFields->SetTemplateId(newDraftIdURL);
      }
    }
  }
  return rv;
}

nsresult nsMsgComposeSendListener::SetMessageKey(nsMsgKey aMessageKey) {
  return NS_OK;
}

nsresult nsMsgComposeSendListener::GetMessageId(nsACString& messageId) {
  return NS_OK;
}

NS_IMETHODIMP nsMsgComposeSendListener::OnStateChange(
    nsIWebProgress* aWebProgress, nsIRequest* aRequest, uint32_t aStateFlags,
    nsresult aStatus) {
  if (aStateFlags == nsIWebProgressListener::STATE_STOP) {
    nsCOMPtr<nsIMsgCompose> msgCompose = do_QueryReferent(mWeakComposeObj);
    if (msgCompose) {
      nsCOMPtr<nsIMsgProgress> progress;
      msgCompose->GetProgress(getter_AddRefs(progress));

      // Time to stop any pending operation...
      if (progress) {
        // Unregister ourself from msg compose progress
        progress->UnregisterListener(this);

        bool bCanceled = false;
        progress->GetProcessCanceledByUser(&bCanceled);
        if (bCanceled) {
          nsresult rv;
          nsCOMPtr<nsIStringBundleService> bundleService =
              mozilla::components::StringBundle::Service();
          NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
          nsCOMPtr<nsIStringBundle> bundle;
          rv = bundleService->CreateBundle(
              "chrome://messenger/locale/messengercompose/"
              "composeMsgs.properties",
              getter_AddRefs(bundle));
          NS_ENSURE_SUCCESS(rv, rv);
          nsString msg;
          bundle->GetStringFromName("msgCancelling", msg);
          progress->OnStatusChange(nullptr, nullptr, NS_OK, msg.get());
        }
      }

      nsCOMPtr<nsIMsgSend> msgSend;
      msgCompose->GetMessageSend(getter_AddRefs(msgSend));
      if (msgSend) msgSend->Abort();
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgComposeSendListener::OnProgressChange(
    nsIWebProgress* aWebProgress, nsIRequest* aRequest,
    int32_t aCurSelfProgress, int32_t aMaxSelfProgress,
    int32_t aCurTotalProgress, int32_t aMaxTotalProgress) {
  /* Ignore this call */
  return NS_OK;
}

NS_IMETHODIMP nsMsgComposeSendListener::OnLocationChange(
    nsIWebProgress* aWebProgress, nsIRequest* aRequest, nsIURI* location,
    uint32_t aFlags) {
  /* Ignore this call */
  return NS_OK;
}

NS_IMETHODIMP nsMsgComposeSendListener::OnStatusChange(
    nsIWebProgress* aWebProgress, nsIRequest* aRequest, nsresult aStatus,
    const char16_t* aMessage) {
  /* Ignore this call */
  return NS_OK;
}

NS_IMETHODIMP nsMsgComposeSendListener::OnSecurityChange(
    nsIWebProgress* aWebProgress, nsIRequest* aRequest, uint32_t state) {
  /* Ignore this call */
  return NS_OK;
}

NS_IMETHODIMP
nsMsgComposeSendListener::OnContentBlockingEvent(nsIWebProgress* aWebProgress,
                                                 nsIRequest* aRequest,
                                                 uint32_t aEvent) {
  /* Ignore this call */
  return NS_OK;
}

nsresult nsMsgCompose::ConvertHTMLToText(nsIFile* aSigFile,
                                         nsString& aSigData) {
  nsAutoString origBuf;

  nsresult rv = LoadDataFromFile(aSigFile, origBuf);
  NS_ENSURE_SUCCESS(rv, rv);

  ConvertBufToPlainText(origBuf, false, true, true);
  aSigData = origBuf;
  return NS_OK;
}

nsresult nsMsgCompose::ConvertTextToHTML(nsIFile* aSigFile,
                                         nsString& aSigData) {
  nsresult rv;
  nsAutoString origBuf;

  rv = LoadDataFromFile(aSigFile, origBuf);
  if (NS_FAILED(rv)) return rv;

  // Ok, once we are here, we need to escape the data to make sure that
  // we don't do HTML stuff with plain text sigs.
  nsCString escapedUTF8;
  nsAppendEscapedHTML(NS_ConvertUTF16toUTF8(origBuf), escapedUTF8);
  aSigData.Append(NS_ConvertUTF8toUTF16(escapedUTF8));

  return NS_OK;
}

nsresult nsMsgCompose::LoadDataFromFile(nsIFile* file, nsString& sigData,
                                        bool aAllowUTF8, bool aAllowUTF16) {
  bool isDirectory = false;
  file->IsDirectory(&isDirectory);
  if (isDirectory) {
    NS_ERROR("file is a directory");
    return NS_MSG_ERROR_READING_FILE;
  }

  nsAutoCString data;
  nsresult rv = nsMsgCompose::SlurpFileToString(file, data);
  NS_ENSURE_SUCCESS(rv, rv);

  const char* readBuf = data.get();
  int32_t readSize = data.Length();

  nsAutoCString sigEncoding(nsMsgI18NParseMetaCharset(file));
  bool removeSigCharset = !sigEncoding.IsEmpty() && m_composeHTML;

  if (sigEncoding.IsEmpty()) {
    if (aAllowUTF8 && mozilla::IsUtf8(nsDependentCString(readBuf))) {
      sigEncoding.AssignLiteral("UTF-8");
    } else if (sigEncoding.IsEmpty() && aAllowUTF16 && readSize % 2 == 0 &&
               readSize >= 2 &&
               ((readBuf[0] == char(0xFE) && readBuf[1] == char(0xFF)) ||
                (readBuf[0] == char(0xFF) && readBuf[1] == char(0xFE)))) {
      sigEncoding.AssignLiteral("UTF-16");
    } else {
      // Autodetect encoding for plain text files w/o meta charset
      nsAutoCString textFileCharset;
      rv = MsgDetectCharsetFromFile(file, textFileCharset);
      NS_ENSURE_SUCCESS(rv, rv);
      sigEncoding.Assign(textFileCharset);
    }
  }

  if (NS_FAILED(nsMsgI18NConvertToUnicode(sigEncoding, data, sigData)))
    CopyASCIItoUTF16(data, sigData);

  // remove sig meta charset to allow user charset override during composition
  if (removeSigCharset) {
    nsAutoCString metaCharset("charset=");
    metaCharset.Append(sigEncoding);
    int32_t pos = sigData.LowerCaseFindASCII(metaCharset);
    if (pos != kNotFound) sigData.Cut(pos, metaCharset.Length());
  }
  return NS_OK;
}

/**
 * If the data contains file URLs, convert them to data URLs instead.
 * This is intended to be used in for signature files, so that we can make sure
 * images loaded into the editor are available on send.
 */
nsresult nsMsgCompose::ReplaceFileURLs(nsString& aData) {
  // XXX This code is rather incomplete since it looks for "file://" even
  // outside tags.

  int32_t offset = 0;
  while (true) {
    int32_t fPos = aData.LowerCaseFindASCII("file://", offset);
    if (fPos == kNotFound) {
      break;  // All done.
    }
    bool quoted = false;
    char16_t q = 'x';  // initialise to anything to keep compilers happy.
    if (fPos > 0) {
      q = aData.CharAt(fPos - 1);
      quoted = (q == '"' || q == '\'');
    }
    int32_t end = kNotFound;
    if (quoted) {
      end = aData.FindChar(q, fPos);
    } else {
      int32_t spacePos = aData.FindChar(' ', fPos);
      int32_t gtPos = aData.FindChar('>', fPos);
      if (gtPos != kNotFound && spacePos != kNotFound) {
        end = (spacePos < gtPos) ? spacePos : gtPos;
      } else if (gtPos == kNotFound && spacePos != kNotFound) {
        end = spacePos;
      } else if (gtPos != kNotFound && spacePos == kNotFound) {
        end = gtPos;
      }
    }
    if (end == kNotFound) {
      break;
    }
    nsString fileURL;
    fileURL = Substring(aData, fPos, end - fPos);
    nsString dataURL;
    nsresult rv = DataURLForFileURL(fileURL, dataURL);
    if (NS_SUCCEEDED(rv)) {
      aData.Replace(fPos, fileURL.Length(), dataURL);
      offset = fPos + dataURL.Length();
    } else {
      // If this one failed, maybe because the file wasn't found,
      // continue to process the next one.
      offset = fPos + fileURL.Length();
    }
  }
  return NS_OK;
}

nsresult nsMsgCompose::DataURLForFileURL(const nsAString& aFileURL,
                                         nsAString& aDataURL) {
  nsresult rv;
  nsCOMPtr<nsIMIMEService> mime = do_GetService("@mozilla.org/mime;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURI> fileUri;
  rv =
      NS_NewURI(getter_AddRefs(fileUri), NS_ConvertUTF16toUTF8(aFileURL).get());
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFileURL> fileUrl(do_QueryInterface(fileUri, &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIFile> file;
  rv = fileUrl->GetFile(getter_AddRefs(file));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString type;
  rv = mime->GetTypeFromFile(file, type);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString data;
  rv = nsMsgCompose::SlurpFileToString(file, data);
  NS_ENSURE_SUCCESS(rv, rv);

  aDataURL.AssignLiteral("data:");
  AppendUTF8toUTF16(type, aDataURL);

  nsAutoString filename;
  rv = file->GetLeafName(filename);
  if (NS_SUCCEEDED(rv)) {
    nsAutoCString fn;
    MsgEscapeURL(
        NS_ConvertUTF16toUTF8(filename),
        nsINetUtil::ESCAPE_URL_FILE_BASENAME | nsINetUtil::ESCAPE_URL_FORCED,
        fn);
    if (!fn.IsEmpty()) {
      aDataURL.AppendLiteral(";filename=");
      aDataURL.Append(NS_ConvertUTF8toUTF16(fn));
    }
  }

  aDataURL.AppendLiteral(";base64,");
  char* result = PL_Base64Encode(data.get(), data.Length(), nullptr);
  nsDependentCString base64data(result);
  NS_ENSURE_SUCCESS(rv, rv);
  AppendUTF8toUTF16(base64data, aDataURL);
  return NS_OK;
}

nsresult nsMsgCompose::SlurpFileToString(nsIFile* aFile, nsACString& aString) {
  aString.Truncate();

  nsCOMPtr<nsIURI> fileURI;
  nsresult rv = NS_NewFileURI(getter_AddRefs(fileURI), aFile);
  if (NS_FAILED(rv)) {
    return rv;
  }

  nsCOMPtr<nsIChannel> channel;
  rv = NS_NewChannel(getter_AddRefs(channel), fileURI,
                     nsContentUtils::GetSystemPrincipal(),
                     nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
                     nsIContentPolicy::TYPE_OTHER);
  if (NS_FAILED(rv)) {
    return rv;
  }

  nsCOMPtr<nsIInputStream> stream;
  rv = channel->Open(getter_AddRefs(stream));
  if (NS_FAILED(rv)) {
    return rv;
  }

  rv = NS_ConsumeStream(stream, UINT32_MAX, aString);
  if (NS_FAILED(rv)) {
    return rv;
  }

  rv = stream->Close();
  if (NS_FAILED(rv)) {
    return rv;
  }

  return NS_OK;
}

nsresult nsMsgCompose::BuildQuotedMessageAndSignature(void) {
  //
  // This should never happen...if it does, just bail out...
  //
  NS_ASSERTION(m_editor, "BuildQuotedMessageAndSignature but no editor!");
  if (!m_editor) return NS_ERROR_FAILURE;

  // We will fire off the quote operation and wait for it to
  // finish before we actually do anything with Ender...
  return QuoteOriginalMessage();
}

//
// This will process the signature file for the user. This method
// will always append the results to the mMsgBody member variable.
//
nsresult nsMsgCompose::ProcessSignature(nsIMsgIdentity* identity, bool aQuoted,
                                        nsString* aMsgBody) {
  nsresult rv = NS_OK;

  // Now, we can get sort of fancy. This is the time we need to check
  // for all sorts of user defined stuff, like signatures and editor
  // types and the like!
  //
  //    user_pref(".....sig_file", "y:\\sig.html");
  //    user_pref(".....attach_signature", true);
  //    user_pref(".....htmlSigText", "unicode sig");
  //
  // Note: We will have intelligent signature behavior in that we
  // look at the signature file first...if the extension is .htm or
  // .html, we assume its HTML, otherwise, we assume it is plain text
  //
  // ...and that's not all! What we will also do now is look and see if
  // the file is an image file. If it is an image file, then we should
  // insert the correct HTML into the composer to have it work, but if we
  // are doing plain text compose, we should insert some sort of message
  // saying "Image Signature Omitted" or something (not done yet).
  //
  // If there's a sig pref, it will only be used if there is no sig file
  // defined, thus if attach_signature is checked, htmlSigText is ignored (bug
  // 324495). Plain-text signatures may or may not have a trailing line break
  // (bug 428040).

  bool attachFile = false;
  bool useSigFile = false;
  bool htmlSig = false;
  bool imageSig = false;
  nsAutoString sigData;
  nsAutoString sigOutput;
  int32_t reply_on_top = 0;
  bool sig_bottom = true;
  bool suppressSigSep = false;

  nsCOMPtr<nsIFile> sigFile;
  if (identity) {
    if (!CheckIncludeSignaturePrefs(identity)) return NS_OK;

    identity->GetReplyOnTop(&reply_on_top);
    identity->GetSigBottom(&sig_bottom);
    identity->GetSuppressSigSep(&suppressSigSep);

    rv = identity->GetAttachSignature(&attachFile);
    if (NS_SUCCEEDED(rv) && attachFile) {
      rv = identity->GetSignature(getter_AddRefs(sigFile));
      if (NS_SUCCEEDED(rv) && sigFile) {
        if (!sigFile->NativePath().IsEmpty()) {
          bool exists = false;
          sigFile->Exists(&exists);
          if (exists) {
            useSigFile = true;  // ok, there's a signature file

            // Now, most importantly, we need to figure out what the content
            // type is for this signature...if we can't, we assume text
            nsAutoCString sigContentType;
            nsresult rv2;  // don't want to clobber the other rv
            nsCOMPtr<nsIMIMEService> mimeFinder(
                do_GetService(NS_MIMESERVICE_CONTRACTID, &rv2));
            if (NS_SUCCEEDED(rv2)) {
              rv2 = mimeFinder->GetTypeFromFile(sigFile, sigContentType);
              if (NS_SUCCEEDED(rv2)) {
                if (StringBeginsWith(sigContentType, "image/"_ns,
                                     nsCaseInsensitiveCStringComparator))
                  imageSig = true;
                else if (sigContentType.Equals(
                             TEXT_HTML, nsCaseInsensitiveCStringComparator))
                  htmlSig = true;
              }
            }
          }
        }
      }
    }
  }

  // Unless signature to be attached from file, use preference value;
  // the htmlSigText value is always going to be treated as html if
  // the htmlSigFormat pref is true, otherwise it is considered text
  nsAutoString prefSigText;
  if (identity && !attachFile) identity->GetHtmlSigText(prefSigText);
  // Now, if they didn't even want to use a signature, we should
  // just return nicely.
  //
  if ((!useSigFile && prefSigText.IsEmpty()) || NS_FAILED(rv)) return NS_OK;

  static const char htmlBreak[] = "<br>";
  static const char dashes[] = "-- ";
  static const char htmlsigopen[] = "<div class=\"moz-signature\">";
  static const char htmlsigclose[] = "</div>"; /* XXX: Due to a bug in
                     4.x' HTML editor, it will not be able to
                     break this HTML sig, if quoted (for the user to
                     interleave a comment). */
  static const char _preopen[] = "<pre class=\"moz-signature\" cols=%d>";
  char* preopen;
  static const char preclose[] = "</pre>";

  int32_t wrapLength = 72;  // setup default value in case GetWrapLength failed
  GetWrapLength(&wrapLength);
  preopen = PR_smprintf(_preopen, wrapLength);
  if (!preopen) return NS_ERROR_OUT_OF_MEMORY;

  bool paragraphMode =
      mozilla::Preferences::GetBool("mail.compose.default_to_paragraph", false);

  if (imageSig) {
    // We have an image signature. If we're using the in HTML composer, we
    // should put in the appropriate HTML for inclusion, otherwise, do nothing.
    if (m_composeHTML) {
      if (!paragraphMode) sigOutput.AppendLiteral(htmlBreak);
      sigOutput.AppendLiteral(htmlsigopen);
      if ((mType == nsIMsgCompType::NewsPost || !suppressSigSep) &&
          (reply_on_top != 1 || sig_bottom || !aQuoted)) {
        sigOutput.AppendLiteral(dashes);
      }

      sigOutput.AppendLiteral(htmlBreak);
      sigOutput.AppendLiteral("<img src='");

      nsCOMPtr<nsIURI> fileURI;
      nsresult rv = NS_NewFileURI(getter_AddRefs(fileURI), sigFile);
      NS_ENSURE_SUCCESS(rv, rv);
      nsCString fileURL;
      fileURI->GetSpec(fileURL);

      nsString dataURL;
      rv = DataURLForFileURL(NS_ConvertUTF8toUTF16(fileURL), dataURL);
      if (NS_SUCCEEDED(rv)) {
        sigOutput.Append(dataURL);
      }
      sigOutput.AppendLiteral("' border=0>");
      sigOutput.AppendLiteral(htmlsigclose);
    }
  } else if (useSigFile) {
    // is this a text sig with an HTML editor?
    if ((m_composeHTML) && (!htmlSig)) {
      ConvertTextToHTML(sigFile, sigData);
    }
    // is this a HTML sig with a text window?
    else if ((!m_composeHTML) && (htmlSig)) {
      ConvertHTMLToText(sigFile, sigData);
    } else {                               // We have a match...
      LoadDataFromFile(sigFile, sigData);  // Get the data!
      ReplaceFileURLs(sigData);
    }
  }

  // if we have a prefSigText, append it to sigData.
  if (!prefSigText.IsEmpty()) {
    // set htmlSig if the pref is supposed to contain HTML code, defaults to
    // false
    rv = identity->GetHtmlSigFormat(&htmlSig);
    if (NS_FAILED(rv)) htmlSig = false;

    if (!m_composeHTML) {
      if (htmlSig) ConvertBufToPlainText(prefSigText, false, true, true);
      sigData.Append(prefSigText);
    } else {
      if (!htmlSig) {
        nsCString escapedUTF8;
        nsAppendEscapedHTML(NS_ConvertUTF16toUTF8(prefSigText), escapedUTF8);
        sigData.Append(NS_ConvertUTF8toUTF16(escapedUTF8));
      } else {
        ReplaceFileURLs(prefSigText);
        sigData.Append(prefSigText);
      }
    }
  }

  // post-processing for plain-text signatures to ensure we end in CR, LF, or
  // CRLF
  if (!htmlSig && !m_composeHTML) {
    int32_t sigLength = sigData.Length();
    if (sigLength > 0 && !(sigData.CharAt(sigLength - 1) == '\r') &&
        !(sigData.CharAt(sigLength - 1) == '\n'))
      sigData.AppendLiteral(CRLF);
  }

  // Now that sigData holds data...if any, append it to the body in a nice
  // looking manner
  if (!sigData.IsEmpty()) {
    if (m_composeHTML) {
      if (!paragraphMode) sigOutput.AppendLiteral(htmlBreak);

      if (htmlSig)
        sigOutput.AppendLiteral(htmlsigopen);
      else
        sigOutput.Append(NS_ConvertASCIItoUTF16(preopen));
    }

    if ((reply_on_top != 1 || sig_bottom || !aQuoted) &&
        sigData.Find(u"\r-- \r") < 0 && sigData.Find(u"\n-- \n") < 0 &&
        sigData.Find(u"\n-- \r") < 0) {
      nsDependentSubstring firstFourChars(sigData, 0, 4);

      if ((mType == nsIMsgCompType::NewsPost || !suppressSigSep) &&
          !(firstFourChars.EqualsLiteral("-- \n") ||
            firstFourChars.EqualsLiteral("-- \r"))) {
        sigOutput.AppendLiteral(dashes);

        if (!m_composeHTML || !htmlSig)
          sigOutput.AppendLiteral(CRLF);
        else if (m_composeHTML)
          sigOutput.AppendLiteral(htmlBreak);
      }
    }

    // add CRLF before signature for plain-text mode if signature comes before
    // quote
    if (!m_composeHTML && reply_on_top == 1 && !sig_bottom && aQuoted)
      sigOutput.AppendLiteral(CRLF);

    sigOutput.Append(sigData);

    if (m_composeHTML) {
      if (htmlSig)
        sigOutput.AppendLiteral(htmlsigclose);
      else
        sigOutput.AppendLiteral(preclose);
    }
  }

  aMsgBody->Append(sigOutput);
  PR_Free(preopen);
  return NS_OK;
}

nsresult nsMsgCompose::BuildBodyMessageAndSignature() {
  nsresult rv = NS_OK;

  //
  // This should never happen...if it does, just bail out...
  //
  if (!m_editor) return NS_ERROR_FAILURE;

  //
  // Now, we have the body so we can just blast it into the
  // composition editor window.
  //
  nsAutoString body;
  m_compFields->GetBody(body);

  // Some time we want to add a signature and sometime we won't.
  // Let's figure that out now...
  bool addSignature;
  bool isQuoted = false;
  switch (mType) {
    case nsIMsgCompType::ForwardInline:
      addSignature = true;
      isQuoted = true;
      break;
    case nsIMsgCompType::New:
    case nsIMsgCompType::MailToUrl:   /* same as New */
    case nsIMsgCompType::Reply:       /* should not happen! but just in case */
    case nsIMsgCompType::ReplyAll:    /* should not happen! but just in case */
    case nsIMsgCompType::ReplyToList: /* should not happen! but just in case */
    case nsIMsgCompType::ForwardAsAttachment: /* should not happen! but just in
                                                 case */
    case nsIMsgCompType::NewsPost:
    case nsIMsgCompType::ReplyToGroup:
    case nsIMsgCompType::ReplyToSender:
    case nsIMsgCompType::ReplyToSenderAndGroup:
      addSignature = true;
      break;

    case nsIMsgCompType::Draft:
    case nsIMsgCompType::Template:
    case nsIMsgCompType::Redirect:
    case nsIMsgCompType::EditAsNew:
      addSignature = false;
      break;

    default:
      addSignature = false;
      break;
  }

  nsAutoString tSignature;
  if (addSignature) ProcessSignature(m_identity, isQuoted, &tSignature);

  // if type is new, but we have body, this is probably a mapi send, so we need
  // to replace '\n' with <br> so that the line breaks won't be lost by html. if
  // mailtourl, do the same.
  if (m_composeHTML &&
      (mType == nsIMsgCompType::New || mType == nsIMsgCompType::MailToUrl))
    body.ReplaceSubstring(u"\n"_ns, u"<br>"_ns);

  // Restore flowed text wrapping for Drafts/Templates.
  // Look for unquoted lines - if we have an unquoted line
  // that ends in a space, join this line with the next one
  // by removing the end of line char(s).
  int32_t wrapping_enabled = 0;
  GetWrapLength(&wrapping_enabled);
  if (!m_composeHTML && wrapping_enabled) {
    bool quote = false;
    for (uint32_t i = 0; i < body.Length(); i++) {
      if (i == 0 || body[i - 1] == '\n')  // newline
      {
        if (body[i] == '>') {
          quote = true;
          continue;
        }
        nsString s(Substring(body, i, 10));
        if (StringBeginsWith(s, u"-- \r"_ns) ||
            StringBeginsWith(s, u"-- \n"_ns)) {
          i += 4;
          continue;
        }
        if (StringBeginsWith(s, u"- -- \r"_ns) ||
            StringBeginsWith(s, u"- -- \n"_ns)) {
          i += 6;
          continue;
        }
      }
      if (body[i] == '\n' && i > 1) {
        if (quote) {
          quote = false;
          continue;  // skip quoted lines
        }
        uint32_t j = i - 1;  // look backward for space
        if (body[j] == '\r') j--;
        if (body[j] == ' ')        // join this line with next one
          body.Cut(j + 1, i - j);  // remove CRLF
      }
    }
  }

  nsString empty;
  rv = ConvertAndLoadComposeWindow(empty, body, tSignature, false,
                                   m_composeHTML);

  return rv;
}

nsresult nsMsgCompose::NotifyStateListeners(int32_t aNotificationType,
                                            nsresult aResult) {
  nsTObserverArray<nsCOMPtr<nsIMsgComposeStateListener>>::ForwardIterator iter(
      mStateListeners);
  nsCOMPtr<nsIMsgComposeStateListener> thisListener;

  while (iter.HasMore()) {
    thisListener = iter.GetNext();

    switch (aNotificationType) {
      case nsIMsgComposeNotificationType::ComposeFieldsReady:
        thisListener->NotifyComposeFieldsReady();
        break;

      case nsIMsgComposeNotificationType::ComposeProcessDone:
        thisListener->ComposeProcessDone(aResult);
        break;

      case nsIMsgComposeNotificationType::SaveInFolderDone:
        thisListener->SaveInFolderDone(m_folderName.get());
        break;

      case nsIMsgComposeNotificationType::ComposeBodyReady:
        thisListener->NotifyComposeBodyReady();
        break;

      default:
        MOZ_ASSERT_UNREACHABLE("Unknown notification");
        break;
    }
  }

  return NS_OK;
}

nsresult nsMsgCompose::AttachmentPrettyName(const nsACString& scheme,
                                            const char* charset,
                                            nsACString& _retval) {
  nsresult rv;

  if (StringHead(scheme, 5).LowerCaseEqualsLiteral("file:")) {
    nsCOMPtr<nsIFile> file;
    rv = NS_GetFileFromURLSpec(scheme, getter_AddRefs(file));
    NS_ENSURE_SUCCESS(rv, rv);
    nsAutoString leafName;
    rv = file->GetLeafName(leafName);
    NS_ENSURE_SUCCESS(rv, rv);
    CopyUTF16toUTF8(leafName, _retval);
    return rv;
  }

  nsCOMPtr<nsITextToSubURI> textToSubURI =
      do_GetService(NS_ITEXTTOSUBURI_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoString retUrl;
  rv = textToSubURI->UnEscapeURIForUI(scheme, retUrl);

  if (NS_SUCCEEDED(rv)) {
    CopyUTF16toUTF8(retUrl, _retval);
  } else {
    _retval.Assign(scheme);
  }
  if (StringHead(scheme, 5).LowerCaseEqualsLiteral("http:")) _retval.Cut(0, 7);

  return NS_OK;
}

/**
 * Retrieve address book directories and mailing lists.
 *
 * @param aDirUri               directory URI
 * @param allDirectoriesArray   retrieved directories and sub-directories
 * @param allMailListArray      retrieved maillists
 */
nsresult nsMsgCompose::GetABDirAndMailLists(
    const nsACString& aDirUri, nsCOMArray<nsIAbDirectory>& aDirArray,
    nsTArray<nsMsgMailList>& aMailListArray) {
  static bool collectedAddressbookFound = false;

  nsresult rv;
  nsCOMPtr<nsIAbManager> abManager =
      do_GetService("@mozilla.org/abmanager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  if (aDirUri.Equals(kAllDirectoryRoot)) {
    nsTArray<RefPtr<nsIAbDirectory>> directories;
    rv = abManager->GetDirectories(directories);
    NS_ENSURE_SUCCESS(rv, rv);

    uint32_t count = directories.Length();
    nsCString uri;
    for (uint32_t i = 0; i < count; i++) {
      rv = directories[i]->GetURI(uri);
      NS_ENSURE_SUCCESS(rv, rv);

      int32_t pos;
      if (uri.EqualsLiteral(kPersonalAddressbookUri)) {
        pos = 0;
      } else {
        uint32_t count = aDirArray.Count();

        if (uri.EqualsLiteral(kCollectedAddressbookUri)) {
          collectedAddressbookFound = true;
          pos = count;
        } else {
          if (collectedAddressbookFound && count > 1) {
            pos = count - 1;
          } else {
            pos = count;
          }
        }
      }

      aDirArray.InsertObjectAt(directories[i], pos);
      rv = GetABDirAndMailLists(uri, aDirArray, aMailListArray);
    }

    return NS_OK;
  }

  nsCOMPtr<nsIAbDirectory> directory;
  rv = abManager->GetDirectory(aDirUri, getter_AddRefs(directory));
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<RefPtr<nsIAbDirectory>> subDirectories;
  rv = directory->GetChildNodes(subDirectories);
  NS_ENSURE_SUCCESS(rv, rv);
  for (nsIAbDirectory* subDirectory : subDirectories) {
    bool bIsMailList;
    if (NS_SUCCEEDED(subDirectory->GetIsMailList(&bIsMailList)) &&
        bIsMailList) {
      aMailListArray.AppendElement(subDirectory);
    }
  }
  return rv;
}

/**
 * Comparator for use with nsTArray::IndexOf to find a recipient.
 * This comparator will check if an "address" is a mail list or not.
 */
struct nsMsgMailListComparator {
  // A mail list will have one of the formats
  //  1) "mName <mDescription>" when the list has a description
  //  2) "mName <mName>" when the list lacks description
  // A recipient is of the form "mName <mEmail>" - for equality the list
  // name must be the same. The recipient "email" must match the list name for
  // case 1, and the list description for case 2.
  bool Equals(const nsMsgMailList& mailList,
              const nsMsgRecipient& recipient) const {
    if (!mailList.mName.Equals(recipient.mName,
                               nsCaseInsensitiveStringComparator))
      return false;
    return mailList.mDescription.IsEmpty()
               ? mailList.mName.Equals(recipient.mEmail,
                                       nsCaseInsensitiveStringComparator)
               : mailList.mDescription.Equals(
                     recipient.mEmail, nsCaseInsensitiveStringComparator);
  }
};

/**
 * Comparator for use with nsTArray::IndexOf to find a recipient.
 */
struct nsMsgRecipientComparator {
  bool Equals(const nsMsgRecipient& recipient,
              const nsMsgRecipient& recipientToFind) const {
    if (!recipient.mEmail.Equals(recipientToFind.mEmail,
                                 nsCaseInsensitiveStringComparator))
      return false;

    if (!recipient.mName.Equals(recipientToFind.mName,
                                nsCaseInsensitiveStringComparator))
      return false;

    return true;
  }
};

/**
 * This function recursively resolves a mailing list and returns individual
 * email addresses. Nested lists are supported. It maintains an array of
 * already visited mailing lists to avoid endless recursion.
 *
 * @param aMailList             the list
 * @param allDirectoriesArray   all directories
 * @param allMailListArray      all maillists
 * @param mailListProcessed     maillists processed (to avoid recursive lists)
 * @param aListMembers          list members
 */
nsresult nsMsgCompose::ResolveMailList(
    nsIAbDirectory* aMailList, nsCOMArray<nsIAbDirectory>& allDirectoriesArray,
    nsTArray<nsMsgMailList>& allMailListArray,
    nsTArray<nsMsgMailList>& mailListProcessed,
    nsTArray<nsMsgRecipient>& aListMembers) {
  nsresult rv = NS_OK;

  nsTArray<RefPtr<nsIAbCard>> mailListAddresses;
  rv = aMailList->GetChildCards(mailListAddresses);
  NS_ENSURE_SUCCESS(rv, rv);

  for (nsIAbCard* existingCard : mailListAddresses) {
    nsMsgRecipient newRecipient;

    rv = existingCard->GetDisplayName(newRecipient.mName);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = existingCard->GetPrimaryEmail(newRecipient.mEmail);
    NS_ENSURE_SUCCESS(rv, rv);

    if (newRecipient.mName.IsEmpty() && newRecipient.mEmail.IsEmpty()) {
      continue;
    }

    // First check if it's a mailing list.
    size_t index =
        allMailListArray.IndexOf(newRecipient, 0, nsMsgMailListComparator());
    if (index != allMailListArray.NoIndex &&
        allMailListArray[index].mDirectory) {
      // Check if maillist processed.
      if (mailListProcessed.Contains(newRecipient, nsMsgMailListComparator())) {
        continue;
      }

      nsCOMPtr<nsIAbDirectory> directory2(allMailListArray[index].mDirectory);

      // Add mailList to mailListProcessed.
      mailListProcessed.AppendElement(directory2);

      // Resolve mailList members.
      rv = ResolveMailList(directory2, allDirectoriesArray, allMailListArray,
                           mailListProcessed, aListMembers);
      NS_ENSURE_SUCCESS(rv, rv);

      continue;
    }

    // Check if recipient is in aListMembers.
    if (aListMembers.Contains(newRecipient, nsMsgRecipientComparator())) {
      continue;
    }

    // Now we need to insert the new address into the list of recipients.
    newRecipient.mCard = existingCard;
    newRecipient.mDirectory = aMailList;

    aListMembers.AppendElement(newRecipient);
  }

  return rv;
}

/**
 * Lookup the recipients as specified in the compose fields (To, Cc, Bcc)
 * in the address books and return an array of individual recipients.
 * Mailing lists are replaced by the cards they contain, nested and recursive
 * lists are taken care of, recipients contained in multiple lists are only
 * added once.
 *
 * @param recipientsList        (out) recipient array
 */
nsresult nsMsgCompose::LookupAddressBook(RecipientsArray& recipientsList) {
  nsresult rv = NS_OK;

  // First, build some arrays with the original recipients.

  nsAutoString originalRecipients[MAX_OF_RECIPIENT_ARRAY];
  m_compFields->GetTo(originalRecipients[0]);
  m_compFields->GetCc(originalRecipients[1]);
  m_compFields->GetBcc(originalRecipients[2]);

  for (uint32_t i = 0; i < MAX_OF_RECIPIENT_ARRAY; ++i) {
    if (originalRecipients[i].IsEmpty()) continue;

    rv = m_compFields->SplitRecipientsEx(originalRecipients[i],
                                         recipientsList[i]);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Then look them up in the Addressbooks
  bool stillNeedToSearch = true;
  nsCOMPtr<nsIAbDirectory> abDirectory;
  nsCOMPtr<nsIAbCard> existingCard;
  nsTArray<nsMsgMailList> mailListArray;
  nsTArray<nsMsgMailList> mailListProcessed;

  nsCOMArray<nsIAbDirectory> addrbookDirArray;
  rv = GetABDirAndMailLists(nsLiteralCString(kAllDirectoryRoot),
                            addrbookDirArray, mailListArray);
  if (NS_FAILED(rv)) return rv;

  nsString dirPath;
  uint32_t nbrAddressbook = addrbookDirArray.Count();

  for (uint32_t k = 0; k < nbrAddressbook && stillNeedToSearch; ++k) {
    // Avoid recursive mailing lists.
    if (abDirectory && (addrbookDirArray[k] == abDirectory)) {
      stillNeedToSearch = false;
      break;
    }

    abDirectory = addrbookDirArray[k];
    if (!abDirectory) continue;

    stillNeedToSearch = false;
    for (uint32_t i = 0; i < MAX_OF_RECIPIENT_ARRAY; i++) {
      mailListProcessed.Clear();

      // Note: We check this each time to allow for length changes.
      for (uint32_t j = 0; j < recipientsList[i].Length(); j++) {
        nsMsgRecipient& recipient = recipientsList[i][j];
        if (!recipient.mDirectory) {
          // First check if it's a mailing list.
          size_t index =
              mailListArray.IndexOf(recipient, 0, nsMsgMailListComparator());
          if (index != mailListArray.NoIndex &&
              mailListArray[index].mDirectory) {
            // Check mailList Processed.
            if (mailListProcessed.Contains(recipient,
                                           nsMsgMailListComparator())) {
              // Remove from recipientsList.
              recipientsList[i].RemoveElementAt(j--);
              continue;
            }

            nsCOMPtr<nsIAbDirectory> directory(mailListArray[index].mDirectory);

            // Add mailList to mailListProcessed.
            mailListProcessed.AppendElement(directory);

            // Resolve mailList members.
            nsTArray<nsMsgRecipient> members;
            rv = ResolveMailList(directory, addrbookDirArray, mailListArray,
                                 mailListProcessed, members);
            NS_ENSURE_SUCCESS(rv, rv);

            // Remove mailList from recipientsList.
            recipientsList[i].RemoveElementAt(j);

            // Merge members into recipientsList[i].
            uint32_t pos = 0;
            for (uint32_t c = 0; c < members.Length(); c++) {
              nsMsgRecipient& member = members[c];
              if (!recipientsList[i].Contains(member,
                                              nsMsgRecipientComparator())) {
                recipientsList[i].InsertElementAt(j + pos, member);
                pos++;
              }
            }
          } else {
            // Find a card that contains this e-mail address.
            rv = abDirectory->CardForEmailAddress(
                NS_ConvertUTF16toUTF8(recipient.mEmail),
                getter_AddRefs(existingCard));
            if (NS_SUCCEEDED(rv) && existingCard) {
              recipient.mCard = existingCard;
              recipient.mDirectory = abDirectory;
            } else {
              stillNeedToSearch = true;
            }
          }
        }
      }
    }
  }

  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::ExpandMailingLists() {
  RecipientsArray recipientsList;
  nsresult rv = LookupAddressBook(recipientsList);
  NS_ENSURE_SUCCESS(rv, rv);

  // Reset the final headers with the expanded mailing lists.
  nsAutoString recipientsStr;

  for (int i = 0; i < MAX_OF_RECIPIENT_ARRAY; ++i) {
    uint32_t nbrRecipients = recipientsList[i].Length();
    if (nbrRecipients == 0) continue;
    recipientsStr.Truncate();

    // Note: We check this each time to allow for length changes.
    for (uint32_t j = 0; j < recipientsList[i].Length(); ++j) {
      nsMsgRecipient& recipient = recipientsList[i][j];

      if (!recipientsStr.IsEmpty()) recipientsStr.Append(char16_t(','));
      nsAutoString address;
      MakeMimeAddress(recipient.mName, recipient.mEmail, address);
      recipientsStr.Append(address);

      if (recipient.mCard) {
        bool readOnly;
        rv = recipient.mDirectory->GetReadOnly(&readOnly);
        NS_ENSURE_SUCCESS(rv, rv);

        // Bump the popularity index for this card since we are about to send
        // e-mail to it.
        if (!readOnly) {
          uint32_t popularityIndex = 0;
          if (NS_FAILED(recipient.mCard->GetPropertyAsUint32(
                  kPopularityIndexProperty, &popularityIndex))) {
            // TB 2 wrote the popularity value as hex, so if we get here,
            // then we've probably got a hex value. We'll convert it back
            // to decimal, as that's the best we can do.

            nsCString hexPopularity;
            if (NS_SUCCEEDED(recipient.mCard->GetPropertyAsAUTF8String(
                    kPopularityIndexProperty, hexPopularity))) {
              nsresult errorCode = NS_OK;
              popularityIndex = hexPopularity.ToInteger(&errorCode, 16);
              if (NS_FAILED(errorCode))
                // We failed, just set it to zero.
                popularityIndex = 0;
            } else
              // We couldn't get it as a string either, so just reset to zero.
              popularityIndex = 0;
          }

          recipient.mCard->SetPropertyAsUint32(kPopularityIndexProperty,
                                               ++popularityIndex);
          recipient.mDirectory->ModifyCard(recipient.mCard);
        }
      }
    }

    switch (i) {
      case 0:
        m_compFields->SetTo(recipientsStr);
        break;
      case 1:
        m_compFields->SetCc(recipientsStr);
        break;
      case 2:
        m_compFields->SetBcc(recipientsStr);
        break;
    }
  }

  return NS_OK;
}

/**
 * Decides which tags trigger which convertible mode,
 * i.e. here is the logic for BodyConvertible.
 * Note: Helper function. Parameters are not checked.
 */
void nsMsgCompose::TagConvertible(Element* node, int32_t* _retval) {
  *_retval = nsIMsgCompConvertible::No;

  nsAutoString element;
  element = node->NodeName();

  // A style attribute on any element can change layout in any way,
  // so that is not convertible.
  nsAutoString attribValue;
  node->GetAttribute(u"style"_ns, attribValue);
  if (!attribValue.IsEmpty()) {
    *_retval = nsIMsgCompConvertible::No;
    return;
  }

  // moz-* classes are used internally by the editor and mail composition
  // (like moz-cite-prefix or moz-signature). Those can be discarded.
  // But any other ones are unconvertible. Style can be attached to them or any
  // other context (e.g. in microformats).
  node->GetAttribute(u"class"_ns, attribValue);
  if (!attribValue.IsEmpty()) {
    if (StringBeginsWith(attribValue, u"moz-"_ns,
                         nsCaseInsensitiveStringComparator)) {
      // We assume that anything with a moz-* class is convertible regardless of
      // the tag, because we add, for example, class="moz-signature" to HTML
      // messages and we still want to be able to downgrade them.
      *_retval = nsIMsgCompConvertible::Plain;
    } else {
      *_retval = nsIMsgCompConvertible::No;
    }

    return;
  }

  // ID attributes can contain attached style/context or be target of links
  // so we should preserve them.
  node->GetAttribute(u"id"_ns, attribValue);
  if (!attribValue.IsEmpty()) {
    *_retval = nsIMsgCompConvertible::No;
    return;
  }

  // Alignment is not convertible to plaintext; editor currently uses this.
  node->GetAttribute(u"align"_ns, attribValue);
  if (!attribValue.IsEmpty()) {
    *_retval = nsIMsgCompConvertible::No;
    return;
  }

  // Title attribute is not convertible to plaintext;
  // this also preserves any links with titles.
  node->GetAttribute(u"title"_ns, attribValue);
  if (!attribValue.IsEmpty()) {
    *_retval = nsIMsgCompConvertible::No;
    return;
  }

  // Treat <font face="monospace"> as converible to plaintext.
  if (element.LowerCaseEqualsLiteral("font")) {
    node->GetAttribute(u"size"_ns, attribValue);
    if (!attribValue.IsEmpty()) {
      *_retval = nsIMsgCompConvertible::No;
      return;
    }
    node->GetAttribute(u"face"_ns, attribValue);
    if (attribValue.LowerCaseEqualsLiteral("monospace")) {
      *_retval = nsIMsgCompConvertible::Plain;
    }
  }

  if (  // Considered convertible to plaintext: Some "simple" elements
        // without non-convertible attributes like style, class, id,
        // or align (see above).
      element.LowerCaseEqualsLiteral("br") ||
      element.LowerCaseEqualsLiteral("p") ||
      element.LowerCaseEqualsLiteral("tt") ||
      element.LowerCaseEqualsLiteral("html") ||
      element.LowerCaseEqualsLiteral("head") ||
      element.LowerCaseEqualsLiteral("meta") ||
      element.LowerCaseEqualsLiteral("title")) {
    *_retval = nsIMsgCompConvertible::Plain;
  } else if (
      // element.LowerCaseEqualsLiteral("blockquote") || // see below
      element.LowerCaseEqualsLiteral("ul") ||
      element.LowerCaseEqualsLiteral("ol") ||
      element.LowerCaseEqualsLiteral("li") ||
      element.LowerCaseEqualsLiteral("dl") ||
      element.LowerCaseEqualsLiteral("dt") ||
      element.LowerCaseEqualsLiteral("dd")) {
    *_retval = nsIMsgCompConvertible::Yes;
  } else if (
      // element.LowerCaseEqualsLiteral("a") || // see below
      element.LowerCaseEqualsLiteral("h1") ||
      element.LowerCaseEqualsLiteral("h2") ||
      element.LowerCaseEqualsLiteral("h3") ||
      element.LowerCaseEqualsLiteral("h4") ||
      element.LowerCaseEqualsLiteral("h5") ||
      element.LowerCaseEqualsLiteral("h6") ||
      element.LowerCaseEqualsLiteral("hr") ||
      element.LowerCaseEqualsLiteral("pre") ||
      (mConvertStructs && (element.LowerCaseEqualsLiteral("em") ||
                           element.LowerCaseEqualsLiteral("strong") ||
                           element.LowerCaseEqualsLiteral("code") ||
                           element.LowerCaseEqualsLiteral("b") ||
                           element.LowerCaseEqualsLiteral("i") ||
                           element.LowerCaseEqualsLiteral("u")))) {
    *_retval = nsIMsgCompConvertible::Altering;
  } else if (element.LowerCaseEqualsLiteral("body")) {
    *_retval = nsIMsgCompConvertible::Plain;

    if (node->HasAttribute(u"background"_ns) ||  // There is a background image
        node->HasAttribute(
            u"dir"_ns)) {  // dir=rtl attributes should not downconvert
      *_retval = nsIMsgCompConvertible::No;
    } else {
      nsAutoString color;
      if (node->HasAttribute(u"text"_ns)) {
        node->GetAttribute(u"text"_ns, color);
        if (!color.EqualsLiteral("#000000"))
          *_retval = nsIMsgCompConvertible::Altering;
      }
      if (*_retval != nsIMsgCompConvertible::Altering &&  // small optimization
          node->HasAttribute(u"bgcolor"_ns)) {
        node->GetAttribute(u"bgcolor"_ns, color);
        if (!color.LowerCaseEqualsLiteral("#ffffff"))
          *_retval = nsIMsgCompConvertible::Altering;
      }
    }

    // ignore special color setting for link, vlink and alink at this point.
  } else if (element.LowerCaseEqualsLiteral("blockquote")) {
    // Skip <blockquote type="cite">
    *_retval = nsIMsgCompConvertible::Yes;

    node->GetAttribute(u"type"_ns, attribValue);
    if (attribValue.LowerCaseEqualsLiteral("cite")) {
      *_retval = nsIMsgCompConvertible::Plain;
    }
  } else if (element.LowerCaseEqualsLiteral("div") ||
             element.LowerCaseEqualsLiteral("span") ||
             element.LowerCaseEqualsLiteral("a")) {
    // Do some special checks for these tags. They are inside this |else if|
    // for performance reasons.

    // Maybe, it's an <a> element inserted by another recognizer (e.g. 4.x')
    if (element.LowerCaseEqualsLiteral("a")) {
      // Ignore anchor tag, if the URI is the same as the text
      // (as inserted by recognizers).
      *_retval = nsIMsgCompConvertible::Altering;

      nsAutoString hrefValue;
      node->GetAttribute(u"href"_ns, hrefValue);
      nsINodeList* children = node->ChildNodes();
      if (children->Length() > 0) {
        nsINode* pItem = children->Item(0);
        nsAutoString textValue;
        pItem->GetNodeValue(textValue);
        if (textValue == hrefValue) *_retval = nsIMsgCompConvertible::Plain;
      }
    }

    // Lastly, test, if it is just a "simple" <div> or <span>
    else if (element.LowerCaseEqualsLiteral("div") ||
             element.LowerCaseEqualsLiteral("span")) {
      *_retval = nsIMsgCompConvertible::Plain;
    }
  }
}

/**
 * Note: Helper function. Parameters are not checked.
 */
NS_IMETHODIMP
nsMsgCompose::NodeTreeConvertible(Element* node, int32_t* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  int32_t result;

  // Check this node
  TagConvertible(node, &result);

  // Walk tree recursively to check the children.
  nsINodeList* children = node->ChildNodes();
  for (uint32_t i = 0; i < children->Length(); i++) {
    nsINode* pItem = children->Item(i);
    // We assume all nodes that are not elements are convertible,
    // so only test elements.
    nsCOMPtr<Element> domElement = do_QueryInterface(pItem);
    if (domElement) {
      int32_t curresult;
      NodeTreeConvertible(domElement, &curresult);

      if (curresult > result) result = curresult;
    }
  }

  *_retval = result;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::BodyConvertible(int32_t* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  NS_ENSURE_STATE(m_editor);

  nsCOMPtr<Document> rootDocument;
  nsresult rv = m_editor->GetDocument(getter_AddRefs(rootDocument));
  if (NS_FAILED(rv)) return rv;
  if (!rootDocument) return NS_ERROR_UNEXPECTED;

  // get the top level element, which contains <html>
  nsCOMPtr<Element> rootElement = rootDocument->GetDocumentElement();
  if (!rootElement) return NS_ERROR_UNEXPECTED;
  NodeTreeConvertible(rootElement, _retval);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompose::GetIdentity(nsIMsgIdentity** aIdentity) {
  NS_ENSURE_ARG_POINTER(aIdentity);
  NS_IF_ADDREF(*aIdentity = m_identity);
  return NS_OK;
}

/**
 * Position above the quote, that is either <blockquote> or
 * <div class="moz-cite-prefix"> or <div class="moz-forward-container">
 * in an inline-forwarded message.
 */
nsresult nsMsgCompose::MoveToAboveQuote(void) {
  RefPtr<Element> rootElement;
  nsresult rv = m_editor->GetRootElement(getter_AddRefs(rootElement));
  if (NS_FAILED(rv) || !rootElement) {
    return rv;
  }

  nsCOMPtr<nsINode> node;
  nsAutoString attributeName;
  nsAutoString attributeValue;
  nsAutoString tagLocalName;
  attributeName.AssignLiteral("class");

  RefPtr<nsINode> rootElement2 = rootElement;
  node = rootElement2->GetFirstChild();
  while (node) {
    nsCOMPtr<Element> element = do_QueryInterface(node);
    if (element) {
      // First check for <blockquote>. This will most likely not trigger
      // since well-behaved quotes are preceded by a cite prefix.
      tagLocalName = node->LocalName();
      if (tagLocalName.EqualsLiteral("blockquote")) {
        break;
      }

      // Get the class value.
      element->GetAttribute(attributeName, attributeValue);

      // Now check for the cite prefix, so an element with
      // class="moz-cite-prefix".
      if (attributeValue.LowerCaseFindASCII("moz-cite-prefix") != kNotFound) {
        break;
      }

      // Next check for forwarded content.
      // The forwarded part is inside an element with
      // class="moz-forward-container".
      if (attributeValue.LowerCaseFindASCII("moz-forward-container") !=
          kNotFound) {
        break;
      }
    }

    node = node->GetNextSibling();
    if (!node) {
      // No further siblings found, so we didn't find what we were looking for.
      rv = NS_OK;
      break;
    }
  }

  // Now position. If no quote was found, we position to the very front.
  int32_t offset = 0;
  if (node) {
    rv = GetChildOffset(node, rootElement2, offset);
    if (NS_FAILED(rv)) {
      return rv;
    }
  }
  RefPtr<Selection> selection;
  m_editor->GetSelection(getter_AddRefs(selection));
  if (selection) rv = selection->CollapseInLimiter(rootElement, offset);

  return rv;
}

/**
 * nsEditor::BeginningOfDocument() will position to the beginning of the
 * document before the first editable element. It will position into a
 * container. We need to be at the very front.
 */
nsresult nsMsgCompose::MoveToBeginningOfDocument(void) {
  RefPtr<Element> rootElement;
  nsresult rv = m_editor->GetRootElement(getter_AddRefs(rootElement));
  if (NS_FAILED(rv) || !rootElement) {
    return rv;
  }

  RefPtr<Selection> selection;
  m_editor->GetSelection(getter_AddRefs(selection));
  if (selection) rv = selection->CollapseInLimiter(rootElement, 0);

  return rv;
}

/**
 * M-C's nsEditor::EndOfDocument() will position to the end of the document
 * but it will position into a container. We really need to position
 * after the last container so we don't accidentally position into a
 * <blockquote>. That's why we use our own function.
 */
nsresult nsMsgCompose::MoveToEndOfDocument(void) {
  int32_t offset;
  RefPtr<Element> rootElement;
  nsCOMPtr<nsINode> lastNode;
  nsresult rv = m_editor->GetRootElement(getter_AddRefs(rootElement));
  if (NS_FAILED(rv) || !rootElement) {
    return rv;
  }

  RefPtr<nsINode> rootElement2 = rootElement;
  lastNode = rootElement2->GetLastChild();
  if (!lastNode) {
    return NS_ERROR_NULL_POINTER;
  }

  rv = GetChildOffset(lastNode, rootElement2, offset);
  if (NS_FAILED(rv)) {
    return rv;
  }

  RefPtr<Selection> selection;
  m_editor->GetSelection(getter_AddRefs(selection));
  if (selection) rv = selection->CollapseInLimiter(rootElement, offset + 1);

  return rv;
}

MOZ_CAN_RUN_SCRIPT_BOUNDARY NS_IMETHODIMP
nsMsgCompose::SetIdentity(nsIMsgIdentity* aIdentity) {
  NS_ENSURE_ARG_POINTER(aIdentity);

  m_identity = aIdentity;

  nsresult rv;

  if (!m_editor) return NS_ERROR_FAILURE;

  RefPtr<Element> rootElement;
  rv = m_editor->GetRootElement(getter_AddRefs(rootElement));
  if (NS_FAILED(rv) || !rootElement) return rv;

  // First look for the current signature, if we have one
  nsCOMPtr<nsINode> lastNode;
  nsCOMPtr<nsINode> node;
  nsCOMPtr<nsINode> tempNode;
  nsAutoString tagLocalName;

  RefPtr<nsINode> rootElement2 = rootElement;
  lastNode = rootElement2->GetLastChild();
  if (lastNode) {
    node = lastNode;
    // In html, the signature is inside an element with
    // class="moz-signature"
    bool signatureFound = false;
    nsAutoString attributeName;
    attributeName.AssignLiteral("class");

    while (node) {
      nsCOMPtr<Element> element = do_QueryInterface(node);
      if (element) {
        nsAutoString attributeValue;

        element->GetAttribute(attributeName, attributeValue);

        if (attributeValue.LowerCaseFindASCII("moz-signature") != kNotFound) {
          signatureFound = true;
          break;
        }
      }
      node = node->GetPreviousSibling();
    }

    if (signatureFound) {
      nsCOMPtr<nsIEditor> editor(m_editor);  // Strong reference.
      editor->BeginTransaction();
      tempNode = node->GetPreviousSibling();
      rv = editor->DeleteNode(node, false, 1);
      if (NS_FAILED(rv)) {
        editor->EndTransaction();
        return rv;
      }

      // Also, remove the <br> right before the signature.
      if (tempNode) {
        tagLocalName = tempNode->LocalName();
        if (tagLocalName.EqualsLiteral("br"))
          editor->DeleteNode(tempNode, false, 1);
      }
      editor->EndTransaction();
    }
  }

  if (!CheckIncludeSignaturePrefs(aIdentity)) return NS_OK;

  // Then add the new one if needed
  nsAutoString aSignature;

  // No delimiter needed if not a compose window
  bool isQuoted;
  switch (mType) {
    case nsIMsgCompType::New:
    case nsIMsgCompType::NewsPost:
    case nsIMsgCompType::MailToUrl:
    case nsIMsgCompType::ForwardAsAttachment:
      isQuoted = false;
      break;
    default:
      isQuoted = true;
      break;
  }

  ProcessSignature(aIdentity, isQuoted, &aSignature);

  if (!aSignature.IsEmpty()) {
    TranslateLineEnding(aSignature);
    nsCOMPtr<nsIEditor> editor(m_editor);  // Strong reference.

    editor->BeginTransaction();
    int32_t reply_on_top = 0;
    bool sig_bottom = true;
    aIdentity->GetReplyOnTop(&reply_on_top);
    aIdentity->GetSigBottom(&sig_bottom);
    bool sigOnTop = (reply_on_top == 1 && !sig_bottom);
    if (sigOnTop && isQuoted) {
      rv = MoveToAboveQuote();
    } else {
      // Note: New messages aren't quoted so we always move to the end.
      rv = MoveToEndOfDocument();
    }

    if (NS_SUCCEEDED(rv)) {
      if (m_composeHTML) {
        bool oldAllow;
        GetAllowRemoteContent(&oldAllow);
        SetAllowRemoteContent(true);
        rv = MOZ_KnownLive(editor->AsHTMLEditor())->InsertHTML(aSignature);
        SetAllowRemoteContent(oldAllow);
      } else {
        rv = editor->InsertLineBreak();
        InsertDivWrappedTextAtSelection(aSignature, u"moz-signature"_ns);
      }
    }
    editor->EndTransaction();
  }

  return rv;
}

NS_IMETHODIMP nsMsgCompose::CheckCharsetConversion(nsIMsgIdentity* identity,
                                                   char** fallbackCharset,
                                                   bool* _retval) {
  NS_ENSURE_ARG_POINTER(identity);
  NS_ENSURE_ARG_POINTER(_retval);

  // Kept around for legacy reasons. This method is supposed to check that the
  // headers can be converted to the appropriate charset, but we don't support
  // encoding headers to non-UTF-8, so this is now moot.
  if (fallbackCharset) *fallbackCharset = nullptr;
  *_retval = true;
  return NS_OK;
}

NS_IMETHODIMP nsMsgCompose::GetDeliverMode(MSG_DeliverMode* aDeliverMode) {
  NS_ENSURE_ARG_POINTER(aDeliverMode);
  *aDeliverMode = mDeliverMode;
  return NS_OK;
}

void nsMsgCompose::DeleteTmpAttachments() {
  if (mTmpAttachmentsDeleted || m_window) {
    // Don't delete tmp attachments if compose window is still open, e.g. saving
    // a draft.
    return;
  }
  mTmpAttachmentsDeleted = true;
  // Remove temporary attachment files, e.g. key.asc when attaching public key.
  nsTArray<RefPtr<nsIMsgAttachment>> attachments;
  m_compFields->GetAttachments(attachments);
  for (nsIMsgAttachment* attachment : attachments) {
    bool isTemporary;
    attachment->GetTemporary(&isTemporary);
    bool sentViaCloud;
    attachment->GetSendViaCloud(&sentViaCloud);
    if (isTemporary && !sentViaCloud) {
      nsCString url;
      attachment->GetUrl(url);
      nsCOMPtr<nsIFile> urlFile;
      nsresult rv = NS_GetFileFromURLSpec(url, getter_AddRefs(urlFile));
      if (NS_SUCCEEDED(rv)) {
        urlFile->Remove(false);
      }
    }
  }
}

nsMsgMailList::nsMsgMailList(nsIAbDirectory* directory)
    : mDirectory(directory) {
  mDirectory->GetDirName(mName);
  mDirectory->GetDescription(mDescription);

  if (mDescription.IsEmpty()) mDescription = mName;

  mDirectory = directory;
}
