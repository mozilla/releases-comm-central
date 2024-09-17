/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mimehdrs.h"
#include "mimeleaf.h"
#include "mimetext.h"
#include "nsMailHeaders.h"
#include "prlog.h"
#include "nsCOMPtr.h"
#include "modlmime.h"
#include "mimemsg.h"
#include "mimemsig.h"
#include "mimemapl.h"
#include "prprf.h"
#include "mimei.h" /* for moved MimeDisplayData struct */
#include "prmem.h"
#include "plstr.h"
#include "prmem.h"
#include "mimemoz2.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIStringBundle.h"
#include "nsString.h"
#include "nsMimeStringResources.h"
#include "nsStreamConverter.h"
#include "nsIMsgMailNewsUrl.h"
#include "mozITXTToHTMLConv.h"
#include "nsCExternalHandlerService.h"
#include "nsIMIMEService.h"
#include "nsMsgI18N.h"
#include "nsICharsetConverterManager.h"
#include "nsMimeTypes.h"
#include "nsIIOService.h"
#include "nsIURI.h"
#include "nsMsgUtils.h"
#include "nsIChannel.h"
#include "nsIMailChannel.h"
#include "mimeebod.h"
// <for functions="HTML2Plaintext,HTMLSantinize">
#include "nsXPCOM.h"
#include "nsIParserUtils.h"
// </for>
#include "mozilla/Components.h"
#include "mozilla/Unused.h"

void ValidateRealName(nsMsgAttachmentData* aAttach, MimeHeaders* aHdrs);

static MimeHeadersState MIME_HeaderType;
static bool MIME_WrapLongLines;
static bool MIME_VariableWidthPlaintext;

mime_stream_data::mime_stream_data()
    : url_name(nullptr),
      orig_url_name(nullptr),
      format_out(0),
      pluginObj2(nullptr),
      istream(nullptr),
      obj(nullptr),
      options(nullptr),
      headers(nullptr),
      output_emitter(nullptr) {}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Attachment handling routines
////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
MimeObject* mime_get_main_object(MimeObject* obj);

// Appends a "filename" parameter with the attachment name to the object url.
void AppendFilenameParameterToAttachmentDataUrl(
    const nsMsgAttachmentData* attachmentData, nsCString& url) {
  url.AppendLiteral("&filename=");
  nsAutoCString aResult;
  if (NS_SUCCEEDED(MsgEscapeString(attachmentData->m_realName,
                                   nsINetUtil::ESCAPE_XALPHAS, aResult))) {
    url.Append(aResult);
  } else {
    url.Append(attachmentData->m_realName);
  }
  if (attachmentData->m_realType.EqualsLiteral("message/rfc822") &&
      !StringEndsWith(url, ".eml"_ns, nsCaseInsensitiveCStringComparator)) {
    url.AppendLiteral(".eml");
  }
}

nsresult MimeGetSize(MimeObject* child, int32_t* size) {
  bool isLeaf = mime_subclass_p(child->clazz, (MimeObjectClass*)&mimeLeafClass);
  bool isContainer =
      mime_subclass_p(child->clazz, (MimeObjectClass*)&mimeContainerClass);
  bool isMsg =
      mime_subclass_p(child->clazz, (MimeObjectClass*)&mimeMessageClass);

  if (isLeaf) {
    *size += ((MimeLeaf*)child)->sizeSoFar;
  } else if (isMsg) {
    *size += ((MimeMessage*)child)->sizeSoFar;
  } else if (isContainer) {
    int i;
    MimeContainer* cont = (MimeContainer*)child;
    for (i = 0; i < cont->nchildren; ++i) {
      MimeGetSize(cont->children[i], size);
    }
  }
  return NS_OK;
}

nsresult ProcessBodyAsAttachment(MimeObject* obj, nsMsgAttachmentData** data) {
  nsMsgAttachmentData* tmp;
  char* disp = nullptr;
  char* charset = nullptr;

  // Ok, this is the special case when somebody sends an "attachment" as the
  // body of an RFC822 message...I really don't think this is the way this
  // should be done.  I believe this should really be a multipart/mixed message
  // with an empty body part, but what can ya do...our friends to the North seem
  // to do this.
  MimeObject* child = obj;

  *data = new nsMsgAttachmentData[2];
  if (!*data) return NS_ERROR_OUT_OF_MEMORY;

  tmp = *data;
  tmp->m_realType = child->content_type;
  tmp->m_realEncoding = child->encoding;
  disp =
      MimeHeaders_get(child->headers, HEADER_CONTENT_DISPOSITION, false, false);
  tmp->m_realName.Adopt(
      MimeHeaders_get_parameter(disp, "name", &charset, NULL));
  if (!tmp->m_realName.IsEmpty()) {
    char* fname = NULL;
    fname = mime_decode_filename(tmp->m_realName.get(), charset, obj->options);
    free(charset);
    if (fname) tmp->m_realName.Adopt(fname);
  } else {
    tmp->m_realName.Adopt(MimeHeaders_get_name(child->headers, obj->options));

    if (tmp->m_realName.IsEmpty() &&
        tmp->m_realType.LowerCaseEqualsLiteral(MESSAGE_RFC822)) {
      // We haven't actually parsed the message "attachment", so just give it a
      // generic name.
      tmp->m_realName = "AttachedMessage.eml";
    }
  }

  tmp->m_hasFilename = !tmp->m_realName.IsEmpty();

  if (tmp->m_realName.IsEmpty() &&
      StringBeginsWith(tmp->m_realType, "text"_ns,
                       nsCaseInsensitiveCStringComparator))
    ValidateRealName(tmp, child->headers);

  tmp->m_displayableInline =
      obj->clazz->displayable_inline_p(obj->clazz, obj->headers);

  char* tmpURL = nullptr;
  char* id = nullptr;
  char* id_imap = nullptr;

  id = mime_part_address(obj);
  if (obj->options->missing_parts) id_imap = mime_imap_part_address(obj);

  tmp->m_isDownloaded = !id_imap;

  if (!id) {
    delete[] *data;
    *data = nullptr;
    PR_FREEIF(id_imap);
    return NS_ERROR_OUT_OF_MEMORY;
  }

  if (obj->options && obj->options->url) {
    const char* url = obj->options->url;
    nsresult rv;
    if (id_imap && id) {
      // if this is an IMAP part.
      tmpURL = mime_set_url_imap_part(url, id_imap, id);
      rv = nsMimeNewURI(getter_AddRefs(tmp->m_url), tmpURL, nullptr);
    } else {
      // This is just a normal MIME part as usual.
      tmpURL = mime_set_url_part(url, id, true);
      nsCString urlString(tmpURL);
      if (!tmp->m_realName.IsEmpty()) {
        AppendFilenameParameterToAttachmentDataUrl(tmp, urlString);
      }
      rv = nsMimeNewURI(getter_AddRefs(tmp->m_url), urlString.get(), nullptr);
    }

    if (!tmp->m_url || NS_FAILED(rv)) {
      delete[] *data;
      *data = nullptr;
      PR_FREEIF(id);
      PR_FREEIF(id_imap);
      return NS_ERROR_OUT_OF_MEMORY;
    }
  }
  PR_FREEIF(id);
  PR_FREEIF(id_imap);
  PR_FREEIF(tmpURL);
  tmp->m_description.Adopt(MimeHeaders_get(
      child->headers, HEADER_CONTENT_DESCRIPTION, false, false));

  tmp->m_size = 0;
  MimeGetSize(child, &tmp->m_size);

  return NS_OK;
}

int32_t CountTotalMimeAttachments(MimeContainer* aObj) {
  int32_t i;
  int32_t rc = 0;

  if ((!aObj) || (!aObj->children) || (aObj->nchildren <= 0)) return 0;

  if (!mime_typep(((MimeObject*)aObj), (MimeObjectClass*)&mimeContainerClass))
    return 0;

  for (i = 0; i < aObj->nchildren; i++)
    rc += CountTotalMimeAttachments((MimeContainer*)aObj->children[i]) + 1;

  return rc;
}

