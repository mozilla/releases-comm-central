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
 * SEXP implementation code sexp-output.c
 * Ron Rivest
 * 5/5/1997
 */

#include <sexp/sexp.h>

namespace sexp {

static const char *hexDigits = "0123456789ABCDEF";
static const char *base64Digits =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/*
 * sexp_output_stream_t::sexp_output_stream_t
 * Creates and initializes new sexp_output_stream_t object.
 */
sexp_output_stream_t::sexp_output_stream_t(std::ostream *o)
{
    set_output(o);
}

/*
 * sexp_output_stream_t::set_output
 * Re-initializes new sexp_output_stream_t object.
 */
sexp_output_stream_t *sexp_output_stream_t::set_output(std::ostream *o)
{
    output_file = o;
    byte_size = 8;
    bits = 0;
    n_bits = 0;
    mode = canonical;
    column = 0;
    max_column = default_line_length;
    indent = 0;
    base64_count = 0;
    return this;
}

/*
 * sexp_output_stream_t::put_char(c)
 * Puts the character c out on the output stream os.
 * Keeps track of the "column" the next output char will go to.
 */
sexp_output_stream_t *sexp_output_stream_t::put_char(int c)
{
    output_file->put(c);
    column++;
    return this;
}

/*
 * sexp_output_stream_t::var_put_char(c)
 * put_char with variable sized output bytes considered.
 * int c;  -- this is always an eight-bit byte being output
 */
sexp_output_stream_t *sexp_output_stream_t::var_put_char(int c)
{
    c &= 0xFF;
    bits = (bits << 8) | c;
    n_bits += 8;
    while (n_bits >= byte_size) {
        if ((byte_size == 6 || byte_size == 4 || c == '}' || c == '{' || c == '#' ||
             c == '|') &&
            max_column > 0 && column >= max_column)
            new_line(mode);
        if (byte_size == 4)
            put_char(hexDigits[(bits >> (n_bits - 4)) & 0x0F]);
        else if (byte_size == 6)
            put_char(base64Digits[(bits >> (n_bits - 6)) & 0x3F]);
        else if (byte_size == 8)
            put_char(bits & 0xFF);
        n_bits -= byte_size;
        base64_count++;
    }
    return this;
}

/*
 * sexp_output_stream_t::change_output_byte_size(newByteSize,newMode)
 * Change os->byte_size to newByteSize
 * record mode in output stream for automatic line breaks
 */
sexp_output_stream_t *sexp_output_stream_t::change_output_byte_size(int newByteSize,
                                                                    sexp_print_mode newMode)
{
    if (newByteSize != 4 && newByteSize != 6 && newByteSize != 8)
        sexp_error(sexp_exception_t::error, "Illegal output base %d", newByteSize, 0, EOF);
    if (newByteSize != 8 && byte_size != 8)
        sexp_error(sexp_exception_t::error,
                   "Illegal change of output byte size from %d to %d",
                   byte_size,
                   newByteSize,
                   EOF);
    byte_size = newByteSize;
    n_bits = 0;
    bits = 0;
    base64_count = 0;
    mode = newMode;
    return this;
}

/*
 * sexp_output_stream_t::flush()
 * flush out any remaining bits
 */
sexp_output_stream_t *sexp_output_stream_t::flush(void)
{
    if (n_bits > 0) {
        assert(byte_size == 6);
        put_char(base64Digits[(bits << (6 - n_bits)) & 0x3F]);
        n_bits = 0;
        base64_count++;
    }
    if (byte_size == 6) { /* and add switch here */
        while ((base64_count & 3) != 0) {
            if (max_column > 0 && column >= max_column)
                new_line(mode);
            put_char('=');
            base64_count++;
        }
    }
    return this;
}

/*
 * sexp_output_stream_t::new_line(mode)
 * Outputs a newline symbol to the output stream os.
 * For advanced mode, also outputs indentation as one blank per
 * indentation level (but never indents more than half of max_column).
 * Resets column for next output character.
 */
sexp_output_stream_t *sexp_output_stream_t::new_line(sexp_print_mode mode)
{
    if (mode == advanced || mode == base64) {
        put_char('\n');
        column = 0;
    }
    if (mode == advanced) {
        for (uint32_t i = 0; i < indent && (4 * i) < max_column; i++)
            put_char(' ');
    }
    return this;
}

/*
 * sexp_output_stream_t::print_decimal(n)
 * print out n in decimal to output stream os
 */
sexp_output_stream_t *sexp_output_stream_t::print_decimal(uint64_t n)
{
    char buffer[20]; // 64*ln(2)/ln(10)
    snprintf(buffer,
             sizeof(buffer) / sizeof(buffer[0]),
#ifdef _WIN32
             "%llu",
#else
             "%lu",
#endif
             n); // since itoa is not a part of any standard
    for (uint32_t i = 0; buffer[i] != 0; i++)
        var_put_char(buffer[i]);
    return this;
}

/*
 * base64 MODE
 * Same as canonical, except all characters get put out as base 64 ones
 */

sexp_output_stream_t *sexp_output_stream_t::print_base64(
  const std::shared_ptr<sexp_object_t> &object)
{
    change_output_byte_size(8, base64)->var_put_char('{')->change_output_byte_size(6, base64);
    print_canonical(object);
    return flush()->change_output_byte_size(8, base64)->var_put_char('}');
}
} // namespace sexp
