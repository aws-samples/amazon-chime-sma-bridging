const { awscdk } = require('projen');
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.41.0',
  defaultReleaseBranch: 'main',
  name: 'amazon-chime-sma-bridging',
  deps: ['fs-extra', '@types/fs-extra'],
  appEntrypoint: 'amazon-chime-sma-bridging.ts',
  deps: ['cdk-amazon-chime-resources'],
  autoApproveOptions: {
    secret: 'GITHUB_TOKEN',
    allowedUsernames: ['schuettc'],
  },
  depsUpgradeOptions: {
    ignoreProjen: false,
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
    },
  },
  scripts: {
    launch:
      'yarn && yarn projen && yarn build && yarn cdk bootstrap && yarn cdk deploy',
  },
});

const common_exclude = [
  'cdk.out',
  'cdk.context.json',
  'yarn-error.log',
  'dependabot.yml',
  '*.drawio',
  '.DS_Store',
  '.vscode',
];

project.gitignore.exclude(...common_exclude);
project.synth();
