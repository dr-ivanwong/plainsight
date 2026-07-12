import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { EnvConfig } from '../../config/types';
import { acknowledgeNagFinding } from '../nag';
import { AppFunction, handlerEntry } from '../constructs/app-function';

/** ~10 rps steady, 20 burst (backend spec §2): the throttles are the WAF and the scraper cost-cap (spec §8 not-list). */
export const ROUTE_RATE_LIMIT = 10;
export const ROUTE_BURST_LIMIT = 20;

export interface ApiStackProps extends StackProps {
  config: EnvConfig;
  table: dynamodb.ITable;
}

/**
 * Api (spec §3, Phase 2): the HTTP API and the read Lambdas. Stateless by
 * construction: it can be torn down and redeployed without touching the Data
 * stack, which is the point of the decomposition (spec §1.1). Everything
 * here is an optional enhancement; its total failure leaves the client fully
 * functional offline (the binding constraint).
 */
export class ApiStack extends Stack {
  readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { config, table } = props;

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `plainsight-${config.envName}-api`,
      description: 'The Plainsight read API (backend spec §2 route table).',
      createDefaultStage: false,
    });

    // Access logs on, structured, with the redaction rule built into the
    // format: request id, route, status, latency; never payloads, tokens, or
    // headers (backend spec §11).
    const accessLogs = new logs.LogGroup(this, 'AccessLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    new apigwv2.HttpStage(this, 'DefaultStage', {
      httpApi: this.httpApi,
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: ROUTE_RATE_LIMIT, burstLimit: ROUTE_BURST_LIMIT },
      accessLogSettings: {
        destination: new apigwv2.LogGroupLogDestination(accessLogs),
        format: apigateway.AccessLogFormat.custom(
          JSON.stringify({
            requestId: '$context.requestId',
            routeKey: '$context.routeKey',
            status: '$context.status',
            latencyMs: '$context.responseLatency',
            error: '$context.error.messageString',
          }),
        ),
      },
    });

    const environment = { TABLE_NAME: table.tableName };

    const profile = new AppFunction(this, 'GetProfile', {
      entry: handlerEntry('getProfile'),
      description: 'GET /v1/companies/{ticker}: the company profile (backend spec §2).',
      timeout: Duration.seconds(10),
      environment,
    });
    const financials = new AppFunction(this, 'GetFinancials', {
      entry: handlerEntry('getFinancials'),
      description:
        'GET /v1/companies/{ticker}/financials: standardised annual statements plus gaps; 202 ingesting on cold tickers (backend spec §2, §5).',
      timeout: Duration.seconds(10),
      environment,
    });

    // The read path reads; the ingestion path owns every write. Scoped by
    // hand rather than grantReadData: these handlers only ever GetItem and
    // Query the table itself (no index, no Scan), and the key-prefix
    // condition pins them to ticker partitions (spec §6: single-table access
    // scoped by key-prefix conditions where sensible). The invariant suite
    // asserts no write action can slip in.
    const readTickerPartitions = new iam.PolicyStatement({
      sid: 'ReadTickerPartitions',
      actions: ['dynamodb:GetItem', 'dynamodb:Query'],
      resources: [table.tableArn],
      conditions: {
        'ForAllValues:StringLike': { 'dynamodb:LeadingKeys': ['TICKER#*'] },
      },
    });
    profile.fn.addToRolePolicy(readTickerPartitions);
    financials.fn.addToRolePolicy(readTickerPartitions);

    this.httpApi.addRoutes({
      path: '/v1/companies/{ticker}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ProfileIntegration', profile.fn),
    });
    this.httpApi.addRoutes({
      path: '/v1/companies/{ticker}/financials',
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('FinancialsIntegration', financials.fn),
    });

    // The Phase 2 read routes are deliberately unauthenticated: they serve
    // public filings data, throttled, behind the edge cache; the routes the
    // backend spec flags auth arrive in Phase 3 with the Cognito authoriser
    // (pinned by the route invariant).
    acknowledgeNagFinding(
      this.httpApi,
      'AwsSolutions-APIG4',
      'Read routes serve public EDGAR-derived data by design (backend spec §2 route table: no ' +
        'auth flag on the read path); abuse is bounded by the stage throttles and the budget ' +
        'kill switch (cdk spec §8). Authenticated routes arrive in Phase 3 with Cognito.',
    );

    new CfnOutput(this, 'ApiEndpoint', {
      value: this.httpApi.apiEndpoint,
      description: 'Invoke URL of the read API; CloudFront fronts it from the edge-cache slice on.',
    });
  }
}
