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

/*
 * sexp_string_t::parse(sis)
 * Parses the strin from input stream
 */

void sexp_string_t::parse(sexp_input_stream_t *sis)
{
    if (sis->get_next_char() == '[') { /* scan presentation hint */
        sis->skip_char('[');
        set_presentation_hint(sis->scan_simple_string());
        sis->skip_white_space()->skip_char(']')->skip_white_space();
    }
    set_string(sis->scan_simple_string());
}

/*
 * sexp_string_t::print_canonical(os)
 * Prints out sexp string onto output stream os
 */
sexp_output_stream_t *sexp_string_t::print_canonical(sexp_output_stream_t *os) const
{
    if (with_presentation_hint) {
        os->var_put_char('[');
        presentation_hint.print_canonical_verbatim(os);
        os->var_put_char(']');
    }
    data_string.print_canonical_verbatim(os);
    return os;
}

/*
 * sexp_string_t::print_advanced(os)
 * Prints out sexp string onto output stream os
 */
sexp_output_stream_t *sexp_string_t::print_advanced(sexp_output_stream_t *os) const
{
    sexp_object_t::print_advanced(os);
    if (with_presentation_hint) {
        os->put_char('[');
        presentation_hint.print_advanced(os);
        os->put_char(']');
    }
    data_string.print_advanced(os);
    return os;
}

/*
 * sexp_string_t::advanced_length(os)
 * Returns length of printed image of string
 */
size_t sexp_string_t::advanced_length(sexp_output_stream_t *os) const
{
    size_t len = 0;
    if (with_presentation_hint)
        len += 2 + presentation_hint.advanced_length(os);
    len += data_string.advanced_length(os);
    return len;
}

/*
 * sexp_list_t::parse(sis)
 * Parses the list from input stream
 */

void sexp_list_t::parse(sexp_input_stream_t *sis)
{
    sis->skip_char('(')->increase_depth()->skip_white_space();
    if (sis->get_next_char() == ')') {
        ;
    } else {
        push_back(sis->scan_object());
    }

    while (true) {
        sis->skip_white_space();
        if (sis->get_next_char() == ')') { /* we just grabbed last element of list */
            sis->skip_char(')')->decrease_depth();
            return;

        } else {
            push_back(sis->scan_object());
        }
    }
}

/*
 * sexp_list_t::print_canonical(os)
 * Prints out the list "list" onto output stream os
 */
sexp_output_stream_t *sexp_list_t::print_canonical(sexp_output_stream_t *os) const
{
    os->var_put_char('(');
    std::for_each(begin(), end(), [os](const std::shared_ptr<sexp_object_t> &obj) {
        obj->print_canonical(os);
    });
    os->var_put_char(')');
    return os;
}

/*
 * sexp_list_t::print_advanced(os)
 * Prints out the list onto output stream os.
 * Uses print-length to determine length of the image.  If it all fits
 * on the current line, then it is printed that way.  Otherwise, it is
 * written out in "vertical" mode, with items of the list starting in
 * the same column on successive lines.
 */
sexp_output_stream_t *sexp_list_t::print_advanced(sexp_output_stream_t *os) const
{
    sexp_object_t::print_advanced(os);
    int vertical = false;
    int firstelement = true;
    os->put_char('(')->inc_indent();
    vertical = (advanced_length(os) > os->get_max_column() - os->get_column());

    std::for_each(begin(), end(), [&](const std::shared_ptr<sexp_object_t> &obj) {
        if (!firstelement) {
            if (vertical)
                os->new_line(sexp_output_stream_t::advanced);
            else
                os->put_char(' ');
        }
        obj->print_advanced(os);
        firstelement = false;
    });

    if (os->get_max_column() > 0 && os->get_column() > os->get_max_column() - 2)
        os->new_line(sexp_output_stream_t::advanced);
    return os->dec_indent()->put_char(')');
}

/*
 * sexp_list_t::advanced_length(os)
 * Returns length of printed image of list given as iterator
 */
size_t sexp_list_t::advanced_length(sexp_output_stream_t *os) const
{
    size_t len = 1; /* for left paren */
    std::for_each(begin(), end(), [&](const std::shared_ptr<sexp_object_t> &obj) {
        len += obj->advanced_length(os);
    });
    return (len + 1); /* for final paren */
}

/*
 * sexp_object_t::print_advanced(os)
 * Prints out object on output stream os
 */
sexp_output_stream_t *sexp_object_t::print_advanced(sexp_output_stream_t *os) const
{
    if (os->get_max_column() > 0 && os->get_column() > os->get_max_column() - 4)
        os->new_line(sexp_output_stream_t::advanced);
    return os;
}

} // namespace sexp