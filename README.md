# Thunderbird
Thunderbird is a powerful and customizable open source email client with lots of users. It is based on the same platform that Firefox uses.

## Getting Started
This README will try and give you the basics that you need to get started, more comprehensive documentation is available on the [Thunderbird Developer Website](https://developer.thunderbird.net).

### Mozilla Code Base
Thunderbird is built on the Mozilla platform, the same base that Firefox is built from. As such the two projects share a lot of code and much of the documentation for one will apply, in many ways, to the other.

In order to be able to build Thunderbird - you will need the mozilla-central repository as well as the comm-central repository (where this README lives). Check out our [Getting Started documentation](https://developer.thunderbird.net/thunderbird-development/getting-started) for instructions on how and where to get the source code.

### mozilla-central vs. comm-central

The mozilla-central repostitory contains the Firefox codebase and all of the platform code. The comm-central repository is added as a subdirectory "comm/" under mozilla-central. This contains the code for Thunderbird.

## Building Thunderbird

### Build Prerequisites

This README assumes that you already have the prerequisite software required to build Thunderbird. If you have not already done so, please complete the instructions for your operating system and then continue following this guide:

- [Windows Build Prerequisites](https://developer.thunderbird.net/thunderbird-development/building-thunderbird/windows-build-prerequisites)
- [Linux Build Prerequisites](https://developer.thunderbird.net/thunderbird-development/building-thunderbird/linux-build-prerequisites)
- [macOS Build Prerequisites](https://developer.thunderbird.net/thunderbird-development/building-thunderbird/macos-build-prerequisites)

### Build Configuration

To build Thunderbird, you need to create a file named `mozconfig` (can also be `.mozconfig`) to the root directory of the mozilla-central checkout that contains the option `comm/mail` enabled. You can create a file with this line by doing this in the root source directory:

```text
echo 'ac_add_options --enable-project=comm/mail' > mozconfig
```

**If you omit this line, the build system will build Firefox instead**. Other build configuration options can be added to this file, although it's **strongly recommended** that you only use options that you fully understand. For example, to create a debug build instead of a release build, that file would also contain the line:

```text
ac_add_options --enable-debug
```

_Each of these ac\_add\_options entries needs to be on its own line._

For more on configuration options, see the page [Configuring build options](https://developer.mozilla.org/en/Configuring_Build_Options). Note that if you use an MOZ\_OBJDIR it cannot be a sibling folder to the root source directory. Use an absolute path to be sure!

### Building

**Before you start**, make sure that the version you checked out is not busted. For `hg` tip, you should see green Bs on [https://treeherder.mozilla.org/\#/jobs?repo=comm-central](https://treeherder.mozilla.org/#/jobs?repo=comm-central)

To start the build, cd into the root source directory, and run:

```text
./mach build
```

mach is our command-line tool to streamline common developer tasks. See the [mach](https://developer.mozilla.org/en-US/docs/Mozilla/Developer_guide/mach) article for more.

Building can take a significant amount of time, depending on your system, OS, and chosen build options. Linux builds on a fast box may take under _15 minutes_, but Windows builds on a slow box may take _several hours_.

### Make Your Build Faster

Follow this guide to rely on `ccache` and other [Tips for making builds faster](../getting-started.md).

## Running Thunderbird

To run your build, you can use:

```text
./mach run
```

There are various command line parameters you can add, e.g. to specify a profile, such as: -no-remote -P testing --purgecaches

Various temporary files, libraries, and the Thunderbird executable will be found in your object directory \(under `comm-central/`\), which is prefixed with `obj-`. The exact name depends on your system and OS. For example, a Mac user may get an object directory name of `obj-x86_64-apple-darwin10.7.3/`.

The Thunderbird executable in particular, and its dependencies are located under the `dist/bin` folder under the object directory. To run the executable from your `comm-central` working directory:

* Windows: `obj-.../dist/bin/thunderbird.exe`
* Linux: `obj-.../dist/bin/thunderbird`
* macOS: `obj-.../dist/Daily.app/Contents/MacOS/thunderbird`

## Update and Build Again

To pull down the latest changes, in the mozilla directory run the following commands:

```text
hg pull -u
cd comm
hg pull -u
cd ..
```

or to do it via one command:

```text
hg pull -u && cd comm && hg pull -u
```

The just run the `./mach build` command detailed in the [Building](./#building)instructions above. This will only recompile files that changed, but it may still take a long time.

## Rebuilding

To build after changes you can simply run:

```text
./mach build
```

### Rebuilding Specific Parts

If you have made many changes, but only want to rebuild specific parts, you may run the following commands.

#### C or C++ Files:

```text
./mach build binaries
```

#### JavaScript or XUL Files \(Windows Only\):

```text
./mach build path/to/dir
```


Replace `path/to/dir` with the directory with the files changed.

This is the tricky bit since you need to specify the directory that installs the files, which may be a parent directory of the changed file's directory. For example, to just rebuild the Lightning calendar extension:

```text
./mach build comm/calendar/lightning
```


## Contributing

### Getting Plugged into the Community

We have a complete listing of the ways in which you can get involved with Thunderbird [on our website](https://thunderbird.net/participate). Below are some quick references from that page that you can use if you are looking to contribute to Thunderbird core right away.

#### Mailing Lists

If you want to participate in discussions about Thunderbird development, there are two main mailing lists you want to join.

1. [**TB-Planning**](https://wiki.mozilla.org/Thunderbird/tb-planning)**:** This mailing list is higher level topics like: the future of Thunderbird, potential features, and changes that you would like to see happen. It is also used to discuss a variety of broader issues around community and governance of the project.
2. [**Maildev**](http://lists.thunderbird.net/mailman/listinfo/maildev_lists.thunderbird.net)**:** A moderated mailing list for discussing engineering plans for Thunderbird. It is a place where you can raise questions and ideas for core Thunderbird development.

#### IRC

If you want to ask questions about how to hack on Thunderbird, the IRC channel you want to join is [\#maildev on irc.mozilla.org](irc://irc.mozilla.org/maildev).

### Report a Bug and Request Features

### [Bugzilla](https://bugzilla.mozilla.org/enter_bug.cgi?product=Thunderbird)

Thunderbird uses bugzilla for reporting and tracking bugs as well as enhancement requests. If you want to become a contributor to Thunderbird, you will need an account on Bugzilla.

### Fixing a Bug and Submitting Patches

All the issues, bugs, work in progress patches, or updates related to Thunderbird, are listed on Bugzilla and are properly organized per **Product**, **Component**, and **Status**. For instance you can see how they are listed by looking at [recent bugs for Thunderbird](https://bugzilla.mozilla.org/buglist.cgi?query_format=advanced&product=Thunderbird&bug_status=UNCONFIRMED&bug_severity=blocker&bug_severity=critical&bug_severity=major&bug_severity=normal&bug_severity=minor&bug_severity=trivial&chfieldfrom=-30d&chfield=%5BBug%20creation%5D&list_id=14706087).

#### Create a Bugzilla account

Creating an account is necessary in order to submit patches, leave comments, and interact with any other aspect of Bugzilla. If you're currently using an `IRC` username in the `#maildev` channel, we recommend saving your profile name with the current format `Firstname Lastname (:username)` in order to be easily searchable and allow the Thunderbird team to offer better support.

#### Find a Bug

Use the [Advanced Search](https://bugzilla.mozilla.org/query.cgi?format=advanced) section to find bugs you want to take care of, and be sure that the bug doesn't currently have any user listed as _Assignee_ and the _Status_ is set to `NEW`. You can see a list of "easy" bugs for beginners [via this query](https://bugzilla.mozilla.org/buglist.cgi?bug_status=NEW&classification=Client%20Software&classification=Developer%20Infrastructure&classification=Components&classification=Server%20Software&classification=Other&f1=status_whiteboard&o1=allwordssubstr&product=Calendar&product=Chat%20Core&product=MailNews%20Core&product=Thunderbird&resolution=---&v1=good%20first%20bug&list_id=14884036). However, we assume you came here to fix your "pet hate" bug, so you already likely have a bug to work with.

#### Search for Code References

Making sense of the **Thunderbird** source code, and knowing where to look, will take some time. The code base is pretty big and if you never worked with `XBL` or `Custom Elements` it can be overwhelming at first. We recommend using our code search engine, [Searchfox](https://searchfox.org/comm-central/source/), to inspect the source code and find snippets and references to help you out while investigating a bug.

#### Mercurial Workflow

Mercurial is pretty flexible in terms of allowing you to write your own code and keep it separate from the main code base. You can use Mercurial Bookmarks or Mercurial Queues for managing your work. We have guides created for [bookmarks](https://developer.thunderbird.net/contributing/fixing-a-bug/using-mercurial-bookmarks) and [queues](https://developer.thunderbird.net/contributing/fixing-a-bug/using-mercurial-queues) on our developer website. While some find Mercurial Queues easier to work with, support for them is being deprecated in various Mozilla tools.

Once you finished taking care of your favorite bug and using Mercurial to commit and export your patch, you can upload it to Bugzilla for review.

#### Upload a Patch

Open your patch file in your code editor and be sure it includes all your code changes, and your name and commit message at the top. You can see an example of a patch for this [README here](https://bug1547325.bmoattachments.org/attachment.cgi?id=9093146).

If everything looks good, you can access the selected bug in Bugzilla and click on the **Attach File** link located above the first comment.

#### Ask for a Review

When uploading a patch to Bugzilla, you can request a review from the user who opened the bug or another developer. Simply select the `?` in the dropdown selector in the _review_ option of the **Flags** section. An input field will appear which will allow you to type the name or username of the user you want to review your patch. You can see an example of [a patch on Bugzilla here](https://bugzilla.mozilla.org/show_bug.cgi?id=1547325#c1).
