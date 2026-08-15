# Docs Page Spec

## Purpose

The Docs page should make SpaceMountain understandable without leaving the app and should expose the same public documentation in a portable raw format.

## Requirements

- Sidebar navigation from `docs/docs-nav.json`
- Markdown rendering
- Search/filter
- Mermaid diagram support
- Code block styling
- Copy code button
- Breadcrumbs
- Mobile-friendly layout
- A complete raw Markdown bundle generated from `docs/docs-nav.json`
- A visible **Download All (.md)** action that saves the generated bundle as `SPMT-DOCS.md`
- Bundle generation must fail on missing, unsafe, archived, or path-traversing manifest entries instead of silently omitting documents
- The generated bundle is an output only; source Markdown files remain authoritative

## Nice To Have

- Version selector
- Last updated metadata
- Feedback button
- Related docs links
- Live API examples
