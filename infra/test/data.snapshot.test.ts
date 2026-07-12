// Snapshot for Data (spec §6): with StaticSite, the stack where unnoticed
// template churn is most dangerous. Review a changed snapshot as part of the
// diff; never regenerate it blindly. Prod keeps the Phase 2 feature flags off
// until the phase goes live, so the snapshot builds from a features-on copy
// of the prod config: the template pinned here is the one the flip deploys.
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { expect, it } from 'vitest';
import { prod } from '../config/prod';
import { buildApp } from '../lib/app';

it('Data template matches the reviewed snapshot', () => {
  const app = new App();
  const stacks = buildApp(app, {
    ...prod,
    features: { ...prod.features, api: true, ingestion: true },
  });
  if (!stacks.data) throw new Error('a features-on build must synthesise the Data stack');
  expect(Template.fromStack(stacks.data).toJSON()).toMatchSnapshot();
});
