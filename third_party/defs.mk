# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# This file is included my mozbuild for this directory and any subdirectories
# that use mozbuild. Currently the OTR libraries do not use mozbuild and
# are not affected.

# MZLA_RNP_CC and MZLA_RNP_CXX are set in openpgp.configure and are used
# to remove the -std= flags from the commands.
CC := $(MZLA_RNP_CC)
CXX := $(MZLA_RNP_CXX)
