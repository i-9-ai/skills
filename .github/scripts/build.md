# Repository build

`npm run build` invokes `build.mjs` with Node.js 24+ and explicitly installed
locked development dependencies. The script resolves the repository relative
to its own location, type-checks source using the installed TypeScript compiler,
clears only its generated `dist/`, compiles the distribution and appends its
source receipt using the existing compiled runner. A failed command stops the
build. Type-check failure preserves the previous build; compilation failure can
leave a partial `dist/` that a subsequent successful build replaces.

```sh
npm run build
npm run package:check
```

`npm ci` and Git-source npm preparation call this build through the existing
`prepare` script. It does not publish or install into a consumer. The script is
repository tooling and is excluded from the compiled npm package. Packed
distribution tests exercise clean Git-source builds and installed CLI behavior.
