# Building the Knowledge Base

Build a knowledge index from a folder of `.md`, `.mdx` or `.txt` files, from public pages, or both.
The key is read from `NROUTER_API_KEY`.

```bash
# From a docs folder; --base-docs-url is where those files are published (used for source links).
npx support-agent build-kb --docs ./docs --base-docs-url https://example.com/docs --out kb.json

# Adding public pages.
npx support-agent build-kb --docs ./docs --seed-url https://example.com/help --out kb.json
```

Rebuild whenever the docs change. The runnable example in `examples/quickstart/` builds its index
on first start instead; delete its `kb.json` to rebuild.

To reuse embeddings for unchanged content during a rebuild:

```bash
npx support-agent build-kb --docs ./docs --out kb.json --incremental
```
