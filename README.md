# Thunderbird
Thunderbird is a powerful and customizable open source email client with many users. It is based on the same platform that Firefox uses.

## Getting Started
This README will try and give you the basics that you need to get started, more comprehensive documentation is available on the [Thunderbird Developer Website](https://developer.thunderbird.net).

We also have documentation from this repository in a rendered version at [Thunderbird Source Tree Documentation](https://source-docs.thunderbird.net/en/latest/).

### Mozilla Code Base
Thunderbird is built on the Mozilla platform, the same base that Firefox is built from. As such, the two projects share a lot of code and much of the documentation for one will apply to the other.

In order to be able to build Thunderbird - you will need the mozilla-central repository as well as the comm-central repository (where this README lives). Check out our [Getting Started documentation](https://developer.thunderbird.net/thunderbird-development/getting-started) for instructions on how and where to get the source code.

### mozilla-central vs. comm-central
The mozilla-central repository contains the Firefox codebase and all of the platform code. The comm-central repository is added as a subdirectory "comm/" under mozilla-central. This contains the code for Thunderbird.

## Building Thunderbird
Follow the [Building Thunderbird guide](https://developer.thunderbird.net/thunderbird-development/building-thunderbird) to get set up and build Thunderbird.

## Contributing

### Getting Plugged into the Community
We have a complete listing of the ways in which you can get involved with Thunderbird [on our website](https://thunderbird.net/participate). Below are some quick references from that page that you can use if you are looking to contribute to Thunderbird core right away.

#### Mailing Lists
If you want to participate in discussions about Thunderbird development, there are two main mailing lists you want to join.

1. [**Thunderbird Planning**](https://thunderbird.topicbox.com/groups/planning)**:** This moderated mailing list is for higher level topics like: the future of Thunderbird, potential features, and changes that you would like to see happen. It is also used to discuss a variety of broader issues around community and governance of the project.
2. [**Thunderbird Developers**](https://thunderbird.topicbox.com/groups/developers)**:** A moderated mailing list for discussing engineering plans for Thunderbird. It is a place where you can raise questions and ideas for core Thunderbird development.

#### Matrix Chat
If you want to ask questions about how to hack on Thunderbird, the Matrix room you want to join is [\#maildev:mozilla.org](https://matrix.to/#/#maildev:mozilla.org?web-instance%5Belement.io%5D=chat.mozilla.org).

### Report a Bug and Request Features
Thunderbird uses [Bugzilla](https://bugzilla.mozilla.org/enter_bug.cgi?product=Thunderbird) for reporting and tracking bugs. If you want to become a contributor to Thunderbird, you will need an account on Bugzilla.

Feature requests should be submitted to [Mozilla Connect](https://connect.mozilla.org/).

### Fixing a Bug and Submitting Patches
See [Fixing a Bug in the developer documentation](https://developer.thunderbird.net/thunderbird-development/fixing-a-bug).
