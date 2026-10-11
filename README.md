# AsciiDoc support for Visual Studio Code

[![Version](https://vsmarketplacebadges.dev/version-short/asciidoctor.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=asciidoctor.asciidoctor-vscode)
[![Installs](https://vsmarketplacebadges.dev/installs-short/asciidoctor.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=asciidoctor.asciidoctor-vscode)
[![Ratings](https://vsmarketplacebadges.dev/rating-short/asciidoctor.asciidoctor-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=asciidoctor.asciidoctor-vscode)
[![Project chat](https://img.shields.io/badge/zulip-join_chat-brightgreen.png)](https://chat.asciidoctor.org/)

An extension that provides live preview, syntax highlighting, and snippets for the AsciiDoc format using Asciidoctor.

![demo](images/demo.gif)

## Install

Launch Visual Studio Code "Quick Open" (`Ctrl+P`), paste the following command, and press `Enter`:

```
ext install asciidoctor.asciidoctor-vscode
```

Alternatively, use the built-in extension browser to find the _AsciiDoc_ extension by _asciidoctor_ and install it.

## Documentation

The full documentation lives at [docs.asciidoctor.org/vscode-extension](https://docs.asciidoctor.org/vscode-extension/).

In the preview, Ctrl+Click (or Cmd+Click on macOS) a link to another AsciiDoc
document to open its preview in a separate tab in the same editor group. The
linked preview is locked to its document, and the original preview stays open.
Links containing an anchor scroll to that section. An ordinary click continues
to follow the `asciidoc.preview.openLinksToAsciidocFiles` setting.

## Issues

Found a bug or have a question? Please check the [existing issues](https://github.com/asciidoctor/asciidoctor-vscode/issues) first, then open a new one. See [Get help](https://docs.asciidoctor.org/vscode-extension/get-help/) for what to include.

## Contributing

Contributions are welcome. See [Contributing](https://docs.asciidoctor.org/vscode-extension/contributing/) to get started.
