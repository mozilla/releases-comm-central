/*
 * Copyright (C) 2014 - David Goulet <dgoulet@ev0ke.net>
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License, version 2 only, as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program; if not, write to the Free Software Foundation, Inc., 51
 * Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

#ifndef TESTS_UTILS_H
#define TESTS_UTILS_H

/*
 * Return 1 if the given buffer is zeroed or 0 if not.
 */
static inline int utils_is_zeroed(const unsigned char *buf, size_t size)
{
	return buf[0] == 0 && !memcmp(buf, buf + 1, size - 1);
}

#endif /* TESTS_UTILS_H */
