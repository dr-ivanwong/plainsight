// Snapshot for StaticSite only (spec §6): the stack where unnoticed template
// churn is most dangerous. Review a changed snapshot as part of the diff;
// never regenerate it blindly.
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { expect, it } from 'vitest';
import { prod } from '../config/prod';
import { buildApp } from '../lib/app';

it('StaticSite template matches the reviewed snapshot', () => {
  const app = new App();
  const stacks = buildApp(app, prod);
  expect(Template.fromStack(stacks.staticSite).toJSON()).toMatchSnapshot();
});
