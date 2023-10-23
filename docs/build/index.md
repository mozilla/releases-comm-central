# Building Thunderbird

This document currently supplements [Building Thunderbird on DTN](https://developer.thunderbird.net/thunderbird-development/building-thunderbird).

## Additional Thunderbird configure flags

### OpenPGP support

Thunderbird's OpenPGP support is provided by [RNP](https://github.com/rnpgp/rnp).
There are several configure options that can be added to mozconfig to control
how it is built.

* --with-system-librnp

  Use system RNP (librnp) for OpenPGP support.

  This option will not build the librnp shared library at all. In order to
  provide OpenPGP support, librnp must be installed as a system package (RPM,
  DEB) and located where the dynamic loader will find it or copied separately
  into Thunderbird's application directory.

* --with-system-jsonc

  Use system JSON-C for librnp (located with pkgconfig)

  Build librnp from the in-tree sources, but link with a system-installed
  libjson-c. Build flags are determined with Pkg-config/pkgconf.

* --with-system-bz2[=prefix]

  Use system Bzip2 for librnp (pkgconfig/given prefix)

  Build librnp from in-tree sources, link with a system libbz2.
  This option does accept a prefix path (such as --with-system-bz2=/usr/local).
  (Bzip2 itself does not provide a pkgconfig file. Some Linux distributions
  include their own so the build system will look for one.)

* --with-system-zlib

  Link librnp to a system zlib. Pkgconfig only.

* --with-librnp-backend=(**botan**|openssl)

  **"openssl" is only supported when targeting Linux.**

  This option allows building librnp with the OpenSSL backend. When not provided,
  it defaults to "botan".

  When set to "openssl", OpenSSL will be located via Pkgconfig.

* --with-system-botan

  Link librnp to a system libbotan.

  Pkgconfig only. Note that it is not necessary to also set
  "--with-librnp-backend=botan".

* --with-openssl=prefix (Linux only)

  Used with "--with-librnp-backend=openssl" to use OpenSSL installed at "prefix"
  instead of one provided by Pkgconfig. Ex: --with-openssl=/usr/openssl-3

#### OpenSSL notes:

Only Linux targets are supported.

OpenSSL 1.1.1 and OpenSSL 3.0.x are supported. The version is checked during
configure as RNP has slightly different code paths for 3.x.

The OpenSSL backend has some limitations compared to Botan. The following
features are disabled:
TWOFISH, BRAINPOOL


## Branding

Thunderbird has multiple sets of “branding” that are used to hold channel-specific
things such as:
  * Logos and other iconography
  * Product names (eg: “Mozilla Thunderbird”, “Mozilla Thunderbird Beta”)
  * Channel-specific preferences (eg: app.update.interval)

Brandings are stored in the [branding subdirectory](https://searchfox.org/comm-central/source/mail/branding)
and map to builds as follows:

  - "thunderbird" is used for Release builds
  - "tb_beta" is used for Beta builds
  - "nightly" is used for Nightly and unofficial builds

When building with official branding[1], the appropriate branding directory
will be set automatically based on:

  - If `--enable-update-channel` is set to "release" or "beta", branding
    is set to "thunderbird" or "tb_beta" respectively.
  - If `--enable-update-channel` is unset (MOZ_UPDATE_CHANNEL="default"), branding
    is determined by the content of [version_display.txt](https://searchfox.org/comm-central/source/mail/config/version_display.txt).
    - If a "beta" version is found, based on the version ending in "b*n*", "tb_beta"
      branding is used.
    - If an "alpha" version is found, ending in "a*1*", "nightly" branding is used.
    - Otherwise "thunderbird" branding is used.
  - In the event the above does not work out, branding will default to "nightly".

### Verifying

To save some time, after running `mach configure`, view `config.status`, found in
the build objdir. "MOZ_BRANDING_DIRECTORY" will refer to the actual branding
directory being used, "MOZ_OFFICIAL_BRANDING" will be "1" if official branding
is being used, and "THUNDERBIRD_OFFICIAL_BRANDING" will be set to what configure
auto-detection found.

"THUNDERBIRD_OFFICIAL_BRANDING" is only used when the official branding build
flag is set[1].

[1] - This flag is intentionally undocumented due to trademark and distribution
requirements. See [the policy](https://www.mozilla.org/en-US/foundation/trademarks/distribution-policy/).
