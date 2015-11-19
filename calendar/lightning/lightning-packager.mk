# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# NOTE: The packager is not only used in calendar/lightning but should be
# general enough to be able to repackage other sub-extensions like
# calendar/providers/gdata. This means no lightning-specific files, no version
# numbers directly from lightning and be careful with relative paths.

# This packager can be used to repackage extensions. To use it, set the
# following variables in your Makefile, then include this file.
#   XPI_NAME = lightning # The extension path name
#   XPI_PKGNAME = lightning-2.2.en-US.mac # The extension package name
#   XPI_VERSION = 2.2 # The extension version
#
# The following variables are optional:
#   XPI_NO_UNIVERSAL = 1  # If set, no universal path is used on mac
#
# For the upload target to work, you also need to set:
#   LIGHTNING_VERSION = 2.2  # Will be used to replace the Thunderbird version
#   						 # in POST_UPLOAD_CMD

include $(MOZILLA_SRCDIR)/toolkit/mozapps/installer/package-name.mk

# Set the univeral path only if we are building a univeral binary and it was
# not restricted by the calling makefile
ifeq ($(UNIVERSAL_BINARY)|$(XPI_NO_UNIVERSAL),1|)
UNIVERSAL_PATH=universal/
else
UNIVERSAL_PATH=
endif

_ABS_DIST := $(abspath $(DIST))
XPI_STAGE_PATH = $(DIST)/$(UNIVERSAL_PATH)xpi-stage
_ABS_XPI_STAGE_PATH = $(_ABS_DIST)/$(UNIVERSAL_PATH)xpi-stage
ENUS_PKGNAME=$(subst .$(AB_CD).,.en-US.,$(XPI_PKGNAME))
XPI_ZIP_IN=$(_ABS_XPI_STAGE_PATH)/$(ENUS_PKGNAME).xpi


# This variable is to allow the wget-en-US target to know which ftp server to download from
ifndef EN_US_BINARY_URL
ifdef DOWNLOAD_HOST
# If this url is missing, and DOWNLOAD_HOST is defined its probably the release
# run where we can't influence the download location. Fake it from the env vars
# we have
BUILD_NR=$(shell echo $(POST_UPLOAD_CMD) | sed -n -e 's/.*-n \([0-9]*\).*/\1/p')
CANDIDATE_NR=$(if $(LIGHTNING_VERSION),$(LIGHTNING_VERSION),$(XPI_VERSION))
EN_US_BINARY_URL=http://$(DOWNLOAD_HOST)/pub/calendar/lightning/candidates/$(CANDIDATE_NR)-candidates/build$(BUILD_NR)/$(MOZ_PKG_PLATFORM)
endif
endif

# Check if EN_US_BINARY_URL has finally been set
ifdef EN_US_BINARY_URL
# If so, we are expected to unpack when the language pack is created
ensure-stage-dir: wget-en-US unpack
else
# If not, use the existing lightning from xpi-stage, or warn that the var is not set.
ensure-stage-dir:
ifeq (,$(wildcard $(XPI_STAGE_PATH)/$(XPI_NAME)/))
	$(error You must set EN_US_BINARY_URL)
endif
endif

$(XPI_STAGE_PATH):
	mkdir -p $@

# Target Directory used for the l10n files
L10N_TARGET = $(XPI_STAGE_PATH)/$(XPI_NAME)-$(AB_CD)

# Short name of the OS used in shipped-locales file. For now osx is the only
# special case, so assume linux for everything else.
ifeq (cocoa,$(MOZ_WIDGET_TOOLKIT))
SHORTOS = osx
else
SHORTOS = linux
endif

# function print_ltnconfig(section,configname)
print_ltnconfig = $(shell $(PYTHON) $(MOZILLA_SRCDIR)/config/printconfigsetting.py $(XPI_STAGE_PATH)/$(XPI_NAME)/app.ini $1 $2)

wget-en-US: FINAL_BINARY_URL = $(subst thunderbird,calendar/lightning,$(EN_US_BINARY_URL))
wget-en-US: $(XPI_STAGE_PATH)
	(cd $(XPI_STAGE_PATH) && $(WGET) -nv -N $(FINAL_BINARY_URL)/$(ENUS_PKGNAME).xpi)
	@echo "Downloaded $(FINAL_BINARY_URL)/$(ENUS_PKGNAME) to $(XPI_ZIP_IN)"


