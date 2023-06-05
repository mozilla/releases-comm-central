/**
 *
 * Copyright (c) 2022-2023, [Ribose Inc](https://www.ribose.com).
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
 * Original copyright
 *
 * SEXP standard header file: sexp.h
 * Ronald L. Rivest
 * 6/29/1997
 */

#pragma once

#include <climits>
#include <limits>
#include <cctype>
#include <locale>
#include <cstring>
#include <memory>
#include <algorithm>
#include <iostream>
#include <string>
#include <vector>
#include <cassert>

#include "sexp-error.h"

namespace sexp {
/*
 * SEXP octet_t definitions
 * We maintain some presumable redundancy with ctype
 * However, we do enforce 'C' locale this way
 */

class sexp_char_defs_t {
  protected:
    static const bool          base64digit[256]; /* true if c is base64 digit */
    static const bool          tokenchar[256];   /* true if c can be in a token */
    static const unsigned char values[256][3]; /* values of c as { dec. hex, base64 } digit */
    static std::locale         c_locale;

    static bool is_white_space(int c)
    {
        return c >= 0 && c <= 255 && std::isspace((char) c, c_locale);
    };
    static bool is_dec_digit(int c)
    {
        return c >= 0 && c <= 255 && std::isdigit((char) c, c_locale);
    };
    static bool is_hex_digit(int c)
    {
        return c >= 0 && c <= 255 && std::isxdigit((char) c, c_locale);
    };
    static bool is_base64_digit(int c) { return c >= 0 && c <= 255 && base64digit[c]; };
    static bool is_token_char(int c) { return c >= 0 && c <= 255 && tokenchar[c]; };
    static bool is_alpha(int c)
    {
        return c >= 0 && c <= 255 && std::isalpha((char) c, c_locale);
    };

    /* decvalue(c) is value of c as dec digit */
    static unsigned char decvalue(int c) { return (c >= 0 && c <= 255) ? values[c][0] : 0; };
    /* hexvalue(c) is value of c as a hex digit */
    static unsigned char hexvalue(int c) { return (c >= 0 && c <= 255) ? values[c][1] : 0; };
    /* base64value(c) is value of c as base64 digit */
    static unsigned char base64value(int c)
    {
        return (c >= 0 && c <= 255) ? values[c][2] : 0;
    };
};

class sexp_string_t;
class sexp_list_t;

class sexp_output_stream_t;
class sexp_input_stream_t;

/*
 * SEXP simple string
 */

typedef uint8_t octet_t;

class sexp_simple_string_t : public std::basic_string<octet_t>, private sexp_char_defs_t {
  public:
    sexp_simple_string_t(void) = default;
    sexp_simple_string_t(const octet_t *dt) : std::basic_string<octet_t>{dt} {}
    sexp_simple_string_t(const octet_t *bt, size_t ln) : std::basic_string<octet_t>{bt, ln} {}
    sexp_simple_string_t &append(int c)
    {
        (*this) += (octet_t)(c & 0xFF);
        return *this;
    }
    // Returns length for printing simple string as a token
    size_t advanced_length_token(void) const { return length(); }
    // Returns length for printing simple string as a base64 string
    size_t advanced_length_base64(void) const { return (2 + 4 * ((length() + 2) / 3)); }
    // Returns length for printing simple string ss in quoted-string mode
    size_t advanced_length_quoted(void) const { return (1 + length() + 1); }
    // Returns length for printing simple string ss in hexadecimal mode
    size_t advanced_length_hexadecimal(void) const { return (1 + 2 * length() + 1); }
    size_t advanced_length(sexp_output_stream_t *os) const;

    sexp_output_stream_t *print_canonical_verbatim(sexp_output_stream_t *os) const;
    sexp_output_stream_t *print_advanced(sexp_output_stream_t *os) const;
    sexp_output_stream_t *print_token(sexp_output_stream_t *os) const;
    sexp_output_stream_t *print_quoted(sexp_output_stream_t *os) const;
    sexp_output_stream_t *print_hexadecimal(sexp_output_stream_t *os) const;
    sexp_output_stream_t *print_base64(sexp_output_stream_t *os) const;

    bool can_print_as_quoted_string(void) const;
    bool can_print_as_token(const sexp_output_stream_t *os) const;

    bool operator==(const char *right) const noexcept
    {
        return length() == std::strlen(right) && std::memcmp(data(), right, length()) == 0;
    }

    bool operator!=(const char *right) const noexcept
    {
        return length() != std::strlen(right) || std::memcmp(data(), right, length()) != 0;
    }

    unsigned as_unsigned() const noexcept
    {
        return empty() ? std::numeric_limits<uint32_t>::max() :
                         (unsigned) atoi(reinterpret_cast<const char *>(c_str()));
    }
};

inline bool operator==(const sexp_simple_string_t *left, const std::string &right) noexcept
{
    return *left == right.c_str();
}

inline bool operator!=(const sexp_simple_string_t *left, const std::string &right) noexcept
{
    return *left != right.c_str();
}

/*
 * SEXP object
 */

class sexp_object_t {
  public:
    virtual ~sexp_object_t(){};

