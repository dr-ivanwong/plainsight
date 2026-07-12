// Snapshot for Data (spec §6): with StaticSite, the stack where unnoticed
// template churn is most dangerous. Review a changed snapshot as part of the
// diff; never regenerate it blindly.
import { testApp } from './util';
import { Template } from 'aws-cdk-lib/assertions';
import { expect, it } from 'vitest';
import { prod } from '../config/prod';
import { buildApp } from '../lib/app';

it('Data template matches the reviewed snapshot', () => {
  const app = testApp();
  const stacks = buildApp(app, prod);
  if (!stacks.data) throw new Error('prod must synthesise the Data stack');
  expect(Template.fromStack(stacks.data).toJSON()).toMatchSnapshot();
});