# We're unpacking directly into FINAL_TARGET, this keeps code to do manual
# repacks cleaner.
unpack: $(XPI_ZIP_IN)
	if test -d $(XPI_STAGE_PATH)/$(XPI_NAME); then \
	  $(RM) -r -v $(XPI_STAGE_PATH)/$(XPI_NAME); \
	fi
	$(NSINSTALL) -D $(XPI_STAGE_PATH)/$(XPI_NAME)
	cd $(XPI_STAGE_PATH)/$(XPI_NAME) && $(UNZIP) $(XPI_ZIP_IN)
	@echo done unpacking

# Nothing to package for en-US, its just the usual english xpi
langpack-en-US:
	@echo "Skipping $@ as en-US is the default"

# It wouldn't fit into mozharness to run compare-locales for calendar
# separately, so we need to do it ourselves. Unfortunately compare-locales is
# not installed globally on the slaves, so we need to hardcode the path.
BUILD_COMPARE_LOCALES = $(wildcard $(topsrcdir)/../compare-locales)
COMPARE_LOCALES = $(if $(BUILD_COMPARE_LOCALES),$(PYTHON) $(BUILD_COMPARE_LOCALES)/scripts/compare-locales,compare-locales)
COMPARE_LOCALES_PYTHONPATH = $(if $(BUILD_COMPARE_LOCALES),$(BUILD_COMPARE_LOCALES)/lib,)

merge-%:
ifdef LOCALE_MERGEDIR
	$(RM) -rf $(LOCALE_MERGEDIR)/calendar
	MACOSX_DEPLOYMENT_TARGET= PYTHONPATH=$(COMPARE_LOCALES_PYTHONPATH) \
	  $(COMPARE_LOCALES) -m $(LOCALE_MERGEDIR) $(topsrcdir)/calendar/locales/l10n.ini $(L10NBASEDIR) $*

	# This file requires a bugfix with string changes, see bug 1154448
	[ -f $(L10NBASEDIR)/$*/calendar/chrome/calendar/calendar-extract.properties ] && \
	  $(RM) $(LOCALE_MERGEDIR)/calendar/chrome/calendar/calendar-extract.properties \
	  || true
else
	@echo "Not merging Lightning locales due to missing LOCALE_MERGEDIR"
endif

# Calling these targets with prerequisites causes the libs and subsequent
# targets to be switched in order due to some make voodoo. Therefore we call
# the targets explicitly, which seems to work better.
langpack-%: L10N_XPI_NAME=$(XPI_NAME)-$*
langpack-%: L10N_XPI_PKGNAME=$(subst $(AB_CD),$*,$(XPI_PKGNAME))
langpack-%: AB_CD=$*
langpack-%: ensure-stage-dir
	$(MAKE) L10N_XPI_NAME=$(L10N_XPI_NAME) L10N_XPI_PKGNAME=$(L10N_XPI_PKGNAME) AB_CD=$(AB_CD) \
	  recreate-platformini repack-stage repack-process-extrafiles libs-$(AB_CD)
	@echo "Done packaging $(L10N_XPI_PKGNAME).xpi"

clobber-%: AB_CD=$*
clobber-%:
	$(RM) -r $(L10N_TARGET)

repackage-zip-%:
	@echo "Already repackaged zip for $* in langpack step"

repack-stage:
	@echo "Repackaging $(XPI_PKGNAME) locale for Language $(AB_CD)"
	$(RM) -rf $(L10N_TARGET)
	cp -R $(XPI_STAGE_PATH)/$(XPI_NAME) $(L10N_TARGET)
	grep -v 'locale \w\+ en-US' $(L10N_TARGET)/chrome.manifest > $(L10N_TARGET)/chrome.manifest~ && \
	  mv $(L10N_TARGET)/chrome.manifest~ $(L10N_TARGET)/chrome.manifest
	find $(abspath $(L10N_TARGET)) -name '*en-US*' -print0 | xargs -0 rm -rf