    virtual sexp_output_stream_t *print_canonical(sexp_output_stream_t *os) const = 0;
    virtual sexp_output_stream_t *print_advanced(sexp_output_stream_t *os) const;
    virtual size_t                advanced_length(sexp_output_stream_t *os) const = 0;

    virtual sexp_list_t *  sexp_list_view(void) noexcept { return nullptr; }
    virtual sexp_string_t *sexp_string_view(void) noexcept { return nullptr; }
    virtual bool           is_sexp_list(void) const noexcept { return false; }
    virtual bool           is_sexp_string(void) const noexcept { return false; }

    virtual const sexp_list_t *sexp_list_at(
      std::vector<std::shared_ptr<sexp_object_t>>::size_type pos) const noexcept
    {
        return nullptr;
    }
    virtual const sexp_string_t *sexp_string_at(
      std::vector<std::shared_ptr<sexp_object_t>>::size_type pos) const noexcept
    {
        return nullptr;
    }
    virtual const sexp_simple_string_t *sexp_simple_string_at(
      std::vector<std::shared_ptr<sexp_object_t>>::size_type pos) const noexcept
    {
        return nullptr;
    }
    virtual bool     operator==(const char *right) const noexcept { return false; }
    virtual bool     operator!=(const char *right) const noexcept { return true; }
    virtual unsigned as_unsigned() const noexcept
    {
        return std::numeric_limits<uint32_t>::max();
    }
};

/*
 * SEXP string
 */

class sexp_string_t : public sexp_object_t {
  protected:
    bool                 with_presentation_hint;
    sexp_simple_string_t presentation_hint;
    sexp_simple_string_t data_string;

  public:
    sexp_string_t(const octet_t *dt) : with_presentation_hint(false), data_string(dt) {}
    sexp_string_t(const octet_t *bt, size_t ln)
        : with_presentation_hint(false), data_string(bt, ln)
    {
    }
    sexp_string_t(const std::string &str)
        : with_presentation_hint(false),
          data_string(reinterpret_cast<const octet_t *>(str.data()))
    {
    }
    sexp_string_t(void) : with_presentation_hint(false) {}
    sexp_string_t(sexp_input_stream_t *sis) { parse(sis); };

    const bool has_presentation_hint(void) const noexcept { return with_presentation_hint; }
    const sexp_simple_string_t &get_string(void) const noexcept { return data_string; }
    const sexp_simple_string_t &set_string(const sexp_simple_string_t &ss)
    {
        return data_string = ss;
    }
    const sexp_simple_string_t &get_presentation_hint(void) const noexcept
    {
        return presentation_hint;
    }
    const sexp_simple_string_t &set_presentation_hint(const sexp_simple_string_t &ph)
    {
        with_presentation_hint = true;
        return presentation_hint = ph;
    }

    virtual sexp_output_stream_t *print_canonical(sexp_output_stream_t *os) const;
    virtual sexp_output_stream_t *print_advanced(sexp_output_stream_t *os) const;
    virtual size_t                advanced_length(sexp_output_stream_t *os) const;

    virtual sexp_string_t *sexp_string_view(void) noexcept { return this; }
    virtual bool           is_sexp_string(void) const noexcept { return true; }

    virtual bool operator==(const char *right) const noexcept { return data_string == right; }
    virtual bool operator!=(const char *right) const noexcept { return data_string != right; }

    void             parse(sexp_input_stream_t *sis);
    virtual unsigned as_unsigned() const noexcept { return data_string.as_unsigned(); }
};

inline bool operator==(const sexp_string_t *left, const std::string &right) noexcept
{
    return *left == right.c_str();
}

inline bool operator!=(const sexp_string_t *left, const std::string &right) noexcept
{
    return *left != right.c_str();
}

/*
 * SEXP list
 */

class sexp_list_t : public sexp_object_t, public std::vector<std::shared_ptr<sexp_object_t>> {
  public:
    virtual ~sexp_list_t() {}

    virtual sexp_output_stream_t *print_canonical(sexp_output_stream_t *os) const;
    virtual sexp_output_stream_t *print_advanced(sexp_output_stream_t *os) const;
    virtual size_t                advanced_length(sexp_output_stream_t *os) const;

    virtual sexp_list_t *sexp_list_view(void) noexcept { return this; }
    virtual bool         is_sexp_list(void) const noexcept { return true; }

    virtual const sexp_list_t *sexp_list_at(size_type pos) const noexcept
    {
        return pos < size() ? (*at(pos)).sexp_list_view() : nullptr;
    }
    virtual const sexp_string_t *sexp_string_at(size_type pos) const noexcept
    {
        return pos < size() ? (*at(pos)).sexp_string_view() : nullptr;
    }
    const sexp_simple_string_t *sexp_simple_string_at(size_type pos) const noexcept
    {
        auto s = sexp_string_at(pos);
        return s != nullptr ? &s->get_string() : nullptr;
    }

