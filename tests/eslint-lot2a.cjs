// Uses only the existing Next rules. --no-inline-config is needed because the
// repository contains TS rule directives without @typescript-eslint/eslint-plugin.
module.exports = { extends: [require.resolve('eslint-config-next/core-web-vitals')] };
