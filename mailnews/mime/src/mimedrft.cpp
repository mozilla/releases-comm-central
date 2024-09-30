/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Original Code has been modified by IBM Corporation. Modifications made
 * by IBM described herein are Copyright (c) International Business Machines
 * Corporation, 2000. Modifications to Mozilla code or documentation identified
 * per MPL Section 3.3
 *
 * Date             Modified by     Description of modification
 * 04/20/2000       IBM Corp.      OS/2 VisualAge build.
 */

#include "mimehdrs.h"
#include "nsCOMPtr.h"
#include "nsMailHeaders.h"
#include "modmimee.h"
#include "mimeobj.h"
#include "modlmime.h"
#include "mimei.h"
#include "mimemoz2.h"
#include "mimemsg.h"
#include "nsMimeTypes.h"
#include <ctype.h>

#include "prmem.h"
#include "plstr.h"
#include "prprf.h"
#include "prio.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "msgCore.h"
#include "nsIMsgSend.h"
#include "nsMimeStringResources.h"
#include "nsNetUtil.h"
#include "comi18n.h"
#include "nsIMsgAttachment.h"
#include "nsIMsgCompFields.h"
#include "nsIMsgComposeService.h"
#include "nsMsgAttachmentData.h"
#include "nsMsgI18N.h"
#include "nsIMsgMessageService.h"
#include "nsMsgUtils.h"
#include "nsMsgCompUtils.h"
#include "nsCExternalHandlerService.h"
#include "nsIMIMEService.h"
#include "nsIMsgAccountManager.h"
#include "modmimee.h"  // for MimeConverterOutputCallback
#include "mozilla/dom/Promise.h"
#include "mozilla/mailnews/MimeHeaderParser.h"

using namespace mozilla::mailnews;

//
// Header strings...
//
#define HEADER_NNTP_POSTING_HOST "NNTP-Posting-Host"
#define MIME_HEADER_TABLE                        \
  "<TABLE CELLPADDING=0 CELLSPACING=0 BORDER=0 " \
  "class=\"moz-email-headers-table\">"
#define HEADER_START_JUNK "<TR><TH VALIGN=BASELINE ALIGN=RIGHT NOWRAP>"
#define HEADER_MIDDLE_JUNK ": </TH><TD>"
#define HEADER_END_JUNK "</TD></TR>"

//
// Forward declarations...
//
extern "C" char* MIME_StripContinuations(char* original);
int mime_decompose_file_init_fn(MimeClosure stream_closure,
                                MimeHeaders* headers);
int mime_decompose_file_output_fn(const char* buf, int32_t size,
                                  MimeClosure stream_closure);
int mime_decompose_file_close_fn(MimeClosure stream_closure);
extern int MimeHeaders_build_heads_list(MimeHeaders* hdrs);

#define NS_MSGCOMPOSESERVICE_CID                    \
  { /* 588595FE-1ADA-11d3-A715-0060B0EB39B5 */      \
    0x588595fe, 0x1ada, 0x11d3, {                   \
      0xa7, 0x15, 0x0, 0x60, 0xb0, 0xeb, 0x39, 0xb5 \
    }                                               \
  }
static NS_DEFINE_CID(kCMsgComposeServiceCID, NS_MSGCOMPOSESERVICE_CID);

mime_draft_data::mime_draft_data()
    : url_name(nullptr),
      format_out(0),
      stream(nullptr),
      obj(nullptr),
      options(nullptr),
      headers(nullptr),
      messageBody(nullptr),
      curAttachment(nullptr),
      decoder_data(nullptr),
      mailcharset(nullptr),
      forwardInline(false),
      forwardInlineFilter(false),
      overrideComposeFormat(false),
      autodetectCharset(false) {}

typedef enum {
  nsMsg_RETURN_RECEIPT_BOOL_HEADER_MASK = 0,
  nsMsg_ENCRYPTED_BOOL_HEADER_MASK,
  nsMsg_SIGNED_BOOL_HEADER_MASK,
  nsMsg_UUENCODE_BINARY_BOOL_HEADER_MASK,
  nsMsg_ATTACH_VCARD_BOOL_HEADER_MASK,
  nsMsg_LAST_BOOL_HEADER_MASK  // last boolean header mask; must be the last one
                               // DON'T remove.
} nsMsgBoolHeaderSet;

#ifdef NS_DEBUG
extern "C" void mime_dump_attachments(nsMsgAttachmentData* attachData) {
  int32_t i = 0;
  class nsMsgAttachmentData* tmp = attachData;

  while (tmp && tmp->m_url) {
    printf("Real Name         : %s\n", tmp->m_realName.get());

    if (tmp->m_url) {
      ;
      printf("URL               : %s\n", tmp->m_url->GetSpecOrDefault().get());
    }

    printf("Desired Type      : %s\n", tmp->m_desiredType.get());
    printf("Real Type         : %s\n", tmp->m_realType.get());
    printf("Real Encoding     : %s\n", tmp->m_realEncoding.get());
    printf("Description       : %s\n", tmp->m_description.get());
    printf("Mac Type          : %s\n", tmp->m_xMacType.get());
    printf("Mac Creator       : %s\n", tmp->m_xMacCreator.get());
    printf("Size in bytes     : %d\n", tmp->m_size);
    i++;
    tmp++;
  }
}
#endif

