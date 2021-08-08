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

## Checking cross-references

Go over any cross-reference that is broken, or whose link text does not match the target title, and
decide what to do in an interactive prompt.

```sh
dita-check-references
  --fix-document-not-found
  --fix-element-not-found
  --fix-text-not-match
  --fix-all

dita-check-references --fix-document-not-in-map my-ditamap.xml
```
