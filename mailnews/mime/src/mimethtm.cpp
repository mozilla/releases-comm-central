/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "mimethtm.h"
#include "prmem.h"
#include "plstr.h"
#include "prlog.h"
#include "prprf.h"
#include "msgCore.h"
#include "nsMimeStringResources.h"
#include "mimemoz2.h"
#include <ctype.h>

#define MIME_SUPERCLASS mimeInlineTextClass
MimeDefClass(MimeInlineTextHTML, MimeInlineTextHTMLClass,
             mimeInlineTextHTMLClass, &MIME_SUPERCLASS);

static int MimeInlineTextHTML_parse_line(const char*, int32_t, MimeObject*);
static int MimeInlineTextHTML_parse_eof(MimeObject*, bool);
static int MimeInlineTextHTML_parse_begin(MimeObject* obj);

static int MimeInlineTextHTMLClassInitialize(MimeObjectClass* oclass) {
  PR_ASSERT(!oclass->class_initialized);
  oclass->parse_begin = MimeInlineTextHTML_parse_begin;
  oclass->parse_line = MimeInlineTextHTML_parse_line;
  oclass->parse_eof = MimeInlineTextHTML_parse_eof;

  return 0;
}

static int MimeInlineTextHTML_parse_begin(MimeObject* obj) {
  int status = ((MimeObjectClass*)&mimeLeafClass)->parse_begin(obj);
  if (status < 0) return status;

  if (!obj->output_p) return 0;

  status = MimeObject_write_separator(obj);
  if (status < 0) return status;

  MimeInlineTextHTML* textHTML = (MimeInlineTextHTML*)obj;

  textHTML->charset = nullptr;

  /* If this HTML part has a Content-Base header, and if we're displaying
   to the screen (that is, not writing this part "raw") then translate
   that Content-Base header into a <BASE> tag in the HTML.
  */
  if (obj->options && obj->options->write_html_p && obj->options->output_fn) {
    char* base_hdr =
        MimeHeaders_get(obj->headers, HEADER_CONTENT_BASE, false, false);

    /* rhp - for MHTML Spec changes!!! */
    if (!base_hdr) {
      base_hdr =
          MimeHeaders_get(obj->headers, HEADER_CONTENT_LOCATION, false, false);
    }
    /* rhp - for MHTML Spec changes!!! */

    if (base_hdr) {
      uint32_t buflen = strlen(base_hdr) + 20;
      char* buf = (char*)PR_MALLOC(buflen);
      const char* in;
      char* out;
      if (!buf) return MIME_OUT_OF_MEMORY;

      /* The value of the Content-Base header is a number of "words".
        Whitespace in this header is not significant -- it is assumed
        that any real whitespace in the URL has already been encoded,
        and whitespace has been inserted to allow the lines in the
        mail header to be wrapped reasonably.  Creators are supposed
        to insert whitespace every 40 characters or less.
      */
      PL_strncpyz(buf, "<BASE HREF=\"", buflen);
      out = buf + strlen(buf);

      for (in = base_hdr; *in; in++) /* ignore whitespace and quotes */
        if (!IS_SPACE(*in) && *in != '"') *out++ = *in;

      /* Close the tag and argument. */
      *out++ = '"';
      *out++ = '>';
      *out++ = 0;

      PR_Free(base_hdr);

      status = MimeObject_write(obj, buf, strlen(buf), false);
      PR_Free(buf);
      if (status < 0) return status;
    }
  }

  return 0;
}

