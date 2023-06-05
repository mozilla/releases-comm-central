/**
 *
 * Copyright (c) 2022, [Ribose Inc](https://www.ribose.com).
 * All rights reserved.
 * This file is a part of RNP sexp library
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
 * OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
 * ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

#pragma once

#include <map>
#include "sexp.h"

namespace ext_key_format {

void ext_key_error(
  sexp::sexp_exception_t::severity level, const char *msg, size_t c1, size_t c2, int pos);

class ext_key_input_stream_t;

class extended_private_key_t {
  public:
    // Comparison of names is done case insensitively !!!
    struct ci_less {
        // case-independent (ci) compare_less binary function
        bool operator()(const std::string &s1, const std::string &s2) const
        {
            return std::lexicographical_compare(
              s1.begin(), s1.end(), s2.begin(), s2.end(), [](char a, char b) {
                  return std::tolower(a) < std::tolower(b);
              });
        }
    };

    // C++ 11 compatible version (no std::equals)
    static bool iequals(const std::string &a, const std::string &b)
    {
        size_t sz = a.size();
        if (b.size() != sz)
            return false;
        for (size_t i = 0; i < sz; ++i)
            if (tolower(a[i]) != tolower(b[i]))
                return false;
        return true;
    }

    typedef std::multimap<std::string, std::string, ci_less> fields_map_t;

    sexp::sexp_list_t key;
    fields_map_t      fields;

    void parse(ext_key_input_stream_t &is);
};

class ext_key_input_stream_t : public sexp::sexp_input_stream_t {
  private:
    static const bool namechar[256]; /* true if allowed in the name field */

    static bool is_newline_char(int c) { return c == '\r' || c == '\n'; };
    static bool is_namechar(int c) { return ((c >= 0 && c <= 255) && namechar[c]); }

    bool is_scanning_value;
    bool has_key;

    int         skip_line(void);
    virtual int read_char(void);
    std::string scan_name(int c);
    std::string scan_value(void);

  public:
    ext_key_input_stream_t(std::istream *i, size_t md = 0)
        : sexp_input_stream_t(i, md), is_scanning_value(false), has_key(false)
    {
    }
    virtual ~ext_key_input_stream_t() = default;
    void scan(extended_private_key_t &extended_key);
};
} // namespace ext_key_format
