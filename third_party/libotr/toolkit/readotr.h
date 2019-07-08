/*
 *  Off-the-Record Messaging Toolkit
 *  Copyright (C) 2004-2012  Ian Goldberg, Chris Alexander, Nikita Borisov
 *                           <otr@cypherpunks.ca>
 *
 *  This program is free software; you can redistribute it and/or modify
 *  it under the terms of version 2 of the GNU General Public License as
 *  published by the Free Software Foundation.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program; if not, write to the Free Software
 *  Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
 */

#ifndef __READOTR_H__
#define __READOTR_H__

/* Read from the given stream until we see a complete OTR Key Exchange
 * or OTR Data message.  Return a newly-allocated pointer to a copy of
 * this message, which the caller should free().  Returns NULL if no
 * such message could be found. */
char *readotr(FILE *stream);

#endif