# Actual locale packaging targets. If L10N_XPI_NAME is set, then use it.
# Otherwise keep the original XPI_NAME
# Overriding the final target is a bit of a hack for universal builds
# so that we can ensure we get the right xpi that gets repacked.
libs-%: FINAL_XPI_NAME=$(if $(L10N_XPI_NAME),$(L10N_XPI_NAME),$(XPI_NAME))
libs-%: FINAL_XPI_PKGNAME=$(if $(L10N_XPI_PKGNAME),$(L10N_XPI_PKGNAME),$(XPI_PKGNAME))
libs-%:
	$(MAKE) -C locales libs AB_CD=$* FINAL_TARGET=$(_ABS_DIST)/$(UNIVERSAL_PATH)xpi-stage/$(FINAL_XPI_NAME) \
	  XPI_NAME=$(FINAL_XPI_NAME) XPI_PKGNAME=$(FINAL_XPI_PKGNAME) USE_EXTENSION_MANIFEST=1
	$(MAKE) -C locales tools AB_CD=$* FINAL_TARGET=$(_ABS_DIST)/$(UNIVERSAL_PATH)xpi-stage/$(FINAL_XPI_NAME) \
	  XPI_NAME=$(FINAL_XPI_NAME) XPI_PKGNAME=$(FINAL_XPI_PKGNAME) USE_EXTENSION_MANIFEST=1

# The calling makefile might need to process some extra files. Provide an empty
# rule to overwrite
repack-process-extrafiles:

# When repackaging Lightning from the builder, platform.ini is not yet created.
# Recreate it from the app.ini bundled with the downloaded xpi.
$(DIST)/bin/platform.ini:
	mkdir -p $(@D)
	echo "[Build]" >> $(DIST)/bin/platform.ini
	echo "Milestone=$(call print_ltnconfig,Gecko,MaxVersion)" >> $(DIST)/bin/platform.ini
	echo "SourceStamp=$(call print_ltnconfig,Build,SourceStamp)" >> $(DIST)/bin/platform.ini
	echo "SourceRepository=$(call print_ltnconfig,Build,SourceRepository)" >> $(DIST)/bin/platform.ini
	echo "BuildID=$(call print_ltnconfig,App,BuildID)" >> $(DIST)/bin/platform.ini

recreate-platformini: $(DIST)/bin/platform.ini


# Lightning uses Thunderbird's build machinery, so we need to hack the post
# upload command to use Lightning's directories and version.
upload: upload-$(AB_CD)
upload-%: LTN_UPLOAD_CMD := $(patsubst $(THUNDERBIRD_VERSION)%,$(LIGHTNING_VERSION),$(subst thunderbird,calendar/lightning,$(POST_UPLOAD_CMD)))
upload-%: stage_upload
	POST_UPLOAD_CMD="$(LTN_UPLOAD_CMD)" \
	  $(PYTHON) $(MOZILLA_DIR)/build/upload.py --base-path $(DIST) \
	  --properties-file $(DIST)/$(XPI_NAME)_build_properties.json \
	  "$(DIST)/$(MOZ_PKG_PLATFORM)/$(XPI_PKGNAME).xpi"

stage_upload:
	$(NSINSTALL) -D $(DIST)/$(MOZ_PKG_PLATFORM)
	$(call install_cmd,$(IFLAGS1) $(XPI_STAGE_PATH)/$(XPI_PKGNAME).xpi $(DIST)/$(MOZ_PKG_PLATFORM))

ifdef XPI_INSTALL_EXTENSION
ifndef XPI_NAME
$(error XPI_NAME must be set for XPI_INSTALL_EXTENSION)
endif
tools::
	$(RM) -r '$(DIST)/bin$(DIST_SUBDIR:%=/%)/extensions/$(XPI_INSTALL_EXTENSION)'
	$(NSINSTALL) -D '$(DIST)/bin$(DIST_SUBDIR:%=/%)/extensions/$(XPI_INSTALL_EXTENSION)'
	$(call copy_dir,$(FINAL_TARGET),$(DIST)/bin$(DIST_SUBDIR:%=/%)/extensions/$(XPI_INSTALL_EXTENSION))

ifeq (cocoa,$(MOZ_WIDGET_TOOLKIT))
# If the macbundle dist dir was already created, sync the xpi here to avoid
# the need to make -C objdir/mail/app each time
tools::
	[ -d $(DIST)/$(MOZ_MACBUNDLE_NAME) ] && rsync -aL $(FINAL_TARGET)/ $(DIST)/$(MOZ_MACBUNDLE_NAME)/Contents/Resources/extensions/$(XPI_INSTALL_EXTENSION) || true
endif

endif