nsresult CreateComposeParams(nsCOMPtr<nsIMsgComposeParams>& pMsgComposeParams,
                             nsIMsgCompFields* compFields,
                             nsMsgAttachmentData* attachmentList,
                             MSG_ComposeType composeType,
                             MSG_ComposeFormat composeFormat,
                             nsIMsgIdentity* identity,
                             const nsACString& originalMsgURI,
                             nsIMsgDBHdr* origMsgHdr) {
#ifdef NS_DEBUG
  mime_dump_attachments(attachmentList);
#endif

  nsresult rv;
  nsMsgAttachmentData* curAttachment = attachmentList;
  if (curAttachment) {
    nsAutoCString spec;

    while (curAttachment && curAttachment->m_url) {
      rv = curAttachment->m_url->GetSpec(spec);
      if (NS_SUCCEEDED(rv)) {
        nsCOMPtr<nsIMsgAttachment> attachment = do_CreateInstance(
            "@mozilla.org/messengercompose/attachment;1", &rv);
        if (NS_SUCCEEDED(rv) && attachment) {
          nsAutoString nameStr;
          rv = nsMsgI18NConvertToUnicode("UTF-8"_ns, curAttachment->m_realName,
                                         nameStr);
          if (NS_FAILED(rv))
            CopyASCIItoUTF16(curAttachment->m_realName, nameStr);
          attachment->SetName(nameStr);
          attachment->SetUrl(spec);
          attachment->SetTemporary(true);
          attachment->SetContentType(curAttachment->m_realType.get());
          attachment->SetMacType(curAttachment->m_xMacType.get());
          attachment->SetMacCreator(curAttachment->m_xMacCreator.get());
          attachment->SetSize(curAttachment->m_size);
          if (!curAttachment->m_cloudPartInfo.IsEmpty()) {
            nsCString provider;
            nsCString cloudUrl;
            nsCString cloudPartHeaderData;

            provider.Adopt(
                MimeHeaders_get_parameter(curAttachment->m_cloudPartInfo.get(),
                                          "provider", nullptr, nullptr));
            cloudUrl.Adopt(MimeHeaders_get_parameter(
                curAttachment->m_cloudPartInfo.get(), "url", nullptr, nullptr));
            cloudPartHeaderData.Adopt(
                MimeHeaders_get_parameter(curAttachment->m_cloudPartInfo.get(),
                                          "data", nullptr, nullptr));

            attachment->SetSendViaCloud(true);
            attachment->SetCloudFileAccountKey(provider);
            attachment->SetContentLocation(cloudUrl);
            attachment->SetCloudPartHeaderData(cloudPartHeaderData);
          }
          compFields->AddAttachment(attachment);
        }
      }
      curAttachment++;
    }
  }

  MSG_ComposeFormat format = composeFormat;  // Format to actually use.
  if (identity && composeType == nsIMsgCompType::ForwardInline) {
    bool composeHtml = false;
    identity->GetComposeHtml(&composeHtml);
    if (composeHtml)
      format = (composeFormat == nsIMsgCompFormat::OppositeOfDefault)
                   ? nsIMsgCompFormat::PlainText
                   : nsIMsgCompFormat::HTML;
    else
      format = (composeFormat == nsIMsgCompFormat::OppositeOfDefault)
                   ? nsIMsgCompFormat::HTML
                   : nsIMsgCompFormat::PlainText;
  }

  pMsgComposeParams =
      do_CreateInstance("@mozilla.org/messengercompose/composeparams;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  pMsgComposeParams->SetType(composeType);
  pMsgComposeParams->SetFormat(format);
  pMsgComposeParams->SetIdentity(identity);
  pMsgComposeParams->SetComposeFields(compFields);
  if (!originalMsgURI.IsEmpty())
    pMsgComposeParams->SetOriginalMsgURI(originalMsgURI);
  if (origMsgHdr) pMsgComposeParams->SetOrigMsgHdr(origMsgHdr);
  return NS_OK;
}

nsresult CreateTheComposeWindow(nsIMsgCompFields* compFields,
                                nsMsgAttachmentData* attachmentList,
                                MSG_ComposeType composeType,
                                MSG_ComposeFormat composeFormat,
                                nsIMsgIdentity* identity,
                                const nsACString& originalMsgURI,
                                nsIMsgDBHdr* origMsgHdr) {
  nsCOMPtr<nsIMsgComposeParams> pMsgComposeParams;
  nsresult rv = CreateComposeParams(pMsgComposeParams, compFields,
                                    attachmentList, composeType, composeFormat,
                                    identity, originalMsgURI, origMsgHdr);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgComposeService> msgComposeService =
      do_GetService(kCMsgComposeServiceCID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return msgComposeService->OpenComposeWindowWithParams(
      nullptr /* default chrome */, pMsgComposeParams);
}

nsresult ForwardMsgInline(nsIMsgCompFields* compFields,
                          nsMsgAttachmentData* attachmentList,
                          MSG_ComposeFormat composeFormat,
                          nsIMsgIdentity* identity,
                          const nsACString& originalMsgURI,
                          nsIMsgDBHdr* origMsgHdr) {
  nsCOMPtr<nsIMsgComposeParams> pMsgComposeParams;
  nsresult rv =
      CreateComposeParams(pMsgComposeParams, compFields, attachmentList,
                          nsIMsgCompType::ForwardInline, composeFormat,
                          identity, originalMsgURI, origMsgHdr);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgComposeService> msgComposeService =
      do_GetService(kCMsgComposeServiceCID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  // create the nsIMsgCompose object to send the object
  nsCOMPtr<nsIMsgCompose> pMsgCompose(
      do_CreateInstance("@mozilla.org/messengercompose/compose;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  /** initialize nsIMsgCompose, Send the message, wait for send completion
   * response **/
  rv = pMsgCompose->Initialize(pMsgComposeParams, nullptr, nullptr);
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<mozilla::dom::Promise> promise;
  rv = pMsgCompose->SendMsg(nsIMsgSend::nsMsgDeliverNow, identity, nullptr,
                            nullptr, nullptr, getter_AddRefs(promise));
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIMsgFolder> origFolder;
    origMsgHdr->GetFolder(getter_AddRefs(origFolder));
    if (origFolder)
      origFolder->AddMessageDispositionState(
          origMsgHdr, nsIMsgFolder::nsMsgDispositionState_Forwarded);
  }
  return rv;
}

nsresult CreateCompositionFields(
    const char* from, const char* reply_to, const char* to, const char* cc,
    const char* bcc, const char* fcc, const char* newsgroups,
    const char* followup_to, const char* organization, const char* subject,
    const char* references, const char* priority, const char* newspost_url,
    const nsTArray<nsString>& otherHeaders, char* charset,
    nsIMsgCompFields** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  nsresult rv;
  *_retval = nullptr;

  nsCOMPtr<nsIMsgCompFields> cFields =
      do_CreateInstance("@mozilla.org/messengercompose/composefields;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ENSURE_TRUE(cFields, NS_ERROR_OUT_OF_MEMORY);

  nsAutoCString val;
  nsAutoString outString;

  if (from) {
    nsMsgI18NConvertRawBytesToUTF16(
        nsDependentCString(from),
        charset ? nsDependentCString(charset) : EmptyCString(), outString);
    cFields->SetFrom(outString);
  }

  if (subject) {
    MIME_DecodeMimeHeader(subject, charset, false, true, val);
    cFields->SetSubject(
        NS_ConvertUTF8toUTF16(!val.IsEmpty() ? val.get() : subject));
  }

  if (reply_to) {
    nsMsgI18NConvertRawBytesToUTF16(
        nsDependentCString(reply_to),
        charset ? nsDependentCString(charset) : EmptyCString(), outString);
    cFields->SetReplyTo(outString);
  }

  if (to) {
    nsMsgI18NConvertRawBytesToUTF16(
        nsDependentCString(to),
        charset ? nsDependentCString(charset) : EmptyCString(), outString);
    cFields->SetTo(outString);
  }

  if (cc) {
    nsMsgI18NConvertRawBytesToUTF16(
        nsDependentCString(cc),
        charset ? nsDependentCString(charset) : EmptyCString(), outString);
    cFields->SetCc(outString);
  }

  if (bcc) {
    nsMsgI18NConvertRawBytesToUTF16(
        nsDependentCString(bcc),
        charset ? nsDependentCString(charset) : EmptyCString(), outString);
    cFields->SetBcc(outString);
  }

  if (fcc) {
    MIME_DecodeMimeHeader(fcc, charset, false, true, val);
    cFields->SetFcc(NS_ConvertUTF8toUTF16(!val.IsEmpty() ? val.get() : fcc));
  }

  if (newsgroups) {
    // fixme: the newsgroups header had better be decoded using the server-side
    // character encoding,but this |charset| might be different from it.
    MIME_DecodeMimeHeader(newsgroups, charset, false, true, val);
    cFields->SetNewsgroups(
        NS_ConvertUTF8toUTF16(!val.IsEmpty() ? val.get() : newsgroups));
  }

  if (followup_to) {
    MIME_DecodeMimeHeader(followup_to, charset, false, true, val);
    cFields->SetFollowupTo(
        NS_ConvertUTF8toUTF16(!val.IsEmpty() ? val.get() : followup_to));
  }

  if (organization) {
    MIME_DecodeMimeHeader(organization, charset, false, true, val);
    cFields->SetOrganization(
        NS_ConvertUTF8toUTF16(!val.IsEmpty() ? val.get() : organization));
  }

  if (references) {
    MIME_DecodeMimeHeader(references, charset, false, true, val);
    cFields->SetReferences(!val.IsEmpty() ? val.get() : references);
  }

  if (priority) {
    MIME_DecodeMimeHeader(priority, charset, false, true, val);
    nsMsgPriorityValue priorityValue;
    NS_MsgGetPriorityFromString(!val.IsEmpty() ? val.get() : priority,
                                priorityValue);
    nsAutoCString priorityName;
    NS_MsgGetUntranslatedPriorityName(priorityValue, priorityName);
    cFields->SetPriority(priorityName.get());
  }

  if (newspost_url) {
    MIME_DecodeMimeHeader(newspost_url, charset, false, true, val);
    cFields->SetNewspostUrl(!val.IsEmpty() ? val.get() : newspost_url);
  }

  nsTArray<nsString> cFieldsOtherHeaders;
  cFields->GetOtherHeaders(cFieldsOtherHeaders);
  for (auto otherHeader : otherHeaders) {
    if (!otherHeader.IsEmpty()) {
      MIME_DecodeMimeHeader(NS_ConvertUTF16toUTF8(otherHeader).get(), charset,
                            false, true, val);
      cFieldsOtherHeaders.AppendElement(NS_ConvertUTF8toUTF16(val));
    } else {
      cFieldsOtherHeaders.AppendElement(u""_ns);
    }
  }
  cFields->SetOtherHeaders(cFieldsOtherHeaders);
  cFields.forget(_retval);
  return rv;
}

static int dummy_file_write(const char* buf, int32_t size,
                            MimeClosure draftData) {
  if (!draftData) return -1;

  mime_draft_data* mdd = draftData.AsMimeDraftData();
  if (!mdd) {
    return -1;
  }

  uint32_t bytesWritten;
  mdd->tmpFileStream->Write(buf, size, &bytesWritten);
  return (int)bytesWritten;
}

static int mime_parse_stream_write(nsMIMESession* stream, const char* buf,
                                   int32_t size) {
  NS_ASSERTION(stream->data_object, "null mime data!");
  if (!stream->data_object) {
    return -1;
  }

  mime_draft_data* mdd = stream->data_object.AsMimeDraftData();
  if (!mdd) {
    return -1;
  }

  if (!mdd->obj) return -1;

  return mdd->obj->clazz->parse_buffer(
      (char*)buf, size, MimeClosure(MimeClosure::isMimeObject, mdd->obj));
}

static void mime_free_attachments(nsTArray<nsMsgAttachedFile*>& attachments) {
  if (attachments.Length() <= 0) return;

  for (uint32_t i = 0; i < attachments.Length(); i++) {
    if (attachments[i]->m_tmpFile) {
      attachments[i]->m_tmpFile->Remove(false);
      attachments[i]->m_tmpFile = nullptr;
    }
    delete attachments[i];
  }
}

static nsMsgAttachmentData* mime_draft_process_attachments(
    mime_draft_data* mdd) {
  if (!mdd) return nullptr;

  nsMsgAttachmentData *attachData = NULL, *tmp = NULL;
  nsMsgAttachedFile* tmpFile = NULL;

  // It's possible we must treat the message body as attachment!
  bool bodyAsAttachment = false;
  if (mdd->messageBody && !mdd->messageBody->m_type.IsEmpty() &&
      mdd->messageBody->m_type.LowerCaseFindASCII("text/html") == kNotFound &&
      mdd->messageBody->m_type.LowerCaseFindASCII("text/plain") == kNotFound &&
      !mdd->messageBody->m_type.LowerCaseEqualsLiteral("text")) {
    bodyAsAttachment = true;
  }

  if (!mdd->attachments.Length() && !bodyAsAttachment) return nullptr;

  int32_t totalCount = mdd->attachments.Length();
  if (bodyAsAttachment) totalCount++;
  attachData = new nsMsgAttachmentData[totalCount + 1];
  if (!attachData) return nullptr;

  tmp = attachData;

  for (int i = 0, attachmentsIndex = 0; i < totalCount; i++, tmp++) {
    if (bodyAsAttachment && i == 0)
      tmpFile = mdd->messageBody;
    else
      tmpFile = mdd->attachments[attachmentsIndex++];

    if (tmpFile->m_type.LowerCaseEqualsLiteral("text/vcard") ||
        tmpFile->m_type.LowerCaseEqualsLiteral("text/x-vcard"))
      tmp->m_realName = tmpFile->m_description;

    if (tmpFile->m_origUrl) {
      nsAutoCString tmpSpec;
      if (NS_FAILED(tmpFile->m_origUrl->GetSpec(tmpSpec))) goto FAIL;

      if (NS_FAILED(
              nsMimeNewURI(getter_AddRefs(tmp->m_url), tmpSpec.get(), nullptr)))
        goto FAIL;

      if (tmp->m_realName.IsEmpty()) {
        if (!tmpFile->m_realName.IsEmpty())
          tmp->m_realName = tmpFile->m_realName;
        else {
          if (tmpFile->m_type.LowerCaseFindASCII(MESSAGE_RFC822) != kNotFound)
            // we have the odd case of processing an e-mail that had an unnamed
            // eml message attached
            tmp->m_realName = "ForwardedMessage.eml";

          else
            tmp->m_realName = tmpSpec.get();
        }
      }
    }

    tmp->m_desiredType = tmpFile->m_type;
    tmp->m_realType = tmpFile->m_type;
    tmp->m_realEncoding = tmpFile->m_encoding;
    tmp->m_description = tmpFile->m_description;
    tmp->m_cloudPartInfo = tmpFile->m_cloudPartInfo;
    tmp->m_xMacType = tmpFile->m_xMacType;
    tmp->m_xMacCreator = tmpFile->m_xMacCreator;
    tmp->m_size = tmpFile->m_size;
  }
  return attachData;

FAIL:
  delete[] attachData;
  return nullptr;
}

static void mime_intl_insert_message_header_1(
    char** body, const char* hdr_value, const char* hdr_str,
    const char* html_hdr_str, const char* mailcharset, bool htmlEdit) {
  if (!body || !hdr_value || !hdr_str) return;

  if (htmlEdit) {
    NS_MsgSACat(body, HEADER_START_JUNK);
  } else {
    NS_MsgSACat(body, MSG_LINEBREAK);
  }
  if (!html_hdr_str) html_hdr_str = hdr_str;
  NS_MsgSACat(body, html_hdr_str);
  if (htmlEdit) {
    NS_MsgSACat(body, HEADER_MIDDLE_JUNK);
  } else
    NS_MsgSACat(body, ": ");

  // MIME decode header
  nsAutoCString utf8Value;
  MIME_DecodeMimeHeader(hdr_value, mailcharset, false, true, utf8Value);
  if (!utf8Value.IsEmpty()) {
    if (htmlEdit) {
      nsCString escaped;
      nsAppendEscapedHTML(utf8Value, escaped);
      NS_MsgSACat(body, escaped.get());
    } else {
      NS_MsgSACat(body, utf8Value.get());
    }
  } else {
    NS_MsgSACat(body, hdr_value);  // raw MIME encoded string
  }

  if (htmlEdit) NS_MsgSACat(body, HEADER_END_JUNK);
}

char* MimeGetNamedString(int32_t id) {
  static char retString[256];

  retString[0] = '\0';
  char* tString = MimeGetStringByID(id);
  if (tString) {
    PL_strncpy(retString, tString, sizeof(retString));
    PR_Free(tString);
  }
  return retString;
}

void MimeGetForwardHeaderDelimiter(nsACString& retString) {
  nsCString defaultValue;
  defaultValue.Adopt(MimeGetStringByID(MIME_FORWARDED_MESSAGE_HTML_USER_WROTE));

  nsString tmpRetString;
  NS_GetLocalizedUnicharPreferenceWithDefault(
      nullptr, "mailnews.forward_header_originalmessage",
      NS_ConvertUTF8toUTF16(defaultValue), tmpRetString);

  CopyUTF16toUTF8(tmpRetString, retString);
}

/* given an address string passed though parameter "address", this one will be
   converted and returned through the same parameter. The original string will
   be destroyed
*/
static void UnquoteMimeAddress(nsACString& mimeHeader, const char* charset) {
  if (!mimeHeader.IsEmpty()) {
    nsTArray<nsCString> addresses;
    ExtractDisplayAddresses(EncodedHeader(mimeHeader, charset),
                            UTF16ArrayAdapter<>(addresses));
    mimeHeader.Truncate();

    uint32_t count = addresses.Length();
    for (uint32_t i = 0; i < count; i++) {
      if (i != 0) mimeHeader.AppendASCII(", ");
      mimeHeader += addresses[i];
    }
  }
}

static void mime_insert_all_headers(char** body, MimeHeaders* headers,
                                    MSG_ComposeFormat composeFormat,
                                    char* mailcharset) {
  bool htmlEdit = (composeFormat == nsIMsgCompFormat::HTML);
  char* newBody = NULL;
  char* html_tag = nullptr;
  if (*body && PL_strncasecmp(*body, "<HTML", 5) == 0)
    html_tag = PL_strchr(*body, '>') + 1;
  int i;

  if (!headers->done_p) {
    MimeHeaders_build_heads_list(headers);
    headers->done_p = true;
  }

  nsCString replyHeader;
  MimeGetForwardHeaderDelimiter(replyHeader);
  if (htmlEdit) {
    NS_MsgSACopy(&(newBody), MIME_FORWARD_HTML_PREFIX);
    NS_MsgSACat(&newBody, replyHeader.get());
    NS_MsgSACat(&newBody, MIME_HEADER_TABLE);
  } else {
    NS_MsgSACopy(&(newBody), MSG_LINEBREAK MSG_LINEBREAK);
    NS_MsgSACat(&newBody, replyHeader.get());
  }

  for (i = 0; i < headers->heads_size; i++) {
    char* head = headers->heads[i];
    char* end = (i == headers->heads_size - 1
                     ? headers->all_headers + headers->all_headers_fp
                     : headers->heads[i + 1]);
    char *colon, *ocolon;
    char* contents;
    char* name = 0;

    // Hack for BSD Mailbox delimiter.
    if (i == 0 && head[0] == 'F' && !strncmp(head, "From ", 5)) {
      colon = head + 4;
      contents = colon + 1;
    } else {
      /* Find the colon. */
      for (colon = head; colon < end; colon++)
        if (*colon == ':') break;

      if (colon >= end) continue; /* junk */

      /* Back up over whitespace before the colon. */
      ocolon = colon;
      for (; colon > head && IS_SPACE(colon[-1]); colon--) {
      }

      contents = ocolon + 1;
    }

    /* Skip over whitespace after colon. */
    while (contents <= end && IS_SPACE(*contents)) contents++;

    /* Take off trailing whitespace... */
    while (end > contents && IS_SPACE(end[-1])) end--;

    name = (char*)PR_MALLOC(colon - head + 1);
    if (!name) return /* MIME_OUT_OF_MEMORY */;
    memcpy(name, head, colon - head);
    name[colon - head] = 0;

    nsAutoCString headerValue;
    headerValue.Assign(contents, end - contents);

    /* Do not reveal bcc recipients when forwarding a message!
       See http://bugzilla.mozilla.org/show_bug.cgi?id=41150
    */
    if (PL_strcasecmp(name, "bcc") != 0) {
      if (!PL_strcasecmp(name, "resent-from") || !PL_strcasecmp(name, "from") ||
          !PL_strcasecmp(name, "resent-to") || !PL_strcasecmp(name, "to") ||
          !PL_strcasecmp(name, "resent-cc") || !PL_strcasecmp(name, "cc") ||
          !PL_strcasecmp(name, "reply-to"))
        UnquoteMimeAddress(headerValue, mailcharset);

      mime_intl_insert_message_header_1(&newBody, headerValue.get(), name, name,
                                        mailcharset, htmlEdit);
    }
    PR_Free(name);
  }

  if (htmlEdit) {
    NS_MsgSACat(&newBody, "</TABLE>");
    NS_MsgSACat(&newBody, MSG_LINEBREAK "<BR><BR>");
    if (html_tag)
      NS_MsgSACat(&newBody, html_tag);
    else if (*body)
      NS_MsgSACat(&newBody, *body);
  } else {
    NS_MsgSACat(&newBody, MSG_LINEBREAK MSG_LINEBREAK);
    if (*body) NS_MsgSACat(&newBody, *body);
  }

  if (newBody) {
    PR_FREEIF(*body);
    *body = newBody;
  }
}

static void mime_insert_normal_headers(char** body, MimeHeaders* headers,
                                       MSG_ComposeFormat composeFormat,
                                       char* mailcharset) {
  char* newBody = nullptr;
  char* subject = MimeHeaders_get(headers, HEADER_SUBJECT, false, false);
  char* resent_comments =
      MimeHeaders_get(headers, HEADER_RESENT_COMMENTS, false, false);
  char* resent_date = MimeHeaders_get(headers, HEADER_RESENT_DATE, false, true);
  nsCString resent_from(
      MimeHeaders_get(headers, HEADER_RESENT_FROM, false, true));
  nsCString resent_to(MimeHeaders_get(headers, HEADER_RESENT_TO, false, true));
  nsCString resent_cc(MimeHeaders_get(headers, HEADER_RESENT_CC, false, true));
  char* date = MimeHeaders_get(headers, HEADER_DATE, false, true);
  nsCString from(MimeHeaders_get(headers, HEADER_FROM, false, true));
  nsCString reply_to(MimeHeaders_get(headers, HEADER_REPLY_TO, false, true));
  char* organization =
      MimeHeaders_get(headers, HEADER_ORGANIZATION, false, false);
  nsCString to(MimeHeaders_get(headers, HEADER_TO, false, true));
  nsCString cc(MimeHeaders_get(headers, HEADER_CC, false, true));
  char* newsgroups = MimeHeaders_get(headers, HEADER_NEWSGROUPS, false, true);
  char* followup_to = MimeHeaders_get(headers, HEADER_FOLLOWUP_TO, false, true);
  char* references = MimeHeaders_get(headers, HEADER_REFERENCES, false, true);
  const char* html_tag = nullptr;
  if (*body && PL_strncasecmp(*body, "<HTML", 5) == 0)
    html_tag = PL_strchr(*body, '>') + 1;
  bool htmlEdit = composeFormat == nsIMsgCompFormat::HTML;

  if (from.IsEmpty())
    from.Adopt(MimeHeaders_get(headers, HEADER_SENDER, false, true));
  if (resent_from.IsEmpty())
    resent_from.Adopt(
        MimeHeaders_get(headers, HEADER_RESENT_SENDER, false, true));

  UnquoteMimeAddress(resent_from, mailcharset);
  UnquoteMimeAddress(resent_to, mailcharset);
  UnquoteMimeAddress(resent_cc, mailcharset);
  UnquoteMimeAddress(reply_to, mailcharset);
  UnquoteMimeAddress(from, mailcharset);
  UnquoteMimeAddress(to, mailcharset);
  UnquoteMimeAddress(cc, mailcharset);

  nsCString replyHeader;
  MimeGetForwardHeaderDelimiter(replyHeader);
  if (htmlEdit) {
    NS_MsgSACopy(&(newBody), MIME_FORWARD_HTML_PREFIX);
    NS_MsgSACat(&newBody, replyHeader.get());
    NS_MsgSACat(&newBody, MIME_HEADER_TABLE);
  } else {
    NS_MsgSACopy(&(newBody), MSG_LINEBREAK MSG_LINEBREAK);
    NS_MsgSACat(&newBody, replyHeader.get());
  }
  if (subject)
    mime_intl_insert_message_header_1(&newBody, subject, HEADER_SUBJECT,
                                      MimeGetNamedString(MIME_MHTML_SUBJECT),
                                      mailcharset, htmlEdit);
  if (resent_comments)
    mime_intl_insert_message_header_1(
        &newBody, resent_comments, HEADER_RESENT_COMMENTS,
        MimeGetNamedString(MIME_MHTML_RESENT_COMMENTS), mailcharset, htmlEdit);
  if (resent_date)
    mime_intl_insert_message_header_1(
        &newBody, resent_date, HEADER_RESENT_DATE,
        MimeGetNamedString(MIME_MHTML_RESENT_DATE), mailcharset, htmlEdit);
  if (!resent_from.IsEmpty()) {
    mime_intl_insert_message_header_1(
        &newBody, resent_from.get(), HEADER_RESENT_FROM,
        MimeGetNamedString(MIME_MHTML_RESENT_FROM), mailcharset, htmlEdit);
  }
  if (!resent_to.IsEmpty()) {
    mime_intl_insert_message_header_1(
        &newBody, resent_to.get(), HEADER_RESENT_TO,
        MimeGetNamedString(MIME_MHTML_RESENT_TO), mailcharset, htmlEdit);
  }
  if (!resent_cc.IsEmpty()) {
    mime_intl_insert_message_header_1(
        &newBody, resent_cc.get(), HEADER_RESENT_CC,
        MimeGetNamedString(MIME_MHTML_RESENT_CC), mailcharset, htmlEdit);
  }
  if (date)
    mime_intl_insert_message_header_1(&newBody, date, HEADER_DATE,
                                      MimeGetNamedString(MIME_MHTML_DATE),
                                      mailcharset, htmlEdit);
  if (!from.IsEmpty()) {
    mime_intl_insert_message_header_1(&newBody, from.get(), HEADER_FROM,
                                      MimeGetNamedString(MIME_MHTML_FROM),
                                      mailcharset, htmlEdit);
  }
  if (!reply_to.IsEmpty()) {
    mime_intl_insert_message_header_1(&newBody, reply_to.get(), HEADER_REPLY_TO,
                                      MimeGetNamedString(MIME_MHTML_REPLY_TO),
                                      mailcharset, htmlEdit);
  }
  if (organization)
    mime_intl_insert_message_header_1(
        &newBody, organization, HEADER_ORGANIZATION,
        MimeGetNamedString(MIME_MHTML_ORGANIZATION), mailcharset, htmlEdit);
  if (!to.IsEmpty()) {
    mime_intl_insert_message_header_1(&newBody, to.get(), HEADER_TO,
                                      MimeGetNamedString(MIME_MHTML_TO),
                                      mailcharset, htmlEdit);
  }
  if (!cc.IsEmpty()) {
    mime_intl_insert_message_header_1(&newBody, cc.get(), HEADER_CC,
                                      MimeGetNamedString(MIME_MHTML_CC),
                                      mailcharset, htmlEdit);
  }
  /*
    Do not reveal bcc recipients when forwarding a message!
    See http://bugzilla.mozilla.org/show_bug.cgi?id=41150
  */
  if (newsgroups)
    mime_intl_insert_message_header_1(&newBody, newsgroups, HEADER_NEWSGROUPS,
                                      MimeGetNamedString(MIME_MHTML_NEWSGROUPS),
                                      mailcharset, htmlEdit);
  if (followup_to) {
    mime_intl_insert_message_header_1(
        &newBody, followup_to, HEADER_FOLLOWUP_TO,
        MimeGetNamedString(MIME_MHTML_FOLLOWUP_TO), mailcharset, htmlEdit);
  }
  // only show references for newsgroups
  if (newsgroups && references) {
    mime_intl_insert_message_header_1(&newBody, references, HEADER_REFERENCES,
                                      MimeGetNamedString(MIME_MHTML_REFERENCES),
                                      mailcharset, htmlEdit);
  }
  if (htmlEdit) {
    NS_MsgSACat(&newBody, "</TABLE>");
    NS_MsgSACat(&newBody, MSG_LINEBREAK "<BR><BR>");
    if (html_tag)
      NS_MsgSACat(&newBody, html_tag);
    else if (*body)
      NS_MsgSACat(&newBody, *body);
  } else {
    NS_MsgSACat(&newBody, MSG_LINEBREAK MSG_LINEBREAK);
    if (*body) NS_MsgSACat(&newBody, *body);
  }
  if (newBody) {
    PR_FREEIF(*body);
    *body = newBody;
  }
  PR_FREEIF(subject);
  PR_FREEIF(resent_comments);
  PR_FREEIF(resent_date);
  PR_FREEIF(date);
  PR_FREEIF(organization);
  PR_FREEIF(newsgroups);
  PR_FREEIF(followup_to);
  PR_FREEIF(references);
}

static void mime_insert_micro_headers(char** body, MimeHeaders* headers,
                                      MSG_ComposeFormat composeFormat,
                                      char* mailcharset) {
  char* newBody = NULL;
  char* subject = MimeHeaders_get(headers, HEADER_SUBJECT, false, false);
  nsCString from(MimeHeaders_get(headers, HEADER_FROM, false, true));
  nsCString resent_from(
      MimeHeaders_get(headers, HEADER_RESENT_FROM, false, true));
  char* date = MimeHeaders_get(headers, HEADER_DATE, false, true);
  nsCString to(MimeHeaders_get(headers, HEADER_TO, false, true));
  nsCString cc(MimeHeaders_get(headers, HEADER_CC, false, true));
  char* newsgroups = MimeHeaders_get(headers, HEADER_NEWSGROUPS, false, true);
  const char* html_tag = nullptr;
  if (*body && PL_strncasecmp(*body, "<HTML", 5) == 0)
    html_tag = PL_strchr(*body, '>') + 1;
  bool htmlEdit = composeFormat == nsIMsgCompFormat::HTML;

  if (from.IsEmpty())
    from.Adopt(MimeHeaders_get(headers, HEADER_SENDER, false, true));
  if (resent_from.IsEmpty())
    resent_from.Adopt(
        MimeHeaders_get(headers, HEADER_RESENT_SENDER, false, true));
  if (!date) date = MimeHeaders_get(headers, HEADER_RESENT_DATE, false, true);

  UnquoteMimeAddress(resent_from, mailcharset);
  UnquoteMimeAddress(from, mailcharset);
  UnquoteMimeAddress(to, mailcharset);
  UnquoteMimeAddress(cc, mailcharset);

  nsCString replyHeader;
  MimeGetForwardHeaderDelimiter(replyHeader);
  if (htmlEdit) {
    NS_MsgSACopy(&(newBody), MIME_FORWARD_HTML_PREFIX);
    NS_MsgSACat(&newBody, replyHeader.get());
    NS_MsgSACat(&newBody, MIME_HEADER_TABLE);
  } else {
    NS_MsgSACopy(&(newBody), MSG_LINEBREAK MSG_LINEBREAK);
    NS_MsgSACat(&newBody, replyHeader.get());
  }

  if (!from.IsEmpty()) {
    mime_intl_insert_message_header_1(&newBody, from.get(), HEADER_FROM,
                                      MimeGetNamedString(MIME_MHTML_FROM),
                                      mailcharset, htmlEdit);
  }
  if (subject)
    mime_intl_insert_message_header_1(&newBody, subject, HEADER_SUBJECT,
                                      MimeGetNamedString(MIME_MHTML_SUBJECT),
                                      mailcharset, htmlEdit);
  /*
    if (date)
      mime_intl_insert_message_header_1(&newBody, date, HEADER_DATE,
                      MimeGetNamedString(MIME_MHTML_DATE),
                      mailcharset, htmlEdit);
  */
  if (!resent_from.IsEmpty()) {
    mime_intl_insert_message_header_1(
        &newBody, resent_from.get(), HEADER_RESENT_FROM,
        MimeGetNamedString(MIME_MHTML_RESENT_FROM), mailcharset, htmlEdit);
  }
  if (!to.IsEmpty()) {
    mime_intl_insert_message_header_1(&newBody, to.get(), HEADER_TO,
                                      MimeGetNamedString(MIME_MHTML_TO),
                                      mailcharset, htmlEdit);
  }
  if (!cc.IsEmpty()) {
    mime_intl_insert_message_header_1(&newBody, cc.get(), HEADER_CC,
                                      MimeGetNamedString(MIME_MHTML_CC),
                                      mailcharset, htmlEdit);
  }
  /*
    Do not reveal bcc recipients when forwarding a message!
    See http://bugzilla.mozilla.org/show_bug.cgi?id=41150
  */
  if (newsgroups)
    mime_intl_insert_message_header_1(&newBody, newsgroups, HEADER_NEWSGROUPS,
                                      MimeGetNamedString(MIME_MHTML_NEWSGROUPS),
                                      mailcharset, htmlEdit);
  if (htmlEdit) {
    NS_MsgSACat(&newBody, "</TABLE>");
    NS_MsgSACat(&newBody, MSG_LINEBREAK "<BR><BR>");
    if (html_tag)
      NS_MsgSACat(&newBody, html_tag);
    else if (*body)
      NS_MsgSACat(&newBody, *body);
  } else {
    NS_MsgSACat(&newBody, MSG_LINEBREAK MSG_LINEBREAK);
    if (*body) NS_MsgSACat(&newBody, *body);
  }
  if (newBody) {
    PR_FREEIF(*body);
    *body = newBody;
  }
  PR_FREEIF(subject);
  PR_FREEIF(date);
  PR_FREEIF(newsgroups);
}

// body has to be encoded in UTF-8
static void mime_insert_forwarded_message_headers(
    char** body, MimeHeaders* headers, MSG_ComposeFormat composeFormat,
    char* mailcharset) {
  if (!body || !headers) return;

  int32_t show_headers = 0;
  nsresult res;

  nsCOMPtr<nsIPrefBranch> prefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &res));
  if (NS_SUCCEEDED(res))
    prefBranch->GetIntPref("mail.show_headers", &show_headers);

  switch (show_headers) {
    case 0:
      mime_insert_micro_headers(body, headers, composeFormat, mailcharset);
      break;
    default:
    case 1:
      mime_insert_normal_headers(body, headers, composeFormat, mailcharset);
      break;
    case 2:
      mime_insert_all_headers(body, headers, composeFormat, mailcharset);
      break;
  }
}

static void convert_plaintext_body_to_html(char** body) {
  // We need to convert the plain/text to HTML in order to escape any HTML
  // markup.
  nsCString escapedBody;
  nsAppendEscapedHTML(nsDependentCString(*body), escapedBody);

  nsCString newBody;
  char* q = escapedBody.BeginWriting();
  char* p;
  int prevQuoteLevel = 0;
  bool isFlowed = false;
  bool haveSig = false;

  // First detect whether this appears to be flowed or not.
  p = q;
  while (*p) {
    // At worst we read the null byte terminator.
    if (*p == ' ' && (*(p + 1) == '\r' || *(p + 1) == '\n')) {
      // This looks flowed, but don't get fooled by a signature separator:
      // --space
      if (p - 3 >= q && (*(p - 3) == '\r' || *(p - 3) == '\n') &&
          *(p - 2) == '-' && *(p - 1) == '-') {
        p++;
        continue;
      }
      if (p - 2 == q && *(p - 2) == '-' && *(p - 1) == '-') {
        p++;
        continue;
      }
      isFlowed = true;
      break;
    }
    p++;
  }

  while (*q) {
    p = q;
    // Detect quotes. A quote character is a ">" which was escaped to &gt;.
    // In non-flowed messages the quote character can be optionally followed by
    // a space. Examples: Level 0
    //  > Level 0 (with leading space)
    // > Level 1
    // >  > Level 1 (with leading space, note the two spaces between the quote
    // characters)
    // >> Level 2
    // > > Level 2 (only when non-flowed, otherwise Level 1 with leading space)
    // >>> Level 3
    // > > >  Level 3 (with leading space, only when non-flowed, otherwise Level
    // 1)
    int quoteLevel = 0;
    while (strncmp(p, "&gt;", 4) == 0) {
      p += 4;
      if (!isFlowed && *p == ' ') p++;
      quoteLevel++;
    }

    // Eat space following quote character, for non-flowed already eaten above.
    if (quoteLevel > 0 && isFlowed && *p == ' ') p++;

    // Close any open signatures if we find a quote. Strange, that shouldn't
    // happen.
    if (quoteLevel > 0 && haveSig) {
      newBody.AppendLiteral("</pre>");
      haveSig = false;
    }
    if (quoteLevel > prevQuoteLevel) {
      while (prevQuoteLevel < quoteLevel) {
        if (isFlowed)
          newBody.AppendLiteral("<blockquote type=\"cite\">");
        else
          newBody.AppendLiteral(
              "<blockquote type=\"cite\"><pre wrap class=\"moz-quote-pre\">");
        prevQuoteLevel++;
      }
    } else if (quoteLevel < prevQuoteLevel) {
      while (prevQuoteLevel > quoteLevel) {
        if (isFlowed)
          newBody.AppendLiteral("</blockquote>");
        else
          newBody.AppendLiteral("</pre></blockquote>");
        prevQuoteLevel--;
      }
    }
    // Position after the quote.
    q = p;

    // Detect signature.
    bool forceBR = false;
    if (quoteLevel == 0) {
      if (strncmp(q, "-- \r", 4) == 0 || strncmp(q, "-- \n", 4) == 0) {
        haveSig = true;
        forceBR = true;
        newBody.AppendLiteral("<pre class=\"moz-signature\">");
      }
    }

    bool seenSpace = false;
    while (*p && *p != '\r' && *p != '\n') {
      seenSpace = (*p == ' ');
      p++;
      continue;
    }
    if (!*p) {
      // We're at the end of the string.
      if (p > q) {
        // Copy last bit over.
        newBody.Append(q);
      }
      break;
    }
    if (*p == '\r' &&
        *(p + 1) == '\n') {  // At worst we read the null byte terminator.
      // Skip the CR in CRLF.
      *p = 0;  // don't copy skipped \r.
      p++;
    }
    *p = 0;
    newBody.Append(q);
    if (!isFlowed || !seenSpace || forceBR) newBody.AppendLiteral("<br>");
    q = p + 1;
  }

  // Close all open quotes.
  while (prevQuoteLevel > 0) {
    if (isFlowed)
      newBody.AppendLiteral("</blockquote>");
    else
      newBody.AppendLiteral("</pre></blockquote>");
    prevQuoteLevel--;
  }

  // Close any open signatures.
  if (haveSig) {
    newBody.AppendLiteral("</pre>");
    haveSig = false;
  }

  PR_Free(*body);
  *body = ToNewCString(newBody);
}

static void mime_parse_stream_complete(nsMIMESession* stream) {
  NS_ASSERTION(stream->data_object, "null mime data");
  if (!stream->data_object) {
    return;
  }

  mime_draft_data* mdd = stream->data_object.AsMimeDraftData();
  if (!mdd) {
    return;
  }

  nsCOMPtr<nsIMsgCompFields> fields;
  int htmlAction = 0;
  int lineWidth = 0;

  char* host = 0;
  char* news_host = 0;
  char* to_and_cc = 0;
  char* re_subject = 0;
  char* new_refs = 0;
  char* from = 0;
  char* repl = 0;
  char* subj = 0;
  char* id = 0;
  char* refs = 0;
  char* to = 0;
  char* cc = 0;
  char* bcc = 0;
  char* fcc = 0;
  char* org = 0;
  char* grps = 0;
  char* foll = 0;
  char* priority = 0;
  char* draftInfo = 0;
  char* contentLanguage = 0;
  char* identityKey = 0;
  nsTArray<nsString> readOtherHeaders;

  bool forward_inline = false;
  bool bodyAsAttachment = false;
  bool charsetOverride = false;

  if (mdd->obj) {
    int status;

    status = mdd->obj->clazz->parse_eof(mdd->obj, false);
    mdd->obj->clazz->parse_end(mdd->obj, status < 0 ? true : false);

    // RICHIE
    // We need to figure out how to pass the forwarded flag along with this
    // operation.

    // forward_inline = (mdd->format_out != FO_CMDLINE_ATTACHMENTS);
    forward_inline = mdd->forwardInline;

    NS_ASSERTION(mdd->options == mdd->obj->options,
                 "mime draft options not same as obj->options");
    mime_free(mdd->obj);
    mdd->obj = 0;
    if (mdd->options) {
      // save the override flag before it's unavailable
      charsetOverride = mdd->options->override_charset;
      // Override the charset only if requested. If the message doesn't have
      // one and we're not overriding, we'll detect it later.
      if (charsetOverride && mdd->options->default_charset) {
        PR_FREEIF(mdd->mailcharset);
        mdd->mailcharset = strdup(mdd->options->default_charset);
      }

      // mscott: aren't we leaking a bunch of strings here like the charset
      // strings and such?
      delete mdd->options;
      mdd->options = 0;
    }
    if (mdd->stream) {
      mdd->stream->complete(mdd->stream);
      PR_Free(mdd->stream);
      mdd->stream = 0;
    }
  }

  //
  // Now, process the attachments that we have gathered from the message
  // on disk
  //
  nsMsgAttachmentData* newAttachData = mime_draft_process_attachments(mdd);

  //
  // time to bring up the compose windows with all the info gathered
  //
  if (mdd->headers) {
    subj = MimeHeaders_get(mdd->headers, HEADER_SUBJECT, false, false);
    if (forward_inline) {
      if (subj) {
        nsresult rv;
        nsCOMPtr<nsIPrefBranch> prefBranch(
            do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
        if (NS_SUCCEEDED(rv)) {
          nsAutoCString fwdPrefix;
          prefBranch->GetCharPref("mail.forward_subject_prefix", fwdPrefix);
          char* newSubj = PR_smprintf(
              "%s: %s", !fwdPrefix.IsEmpty() ? fwdPrefix.get() : "Fwd", subj);
          if (newSubj) {
            PR_Free(subj);
            subj = newSubj;
          }
        }
      }
    } else {
      from = MimeHeaders_get(mdd->headers, HEADER_FROM, false, false);
      repl = MimeHeaders_get(mdd->headers, HEADER_REPLY_TO, false, false);
      to = MimeHeaders_get(mdd->headers, HEADER_TO, false, true);
      cc = MimeHeaders_get(mdd->headers, HEADER_CC, false, true);
      bcc = MimeHeaders_get(mdd->headers, HEADER_BCC, false, true);

      /* These headers should not be RFC-1522-decoded. */
      grps = MimeHeaders_get(mdd->headers, HEADER_NEWSGROUPS, false, true);
      foll = MimeHeaders_get(mdd->headers, HEADER_FOLLOWUP_TO, false, true);

      host = MimeHeaders_get(mdd->headers, HEADER_X_MOZILLA_NEWSHOST, false,
                             false);
      if (!host)
        host = MimeHeaders_get(mdd->headers, HEADER_NNTP_POSTING_HOST, false,
                               false);

      id = MimeHeaders_get(mdd->headers, HEADER_MESSAGE_ID, false, false);
      refs = MimeHeaders_get(mdd->headers, HEADER_REFERENCES, false, true);
      priority = MimeHeaders_get(mdd->headers, HEADER_X_PRIORITY, false, false);

      if (host) {
        char* secure = NULL;

        secure = PL_strcasestr(host, "secure");
        if (secure) {
          *secure = 0;
          news_host = PR_smprintf("snews://%s", host);
        } else {
          news_host = PR_smprintf("news://%s", host);
        }
      }

      // Other headers via pref.
      nsCString otherHeaders;
      nsTArray<nsCString> otherHeadersArray;
      nsresult rv;
      nsCOMPtr<nsIPrefBranch> pPrefBranch(
          do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
      pPrefBranch->GetCharPref("mail.compose.other.header", otherHeaders);
      if (!otherHeaders.IsEmpty()) {
        ToLowerCase(otherHeaders);
        ParseString(otherHeaders, ',', otherHeadersArray);
        for (auto otherHeader : otherHeadersArray) {
          otherHeader.Trim(" ");
          nsAutoCString result;
          result.Assign(
              MimeHeaders_get(mdd->headers, otherHeader.get(), false, false));
          readOtherHeaders.AppendElement(NS_ConvertUTF8toUTF16(result));
        }
      }
    }

    CreateCompositionFields(from, repl, to, cc, bcc, fcc, grps, foll, org, subj,
                            refs, priority, news_host, readOtherHeaders,
                            mdd->mailcharset, getter_AddRefs(fields));

    contentLanguage =
        MimeHeaders_get(mdd->headers, HEADER_CONTENT_LANGUAGE, false, false);
    if (contentLanguage) {
      fields->SetContentLanguage(contentLanguage);
    }

    draftInfo = MimeHeaders_get(mdd->headers, HEADER_X_MOZILLA_DRAFT_INFO,
                                false, false);

    // We always preserve an existing message ID, if present, apart from some
    // exceptions.
    bool keepID = fields != nullptr;

    // Don't keep ID when forwarding inline.
    if (forward_inline) keepID = false;

    // nsMimeOutput::nsMimeMessageEditorTemplate is used for editing a message
    // "as new", creating a message from a template or editing a template.
    // Only in the latter case we want to preserve the ID.
    if (mdd->format_out == nsMimeOutput::nsMimeMessageEditorTemplate &&
        !PL_strstr(mdd->url_name, "&edittempl=true"))
      keepID = false;

    if (keepID) fields->SetMessageId(id);

    if (draftInfo && fields && !forward_inline) {
      char* parm = 0;
      parm = MimeHeaders_get_parameter(draftInfo, "vcard", NULL, NULL);
      fields->SetAttachVCard(parm && !strcmp(parm, "1"));
      PR_FREEIF(parm);

      parm = MimeHeaders_get_parameter(draftInfo, "receipt", NULL, NULL);
      if (!parm || !strcmp(parm, "0"))
        fields->SetReturnReceipt(false);
      else {
        int receiptType = 0;
        fields->SetReturnReceipt(true);
        sscanf(parm, "%d", &receiptType);
        // slight change compared to 4.x; we used to use receipt= to tell
        // whether the draft/template has request for either MDN or DNS or both
        // return receipt; since the DNS is out of the picture we now use the
        // header type - 1 to tell whether user has requested the return receipt
        fields->SetReceiptHeaderType(((int32_t)receiptType) - 1);
      }
      PR_FREEIF(parm);
      parm = MimeHeaders_get_parameter(draftInfo, "DSN", NULL, NULL);
      fields->SetDSN(parm && !strcmp(parm, "1"));
      PR_Free(parm);
      parm = MimeHeaders_get_parameter(draftInfo, "html", NULL, NULL);
      if (parm) sscanf(parm, "%d", &htmlAction);
      PR_FREEIF(parm);
      parm = MimeHeaders_get_parameter(draftInfo, "linewidth", NULL, NULL);
      if (parm) sscanf(parm, "%d", &lineWidth);
      PR_FREEIF(parm);
      parm = MimeHeaders_get_parameter(draftInfo, "attachmentreminder", NULL,
                                       NULL);
      if (parm && !strcmp(parm, "1"))
        fields->SetAttachmentReminder(true);
      else
        fields->SetAttachmentReminder(false);
      PR_FREEIF(parm);
      parm = MimeHeaders_get_parameter(draftInfo, "deliveryformat", NULL, NULL);
      if (parm) {
        int32_t deliveryFormat = nsIMsgCompSendFormat::Unset;
        sscanf(parm, "%d", &deliveryFormat);
        fields->SetDeliveryFormat(deliveryFormat);
      }
      PR_FREEIF(parm);
    }

    // identity to prefer when opening the message in the compose window?
    identityKey = MimeHeaders_get(mdd->headers, HEADER_X_MOZILLA_IDENTITY_KEY,
                                  false, false);
    if (identityKey && *identityKey) {
      nsresult rv = NS_OK;
      nsCOMPtr<nsIMsgAccountManager> accountManager =
          do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
      if (NS_SUCCEEDED(rv) && accountManager) {
        nsCOMPtr<nsIMsgIdentity> overrulingIdentity;
        rv = accountManager->GetIdentity(nsDependentCString(identityKey),
                                         getter_AddRefs(overrulingIdentity));

        if (NS_SUCCEEDED(rv) && overrulingIdentity) {
          mdd->identity = overrulingIdentity;
          fields->SetCreatorIdentityKey(identityKey);
        }
      }
    }

    if (mdd->messageBody) {
      MSG_ComposeFormat composeFormat = nsIMsgCompFormat::Default;
      if (!mdd->messageBody->m_type.IsEmpty()) {
        if (mdd->messageBody->m_type.LowerCaseFindASCII("text/html") !=
            kNotFound)
          composeFormat = nsIMsgCompFormat::HTML;
        else if (mdd->messageBody->m_type.LowerCaseFindASCII("text/plain") !=
                     kNotFound ||
                 mdd->messageBody->m_type.LowerCaseEqualsLiteral("text"))
          composeFormat = nsIMsgCompFormat::PlainText;
        else
          // We cannot use this kind of data for the message body! Therefore,
          // move it as attachment
          bodyAsAttachment = true;
      } else
        composeFormat = nsIMsgCompFormat::PlainText;

      char* body = nullptr;

      if (!bodyAsAttachment && mdd->messageBody->m_tmpFile) {
        int64_t fileSize;
        nsCOMPtr<nsIFile> tempFileCopy;
        mdd->messageBody->m_tmpFile->Clone(getter_AddRefs(tempFileCopy));
        mdd->messageBody->m_tmpFile = tempFileCopy;
        tempFileCopy = nullptr;
        mdd->messageBody->m_tmpFile->GetFileSize(&fileSize);
        uint32_t bodyLen = 0;

        // The stream interface can only read up to 4GB (32bit uint).
        // It is highly unlikely to encounter a body lager than that limit,
        // so we just skip it instead of reading it in chunks.
        if (fileSize < UINT32_MAX) {
          bodyLen = fileSize;
          body = (char*)PR_MALLOC(bodyLen + 1);
        }
        if (body) {
          memset(body, 0, bodyLen + 1);

          uint32_t bytesRead;
          nsCOMPtr<nsIInputStream> inputStream;

          nsresult rv = NS_NewLocalFileInputStream(getter_AddRefs(inputStream),
                                                   mdd->messageBody->m_tmpFile);
          if (NS_FAILED(rv)) return;

          inputStream->Read(body, bodyLen, &bytesRead);

          inputStream->Close();

          // Convert the body to UTF-8
          char* mimeCharset = nullptr;
          // Get a charset from the header if no override is set.
          if (!charsetOverride)
            mimeCharset = MimeHeaders_get_parameter(
                mdd->messageBody->m_type.get(), "charset", nullptr, nullptr);
          // If no charset is specified in the header then use the default.
          nsAutoCString bodyCharset;
          if (mimeCharset) {
            bodyCharset.Adopt(mimeCharset);
          } else if (mdd->mailcharset) {
            bodyCharset.Assign(mdd->mailcharset);
          }
          if (bodyCharset.IsEmpty()) {
            nsAutoCString detectedCharset;
            // We need to detect it.
            rv = MIME_detect_charset(body, bodyLen, detectedCharset);
            if (NS_SUCCEEDED(rv) && !detectedCharset.IsEmpty()) {
              bodyCharset = detectedCharset;
            }
          }
          if (!bodyCharset.IsEmpty()) {
            nsAutoString tmpUnicodeBody;
            rv = nsMsgI18NConvertToUnicode(
                bodyCharset, nsDependentCString(body), tmpUnicodeBody);
            if (NS_FAILED(rv))  // Tough luck, ASCII/ISO-8859-1 then...
              CopyASCIItoUTF16(nsDependentCString(body), tmpUnicodeBody);

            char* newBody = ToNewUTF8String(tmpUnicodeBody);
            if (newBody) {
              PR_Free(body);
              body = newBody;
            }
          }
        }
      }

      bool convertToPlainText = false;
      if (forward_inline) {
        if (mdd->identity) {
          bool identityComposeHTML;
          mdd->identity->GetComposeHtml(&identityComposeHTML);
          if ((identityComposeHTML && !mdd->overrideComposeFormat) ||
              (!identityComposeHTML && mdd->overrideComposeFormat)) {
            // In the end, we're going to compose in HTML mode...

            if (body && composeFormat == nsIMsgCompFormat::PlainText) {
              // ... but the message body is currently plain text.
              convert_plaintext_body_to_html(&body);
            }
            // Body is now HTML, set the format too (so headers are inserted in
            // correct format).
            composeFormat = nsIMsgCompFormat::HTML;
          } else if ((identityComposeHTML && mdd->overrideComposeFormat) ||
                     !identityComposeHTML) {
            // In the end, we're going to compose in plain text mode...

            if (composeFormat == nsIMsgCompFormat::HTML) {
              // ... but the message body is currently HTML.
              // We'll do the conversion later on when headers have been
              // inserted, body has been set and converted to unicode.
              convertToPlainText = true;
            }
          }
        }

        mime_insert_forwarded_message_headers(&body, mdd->headers,
                                              composeFormat, mdd->mailcharset);
      }

      MSG_ComposeType msgComposeType = 0;  // Keep compilers happy.
      if (mdd->format_out == nsMimeOutput::nsMimeMessageEditorTemplate) {
        if (PL_strstr(mdd->url_name, "?redirect=true") ||
            PL_strstr(mdd->url_name, "&redirect=true"))
          msgComposeType = nsIMsgCompType::Redirect;
        else if (PL_strstr(mdd->url_name, "?editasnew=true") ||
                 PL_strstr(mdd->url_name, "&editasnew=true"))
          msgComposeType = nsIMsgCompType::EditAsNew;
        else if (PL_strstr(mdd->url_name, "?edittempl=true") ||
                 PL_strstr(mdd->url_name, "&edittempl=true"))
          msgComposeType = nsIMsgCompType::EditTemplate;
        else
          msgComposeType = nsIMsgCompType::Template;
      }

      if (body && msgComposeType == nsIMsgCompType::EditAsNew) {
        // When editing as new, we respect the identities preferred format
        // which can be overridden.
        if (mdd->identity) {
          bool identityComposeHTML;
          mdd->identity->GetComposeHtml(&identityComposeHTML);

          if (composeFormat == nsIMsgCompFormat::HTML &&
              identityComposeHTML == mdd->overrideComposeFormat) {
            // We we have HTML:
            // If they want HTML and they want to override it (true == true)
            // or they don't want HTML and they don't want to override it
            // (false == false), then convert. Conversion happens below.
            convertToPlainText = true;
            composeFormat = nsIMsgCompFormat::PlainText;
          } else if (composeFormat == nsIMsgCompFormat::PlainText &&
                     identityComposeHTML != mdd->overrideComposeFormat) {
            // We have plain text:
            // If they want HTML and they don't want to override it (true !=
            // false) or they don't want HTML and they want to override it
            // (false != true), then convert.
            convert_plaintext_body_to_html(&body);
            composeFormat = nsIMsgCompFormat::HTML;
          }
        }
      } else if (body && mdd->overrideComposeFormat &&
                 (msgComposeType == nsIMsgCompType::Template ||
                  msgComposeType == nsIMsgCompType::EditTemplate ||
                  !mdd->forwardInline))  // Draft processing.
      {
        // When using a template and overriding, the user gets the
        // "other" format.
        if (composeFormat == nsIMsgCompFormat::PlainText) {
          convert_plaintext_body_to_html(&body);
          composeFormat = nsIMsgCompFormat::HTML;
        } else {
          // Conversion happens below.
          convertToPlainText = true;
          composeFormat = nsIMsgCompFormat::PlainText;
        }
      }

      // convert from UTF-8 to UTF-16
      if (body) {
        fields->SetBody(NS_ConvertUTF8toUTF16(body));
        PR_Free(body);
      }

      //
      // At this point, we need to create a message compose window or editor
      // window via XP-COM with the information that we have retrieved from
      // the message store.
      //
      if (mdd->format_out == nsMimeOutput::nsMimeMessageEditorTemplate) {
        // Set the draft ID when editing a template so the original is
        // overwritten when saving the template again.
        // Note that always setting the draft ID here would cause drafts to be
        // overwritten when edited "as new", which is undesired.
        if (msgComposeType == nsIMsgCompType::EditTemplate) {
          fields->SetDraftId(nsDependentCString(mdd->url_name));
          fields->SetTemplateId(nsDependentCString(
              mdd->url_name));  // Remember original template ID.
        }

        if (convertToPlainText) fields->ConvertBodyToPlainText();

        CreateTheComposeWindow(fields, newAttachData, msgComposeType,
                               composeFormat, mdd->identity,
                               mdd->originalMsgURI, mdd->origMsgHdr);
      } else {
        if (mdd->forwardInline) {
          if (convertToPlainText) fields->ConvertBodyToPlainText();
          if (mdd->overrideComposeFormat)
            composeFormat = nsIMsgCompFormat::OppositeOfDefault;
          if (mdd->forwardInlineFilter) {
            fields->SetTo(mdd->forwardToAddress);
            ForwardMsgInline(fields, newAttachData, composeFormat,
                             mdd->identity, mdd->originalMsgURI,
                             mdd->origMsgHdr);
          } else
            CreateTheComposeWindow(fields, newAttachData,
                                   nsIMsgCompType::ForwardInline, composeFormat,
                                   mdd->identity, mdd->originalMsgURI,
                                   mdd->origMsgHdr);
        } else {
          if (convertToPlainText) fields->ConvertBodyToPlainText();
          fields->SetDraftId(nsDependentCString(mdd->url_name));
          CreateTheComposeWindow(fields, newAttachData, nsIMsgCompType::Draft,
                                 composeFormat, mdd->identity,
                                 mdd->originalMsgURI, mdd->origMsgHdr);
        }
      }
    } else {
      //
      // At this point, we need to create a message compose window via
      // XP-COM with the information that we have retrieved from the message
      // store.
      //
      if (mdd->format_out == nsMimeOutput::nsMimeMessageEditorTemplate) {
#ifdef NS_DEBUG
        printf(
            "RICHIE: Time to create the EDITOR with this template - NO "
            "body!!!!\n");
#endif
        CreateTheComposeWindow(fields, newAttachData, nsIMsgCompType::Template,
                               nsIMsgCompFormat::Default, mdd->identity,
                               EmptyCString(), mdd->origMsgHdr);
      } else {
#ifdef NS_DEBUG
        printf("Time to create the composition window WITHOUT a body!!!!\n");
#endif
        if (mdd->forwardInline) {
          MSG_ComposeFormat composeFormat =
              (mdd->overrideComposeFormat) ? nsIMsgCompFormat::OppositeOfDefault
                                           : nsIMsgCompFormat::Default;
          CreateTheComposeWindow(fields, newAttachData,
                                 nsIMsgCompType::ForwardInline, composeFormat,
                                 mdd->identity, mdd->originalMsgURI,
                                 mdd->origMsgHdr);
        } else {
          fields->SetDraftId(nsDependentCString(mdd->url_name));
          CreateTheComposeWindow(fields, newAttachData, nsIMsgCompType::Draft,
                                 nsIMsgCompFormat::Default, mdd->identity,
                                 EmptyCString(), mdd->origMsgHdr);
        }
      }
    }
  } else {
    CreateCompositionFields(from, repl, to, cc, bcc, fcc, grps, foll, org, subj,
                            refs, priority, news_host, readOtherHeaders,
                            mdd->mailcharset, getter_AddRefs(fields));
    if (fields)
      CreateTheComposeWindow(fields, newAttachData, nsIMsgCompType::New,
                             nsIMsgCompFormat::Default, mdd->identity,
                             EmptyCString(), mdd->origMsgHdr);
  }

  if (mdd->headers) MimeHeaders_free(mdd->headers);

  //
  // Free the original attachment structure...
  // Make sure we only cleanup the local copy of the memory and not kill
  // files we need on disk
  //
  if (bodyAsAttachment)
    mdd->messageBody->m_tmpFile = nullptr;
  else if (mdd->messageBody && mdd->messageBody->m_tmpFile)
    mdd->messageBody->m_tmpFile->Remove(false);

  delete mdd->messageBody;

  for (uint32_t i = 0; i < mdd->attachments.Length(); i++)
    mdd->attachments[i]->m_tmpFile = nullptr;

  PR_FREEIF(mdd->mailcharset);

  mdd->identity = nullptr;
  PR_Free(mdd->url_name);
  mdd->origMsgHdr = nullptr;
  PR_Free(mdd);

  PR_FREEIF(host);
  PR_FREEIF(to_and_cc);
  PR_FREEIF(re_subject);
  PR_FREEIF(new_refs);
  PR_FREEIF(from);
  PR_FREEIF(repl);
  PR_FREEIF(subj);
  PR_FREEIF(id);
  PR_FREEIF(refs);
  PR_FREEIF(to);
  PR_FREEIF(cc);
  PR_FREEIF(grps);
  PR_FREEIF(foll);
  PR_FREEIF(priority);
  PR_FREEIF(draftInfo);
  PR_Free(identityKey);

  delete[] newAttachData;
}

static void mime_parse_stream_abort(nsMIMESession* stream, int status) {
  NS_ASSERTION(stream->data_object, "null mime data");
  if (!stream->data_object) {
    return;
  }

  mime_draft_data* mdd = stream->data_object.AsMimeDraftData();
  if (!mdd) {
    return;
  }

  if (mdd->obj) {
    int status = 0;

    if (!mdd->obj->closed_p)
      status = mdd->obj->clazz->parse_eof(mdd->obj, true);
    if (!mdd->obj->parsed_p) mdd->obj->clazz->parse_end(mdd->obj, true);

    NS_ASSERTION(mdd->options == mdd->obj->options,
                 "draft display options not same as mime obj");
    mime_free(mdd->obj);
    mdd->obj = 0;
    if (mdd->options) {
      delete mdd->options;
      mdd->options = 0;
    }

    if (mdd->stream) {
      mdd->stream->abort(mdd->stream, status);
      PR_Free(mdd->stream);
      mdd->stream = 0;
    }
  }

  if (mdd->headers) MimeHeaders_free(mdd->headers);

  mime_free_attachments(mdd->attachments);

  PR_FREEIF(mdd->mailcharset);

  PR_Free(mdd);
}

static int make_mime_headers_copy(MimeClosure closure, MimeHeaders* headers) {
  NS_ASSERTION(closure && headers, "null mime draft data and/or headers");
  if (!closure || !headers) return 0;

  mime_draft_data* mdd = closure.AsMimeDraftData();
  if (!mdd) {
    return 0;
  }

  NS_ASSERTION(mdd->headers == NULL, "non null mime draft data headers");

  mdd->headers = MimeHeaders_copy(headers);
  mdd->options->done_parsing_outer_headers = true;

  return 0;
}

int mime_decompose_file_init_fn(MimeClosure stream_closure,
                                MimeHeaders* headers) {
  NS_ASSERTION(stream_closure && headers,
               "null mime draft data and/or headers");
  if (!stream_closure || !headers) return -1;

  mime_draft_data* mdd = stream_closure.AsMimeDraftData();
  if (!mdd) {
    return -1;
  }

  nsMsgAttachedFile* newAttachment = 0;
  int nAttachments = 0;
  // char *hdr_value = NULL;
  char* parm_value = NULL;
  bool creatingMsgBody = true;

  if (mdd->options->decompose_init_count) {
    mdd->options->decompose_init_count++;
    NS_ASSERTION(mdd->curAttachment,
                 "missing attachment in mime_decompose_file_init_fn");
    if (mdd->curAttachment)
      mdd->curAttachment->m_type.Adopt(
          MimeHeaders_get(headers, HEADER_CONTENT_TYPE, false, true));
    return 0;
  } else
    mdd->options->decompose_init_count++;

  nAttachments = mdd->attachments.Length();

  if (!nAttachments && !mdd->messageBody) {
    // if we've been told to use an override charset then do so....otherwise use
    // the charset inside the message header...
    if (mdd->options && mdd->options->override_charset) {
      if (mdd->options->default_charset)
        mdd->mailcharset = strdup(mdd->options->default_charset);
      else {
        mdd->mailcharset = strdup("");
        mdd->autodetectCharset = true;
      }
    } else {
      char* contentType;
      contentType = MimeHeaders_get(headers, HEADER_CONTENT_TYPE, false, false);
      if (contentType) {
        mdd->mailcharset =
            MimeHeaders_get_parameter(contentType, "charset", NULL, NULL);
        PR_FREEIF(contentType);
      }
    }

    mdd->messageBody = new nsMsgAttachedFile;
    if (!mdd->messageBody) return MIME_OUT_OF_MEMORY;
    newAttachment = mdd->messageBody;
    creatingMsgBody = true;
  } else {
    /* always allocate one more extra; don't ask me why */
    newAttachment = new nsMsgAttachedFile;
    if (!newAttachment) return MIME_OUT_OF_MEMORY;
    mdd->attachments.AppendElement(newAttachment);
  }

  char* workURLSpec = nullptr;
  char* contLoc = nullptr;

  newAttachment->m_realName.Adopt(MimeHeaders_get_name(headers, mdd->options));
  contLoc = MimeHeaders_get(headers, HEADER_CONTENT_LOCATION, false, false);
  if (!contLoc)
    contLoc = MimeHeaders_get(headers, HEADER_CONTENT_BASE, false, false);

  if (!contLoc && !newAttachment->m_realName.IsEmpty())
    workURLSpec = ToNewCString(newAttachment->m_realName);
  if (contLoc && !workURLSpec) workURLSpec = strdup(contLoc);

  PR_FREEIF(contLoc);

  mdd->curAttachment = newAttachment;
  newAttachment->m_type.Adopt(
      MimeHeaders_get(headers, HEADER_CONTENT_TYPE, false, false));

  //
  // This is to handle the degenerated Apple Double attachment.
  //
  parm_value = MimeHeaders_get(headers, HEADER_CONTENT_TYPE, false, false);
  if (parm_value) {
    char* boundary = NULL;
    char* tmp_value = NULL;
    boundary = MimeHeaders_get_parameter(parm_value, "boundary", NULL, NULL);
    if (boundary) tmp_value = PR_smprintf("; boundary=\"%s\"", boundary);
    if (tmp_value) newAttachment->m_type = tmp_value;
    newAttachment->m_xMacType.Adopt(
        MimeHeaders_get_parameter(parm_value, "x-mac-type", NULL, NULL));
    newAttachment->m_xMacCreator.Adopt(
        MimeHeaders_get_parameter(parm_value, "x-mac-creator", NULL, NULL));
    PR_FREEIF(parm_value);
    PR_FREEIF(boundary);
    PR_FREEIF(tmp_value);
  }

  newAttachment->m_size = 0;
  newAttachment->m_encoding.Adopt(
      MimeHeaders_get(headers, HEADER_CONTENT_TRANSFER_ENCODING, false, false));
  newAttachment->m_description.Adopt(
      MimeHeaders_get(headers, HEADER_CONTENT_DESCRIPTION, false, false));
  //
  // If we came up empty for description or the orig URL, we should do something
  // about it.
  //
  if (newAttachment->m_description.IsEmpty() && workURLSpec)
    newAttachment->m_description = workURLSpec;

  PR_FREEIF(workURLSpec);  // resource leak otherwise

  newAttachment->m_cloudPartInfo.Adopt(
      MimeHeaders_get(headers, HEADER_X_MOZILLA_CLOUD_PART, false, false));

  nsCOMPtr<nsIFile> tmpFile = nullptr;
  {
    // Let's build a temp file with an extension based on the content-type:
    // nsmail.<extension>

    nsAutoCString newAttachName("nsmail");
    nsAutoCString fileExtension;
    // the content type may contain a charset. i.e. text/html; ISO-2022-JP...we
    // want to strip off the charset before we ask the mime service for a mime
    // info for this content type.
    nsAutoCString contentType(newAttachment->m_type);
    int32_t pos = contentType.FindChar(';');
    if (pos > 0) contentType.SetLength(pos);
    int32_t extLoc = newAttachment->m_realName.RFindChar('.');
    int32_t specLength = newAttachment->m_realName.Length();
    // @see nsExternalHelperAppService::GetTypeFromURI()
    if (extLoc != -1 && extLoc != specLength - 1 &&
        // nothing over 20 chars long can be sanely considered an
        // extension.... Dat dere would be just data.
        specLength - extLoc < 20) {
      fileExtension = Substring(newAttachment->m_realName, extLoc + 1);
    } else {
      nsCOMPtr<nsIMIMEService> mimeFinder(
          do_GetService(NS_MIMESERVICE_CONTRACTID));
      if (mimeFinder) {
        mimeFinder->GetPrimaryExtension(contentType, ""_ns, fileExtension);
      }
    }

    if (fileExtension.IsEmpty()) {
      newAttachName.AppendLiteral(".tmp");
    } else {
      newAttachName.Append('.');
      newAttachName.Append(fileExtension);
    }

    nsMsgCreateTempFile(newAttachName.get(), getter_AddRefs(tmpFile));
  }
  nsresult rv;

  // This needs to be done so the attachment structure has a handle
  // on the temp file for this attachment...
  if (tmpFile) {
    nsAutoCString fileURL;
    rv = NS_GetURLSpecFromFile(tmpFile, fileURL);
    if (NS_SUCCEEDED(rv))
      nsMimeNewURI(getter_AddRefs(newAttachment->m_origUrl), fileURL.get(),
                   nullptr);
  }

  if (!tmpFile) return MIME_OUT_OF_MEMORY;

  mdd->tmpFile = tmpFile;

  newAttachment->m_tmpFile = mdd->tmpFile;

  rv = MsgNewBufferedFileOutputStream(getter_AddRefs(mdd->tmpFileStream),
                                      tmpFile, PR_WRONLY | PR_CREATE_FILE,
                                      00600);
  if (NS_FAILED(rv)) return MIME_UNABLE_TO_OPEN_TMP_FILE;

  // For now, we are always going to decode all of the attachments
  // for the message. This way, we have native data
  if (creatingMsgBody) {
    MimeDecoderData* (*fn)(MimeConverterOutputCallback, MimeClosure) = 0;

    //
    // Initialize a decoder if necessary.
    //
    if (newAttachment->m_encoding.LowerCaseEqualsLiteral(ENCODING_BASE64))
      fn = &MimeB64DecoderInit;
    else if (newAttachment->m_encoding.LowerCaseEqualsLiteral(
                 ENCODING_QUOTED_PRINTABLE)) {
      mdd->decoder_data = MimeQPDecoderInit(
          dummy_file_write, MimeClosure(MimeClosure::isMimeDraftData, mdd));
      if (!mdd->decoder_data) return MIME_OUT_OF_MEMORY;
    } else if (newAttachment->m_encoding.LowerCaseEqualsLiteral(
                   ENCODING_UUENCODE) ||
               newAttachment->m_encoding.LowerCaseEqualsLiteral(
                   ENCODING_UUENCODE2) ||
               newAttachment->m_encoding.LowerCaseEqualsLiteral(
                   ENCODING_UUENCODE3) ||
               newAttachment->m_encoding.LowerCaseEqualsLiteral(
                   ENCODING_UUENCODE4))
      fn = &MimeUUDecoderInit;
    else if (newAttachment->m_encoding.LowerCaseEqualsLiteral(ENCODING_YENCODE))
      fn = &MimeYDecoderInit;

    if (fn) {
      mdd->decoder_data =
          fn(dummy_file_write, MimeClosure(MimeClosure::isMimeDraftData, mdd));
      if (!mdd->decoder_data) return MIME_OUT_OF_MEMORY;
    }
  }

  return 0;
}

int mime_decompose_file_output_fn(const char* buf, int32_t size,
                                  MimeClosure stream_closure) {
  NS_ASSERTION(stream_closure && buf, "missing mime draft data and/or buf");
  if (!stream_closure || !buf) return -1;

  mime_draft_data* mdd = stream_closure.AsMimeDraftData();
  if (!mdd) {
    return -1;
  }

  int ret = 0;

  if (!size) return 0;

  if (!mdd->tmpFileStream) return 0;

  if (mdd->autodetectCharset) {
    nsAutoCString detectedCharset;
    nsresult res = NS_OK;
    res = MIME_detect_charset(buf, size, detectedCharset);
    if (NS_SUCCEEDED(res) && !detectedCharset.IsEmpty()) {
      mdd->mailcharset = ToNewCString(detectedCharset);
      mdd->autodetectCharset = false;
    }
  }

  if (mdd->decoder_data) {
    int32_t outsize;
    ret = MimeDecoderWrite(mdd->decoder_data, buf, size, &outsize);
    if (ret == -1) return -1;
    mdd->curAttachment->m_size += outsize;
  } else {
    uint32_t bytesWritten;
    mdd->tmpFileStream->Write(buf, size, &bytesWritten);
    if ((int32_t)bytesWritten < size) return MIME_ERROR_WRITING_FILE;
    mdd->curAttachment->m_size += size;
  }

  return 0;
}

int mime_decompose_file_close_fn(MimeClosure stream_closure) {
  if (!stream_closure) return -1;

  mime_draft_data* mdd = stream_closure.AsMimeDraftData();
  if (!mdd) {
    return -1;
  }

  if (--mdd->options->decompose_init_count > 0) return 0;

  if (mdd->decoder_data) {
    MimeDecoderDestroy(mdd->decoder_data, false);
    mdd->decoder_data = 0;
  }

  if (!mdd->tmpFileStream) {
    // it's ok to have a null tmpFileStream if there's no tmpFile.
    // This happens for cloud file attachments.
    NS_ASSERTION(!mdd->tmpFile, "shouldn't have a tmp file bu no stream");
    return 0;
  }
  mdd->tmpFileStream->Close();

  mdd->tmpFileStream = nullptr;

  mdd->tmpFile = nullptr;

  return 0;
}

extern "C" void* mime_bridge_create_draft_stream(
    nsIMimeEmitter* newEmitter, nsStreamConverter* newPluginObj2, nsIURI* uri,
    nsMimeOutputType format_out) {
  int status = 0;
  nsMIMESession* stream = nullptr;
  mime_draft_data* mdd = nullptr;
  MimeObject* obj = nullptr;

  if (!uri) return nullptr;

  mdd = new mime_draft_data;
  if (!mdd) return nullptr;

  nsAutoCString turl;
  nsCOMPtr<nsIMsgMessageService> msgService;
  nsCOMPtr<nsIURI> aURL;
  nsAutoCString urlString;
  nsresult rv;

  // first, convert the rdf msg uri into a url that represents the message...
  if (NS_FAILED(uri->GetSpec(turl))) goto FAIL;

  rv = GetMessageServiceFromURI(turl, getter_AddRefs(msgService));
  if (NS_FAILED(rv)) goto FAIL;

  rv = msgService->GetUrlForUri(turl, nullptr, getter_AddRefs(aURL));
  if (NS_FAILED(rv)) goto FAIL;

  if (NS_SUCCEEDED(aURL->GetSpec(urlString))) {
    int32_t typeIndex = urlString.Find("&type=application/x-message-display");
    if (typeIndex != -1)
      urlString.Cut(typeIndex,
                    sizeof("&type=application/x-message-display") - 1);

    mdd->url_name = ToNewCString(urlString);
    if (!(mdd->url_name)) goto FAIL;
  }

  newPluginObj2->GetForwardInline(&mdd->forwardInline);
  newPluginObj2->GetForwardInlineFilter(&mdd->forwardInlineFilter);
  newPluginObj2->GetForwardToAddress(mdd->forwardToAddress);
  newPluginObj2->GetOverrideComposeFormat(&mdd->overrideComposeFormat);
  newPluginObj2->GetIdentity(getter_AddRefs(mdd->identity));
  newPluginObj2->GetOriginalMsgURI(mdd->originalMsgURI);
  newPluginObj2->GetOrigMsgHdr(getter_AddRefs(mdd->origMsgHdr));
  mdd->format_out = format_out;
  mdd->options = new MimeDisplayOptions;
  if (!mdd->options) goto FAIL;

  mdd->options->url = strdup(mdd->url_name);
  mdd->options->format_out = format_out;  // output format
  mdd->options->decompose_file_p = true;  /* new field in MimeDisplayOptions */
  mdd->options->stream_closure = MimeClosure(MimeClosure::isMimeDraftData, mdd);
  mdd->options->html_closure = MimeClosure(MimeClosure::isMimeDraftData, mdd);
  mdd->options->decompose_headers_info_fn = make_mime_headers_copy;
  mdd->options->decompose_file_init_fn = mime_decompose_file_init_fn;
  mdd->options->decompose_file_output_fn = mime_decompose_file_output_fn;
  mdd->options->decompose_file_close_fn = mime_decompose_file_close_fn;

  mdd->options->m_prefBranch = do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  if (NS_FAILED(rv)) goto FAIL;

#ifdef ENABLE_SMIME
  /* If we're attaching a message (for forwarding) then we must eradicate all
   traces of xlateion from it, since forwarding someone else a message
   that wasn't xlated for them doesn't work.  We have to dexlate it
   before sending it.
   */
  mdd->options->decrypt_p = true;
#endif /* ENABLE_SMIME */

  obj = mime_new((MimeObjectClass*)&mimeMessageClass, (MimeHeaders*)NULL,
                 MESSAGE_RFC822);
  if (!obj) goto FAIL;

  obj->options = mdd->options;
  mdd->obj = obj;

  stream = PR_NEWZAP(nsMIMESession);
  if (!stream) goto FAIL;

  stream->name = "MIME To Draft Converter Stream";
  stream->complete = mime_parse_stream_complete;
  stream->abort = mime_parse_stream_abort;
  stream->put_block = mime_parse_stream_write;
  stream->data_object = MimeClosure(MimeClosure::isMimeDraftData, mdd);

  status = obj->clazz->initialize(obj);
  if (status >= 0) status = obj->clazz->parse_begin(obj);
  if (status < 0) goto FAIL;

  return stream;

FAIL:
  if (mdd) {
    PR_Free(mdd->url_name);
    if (mdd->options) delete mdd->options;
    PR_Free(mdd);
  }
  PR_Free(stream);
  PR_Free(obj);

  return nullptr;
}