void ValidateRealName(nsMsgAttachmentData* aAttach, MimeHeaders* aHdrs) {
  // Sanity.
  if (!aAttach) return;

  // Do we need to validate?
  if (!aAttach->m_realName.IsEmpty()) return;

  // Internal MIME structures need not be named!
  if (aAttach->m_realType.IsEmpty() ||
      StringBeginsWith(aAttach->m_realType, "multipart"_ns,
                       nsCaseInsensitiveCStringComparator))
    return;

  //
  // Now validate any other name we have for the attachment!
  //
  if (aAttach->m_realName.IsEmpty()) {
    aAttach->m_realName = "attachment";
    nsresult rv = NS_OK;
    nsAutoCString contentType(aAttach->m_realType);
    int32_t pos = contentType.FindChar(';');
    if (pos > 0) contentType.SetLength(pos);

    nsCOMPtr<nsIMIMEService> mimeFinder(
        do_GetService(NS_MIMESERVICE_CONTRACTID, &rv));
    if (NS_SUCCEEDED(rv)) {
      nsAutoCString fileExtension;
      rv = mimeFinder->GetPrimaryExtension(contentType, EmptyCString(),
                                           fileExtension);

      if (NS_SUCCEEDED(rv) && !fileExtension.IsEmpty()) {
        aAttach->m_realName.Append('.');
        aAttach->m_realName.Append(fileExtension);
      }
    }
  }
}

static int32_t attIndex = 0;

nsresult GenerateAttachmentData(MimeObject* object, const char* aMessageURL,
                                MimeDisplayOptions* options,
                                bool isAnAppleDoublePart, int32_t attSize,
                                nsMsgAttachmentData* aAttachData) {
  nsCString imappart;
  nsCString part;
  bool isExternalAttachment = false;

  /* be sure the object has not be marked as Not to be an attachment */
  if (object->dontShowAsAttachment) return NS_OK;

  part.Adopt(mime_part_address(object));
  if (part.IsEmpty()) return NS_ERROR_OUT_OF_MEMORY;

  if (options->missing_parts) imappart.Adopt(mime_imap_part_address(object));

  char* urlSpec = nullptr;
  if (!imappart.IsEmpty()) {
    urlSpec = mime_set_url_imap_part(aMessageURL, imappart.get(), part.get());
  } else {
    char* no_part_url = nullptr;
    if (options->part_to_load &&
        options->format_out == nsMimeOutput::nsMimeMessageBodyDisplay)
      no_part_url = mime_get_base_url(aMessageURL);
    if (no_part_url) {
      urlSpec = mime_set_url_part(no_part_url, part.get(), true);
      PR_Free(no_part_url);
    } else {
      // if the mime object contains an external attachment URL, then use it,
      // otherwise fall back to creating an attachment url based on the message
      // URI and the part number.
      urlSpec = mime_external_attachment_url(object);
      isExternalAttachment = urlSpec ? true : false;
      if (!urlSpec) urlSpec = mime_set_url_part(aMessageURL, part.get(), true);
    }
  }

  if (!urlSpec) return NS_ERROR_OUT_OF_MEMORY;

  if ((options->format_out == nsMimeOutput::nsMimeMessageBodyDisplay) &&
      (PL_strncasecmp(aMessageURL, urlSpec, strlen(urlSpec)) == 0))
    return NS_OK;

  nsCString urlString(urlSpec);

  nsMsgAttachmentData* tmp = &(aAttachData[attIndex++]);

  tmp->m_realType = object->content_type;
  tmp->m_realEncoding = object->encoding;
  tmp->m_isExternalAttachment = isExternalAttachment;
  tmp->m_isExternalLinkAttachment =
      (isExternalAttachment &&
       StringBeginsWith(urlString, "http"_ns,
                        nsCaseInsensitiveCStringComparator));
  tmp->m_size = attSize;
  tmp->m_sizeExternalStr = "-1";
  tmp->m_disposition.Adopt(MimeHeaders_get(
      object->headers, HEADER_CONTENT_DISPOSITION, true, false));
  tmp->m_displayableInline =
      object->clazz->displayable_inline_p(object->clazz, object->headers);

  char* part_addr = mime_imap_part_address(object);
  tmp->m_isDownloaded = !part_addr;
  PR_FREEIF(part_addr);

  int32_t i;
  char* charset = nullptr;
  char* disp = MimeHeaders_get(object->headers, HEADER_CONTENT_DISPOSITION,
                               false, false);
  if (disp) {
    tmp->m_realName.Adopt(
        MimeHeaders_get_parameter(disp, "filename", &charset, nullptr));
    if (isAnAppleDoublePart)
      for (i = 0; i < 2 && tmp->m_realName.IsEmpty(); i++) {
        PR_FREEIF(disp);
        free(charset);
        disp = MimeHeaders_get(((MimeContainer*)object)->children[i]->headers,
                               HEADER_CONTENT_DISPOSITION, false, false);
        tmp->m_realName.Adopt(
            MimeHeaders_get_parameter(disp, "filename", &charset, nullptr));
      }

    if (!tmp->m_realName.IsEmpty()) {
      // check encoded type
      //
      // The parameter of Content-Disposition must use RFC 2231.
      // But old Netscape 4.x and Outlook Express etc. use RFC2047.
      // So we should parse both types.

      char* fname = nullptr;
      fname = mime_decode_filename(tmp->m_realName.get(), charset, options);
      free(charset);

      if (fname) tmp->m_realName.Adopt(fname);
    }

    PR_FREEIF(disp);
  }

  disp = MimeHeaders_get(object->headers, HEADER_CONTENT_TYPE, false, false);
  if (disp) {
    tmp->m_xMacType.Adopt(
        MimeHeaders_get_parameter(disp, PARAM_X_MAC_TYPE, nullptr, nullptr));
    tmp->m_xMacCreator.Adopt(
        MimeHeaders_get_parameter(disp, PARAM_X_MAC_CREATOR, nullptr, nullptr));

    if (tmp->m_realName.IsEmpty()) {
      tmp->m_realName.Adopt(
          MimeHeaders_get_parameter(disp, "name", &charset, nullptr));
      if (isAnAppleDoublePart)
        // the data fork is the 2nd part, and we should ALWAYS look there first
        // for the file name
        for (i = 1; i >= 0 && tmp->m_realName.IsEmpty(); i--) {
          PR_FREEIF(disp);
          free(charset);
          disp = MimeHeaders_get(((MimeContainer*)object)->children[i]->headers,
                                 HEADER_CONTENT_TYPE, false, false);
          tmp->m_realName.Adopt(
              MimeHeaders_get_parameter(disp, "name", &charset, nullptr));
          tmp->m_realType.Adopt(
              MimeHeaders_get(((MimeContainer*)object)->children[i]->headers,
                              HEADER_CONTENT_TYPE, true, false));
        }

      if (!tmp->m_realName.IsEmpty()) {
        // check encoded type
        //
        // The parameter of Content-Disposition must use RFC 2231.
        // But old Netscape 4.x and Outlook Express etc. use RFC2047.
        // So we should parse both types.

        char* fname = nullptr;
        fname = mime_decode_filename(tmp->m_realName.get(), charset, options);
        free(charset);

        if (fname) tmp->m_realName.Adopt(fname);
      }
    }

    if (tmp->m_isExternalLinkAttachment) {
      // If an external link attachment part's Content-Type contains a
      // |size| parm, store it in m_sizeExternalStr. Let the msgHeaderSink
      // addAttachmentField() figure out if it's sane, and don't bother
      // strtol'ing it to an int only to emit it as a string.
      char* sizeStr = MimeHeaders_get_parameter(disp, "size", nullptr, nullptr);
      if (sizeStr) tmp->m_sizeExternalStr = sizeStr;
    }

    PR_FREEIF(disp);
  }

  tmp->m_description.Adopt(MimeHeaders_get(
      object->headers, HEADER_CONTENT_DESCRIPTION, false, false));

  // Now, do the right thing with the name!
  if (tmp->m_realName.IsEmpty() &&
      !(tmp->m_realType.LowerCaseEqualsLiteral(MESSAGE_RFC822))) {
    // Keep in mind that the name was provided by us and this is probably not a
    // real attachment.
    tmp->m_hasFilename = false;
    /* If this attachment doesn't have a name, just give it one... */
    tmp->m_realName.Adopt(MimeGetStringByID(MIME_MSG_DEFAULT_ATTACHMENT_NAME));
    if (!tmp->m_realName.IsEmpty()) {
      char* newName = PR_smprintf(tmp->m_realName.get(), part.get());
      if (newName) tmp->m_realName.Adopt(newName);
    } else
      tmp->m_realName.Adopt(mime_part_address(object));
  } else {
    tmp->m_hasFilename = true;
  }

  if (!tmp->m_realName.IsEmpty() && !tmp->m_isExternalAttachment) {
    AppendFilenameParameterToAttachmentDataUrl(tmp, urlString);
  } else if (tmp->m_isExternalAttachment) {
    // Allows the JS mime emitter to figure out the part information.
    urlString.AppendLiteral("?part=");
    urlString.Append(part);
  } else if (tmp->m_realType.LowerCaseEqualsLiteral(MESSAGE_RFC822)) {
    // Special case...if this is a enclosed RFC822 message, give it a nice
    // name.
    if (object->headers->munged_subject) {
      nsCString subject;
      subject.Assign(object->headers->munged_subject);
      MimeHeaders_convert_header_value(options, subject, false);
      tmp->m_realName.Assign(subject);
      tmp->m_realName.AppendLiteral(".eml");
    } else
      tmp->m_realName = "ForwardedMessage.eml";
  }

  nsresult rv =
      nsMimeNewURI(getter_AddRefs(tmp->m_url), urlString.get(), nullptr);

  PR_FREEIF(urlSpec);

  if (NS_FAILED(rv) || !tmp->m_url) return NS_ERROR_OUT_OF_MEMORY;

  ValidateRealName(tmp, object->headers);

  return NS_OK;
}

