# DITA refactor tool

A command-line interface for some common refactorings on a DITA XML set.

## Moving files

Moves the file, and fixes inbound cross-references (`@href` and `@conref`) to any child element, and any outbound cross-
references.

```sh
dita-move docs/some/topic.xml docs/another/location.xml
```