    void parse(sexp_input_stream_t *sis);
};

/*
 * SEXP input stream
 */

class sexp_input_stream_t : public sexp_char_defs_t {
  protected:
    std::istream *input_file;
    uint32_t      byte_size; /* 4 or 6 or 8 == currently scanning mode */
    int           next_char; /* character currently being scanned */
    uint32_t      bits;      /* Bits waiting to be used */
    uint32_t      n_bits;    /* number of such bits waiting to be used */
    int           count;     /* number of 8-bit characters output by get_char */
    size_t        depth;     /* current depth of nested SEXP lists */
    size_t        max_depth; /* maximum allowed depth of nested SEXP lists, 0 if no limit */

    virtual int read_char(void);

  public:
    sexp_input_stream_t(std::istream *i, size_t max_depth = 0);
    virtual ~sexp_input_stream_t() = default;
    sexp_input_stream_t *set_input(std::istream *i, size_t max_depth = 0);
    sexp_input_stream_t *set_byte_size(uint32_t new_byte_size);
    uint32_t             get_byte_size(void) { return byte_size; }
    sexp_input_stream_t *get_char(void);
    sexp_input_stream_t *skip_white_space(void);
    sexp_input_stream_t *skip_char(int c);
    sexp_input_stream_t *increase_depth(void)
    {
        if (max_depth != 0 && ++depth > max_depth)
            sexp_error(sexp_exception_t::error,
                       "Maximum allowed SEXP list depth (%u) is exceeded",
                       max_depth,
                       0,
                       count);
        return this;
    }
    sexp_input_stream_t *decrease_depth(void)
    {
        depth--;
        return this;
    }

    std::shared_ptr<sexp_object_t> scan_to_eof();
    std::shared_ptr<sexp_object_t> scan_object(void);
    std::shared_ptr<sexp_string_t> scan_string(void);
    std::shared_ptr<sexp_list_t>   scan_list(void);
    sexp_simple_string_t           scan_simple_string(void);
    void                           scan_token(sexp_simple_string_t &ss);
    void     scan_verbatim_string(sexp_simple_string_t &ss, uint32_t length);
    void     scan_quoted_string(sexp_simple_string_t &ss, uint32_t length);
    void     scan_hexadecimal_string(sexp_simple_string_t &ss, uint32_t length);
    void     scan_base64_string(sexp_simple_string_t &ss, uint32_t length);
    uint32_t scan_decimal_string(void);

    int get_next_char(void) const { return next_char; }
    int set_next_char(int c) { return next_char = c; }
};

/*
 * SEXP output stream
 */

class sexp_output_stream_t {
  public:
    const uint32_t default_line_length = 75;
    enum sexp_print_mode {                /* PRINTING MODES */
                           canonical = 1, /* standard for hashing and tranmission */
                           base64 = 2,    /* base64 version of canonical */
                           advanced = 3   /* pretty-printed */
    };

  protected:
    std::ostream *  output_file;
    uint32_t        base64_count; /* number of hex or base64 chars printed this region */
    uint32_t        byte_size;    /* 4 or 6 or 8 depending on output mode */
    uint32_t        bits;         /* bits waiting to go out */
    uint32_t        n_bits;       /* number of bits waiting to go out */
    sexp_print_mode mode;         /* base64, advanced, or canonical */
    uint32_t        column;       /* column where next character will go */
    uint32_t        max_column;   /* max usable column, or 0 if no maximum */
    uint32_t        indent;       /* current indentation level (starts at 0) */
  public:
    sexp_output_stream_t(std::ostream *o);
    sexp_output_stream_t *set_output(std::ostream *o);
    sexp_output_stream_t *put_char(int c);                /* output a character */
    sexp_output_stream_t *new_line(sexp_print_mode mode); /* go to next line (and indent) */
    sexp_output_stream_t *var_put_char(int c);
    sexp_output_stream_t *flush(void);
    sexp_output_stream_t *print_decimal(uint64_t n);

    sexp_output_stream_t *change_output_byte_size(int newByteSize, sexp_print_mode mode);

    sexp_output_stream_t *print_canonical(const std::shared_ptr<sexp_object_t> &obj)
    {
        return obj->print_canonical(this);
    }
    sexp_output_stream_t *print_advanced(const std::shared_ptr<sexp_object_t> &obj)
    {
        return obj->print_advanced(this);
    };
    sexp_output_stream_t *print_base64(const std::shared_ptr<sexp_object_t> &obj);
    sexp_output_stream_t *print_canonical(const sexp_simple_string_t *ss)
    {
        return ss->print_canonical_verbatim(this);
    }
    sexp_output_stream_t *print_advanced(const sexp_simple_string_t *ss)
    {
        return ss->print_advanced(this);
    };

    uint32_t              get_byte_size(void) const { return byte_size; }
    uint32_t              get_column(void) const { return column; }
    sexp_output_stream_t *reset_column(void)
    {
        column = 0;
        return this;
    }
    uint32_t              get_max_column(void) const { return max_column; }
    sexp_output_stream_t *set_max_column(uint32_t mc)
    {
        max_column = mc;
        return this;
    }
    sexp_output_stream_t *inc_indent(void)
    {
        ++indent;
        return this;
    }
    sexp_output_stream_t *dec_indent(void)
    {
        --indent;
        return this;
    }
};

} // namespace sexp
