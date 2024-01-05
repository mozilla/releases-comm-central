# Thunderbird Cross-channel

Thunderbird is localized with "cross-channel", a process developed for Firefox
to keep all localized strings in a single repository for all release channels.

The [Firefox Cross Channel](https://firefox-source-docs.mozilla.org/l10n/crosschannel/index.html)
documentation is a good reference, and this document will only discuss the
differences for Thunderbird.

## comm-l10n and comm-strings-quarantine

Firefox has "gecko-strings". Thunderbird has [comm-l10n](https://hg.mozilla.org/projects/comm-l10n).

Firefox has "gecko-strings-quarantine". Thunderbird has [comm-strings-quarantine](https://hg.mozilla.org/projects/comm-strings-quarantine/).

The cron job that updates comm-strings-quarantine runs on comm-central and uses
the same script as Firefox, with a slightly different configuration.

### quarantine-to-strings

After the string review, comm-l10n is updated with the latest commits to
comm-strings-quarantine. This is handled by a mach command, run twice:

```bash
mach tb-l10n-quarantine-to-strings --quarantine-path quarantine --comm-l10n-path comm-l10n clean prep migrate
mach tb-l10n-quarantine-to-strings --quarantine-path quarantine --comm-l10n-path comm-l10n push
```

As the quarantine repo does not have subdirectories for each locale, some
Mercurial magic is used to handle the path rewriting.

The last converted revision of comm-strings-quarantine is saved in an extra
metadata field in comm-l10n by `hg convert`. That revision's first child
is the next one to convert. A splicemap is written to splice it onto the tip of
comm-l10n. A filemap file is also used to rewrite the paths into `en-US`.

The resulting `hg convert` command looks like:

```bash
hg convert \
  --config convert.hg.saverev=True \
  --config convert.hg.sourcename=comm-strings-quarantine \
  --config convert.hg.revs=5ee85b7de10c0acb3281d2fa4ade3104833f313d:tip \
  --filemap /tmp/filemaps5axhbzd.txt \
  --splicemap /tmp/splicemaprr2tqrk2.txt \
  --datesort \
  /tmp/quarantine \
  /tmp/comm-l10n
```

Using Mercurial's extra metadata fields to save the commit information allows
for maintaining state information without needing a separate metadata file
stored somewhere.


## Monorepo

**comm-l10n** is a monorepo that includes the source (en-US) strings as well
as the target languages.


## L10n Repackaging during Release Promotion

As Thunderbird uses strings from Gecko Toolkit, it's necessary to pull those
strings from l10n-central and combine them with comm-l10n to produce a localized
build.

In automation, this is done in two steps. A `l10n-pre` job gets all of the strings
from all locales from the l10n-central repositories and comm-l10n and produces
a tar file, `strings_all.tar.xz`. The L10n repackage jobs use that file rather
than cloning from l10n-central. `strings_all.tar.xz` is also uploaded to the
FTP archive along with the source code tar file for use by downstream packagers.

For local development, `mach build installers-$AB_CD` and `./mach build langpack-$AB_CD`
will do the same combining of string sources as above in one step.

In both cases, the comm-l10n changset used is the one in `comm/mail/locales/l10n-changesets.json`
and the l10n-central revisions are taken from `browser/locales/l10n-changesets.json`.
