module.exports = require('@backstage/cli/config/eslint-factory')(__dirname, {
  overrides: [
    {
      files: ['run.ts', 'standaloneServer.ts'],
      rules: {
        '@backstage/no-undeclared-imports': 'off',
      },
    },
  ],
});
