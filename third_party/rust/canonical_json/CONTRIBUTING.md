# Contributing to Remote-Settings Client

When contributing to the development of Remote-Settings Client, create a new issue and make sure with the maintainers before
making a change that the change is really needed.

Please note we have a [Code of Conduct](CODE-OF-CONDUCT), please follow it in all
your interactions with the project.

# Table of contents
1. [Creating an issue](#Issues)
2. [Pull requests](#pull-request-process)
3. [Code of Conduct](CODE-OF-CONDUCT)

# Issues

There are many ways you can contribute to Remote-Settings Client, and all of them involve creating issues
in [Remote-Settings Github Project](https://github.com/Vishwa-Mozilla/Remote-Settings-Client/issues). This is the
entry point for your contribution.

To create an effective and high quality ticket, try to put the following information on your
issue:

 A detailed description of the issue or feature request
  - For issues, please add the necessary steps to reproduce the issue.
  - For feature requests, add a detailed description of your proposal and the motivation behind working on the feature.

---

# Project Board 
Keep your issue status updated [here](https://github.com/Vishwa-Mozilla/Remote-Settings-Client/projects/1)

# Pull Request Process

1. Ensure your code compiles. Run `cargo test` before creating the pull request.
2. If you're adding new external API, it must be properly documented. Run `cargo doc --open` to see crate documentation 
3. Create branches with format - "issue[issue#]_[short_description]"
4. Checklist before merging PR for a particular code change or feature
   - Unit Testing, CI tests passing
   - Documentation (Update README, crates.io)
   - Rust best practices followed
   - PR approval
5. While merging the PR, select "Squash and merge" option to avoid adding unnecessary commits from your branch to the main branch