static int MimeInlineTextHTML_parse_line(const char* line, int32_t length,
                                         MimeObject* obj) {
  MimeInlineTextHTML* textHTML = (MimeInlineTextHTML*)obj;

  if (!obj->output_p) return 0;

  if (!obj->options || !obj->options->output_fn) return 0;

  if (!textHTML->charset) {
    char* cp;
    // First, try to detect a charset via a META tag!
    if ((cp = PL_strncasestr(line, "META", length)) &&
        (cp = PL_strncasestr(cp, "HTTP-EQUIV=", length - (int)(cp - line))) &&
        (cp = PL_strncasestr(cp, "CONTENT=", length - (int)(cp - line))) &&
        (cp = PL_strncasestr(cp, "CHARSET=", length - (int)(cp - line)))) {
      char* cp1 = cp + 8;  // 8 for the length of "CHARSET="
      char* cp2 = PL_strnpbrk(cp1, " \"\'", length - (int)(cp1 - line));
      if (cp2) {
        char* charset = PL_strndup(cp1, (int)(cp2 - cp1));

        // Fix bug 101434, in this case since this parsing is a char*
        // operation, a real UTF-16 or UTF-32 document won't be parse
        // correctly, if it got parse, it cannot be UTF-16 nor UTF-32
        // there fore, we ignore them if somehow we got that value
        // 6 == strlen("UTF-16") or strlen("UTF-32"), this will cover
        // UTF-16, UTF-16BE, UTF-16LE, UTF-32, UTF-32BE, UTF-32LE
        if ((charset != nullptr) && PL_strncasecmp(charset, "UTF-16", 6) &&
            PL_strncasecmp(charset, "UTF-32", 6)) {
          textHTML->charset = charset;

          // write out the data without the charset part...
          if (textHTML->charset) {
            int err = MimeObject_write(obj, line, cp - line, true);
            if (err == 0)
              err =
                  MimeObject_write(obj, cp2, length - (int)(cp2 - line), true);

            return err;
          }
        }
        PR_FREEIF(charset);
      }
    }
  }

  // Now, just write out the data...
  return MimeObject_write(obj, line, length, true);
}

static int MimeInlineTextHTML_parse_eof(MimeObject* obj, bool abort_p) {
  int status;
  MimeInlineTextHTML* textHTML = (MimeInlineTextHTML*)obj;
  if (obj->closed_p) return 0;

  PR_FREEIF(textHTML->charset);

  /* Run parent method first, to flush out any buffered data. */
  status = ((MimeObjectClass*)&MIME_SUPERCLASS)->parse_eof(obj, abort_p);
  if (status < 0) return status;

  return 0;
}

/*
 * The following function adds <div class="moz-text-html" lang="..."> or
 * <div class="moz-text-html"> as the first tag following the <body> tag in the
 * serialised HTML of a message. This becomes a no-op if no <body> tag is found.
 */
void MimeInlineTextHTML_insert_lang_div(MimeObject* obj, nsCString& message) {
  if (obj->options->format_out != nsMimeOutput::nsMimeMessageBodyDisplay &&
      obj->options->format_out != nsMimeOutput::nsMimeMessagePrintOutput)
    return;

  // Make sure we have a <body> before we start.
  int32_t index = message.LowerCaseFindASCII("<body");
  if (index == kNotFound) return;
  index = message.FindChar('>', index) + 1;

  // Insert <div class="moz-text-html" lang="..."> for the following two
  // purposes:
  // 1) Users can configure their HTML display via CSS for .moz-text-html.
  // 2) The language group in the 'lang' attribute is used by Gecko to determine
  //    which font to use.
  int32_t fontSize;            // default font size
  int32_t fontSizePercentage;  // size percentage
  nsAutoCString fontLang;      // langgroup of the font.
  if (NS_SUCCEEDED(GetMailNewsFont(obj, false, &fontSize, &fontSizePercentage,
                                   fontLang))) {
    message.Insert(
        "<div class=\"moz-text-html\" lang=\""_ns + fontLang + "\">"_ns, index);
  } else {
    message.Insert("<div class=\"moz-text-html\">"_ns, index);
  }

  nsACString::const_iterator begin, end;
  message.BeginReading(begin);
  message.EndReading(end);
  nsACString::const_iterator messageBegin = begin;
  if (RFindInReadable("</body>"_ns, begin, end,
                      nsCaseInsensitiveCStringComparator)) {
    message.InsertLiteral("</div>", begin - messageBegin);
  }
}

/*
 * The following function replaces <plaintext> tags with <x-plaintext>.
 * <plaintext> is a funny beast: It leads to everything following it
 * being displayed verbatim, even a </plaintext> tag is ignored.
 */
void MimeInlineTextHTML_remove_plaintext_tag(MimeObject* obj,
                                             nsCString& message) {
  if (obj->options->format_out != nsMimeOutput::nsMimeMessageBodyDisplay &&
      obj->options->format_out != nsMimeOutput::nsMimeMessagePrintOutput)
    return;

  // Replace all <plaintext> and </plaintext> tags.
  int32_t index = 0;
  bool replaced = false;
  while ((index = message.LowerCaseFindASCII("<plaintext", index)) !=
         kNotFound) {
    message.Insert("x-", index + 1);
    index += 12;
    replaced = true;
  }
  if (replaced) {
    index = 0;
    while ((index = message.LowerCaseFindASCII("</plaintext", index)) !=
           kNotFound) {
      message.Insert("x-", index + 2);
      index += 13;
    }
  }
}
