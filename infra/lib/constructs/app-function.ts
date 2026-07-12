import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acknowledgeNagFinding } from '../nag';

/** Handler entries live in the api workspace; infra points at source and esbuild bundles at synth. */
const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
export const handlerEntry = (name: string): string =>
  path.join(REPO_ROOT, 'apps', 'api', 'src', 'handlers', `${name}.ts`);

/**
 * Local bundling shells out through the lock file's package manager
 * (`pnpm exec esbuild`), and this repository runs pnpm through corepack with
 * no global binary on PATH. Declaring pnpm and esbuild as infra
 * devDependencies puts both binaries in infra's bin directory; prepending it
 * to the bundling PATH makes synth self-contained under any invocation
 * (pnpm scripts, npx cdk, CI).
 */
const BUNDLING_PATH = [
  path.join(REPO_ROOT, 'infra', 'node_modules', '.bin'),
  process.env['PATH'] ?? '',
].join(path.delimiter);

export interface AppFunctionProps {
  /** Absolute path to the handler source; use handlerEntry(). */
  entry: string;
  description: string;
  /** Explicit on every function: a missing timeout is a rejected PR (spec §5). */
  timeout: Duration;
  /** 256 MB default for API functions (spec §5 sizing floor). */
  memorySize?: number;
  environment?: Record<string, string>;
  /** X-Ray, on for the ingestion path only (main plan §6). */
  tracing?: lambda.Tracing;
}

/**
 * The Lambda defaults, extracted on second use as spec §5 expected: Node 22,
 * ARM64, explicit timeout, 30-day log retention via an explicit log group
 * (the logRetention prop would create a custom-resource Lambda, which the
 * invariants forbid), and a hand-built execution role whose only grant is
 * writing to its own log group: least privilege without managed policies.
 */
export class AppFunction extends Construct {
  readonly fn: NodejsFunction;
  readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: AppFunctionProps) {
    super(scope, id);

    this.logGroup = new logs.LogGroup(this, 'Logs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for ${id}; log writes plus explicit grants only.`,
    });
    this.logGroup.grantWrite(role);

    this.fn = new NodejsFunction(this, 'Fn', {
      entry: props.entry,
      description: props.description,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: props.memorySize ?? 256,
      timeout: props.timeout,
      role,
      logGroup: this.logGroup,
      ...(props.environment === undefined ? {} : { environment: props.environment }),
      ...(props.tracing === undefined ? {} : { tracing: props.tracing }),
      depsLockFilePath: path.join(REPO_ROOT, 'pnpm-lock.yaml'),
      bundling: {
        // The runtime provides the AWS SDK; everything else (zod, the
        // workspace packages) bundles into the asset.
        minify: true,
        sourcesContent: false,
        target: 'node22',
        environment: { PATH: BUNDLING_PATH },
      },
    });

    acknowledgeNagFinding(
      this.fn,
      'AwsSolutions-L1',
      'Node 22 is the pinned repo-wide runtime (cdk spec §5: the active LTS; Lambdas, tooling, ' +
        'and the esbuild target all match it). Moving to a newer runtime is a deliberate ' +
        'cross-repo change made in one commit, not a per-function drift.',
    );
  }
}
