/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* If you fix a bug here, check, if the same is also in mimethsa, because that
   class is based on this class. */

#include "mimethpl.h"
#include <string_view>
#include "prlog.h"
#include "mimemoz2.h"
#include "nsString.h"
#include "nsIDocumentEncoder.h"  // for output flags

#define MIME_SUPERCLASS mimeInlineTextPlainClass
MimeDefClass(MimeInlineTextHTMLAsPlaintext, MimeInlineTextHTMLAsPlaintextClass,
             mimeInlineTextHTMLAsPlaintextClass, &MIME_SUPERCLASS);

static int MimeInlineTextHTMLAsPlaintext_parse_line(const char*, int32_t,
                                                    MimeObject*);
static int MimeInlineTextHTMLAsPlaintext_parse_begin(MimeObject* obj);
static int MimeInlineTextHTMLAsPlaintext_parse_eof(MimeObject*, bool);
static void MimeInlineTextHTMLAsPlaintext_finalize(MimeObject* obj);

static int MimeInlineTextHTMLAsPlaintextClassInitialize(
    MimeObjectClass* oclass) {
  NS_ASSERTION(!oclass->class_initialized, "problem with superclass");
  oclass->parse_line = MimeInlineTextHTMLAsPlaintext_parse_line;
  oclass->parse_begin = MimeInlineTextHTMLAsPlaintext_parse_begin;
  oclass->parse_eof = MimeInlineTextHTMLAsPlaintext_parse_eof;
  oclass->finalize = MimeInlineTextHTMLAsPlaintext_finalize;
  return 0;
}

static int MimeInlineTextHTMLAsPlaintext_parse_begin(MimeObject* obj) {
  MimeInlineTextHTMLAsPlaintext* textHTMLPlain =
      (MimeInlineTextHTMLAsPlaintext*)obj;
  textHTMLPlain->complete_buffer = new nsString();
  // Let's just hope that libmime won't have the idea to call begin twice...
  return ((MimeObjectClass*)&MIME_SUPERCLASS)->parse_begin(obj);
}

static int MimeInlineTextHTMLAsPlaintext_parse_eof(MimeObject* obj,
                                                   bool abort_p) {
  if (obj->closed_p) return 0;

  // This is a hack. We need to call parse_eof() of the super class to flush out
  // any buffered data. We can't call it yet for our direct super class, because
  // it would "close" the output (write tags such as </pre> and </div>). We'll
  // do that after parsing the buffer.
  int status =
      ((MimeObjectClass*)&MIME_SUPERCLASS)->superclass->parse_eof(obj, abort_p);
  if (status < 0) return status;

  MimeInlineTextHTMLAsPlaintext* textHTMLPlain =
      (MimeInlineTextHTMLAsPlaintext*)obj;

  if (!textHTMLPlain || !textHTMLPlain->complete_buffer) return 0;

  nsString& cb = *(textHTMLPlain->complete_buffer);

  // could be empty, e.g., if part isn't actually being displayed
  if (cb.Length()) {
    nsString asPlaintext;
    uint32_t flags = nsIDocumentEncoder::OutputFormatted |
                     nsIDocumentEncoder::OutputWrap |
                     nsIDocumentEncoder::OutputFormatFlowed |
                     nsIDocumentEncoder::OutputLFLineBreak |
                     nsIDocumentEncoder::OutputNoScriptContent |
                     nsIDocumentEncoder::OutputNoFramesContent |
                     nsIDocumentEncoder::OutputBodyOnly;
    HTML2Plaintext(cb, asPlaintext, flags, 80);

    NS_ConvertUTF16toUTF8 resultCStr(asPlaintext);
    // We parse each line independently including its line terminator to allow
    // for smooth further processing, such as our trailing empty line collapse.
    std::string_view text(resultCStr.get(), resultCStr.Length());

    while (!text.empty()) {
      size_t eol = text.find_first_of("\r\n");
      size_t lineLen = text.size();
      if (eol != std::string_view::npos) {
        lineLen = (text[eol] == '\r' && eol + 1 < text.size() &&
                   text[eol + 1] == '\n')
                      ? eol + 2
                      : eol + 1;
      }
      status =
          ((MimeObjectClass*)&MIME_SUPERCLASS)
              ->parse_line(text.data(), static_cast<int32_t>(lineLen), obj);
      if (status < 0) {
        cb.Truncate();
        return status;
      }
      text.remove_prefix(lineLen);
    }
    cb.Truncate();
  }

  if (status < 0) return status;

  // Second part of the flush hack. Pretend obj wasn't closed yet, so that our
  // super class gets a chance to write the closing.
  bool save_closed_p = obj->closed_p;
  obj->closed_p = false;
  status = ((MimeObjectClass*)&MIME_SUPERCLASS)->parse_eof(obj, abort_p);
  // Restore closed_p.
  obj->closed_p = save_closed_p;
  return status;
}

void MimeInlineTextHTMLAsPlaintext_finalize(MimeObject* obj) {
  MimeInlineTextHTMLAsPlaintext* textHTMLPlain =
      (MimeInlineTextHTMLAsPlaintext*)obj;
  if (textHTMLPlain && textHTMLPlain->complete_buffer) {
    // If there's content in the buffer, make sure that we output it.
    // don't care about return codes
    obj->clazz->parse_eof(obj, false);

    delete textHTMLPlain->complete_buffer;
    textHTMLPlain->complete_buffer = NULL;
    /* It is important to zero the pointer, so we can reliably check for
       the validity of it in the other functions. See above. */
  }
  ((MimeObjectClass*)&MIME_SUPERCLASS)->finalize(obj);
}

static int MimeInlineTextHTMLAsPlaintext_parse_line(const char* line,
                                                    int32_t length,
                                                    MimeObject* obj) {
  MimeInlineTextHTMLAsPlaintext* textHTMLPlain =
      (MimeInlineTextHTMLAsPlaintext*)obj;

  if (!textHTMLPlain || !(textHTMLPlain->complete_buffer)) {
#if DEBUG
    printf("Can't output: %s\n", line);
#endif
    return -1;
  }

  /*
    To convert HTML->TXT synchronously, I need the full source at once,
    not line by line (how do you convert "<li>foo\n" to plaintext?).
    parse_decoded_buffer claims to give me that, but in fact also gives
    me single lines.
    It might be theoretically possible to drive this asynchronously, but
    I don't know, which odd circumstances might arise and how libmime
    will behave then. It's not worth the trouble for me to figure this all out.
   */
  nsCString linestr(line, length);
  NS_ConvertUTF8toUTF16 line_ucs2(linestr.get());
  if (length && line_ucs2.IsEmpty()) CopyASCIItoUTF16(linestr, line_ucs2);
  (textHTMLPlain->complete_buffer)->Append(line_ucs2);

  return 0;
}

#undef MIME_SUPERCLASS