nsresult BuildAttachmentList(MimeObject* anObject,
                             nsMsgAttachmentData* aAttachData,
                             const char* aMessageURL) {
  nsresult rv;
  int32_t i;
  MimeContainer* cobj = (MimeContainer*)anObject;
  bool found_output = false;

  if ((!anObject) || (!cobj->children) || (!cobj->nchildren) ||
      (mime_typep(anObject, (MimeObjectClass*)&mimeExternalBodyClass)))
    return NS_OK;

  for (i = 0; i < cobj->nchildren; i++) {
    MimeObject* child = cobj->children[i];
    char* ct = child->content_type;

    // We're going to ignore the output_p attribute because we want to output
    // any part with a name to work around bug 674473

    // Skip the first child that's being output if it's in fact a message body.
    // Start by assuming that it is, until proven otherwise in the code below.
    bool skip = true;
    if (found_output)
      // not first child being output
      skip = false;
    else if (!ct)
      // no content type so can't be message body
      skip = false;
    else if (PL_strcasecmp(ct, TEXT_PLAIN) && PL_strcasecmp(ct, TEXT_HTML) &&
             PL_strcasecmp(ct, TEXT_MDL))
      // not a type we recognize as a message body
      skip = false;
    // we're displaying all body parts
    if (child->options->html_as_p == 4) skip = false;
    if (skip && child->headers) {
      // If it has a filename, we don't skip it regardless of the
      // content disposition which can be "inline" or "attachment".
      // Inline parts are not shown when attachments aren't displayed
      // inline, so the only chance to see the part is as attachment.
      char* name = MimeHeaders_get_name(child->headers, nullptr);
      if (name) skip = false;
      PR_FREEIF(name);
    }

    found_output = true;
    if (skip) continue;

    // We should generate an attachment for leaf object only but...
    bool isALeafObject =
        mime_subclass_p(child->clazz, (MimeObjectClass*)&mimeLeafClass);

    // ...we will generate an attachment for inline message too.
    bool isAnInlineMessage =
        mime_typep(child, (MimeObjectClass*)&mimeMessageClass);

    // AppleDouble part need special care: we need to fetch the part as well its
    // two children for the needed info as they could be anywhere, eventually,
    // they won't contain a name or file name. In any case we need to build only
    // one attachment data
    bool isAnAppleDoublePart =
        mime_typep(child, (MimeObjectClass*)&mimeMultipartAppleDoubleClass) &&
        ((MimeContainer*)child)->nchildren == 2;

    // The function below does not necessarily set the size to something (I
    // don't think it will work for external objects, for instance, since they
    // are neither containers nor leafs).
    int32_t attSize = 0;
    MimeGetSize(child, &attSize);

    if (isALeafObject || isAnInlineMessage || isAnAppleDoublePart) {
      rv = GenerateAttachmentData(child, aMessageURL, anObject->options,
                                  isAnAppleDoublePart, attSize, aAttachData);
      NS_ENSURE_SUCCESS(rv, rv);
    }

    // Now build the attachment list for the children of our object...
    if (!isALeafObject && !isAnAppleDoublePart) {
      rv = BuildAttachmentList((MimeObject*)child, aAttachData, aMessageURL);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }

  return NS_OK;
}

extern "C" nsresult MimeGetAttachmentList(MimeObject* tobj,
                                          const char* aMessageURL,
                                          nsMsgAttachmentData** data) {
  MimeObject* obj;
  MimeContainer* cobj;
  int32_t n;
  bool isAnInlineMessage;

  if (!data) return NS_ERROR_INVALID_ARG;
  *data = nullptr;

  obj = mime_get_main_object(tobj);
  if (!obj) return NS_OK;

  if (!mime_subclass_p(obj->clazz, (MimeObjectClass*)&mimeContainerClass))
    return ProcessBodyAsAttachment(obj, data);

  isAnInlineMessage = mime_typep(obj, (MimeObjectClass*)&mimeMessageClass);

  cobj = (MimeContainer*)obj;
  n = CountTotalMimeAttachments(cobj);
  if (n <= 0)
    // XXX n is a regular number here, not meaningful as an nsresult
    return static_cast<nsresult>(n);

  // in case of an inline message (as body), we need an extra slot for the
  // message itself that we will fill later...
  if (isAnInlineMessage) n++;

  *data = new nsMsgAttachmentData[n + 1];
  if (!*data) return NS_ERROR_OUT_OF_MEMORY;

  attIndex = 0;

  // Now, build the list!

  nsresult rv;

  if (isAnInlineMessage) {
    int32_t size = 0;
    MimeGetSize(obj, &size);
    rv = GenerateAttachmentData(obj, aMessageURL, obj->options, false, size,
                                *data);
    if (NS_FAILED(rv)) {
      delete[] *data;  // release data in case of error return.
      *data = nullptr;
      return rv;
    }
  }
  rv = BuildAttachmentList((MimeObject*)cobj, *data, aMessageURL);
  if (NS_FAILED(rv)) {
    delete[] *data;  // release data in case of error return.
    *data = nullptr;
  }
  return rv;
}

extern "C" void NotifyEmittersOfAttachmentList(MimeDisplayOptions* opt,
                                               nsMsgAttachmentData* data) {
  nsMsgAttachmentData* tmp = data;

  if (!tmp) return;

  while (tmp->m_url) {
    // The code below implements the following logic:
    // - Always display the attachment if the Content-Disposition is
    //   "attachment" or if it can't be displayed inline.
    // - If there's no name at all, just skip it (we don't know what to do with
    //   it then).
    // - If the attachment has a "provided name" (i.e. not something like "Part
    //   1.2"), display it.
    // - If we're asking for all body parts and NOT asking for metadata only,
    //   display it.
    // - Otherwise, skip it.
    if (!tmp->m_disposition.EqualsLiteral("attachment") &&
        tmp->m_displayableInline &&
        (tmp->m_realName.IsEmpty() ||
         (!tmp->m_hasFilename &&
          (opt->html_as_p != 4 || opt->metadata_only)))) {
      ++tmp;
      continue;
    }

    nsAutoCString spec;
    if (tmp->m_url) {
      if (tmp->m_isExternalLinkAttachment)
        mozilla::Unused << tmp->m_url->GetAsciiSpec(spec);
      else
        mozilla::Unused << tmp->m_url->GetSpec(spec);
    }

    nsAutoCString sizeStr;
    if (tmp->m_isExternalLinkAttachment)
      sizeStr.Append(tmp->m_sizeExternalStr);
    else
      sizeStr.AppendInt(tmp->m_size);

    nsAutoCString downloadedStr;
    downloadedStr.AppendInt(tmp->m_isDownloaded);

    mimeEmitterStartAttachment(opt, tmp->m_realName.get(),
                               tmp->m_realType.get(), spec.get(),
                               tmp->m_isExternalAttachment);
    mimeEmitterAddAttachmentField(opt, HEADER_X_MOZILLA_PART_URL, spec.get());
    mimeEmitterAddAttachmentField(opt, HEADER_X_MOZILLA_PART_SIZE,
                                  sizeStr.get());
    mimeEmitterAddAttachmentField(opt, HEADER_X_MOZILLA_PART_DOWNLOADED,
                                  downloadedStr.get());

    if ((opt->format_out == nsMimeOutput::nsMimeMessageQuoting) ||
        (opt->format_out == nsMimeOutput::nsMimeMessageBodyQuoting) ||
        (opt->format_out == nsMimeOutput::nsMimeMessageSaveAs) ||
        (opt->format_out == nsMimeOutput::nsMimeMessagePrintOutput)) {
      mimeEmitterAddAttachmentField(opt, HEADER_CONTENT_DESCRIPTION,
                                    tmp->m_description.get());
      mimeEmitterAddAttachmentField(opt, HEADER_CONTENT_TYPE,
                                    tmp->m_realType.get());
      mimeEmitterAddAttachmentField(opt, HEADER_CONTENT_ENCODING,
                                    tmp->m_realEncoding.get());
    }

    mimeEmitterEndAttachment(opt);
    ++tmp;
  }
  mimeEmitterEndAllAttachments(opt);
}

// Utility to create a nsIURI object...
extern "C" nsresult nsMimeNewURI(nsIURI** aInstancePtrResult, const char* aSpec,
                                 nsIURI* aBase) {
  if (nullptr == aInstancePtrResult) return NS_ERROR_NULL_POINTER;

  nsCOMPtr<nsIIOService> pService = mozilla::components::IO::Service();
  NS_ENSURE_TRUE(pService, NS_ERROR_FACTORY_NOT_REGISTERED);

  return pService->NewURI(nsDependentCString(aSpec), nullptr, aBase,
                          aInstancePtrResult);
}

extern "C" nsresult SetMailCharacterSetToMsgWindow(MimeObject* obj,
                                                   const char* aCharacterSet) {
  nsresult rv = NS_OK;

  if (obj && obj->options) {
    if (obj->options->stream_closure) {
      PR_ASSERT(
          obj->options->stream_closure.mType == MimeClosure::isMimeStreamData ||
          obj->options->stream_closure.mType == MimeClosure::isMimeDraftData);
      if (obj->options->stream_closure.mType != MimeClosure::isMimeStreamData) {
        return NS_ERROR_UNEXPECTED;
      }

      mime_stream_data* msd =
          (mime_stream_data*)(obj->options->stream_closure.mClosure);
      nsCOMPtr<nsIMailChannel> mailChannel = do_QueryInterface(msd->channel);
      if (mailChannel) {
        if (!PL_strcasecmp(aCharacterSet, "us-ascii")) {
          mailChannel->SetMailCharacterSet("ISO-8859-1"_ns);
        } else {
          mailChannel->SetMailCharacterSet(nsDependentCString(aCharacterSet));
        }
      }
    }
  }

  return rv;
}

static char* mime_file_type(const char* filename, MimeClosure stream_closure) {
  char* retType = nullptr;
  char* ext = nullptr;
  nsresult rv;

  ext = PL_strrchr(filename, '.');
  if (ext) {
    ext++;
    nsCOMPtr<nsIMIMEService> mimeFinder(
        do_GetService(NS_MIMESERVICE_CONTRACTID, &rv));
    if (mimeFinder) {
      nsAutoCString type;
      mimeFinder->GetTypeFromExtension(nsDependentCString(ext), type);
      retType = ToNewCString(type);
    }
  }

  return retType;
}

int ConvertToUTF8(const char* stringToUse, int32_t inLength,
                  const char* input_charset, nsACString& outString) {
  nsresult rv = NS_OK;

  // Look up Thunderbird's special aliases from charsetalias.properties.
  nsCOMPtr<nsICharsetConverterManager> ccm =
      do_GetService(NS_CHARSETCONVERTERMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, -1);

  nsCString newCharset;
  rv = ccm->GetCharsetAlias(input_charset, newCharset);
  NS_ENSURE_SUCCESS(rv, -1);

  if (newCharset.Equals("UTF-7", nsCaseInsensitiveCStringComparator)) {
    nsAutoString utf16;
    rv = CopyUTF7toUTF16(nsDependentCSubstring(stringToUse, inLength), utf16);
    if (NS_FAILED(rv)) return -1;
    CopyUTF16toUTF8(utf16, outString);
    return 0;
  }

  auto encoding = mozilla::Encoding::ForLabel(newCharset);
  NS_ENSURE_TRUE(encoding,
                 -1);  // Impossible since GetCharsetAlias() already checked.

  rv = encoding->DecodeWithoutBOMHandling(
      nsDependentCSubstring(stringToUse, inLength), outString);
  return NS_SUCCEEDED(rv) ? 0 : -1;
}

static int mime_convert_charset(const char* input_line, int32_t input_length,
                                const char* input_charset,
                                nsACString& convertedString,
                                MimeClosure stream_closure) {
  return ConvertToUTF8(input_line, input_length, input_charset,
                       convertedString);
}

static int mime_output_fn(const char* buf, int32_t size,
                          MimeClosure stream_closure) {
  uint32_t written = 0;
  PR_ASSERT(stream_closure.mType == MimeClosure::isMimeStreamData);
  if (stream_closure.mType != MimeClosure::isMimeStreamData) {
    return -1;
  }
  mime_stream_data* msd = (mime_stream_data*)stream_closure.mClosure;
  if ((!msd->pluginObj2) && (!msd->output_emitter)) return -1;

  // Fire pending start request
  ((nsStreamConverter*)msd->pluginObj2)->FirePendingStartRequest();

  // Now, write to the WriteBody method if this is a message body and not
  // a part retrevial
  if (!msd->options->part_to_load ||
      msd->options->format_out == nsMimeOutput::nsMimeMessageBodyDisplay) {
    if (msd->output_emitter) {
      msd->output_emitter->WriteBody(Substring(buf, buf + size), &written);
    }
  } else {
    if (msd->output_emitter) {
      msd->output_emitter->Write(Substring(buf, buf + size), &written);
    }
  }
  return written;
}

extern "C" int mime_display_stream_write(nsMIMESession* stream, const char* buf,
                                         int32_t size) {
  mime_stream_data* msd =
      (mime_stream_data*)((nsMIMESession*)stream)->data_object;

  MimeObject* obj = (msd ? msd->obj : 0);
  if (!obj) return -1;

  return obj->clazz->parse_buffer((char*)buf, size,
                                  MimeClosure(MimeClosure::isMimeObject, obj));
}

extern "C" void mime_display_stream_complete(nsMIMESession* stream) {
  mime_stream_data* msd =
      (mime_stream_data*)((nsMIMESession*)stream)->data_object;
  MimeObject* obj = (msd ? msd->obj : 0);
  if (obj) {
    int status;
    bool abortNow = false;

    if ((obj->options) && (obj->options->headers == MimeHeadersOnly))
      abortNow = true;

    status = obj->clazz->parse_eof(obj, abortNow);
    obj->clazz->parse_end(obj, (status < 0 ? true : false));

    //
    // Ok, now we are going to process the attachment data by getting all
    // of the attachment info and then driving the emitter with this data.
    //
    if (!msd->options->part_to_load ||
        msd->options->format_out == nsMimeOutput::nsMimeMessageBodyDisplay) {
      nsMsgAttachmentData* attachments;
      nsresult rv = MimeGetAttachmentList(obj, msd->url_name, &attachments);
      if (NS_SUCCEEDED(rv)) {
        NotifyEmittersOfAttachmentList(msd->options, attachments);
      }
      delete[] attachments;
    }

    // Release the conversion object - this has to be done after
    // we finish processing data.
    if (obj->options) {
      NS_IF_RELEASE(obj->options->conv);
    }

    // Destroy the object now.
    PR_ASSERT(msd->options == obj->options);
    mime_free(obj);
    obj = NULL;
    if (msd->options) {
      delete msd->options;
      msd->options = 0;
    }
  }

  if (msd->headers) MimeHeaders_free(msd->headers);

  if (msd->url_name) free(msd->url_name);

  if (msd->orig_url_name) free(msd->orig_url_name);

  delete msd;
}

extern "C" void mime_display_stream_abort(nsMIMESession* stream, int status) {
  mime_stream_data* msd =
      (mime_stream_data*)((nsMIMESession*)stream)->data_object;

  MimeObject* obj = (msd ? msd->obj : 0);
  if (obj) {
    if (!obj->closed_p) obj->clazz->parse_eof(obj, true);
    if (!obj->parsed_p) obj->clazz->parse_end(obj, true);

    // Destroy code....
    PR_ASSERT(msd->options == obj->options);
    mime_free(obj);
    if (msd->options) {
      delete msd->options;
      msd->options = 0;
    }
  }

  if (msd->headers) MimeHeaders_free(msd->headers);

  if (msd->url_name) free(msd->url_name);

  if (msd->orig_url_name) free(msd->orig_url_name);

  delete msd;
}

static int mime_output_init_fn(const char* type, const char* charset,
                               const char* name, const char* x_mac_type,
                               const char* x_mac_creator,
                               MimeClosure stream_closure) {
  PR_ASSERT(stream_closure.mType == MimeClosure::isMimeStreamData);
  if (stream_closure.mType != MimeClosure::isMimeStreamData) {
    return -1;
  }
  mime_stream_data* msd = (mime_stream_data*)stream_closure.mClosure;

  // Now, all of this stream creation is done outside of libmime, so this
  // is just a check of the pluginObj member and returning accordingly.
  if (!msd->pluginObj2)
    return -1;
  else
    return 0;
}

static void* mime_image_begin(const char* image_url, const char* content_type,
                              MimeClosure stream_closure);
static void mime_image_end(void* image_closure, int status);
static char* mime_image_make_image_html(void* image_data);
static int mime_image_write_buffer(const char* buf, int32_t size,
                                   void* image_closure);

/* Interface between libmime and inline display of images: the abomination
   that is known as "internal-external-reconnect".
 */
class mime_image_stream_data {
 public:
  mime_image_stream_data();

  mime_stream_data* msd;
  char* url;
  nsMIMESession* istream;
};

mime_image_stream_data::mime_image_stream_data() {
  url = nullptr;
  istream = nullptr;
  msd = nullptr;
}

static void* mime_image_begin(const char* image_url, const char* content_type,
                              MimeClosure stream_closure) {
  PR_ASSERT(stream_closure.mType == MimeClosure::isMimeStreamData);
  if (stream_closure.mType != MimeClosure::isMimeStreamData) {
    return nullptr;
  }
  mime_stream_data* msd = (mime_stream_data*)stream_closure.mClosure;
  class mime_image_stream_data* mid;

  mid = new mime_image_stream_data;
  if (!mid) return nullptr;

  mid->msd = msd;

  mid->url = (char*)strdup(image_url);
  if (!mid->url) {
    PR_Free(mid);
    return nullptr;
  }

  mid->istream = (nsMIMESession*)msd->pluginObj2;
  return mid;
}

static void mime_image_end(void* image_closure, int status) {
  mime_image_stream_data* mid = (mime_image_stream_data*)image_closure;

  PR_ASSERT(mid);
  if (!mid) return;

  PR_FREEIF(mid->url);
  delete mid;
}

static char* mime_image_make_image_html(void* image_closure) {
  mime_image_stream_data* mid = (mime_image_stream_data*)image_closure;

  PR_ASSERT(mid);
  if (!mid) return 0;

  /* Internal-external-reconnect only works when going to the screen. */
  if (!mid->istream)
    return strdup(
        "<DIV CLASS=\"moz-attached-image-container\"><IMG "
        "SRC=\"resource://gre-resources/loading-image.png\" "
        "ALT=\"[Image]\"></DIV>");

  const char* prefix;
  const char* url;
  char* buf;
  /* Wouldn't it be nice if attributes were case-sensitive? */
  const char* scaledPrefix =
      "<DIV CLASS=\"moz-attached-image-container\"><IMG "
      "CLASS=\"moz-attached-image\" shrinktofit=\"yes\" SRC=\"";
  const char* suffix = "\"></DIV>";
  // Thunderbird doesn't have this pref.
#ifdef MOZ_SUITE
  const char* unscaledPrefix =
      "<DIV CLASS=\"moz-attached-image-container\"><IMG "
      "CLASS=\"moz-attached-image\" SRC=\"";
  nsCOMPtr<nsIPrefBranch> prefBranch;
  nsCOMPtr<nsIPrefService> prefSvc(do_GetService(NS_PREFSERVICE_CONTRACTID));
  bool resize = true;

  if (prefSvc) prefSvc->GetBranch("", getter_AddRefs(prefBranch));
  if (prefBranch)
    prefBranch->GetBoolPref("mail.enable_automatic_image_resizing",
                            &resize);  // ignore return value
  prefix = resize ? scaledPrefix : unscaledPrefix;
#else
  prefix = scaledPrefix;
#endif

  if ((!mid->url) || (!(*mid->url)))
    url = "";
  else
    url = mid->url;

  uint32_t buflen = strlen(prefix) + strlen(suffix) + strlen(url) + 20;
  buf = (char*)PR_MALLOC(buflen);
  if (!buf) return 0;
  *buf = 0;

  PL_strcatn(buf, buflen, prefix);
  PL_strcatn(buf, buflen, url);
  PL_strcatn(buf, buflen, suffix);
  return buf;
}

static int mime_image_write_buffer(const char* buf, int32_t size,
                                   void* image_closure) {
  mime_image_stream_data* mid = (mime_image_stream_data*)image_closure;
  mime_stream_data* msd = mid->msd;

  if (((!msd->output_emitter)) && ((!msd->pluginObj2))) return -1;

  return size;
}

MimeObject* mime_get_main_object(MimeObject* obj) {
  MimeContainer* cobj;
  if (!(mime_subclass_p(obj->clazz, (MimeObjectClass*)&mimeMessageClass))) {
    return obj;
  }
  cobj = (MimeContainer*)obj;
  if (cobj->nchildren != 1) return obj;
  obj = cobj->children[0];
  while (obj) {
    if ((!mime_subclass_p(obj->clazz,
                          (MimeObjectClass*)&mimeMultipartSignedClass)) &&
        (PL_strcasecmp(obj->content_type, MULTIPART_SIGNED) != 0)) {
      return obj;
    } else {
      if (mime_subclass_p(obj->clazz, (MimeObjectClass*)&mimeContainerClass)) {
        // We don't care about a signed/smime object; Go inside to the
        // thing that we signed or smime'ed
        //
        cobj = (MimeContainer*)obj;
        if (cobj->nchildren > 0)
          obj = cobj->children[0];
        else
          obj = nullptr;
      } else {
        // we received a message with a child object that looks like a signed
        // object, but it is not a subclass of mimeContainer, so let's
        // return the given child object.
        return obj;
      }
    }
  }
  return nullptr;
}

static bool MimeObjectIsMessageBodyNoClimb(MimeObject* parent,
                                           MimeObject* looking_for,
                                           bool* stop) {
  MimeContainer* container = (MimeContainer*)parent;
  int32_t i;
  char* disp;

  NS_ASSERTION(stop, "NULL stop to MimeObjectIsMessageBodyNoClimb");

  for (i = 0; i < container->nchildren; i++) {
    MimeObject* child = container->children[i];
    bool is_body = true;

    // The body can't be something we're not displaying.
    if (!child->output_p)
      is_body = false;
    else if ((disp = MimeHeaders_get(child->headers, HEADER_CONTENT_DISPOSITION,
                                     true, false))) {
      PR_Free(disp);
      is_body = false;
    } else if (PL_strcasecmp(child->content_type, TEXT_PLAIN) &&
               PL_strcasecmp(child->content_type, TEXT_HTML) &&
               PL_strcasecmp(child->content_type, TEXT_MDL) &&
               PL_strcasecmp(child->content_type, MESSAGE_NEWS) &&
               PL_strcasecmp(child->content_type, MESSAGE_RFC822))
      is_body = false;

    if (is_body || child == looking_for) {
      *stop = true;
      return child == looking_for;
    }

    // The body could be down inside a multipart child, so search recursively.
    if (mime_subclass_p(child->clazz, (MimeObjectClass*)&mimeContainerClass)) {
      is_body = MimeObjectIsMessageBodyNoClimb(child, looking_for, stop);
      if (is_body || *stop) return is_body;
    }
  }
  return false;
}

/* Should this be static in mimemult.cpp? */
bool MimeObjectIsMessageBody(MimeObject* looking_for) {
  bool stop = false;
  MimeObject* root = looking_for;
  while (root->parent) root = root->parent;
  return MimeObjectIsMessageBodyNoClimb(root, looking_for, &stop);
}

//
// New Stream Converter Interface
//

// Get the connection to prefs service manager
nsIPrefBranch* GetPrefBranch(MimeDisplayOptions* opt) {
  if (!opt) return nullptr;

  return opt->m_prefBranch;
}

// Get the text converter...
mozITXTToHTMLConv* GetTextConverter(MimeDisplayOptions* opt) {
  if (!opt) return nullptr;

  return opt->conv;
}

MimeDisplayOptions::MimeDisplayOptions() {
  conv = nullptr;  // For text conversion...
  format_out = 0;  // The format out type
  url = nullptr;

  memset(&headers, 0, sizeof(headers));
  fancy_headers_p = false;

  output_vcard_buttons_p = false;

  variable_width_plaintext_p = false;
  wrap_long_lines_p = false;
  rot13_p = false;
  part_to_load = nullptr;

  no_output_p = false;
  write_html_p = false;

  decrypt_p = false;

  whattodo = 0;
  default_charset = nullptr;
  override_charset = false;
  force_user_charset = false;
  stream_closure = MimeClosure::zero();

  /* For setting up the display stream, so that the MIME parser can inform
   the caller of the type of the data it will be getting. */
  output_init_fn = nullptr;
  output_fn = nullptr;

  output_closure = MimeClosure::zero();

  charset_conversion_fn = nullptr;
  rfc1522_conversion_p = false;

  file_type_fn = nullptr;

  passwd_prompt_fn = nullptr;

  html_closure = nullptr;

  generate_header_html_fn = nullptr;
  generate_post_header_html_fn = nullptr;
  generate_footer_html_fn = nullptr;
  generate_reference_url_fn = nullptr;
  generate_mailto_url_fn = nullptr;
  generate_news_url_fn = nullptr;

  image_begin = nullptr;
  image_end = nullptr;
  image_write_buffer = nullptr;
  make_image_html = nullptr;
  state = nullptr;

#ifdef MIME_DRAFTS
  decompose_file_p = false;
  done_parsing_outer_headers = false;
  is_multipart_msg = false;
  decompose_init_count = 0;

  signed_p = false;
  caller_need_root_headers = false;
  decompose_headers_info_fn = nullptr;
  decompose_file_init_fn = nullptr;
  decompose_file_output_fn = nullptr;
  decompose_file_close_fn = nullptr;
#endif /* MIME_DRAFTS */

  attachment_icon_layer_id = 0;

  missing_parts = false;
  show_attachment_inline_p = false;
  show_attachment_inline_text = false;
  quote_attachment_inline_p = false;
  notify_nested_bodies = false;
  write_pure_bodies = false;
  metadata_only = false;
}

MimeDisplayOptions::~MimeDisplayOptions() {
  PR_FREEIF(part_to_load);
  PR_FREEIF(default_charset);
}
////////////////////////////////////////////////////////////////
// Bridge routines for new stream converter XP-COM interface
////////////////////////////////////////////////////////////////
extern "C" void* mime_bridge_create_display_stream(
    nsIMimeEmitter* newEmitter, nsStreamConverter* newPluginObj2, nsIURI* uri,
    nsMimeOutputType format_out, uint32_t whattodo, nsIChannel* aChannel) {
  int status = 0;
  MimeObject* obj;
  mime_stream_data* msd;
  nsMIMESession* stream = 0;

  if (!uri) return nullptr;

  msd = new mime_stream_data;
  if (!msd) return NULL;

  // Assign the new mime emitter - will handle output operations
  msd->output_emitter = newEmitter;

  // Store the URL string for this decode operation
  nsAutoCString urlString;
  nsresult rv;

  // Keep a hold of the channel...
  msd->channel = aChannel;
  rv = uri->GetSpec(urlString);
  if (NS_SUCCEEDED(rv)) {
    if (!urlString.IsEmpty()) {
      msd->url_name = ToNewCString(urlString);
      if (!(msd->url_name)) {
        delete msd;
        return NULL;
      }
      nsCOMPtr<nsIMsgMessageUrl> msgUrl = do_QueryInterface(uri);
      if (msgUrl) {
        nsAutoCString orgSpec;
        msgUrl->GetOriginalSpec(orgSpec);
        msd->orig_url_name = ToNewCString(orgSpec);
      }
    }
  }

  msd->format_out = format_out;     // output format
  msd->pluginObj2 = newPluginObj2;  // the plugin object pointer

  msd->options = new MimeDisplayOptions;
  if (!msd->options) {
    delete msd;
    return 0;
  }
  //  memset(msd->options, 0, sizeof(*msd->options));
  msd->options->format_out = format_out;  // output format

  msd->options->m_prefBranch = do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  if (NS_FAILED(rv)) {
    delete msd;
    return nullptr;
  }

  // Need the text converter...
  rv = CallCreateInstance(MOZ_TXTTOHTMLCONV_CONTRACTID, &(msd->options->conv));
  if (NS_FAILED(rv)) {
    msd->options->m_prefBranch = nullptr;
    delete msd;
    return nullptr;
  }

  //
  // Set the defaults, based on the context, and the output-type.
  //
  MIME_HeaderType = MimeHeadersAll;
  msd->options->write_html_p = true;
  switch (format_out) {
    case nsMimeOutput::nsMimeMessageHeaderDisplay:  // the split header/body
                                                    // display
    case nsMimeOutput::nsMimeMessageBodyDisplay:    // the split header/body
                                                    // display
      msd->options->fancy_headers_p = true;
      msd->options->output_vcard_buttons_p = true;
      break;

    case nsMimeOutput::nsMimeMessageSaveAs:   // Save As operations
    case nsMimeOutput::nsMimeMessageQuoting:  // all HTML quoted/printed output
    case nsMimeOutput::nsMimeMessagePrintOutput:
      msd->options->fancy_headers_p = true;
      break;

    case nsMimeOutput::nsMimeMessageBodyQuoting:  // only HTML body quoted
                                                  // output
      MIME_HeaderType = MimeHeadersNone;
      break;

    case nsMimeOutput::nsMimeMessageAttach:  // handling attachment storage
      msd->options->write_html_p = false;
      break;
    case nsMimeOutput::nsMimeMessageRaw:  // the raw RFC822 data (view source)
                                          // and attachments
    case nsMimeOutput::nsMimeMessageDraftOrTemplate:  // Loading drafts &
                                                      // templates
    case nsMimeOutput::nsMimeMessageEditorTemplate:   // Loading templates into
                                                      // editor
    case nsMimeOutput::nsMimeMessageFilterSniffer:  // generating an output that
                                                    // can be scan by a message
                                                    // filter
      break;

    case nsMimeOutput::nsMimeMessageDecrypt:
      msd->options->decrypt_p = true;
      msd->options->write_html_p = false;
      break;
  }

  ////////////////////////////////////////////////////////////
  // Now, get the libmime prefs...
  ////////////////////////////////////////////////////////////

  MIME_WrapLongLines = true;
  MIME_VariableWidthPlaintext = true;
  msd->options->force_user_charset = false;

  if (msd->options->m_prefBranch) {
    msd->options->m_prefBranch->GetBoolPref("mail.wrap_long_lines",
                                            &MIME_WrapLongLines);
    msd->options->m_prefBranch->GetBoolPref("mail.fixed_width_messages",
                                            &MIME_VariableWidthPlaintext);
    //
    // Charset overrides takes place here
    //
    // We have a bool pref (mail.force_user_charset) to deal with attachments.
    // 1) If true - libmime does NO conversion and just passes it through to
    //    raptor
    // 2) If false, then we try to use the charset of the part and if not
    //    available, the charset of the root message
    //
    msd->options->m_prefBranch->GetBoolPref(
        "mail.force_user_charset", &(msd->options->force_user_charset));
    msd->options->m_prefBranch->GetBoolPref(
        "mail.inline_attachments", &(msd->options->show_attachment_inline_p));
    msd->options->m_prefBranch->GetBoolPref(
        "mail.inline_attachments.text",
        &(msd->options->show_attachment_inline_text));
    msd->options->m_prefBranch->GetBoolPref(
        "mail.reply_quote_inline", &(msd->options->quote_attachment_inline_p));
    msd->options->m_prefBranch->GetIntPref("mailnews.display.html_as",
                                           &(msd->options->html_as_p));
  }
  /* This pref is written down in with the
     opposite sense of what we like to use... */
  MIME_VariableWidthPlaintext = !MIME_VariableWidthPlaintext;

  msd->options->wrap_long_lines_p = MIME_WrapLongLines;
  msd->options->headers = MIME_HeaderType;

  // We need to have the URL to be able to support the various
  // arguments
  status = mime_parse_url_options(msd->url_name, msd->options);
  if (status < 0) {
    PR_FREEIF(msd->options->part_to_load);
    PR_Free(msd->options);
    delete msd;
    return 0;
  }

  if (msd->options->headers == MimeHeadersMicro &&
      (msd->url_name == NULL || (strncmp(msd->url_name, "news:", 5) != 0 &&
                                 strncmp(msd->url_name, "snews:", 6) != 0)))
    msd->options->headers = MimeHeadersMicroPlus;

  msd->options->url = msd->url_name;
  msd->options->output_init_fn = mime_output_init_fn;

  msd->options->output_fn = mime_output_fn;

  msd->options->whattodo = whattodo;
  msd->options->charset_conversion_fn = mime_convert_charset;
  msd->options->rfc1522_conversion_p = true;
  msd->options->file_type_fn = mime_file_type;
  msd->options->stream_closure =
      MimeClosure(MimeClosure::isMimeStreamData, msd);
  msd->options->passwd_prompt_fn = 0;

  msd->options->image_begin = mime_image_begin;
  msd->options->image_end = mime_image_end;
  msd->options->make_image_html = mime_image_make_image_html;
  msd->options->image_write_buffer = mime_image_write_buffer;

  msd->options->variable_width_plaintext_p = MIME_VariableWidthPlaintext;

  // If this is a part, then we should emit the HTML to render the data
  // (i.e. embedded images)
  if (msd->options->part_to_load &&
      msd->options->format_out != nsMimeOutput::nsMimeMessageBodyDisplay)
    msd->options->write_html_p = false;

  obj = mime_new((MimeObjectClass*)&mimeMessageClass, (MimeHeaders*)NULL,
                 MESSAGE_RFC822);
  if (!obj) {
    delete msd->options;
    delete msd;
    return 0;
  }

  obj->options = msd->options;
  msd->obj = obj;

  /* Both of these better not be true at the same time. */
  PR_ASSERT(!(obj->options->decrypt_p && obj->options->write_html_p));

  stream = PR_NEW(nsMIMESession);
  if (!stream) {
    delete msd->options;
    delete msd;
    PR_Free(obj);
    return 0;
  }

  memset(stream, 0, sizeof(*stream));
  stream->name = "MIME Conversion Stream";
  stream->complete = mime_display_stream_complete;
  stream->abort = mime_display_stream_abort;
  stream->put_block = mime_display_stream_write;
  stream->data_object = msd;

  status = obj->clazz->initialize(obj);
  if (status >= 0) status = obj->clazz->parse_begin(obj);
  if (status < 0) {
    PR_Free(stream);
    delete msd->options;
    delete msd;
    PR_Free(obj);
    return 0;
  }

  return stream;
}

//
// Emitter Wrapper Routines!
//
nsIMimeEmitter* GetMimeEmitter(MimeDisplayOptions* opt) {
  if (!opt->stream_closure) return NULL;

  PR_ASSERT(opt->stream_closure.mType == MimeClosure::isMimeStreamData);
  if (opt->stream_closure.mType != MimeClosure::isMimeStreamData) {
    return nullptr;
  }
  mime_stream_data* msd = (mime_stream_data*)opt->stream_closure.mClosure;

  nsIMimeEmitter* ptr = (nsIMimeEmitter*)(msd->output_emitter);
  return ptr;
}

mime_stream_data* GetMSD(MimeDisplayOptions* opt) {
  if (!opt) return nullptr;
  PR_ASSERT(opt->stream_closure.mType == MimeClosure::isMimeStreamData);
  if (opt->stream_closure.mType != MimeClosure::isMimeStreamData) {
    return nullptr;
  }
  mime_stream_data* msd = (mime_stream_data*)opt->stream_closure.mClosure;
  return msd;
}

bool NoEmitterProcessing(nsMimeOutputType format_out) {
  if (format_out == nsMimeOutput::nsMimeMessageDraftOrTemplate ||
      format_out == nsMimeOutput::nsMimeMessageEditorTemplate ||
      format_out == nsMimeOutput::nsMimeMessageQuoting ||
      format_out == nsMimeOutput::nsMimeMessageBodyQuoting)
    return true;
  else
    return false;
}

extern "C" nsresult mimeEmitterAddAttachmentField(MimeDisplayOptions* opt,
                                                  const char* field,
                                                  const char* value) {
  // Check for draft processing...
  if (NoEmitterProcessing(opt->format_out)) return NS_OK;

  mime_stream_data* msd = GetMSD(opt);
  if (!msd) return NS_ERROR_FAILURE;

  if (msd->output_emitter) {
    nsIMimeEmitter* emitter = (nsIMimeEmitter*)msd->output_emitter;
    return emitter->AddAttachmentField(field, value);
  }

  return NS_ERROR_FAILURE;
}

extern "C" nsresult mimeEmitterAddHeaderField(MimeDisplayOptions* opt,
                                              const char* field,
                                              const char* value) {
  // Check for draft processing...
  if (NoEmitterProcessing(opt->format_out)) return NS_OK;

  mime_stream_data* msd = GetMSD(opt);
  if (!msd) return NS_ERROR_FAILURE;

  if (msd->output_emitter) {
    nsIMimeEmitter* emitter = (nsIMimeEmitter*)msd->output_emitter;
    return emitter->AddHeaderField(field, value);
  }

  return NS_ERROR_FAILURE;
}

extern "C" nsresult mimeEmitterAddAllHeaders(MimeDisplayOptions* opt,
                                             const char* allheaders,
                                             const int32_t allheadersize) {
  // Check for draft processing...
  if (NoEmitterProcessing(opt->format_out)) return NS_OK;

  mime_stream_data* msd = GetMSD(opt);
  if (!msd) return NS_ERROR_FAILURE;

  if (msd->output_emitter) {
    nsIMimeEmitter* emitter = (nsIMimeEmitter*)msd->output_emitter;
    return emitter->AddAllHeaders(
        Substring(allheaders, allheaders + allheadersize));
  }

  return NS_ERROR_FAILURE;
}

extern "C" nsresult mimeEmitterStartAttachment(MimeDisplayOptions* opt,
                                               const char* name,
                                               const char* contentType,
                                               const char* url,
                                               bool aIsExternalAttachment) {
  // Check for draft processing...
  if (NoEmitterProcessing(opt->format_out)) return NS_OK;

  mime_stream_data* msd = GetMSD(opt);
  if (!msd) return NS_ERROR_FAILURE;

  if (msd->output_emitter) {
    nsIMimeEmitter* emitter = (nsIMimeEmitter*)msd->output_emitter;
    return emitter->StartAttachment(nsDependentCString(name), contentType, url,
                                    aIsExternalAttachment);
  }

  return NS_ERROR_FAILURE;
}

extern "C" nsresult mimeEmitterEndAttachment(MimeDisplayOptions* opt) {
  // Check for draft processing...
  if (NoEmitterProcessing(opt->format_out)) return NS_OK;

  mime_stream_data* msd = GetMSD(opt);
  if (!msd) return NS_ERROR_FAILURE;

  if (msd->output_emitter) {
    nsIMimeEmitter* emitter = (nsIMimeEmitter*)msd->output_emitter;
    if (emitter)
      return emitter->EndAttachment();
    else
      return NS_OK;
  }

  return NS_ERROR_FAILURE;
}

extern "C" nsresult mimeEmitterEndAllAttachments(MimeDisplayOptions* opt) {
  // Check for draft processing...
  if (NoEmitterProcessing(opt->format_out)) return NS_OK;

  mime_stream_data* msd = GetMSD(opt);
  if (!msd) return NS_ERROR_FAILURE;

  if (msd->output_emitter) {
    nsIMimeEmitter* emitter = (nsIMimeEmitter*)msd->output_emitter;
    if (emitter)
      return emitter->EndAllAttachments();
    else
      return NS_OK;
  }

  return NS_ERROR_FAILURE;
}

extern "C" nsresult mimeEmitterStartBody(MimeDisplayOptions* opt, bool bodyOnly,
                                         const char* msgID,
                                         const char* outCharset) {
  // Check for draft processing...
  if (NoEmitterProcessing(opt->format_out)) return NS_OK;

  mime_stream_data* msd = GetMSD(opt);
  if (!msd) return NS_ERROR_FAILURE;

  if (msd->output_emitter) {
    nsIMimeEmitter* emitter = (nsIMimeEmitter*)msd->output_emitter;
    return emitter->StartBody(bodyOnly, msgID, outCharset);
  }

  return NS_ERROR_FAILURE;
}

extern "C" nsresult mimeEmitterEndBody(MimeDisplayOptions* opt) {
  // Check for draft processing...
  if (NoEmitterProcessing(opt->format_out)) return NS_OK;

  mime_stream_data* msd = GetMSD(opt);
  if (!msd) return NS_ERROR_FAILURE;

  if (msd->output_emitter) {
    nsIMimeEmitter* emitter = (nsIMimeEmitter*)msd->output_emitter;
    return emitter->EndBody();
  }

  return NS_ERROR_FAILURE;
}

extern "C" nsresult mimeEmitterEndHeader(MimeDisplayOptions* opt,
                                         MimeObject* obj) {
  // Check for draft processing...
  if (NoEmitterProcessing(opt->format_out)) return NS_OK;

  mime_stream_data* msd = GetMSD(opt);
  if (!msd) return NS_ERROR_FAILURE;

  if (msd->output_emitter) {
    nsIMimeEmitter* emitter = (nsIMimeEmitter*)msd->output_emitter;

    nsCString name;
    if (msd->format_out == nsMimeOutput::nsMimeMessageHeaderDisplay ||
        msd->format_out == nsMimeOutput::nsMimeMessageBodyDisplay ||
        msd->format_out == nsMimeOutput::nsMimeMessageSaveAs ||
        msd->format_out == nsMimeOutput::nsMimeMessagePrintOutput) {
      if (obj->headers) {
        nsMsgAttachmentData attachment;
        attIndex = 0;
        nsresult rv = GenerateAttachmentData(obj, msd->url_name, opt, false, 0,
                                             &attachment);

        if (NS_SUCCEEDED(rv)) name.Assign(attachment.m_realName);
      }
    }

    MimeHeaders_convert_header_value(opt, name, false);
    return emitter->EndHeader(name);
  }

  return NS_ERROR_FAILURE;
}

extern "C" nsresult mimeEmitterUpdateCharacterSet(MimeDisplayOptions* opt,
                                                  const char* aCharset) {
  // Check for draft processing...
  if (NoEmitterProcessing(opt->format_out)) return NS_OK;

  mime_stream_data* msd = GetMSD(opt);
  if (!msd) return NS_ERROR_FAILURE;

  if (msd->output_emitter) {
    nsIMimeEmitter* emitter = (nsIMimeEmitter*)msd->output_emitter;
    return emitter->UpdateCharacterSet(aCharset);
  }

  return NS_ERROR_FAILURE;
}

extern "C" nsresult mimeEmitterStartHeader(MimeDisplayOptions* opt,
                                           bool rootMailHeader, bool headerOnly,
                                           const char* msgID,
                                           const char* outCharset) {
  // Check for draft processing...
  if (NoEmitterProcessing(opt->format_out)) return NS_OK;

  mime_stream_data* msd = GetMSD(opt);
  if (!msd) return NS_ERROR_FAILURE;

  if (msd->output_emitter) {
    nsIMimeEmitter* emitter = (nsIMimeEmitter*)msd->output_emitter;
    return emitter->StartHeader(rootMailHeader, headerOnly, msgID, outCharset);
  }

  return NS_ERROR_FAILURE;
}

extern "C" nsresult mimeSetNewURL(nsMIMESession* stream, char* url) {
  if ((!stream) || (!url) || (!*url)) return NS_ERROR_FAILURE;

  mime_stream_data* msd = (mime_stream_data*)stream->data_object;
  if (!msd) return NS_ERROR_FAILURE;

  char* tmpPtr = strdup(url);
  if (!tmpPtr) return NS_ERROR_OUT_OF_MEMORY;

  PR_FREEIF(msd->url_name);
  msd->url_name = tmpPtr;
  return NS_OK;
}

#define MIME_URL "chrome://messenger/locale/mime.properties"

extern "C" char* MimeGetStringByID(int32_t stringID) {
  nsCOMPtr<nsIStringBundleService> stringBundleService =
      mozilla::components::StringBundle::Service();

  nsCOMPtr<nsIStringBundle> stringBundle;
  stringBundleService->CreateBundle(MIME_URL, getter_AddRefs(stringBundle));
  if (stringBundle) {
    nsString v;
    if (NS_SUCCEEDED(stringBundle->GetStringFromID(stringID, v)))
      return ToNewUTF8String(v);
  }

  return strdup("???");
}

extern "C" char* MimeGetStringByName(const char16_t* stringName) {
  nsCOMPtr<nsIStringBundleService> stringBundleService =
      do_GetService(NS_STRINGBUNDLE_CONTRACTID);

  nsCOMPtr<nsIStringBundle> stringBundle;
  stringBundleService->CreateBundle(MIME_URL, getter_AddRefs(stringBundle));
  if (stringBundle) {
    nsString v;
    if (NS_SUCCEEDED(stringBundle->GetStringFromName(
            NS_ConvertUTF16toUTF8(stringName).get(), v)))
      return ToNewUTF8String(v);
  }

  return strdup("???");
}

void ResetChannelCharset(MimeObject* obj) {
  if (obj->options && obj->options->stream_closure &&
      obj->options->default_charset && obj->headers &&
      obj->options->stream_closure) {
    PR_ASSERT(obj->options->stream_closure.mType ==
              MimeClosure::isMimeStreamData);
    if (obj->options->stream_closure.mType != MimeClosure::isMimeStreamData) {
      return;
    }
    mime_stream_data* msd =
        (mime_stream_data*)(obj->options->stream_closure.mClosure);
    char* ct = MimeHeaders_get(obj->headers, HEADER_CONTENT_TYPE, false, false);
    if (ct && msd->channel) {
      char* cSet = MimeHeaders_get_parameter(ct, "charset", nullptr, nullptr);
      if (cSet) {
        // The content-type does specify a charset. First, setup the channel.
        msd->channel->SetContentType(nsDependentCString(ct));

        // Second, if this is a Save As operation, then we need to convert
        // to override the output charset.
        if (msd->format_out == nsMimeOutput::nsMimeMessageSaveAs) {
          // The previous version of this code would have entered an infinite
          // loop. But it never showed up, so it's not clear that we ever get
          // here...  See bug #1597891.
          PR_FREEIF(obj->options->default_charset);
          obj->options->default_charset = cSet;
          cSet = nullptr;  // Ownership was transferred.
          obj->options->override_charset = true;
          MOZ_DIAGNOSTIC_ASSERT(
              false, "Ahh. So this code _is_ run after all! (see bug 1597891)");
        }
        PR_FREEIF(cSet);
      }
    }
    PR_FREEIF(ct);
  }
}

////////////////////////////////////////////////////////////
// Function to get up mail/news fontlang
////////////////////////////////////////////////////////////

nsresult GetMailNewsFont(MimeObject* obj, bool styleFixed,
                         int32_t* fontPixelSize, int32_t* fontSizePercentage,
                         nsCString& fontLang) {
  nsresult rv = NS_OK;

  nsIPrefBranch* prefBranch = GetPrefBranch(obj->options);
  if (prefBranch) {
    MimeInlineText* text = (MimeInlineText*)obj;
    nsAutoCString charset;

    // get a charset
    if (!text->initializeCharset)
      ((MimeInlineTextClass*)&mimeInlineTextClass)->initialize_charset(obj);

    if (!text->charset || !(*text->charset))
      charset.AssignLiteral("us-ascii");
    else
      charset.Assign(text->charset);

    nsCOMPtr<nsICharsetConverterManager> charSetConverterManager2;
    nsAutoCString prefStr;

    ToLowerCase(charset);

    charSetConverterManager2 =
        do_GetService(NS_CHARSETCONVERTERMANAGER_CONTRACTID, &rv);
    if (NS_FAILED(rv)) return rv;

    // get a language, e.g. x-western, ja
    rv = charSetConverterManager2->GetCharsetLangGroup(charset.get(), fontLang);
    if (NS_FAILED(rv)) return rv;

    // get a font size from pref
    prefStr.Assign(!styleFixed ? "font.size.variable."
                               : "font.size.monospace.");
    prefStr.Append(fontLang);
    rv = prefBranch->GetIntPref(prefStr.get(), fontPixelSize);
    if (NS_FAILED(rv)) return rv;

    nsCOMPtr<nsIPrefBranch> prefDefBranch;
    nsCOMPtr<nsIPrefService> prefSvc(
        do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
    if (prefSvc)
      rv = prefSvc->GetDefaultBranch("", getter_AddRefs(prefDefBranch));

    if (!prefDefBranch) return rv;

    // get original font size
    int32_t originalSize;
    rv = prefDefBranch->GetIntPref(prefStr.get(), &originalSize);
    if (NS_FAILED(rv)) return rv;

    // calculate percentage
    *fontSizePercentage =
        originalSize
            ? (int32_t)((float)*fontPixelSize / (float)originalSize * 100)
            : 0;
  }

  return NS_OK;
}

/**
 * This function synchronously converts an HTML document (as string)
 * to plaintext (as string) using the Gecko converter.
 *
 * @param flags see nsIDocumentEncoder.h
 */
nsresult HTML2Plaintext(const nsString& inString, nsString& outString,
                        uint32_t flags, uint32_t wrapCol) {
  nsCOMPtr<nsIParserUtils> utils = do_GetService(NS_PARSERUTILS_CONTRACTID);
  return utils->ConvertToPlainText(inString, flags, wrapCol, outString);
}

/**
 * This function synchronously sanitizes an HTML document (string->string)
 * using the Gecko nsTreeSanitizer.
 */
nsresult HTMLSanitize(const nsString& inString, nsString& outString) {
  // If you want to add alternative sanitization, you can insert a conditional
  // call to another sanitizer and an early return here.

  uint32_t flags = nsIParserUtils::SanitizerCidEmbedsOnly |
                   nsIParserUtils::SanitizerDropForms;

  nsCOMPtr<nsIPrefBranch> prefs(do_GetService(NS_PREFSERVICE_CONTRACTID));

  bool dropPresentational = true;
  bool dropMedia = false;
  prefs->GetBoolPref(
      "mailnews.display.html_sanitizer.drop_non_css_presentation",
      &dropPresentational);
  prefs->GetBoolPref("mailnews.display.html_sanitizer.drop_media", &dropMedia);
  if (dropPresentational)
    flags |= nsIParserUtils::SanitizerDropNonCSSPresentation;
  if (dropMedia) flags |= nsIParserUtils::SanitizerDropMedia;

  nsCOMPtr<nsIParserUtils> utils = do_GetService(NS_PARSERUTILS_CONTRACTID);
  return utils->Sanitize(inString, flags, outString);
}
