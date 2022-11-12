import {Construct} from "constructs";
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";

interface ServerStatusProps {
    ecsCluster: ecs.Cluster
}

export class ServerStatus extends Construct {
    constructor(scope: Construct, id: string, props: ServerStatusProps) {
        super(scope, id);

        // The code that defines your stack goes here
        const api = new apigateway.RestApi(this, 'minecraft-status', {
            description: 'Get ECS minecraft status',
            deployOptions: {
                stageName: 'dev',
            },
            // 👇 enable CORS
            defaultCorsPreflightOptions: {
                allowHeaders: [
                    'Content-Type',
                    'X-Amz-Date',
                    'Authorization',
                    'X-Api-Key',
                ],
                allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                allowCredentials: true,
                allowOrigins: ['*'],
            },
        });

        const getStatusLambda = new lambda.Function(this, 'get-status-lambda', {
            runtime: lambda.Runtime.NODEJS_16_X,
            handler: 'index.main',
            code: lambda.Code.fromAsset(path.join(__dirname, '/../src/get-status')),
        });

        const ecsPolicy = new iam.PolicyStatement({
            actions: ['ecs:ListTasks'],
            resources: ['*'],
        });

        getStatusLambda.role?.attachInlinePolicy(new iam.Policy(this, 'task-status', {
            statements: [ecsPolicy]
        }));

        const todos = api.root.addResource('status');

        todos.addMethod(
            'GET',
            new apigateway.LambdaIntegration(getStatusLambda, {proxy: true}),
        );

    }
}