module.exports = {
  ...require('@spotify/prettier-config'),
  overrides: [
    {
      files: '*.md',
      options: {
        printWidth: 120,
        proseWrap: 'always',
      },
    },
  ],
};
