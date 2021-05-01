# DITA refactor tool

**A command-line interface for some common refactorings on a DITA XML set.**

Focuses on `@href` and `@conref` references. Assumes all cross-references are relative file URLs.
Does not have much schema awareness or respect DITA inheritance. Does not prettify XML.

## Moving files

Moves the file, and fixes inbound cross-references to any child element, and any outbound
cross-references.

```sh
dita-move docs/some/topic.xml docs/another/location.xml
```
