# Mozilla Thunderbird Instructions

This directory contains the codebase for Mozilla Thunderbird, which is contained
in an additional repository that is checked out inside the Mozilla Firefox
codebase.

## Code Structure

- The Thunderbird code is contained in `comm/`. That is the primary
  code that these rules apply to.
- The Firefox code is contained in all of the other subdirectories of the
  parent folder.
- The AGENTS.md file in the parent folder contains guidance for working with
  both the Firefox and Thunderbird code bases. However, there are additional
  rules and exceptions for Thunderbird that are described in this file.
  When Firefox and Thunderbird guidance are at odds, prefer
  Thunderbird guidance.
- Completely ignore the 'suite' folder, unless work is specifically directed at
  it.

## Version Control

Both projects are separate Git repositories.

The Firefox repository was checked out to the parent folder and the Thunderbird
repository was checked out to comm/ folder inside of it. Almost all
modifications needed when working on Thunderbird will be in the comm/ directory.

To move files that are version controlled, use the `git mv` command to ensure
the metadata for the move is recorded in Git.

## Searching

- When searching for usage examples, favor newer Thunderbird files and recently
  updated patterns over older examples. This codebase contains both current and
  out-of-date approaches.
- To use `searchfox-cli` for the comm/ repository, use the `--repo comm-central`
  command line argument.
- Prefer ripgrep (`rg`) for text searching. If not installed, prompt the user to
  install it.

## Build System

Thunderbird uses the same `mach` build command as Firefox. To build the app,
when necessary:

- You must be in the parent folder
- Run either './mach build faster', or if that fails, './mach build'
- Run this in a subagent as a single task if possible

### Linting Code

To format source code appropriately for Thunderbird, use the `../mach commlint`
command as follows from the `comm` directory:

```
$ ../mach commlint [file paths...]
```

Do NOT include the 'comm' folder in the path.

Do NOT use `../mach lint`, as that will fail.

## Writing and Reviewing Front-end Code

Follow the guidance in the `thunderbird-frontend-guidelines` and
`writing-jsdocs` skills.

## Automated Tests

There are multiple kinds of tests:

* xpcshell tests, often referred to as unit tests, are implemented in
  JavaScript and do not have an application window. They are used to test
  components at lower levels.
* mochitests, often referred to as browser tests, are also implemented in
  JavaScript and allow scripting of UI actions such as opening windows,
  clicking on UI elements.

The testing framework is not any of the commonly used testing frameworks, so
it's important not to assume any particular testing or mocking framework is
available.

For writing, running, or reviewing frontend tests, use the
`thunderbird-frontend-testing-guidelines` skill.
