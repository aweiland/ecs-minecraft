// import * as cdk from '@aws-cdk/core';
// import * as efs from '@aws-cdk/aws-efs';
// import * as lambda from '@aws-cdk/aws-lambda';
// import * as lambdapython from '@aws-cdk/aws-lambda-python';
// // import * as logs from '@aws-cdk/aws-logs'
// import * as dest from '@aws-cdk/aws-logs-destinations'
// import * as iam from '@aws-cdk/aws-iam'
// import * as ec2 from '@aws-cdk/aws-ec2'
// import * as ecs from '@aws-cdk/aws-ecs'

import * as cdk from 'aws-cdk-lib';
import * as efs from "aws-cdk-lib/aws-efs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as dest from "aws-cdk-lib/aws-logs-destinations";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events"
import * as targets from "aws-cdk-lib/aws-events-targets"
import {Construct} from "constructs";
import {Lambda} from "aws-cdk-lib/aws-ses-actions";
import * as path from "path";



interface MinecraftStarterProps {
    vpc: ec2.Vpc
    filesystem: efs.FileSystem
    ecsControlStatment: iam.PolicyStatement
    route53LogGroup: string
    hostname: string
    ecsService: ecs.FargateService
    ecsTaskRole: iam.Role
    eip: ec2.CfnEIP
}
//https://github.com/doctorray117/minecraft-ondemand

export class MinecraftStarter extends Construct {

    constructor(scope: Construct, id: string, props: MinecraftStarterProps) {
        super(scope, id);

        const lambdaFn = new lambda.Function(this, "MinecraftLauncher", {
            runtime: lambda.Runtime.PYTHON_3_9,
            functionName: "MinecraftLauncher",
            handler: "launcher.lambda_handler",
            code: lambda.Code.fromAsset(path.join(__dirname, '../resources/launcher')),
            reservedConcurrentExecutions: 1,
            timeout: cdk.Duration.seconds(300),
            environment: {
                CLUSTER: props.ecsService.cluster.clusterName,
                SERVICE: props.ecsService.serviceName
            }
        })
        lambdaFn.addToRolePolicy(props.ecsControlStatment);

        const eipManager = new lambda.Function(this, "EIPManager", {
            runtime: lambda.Runtime.PYTHON_3_9,
            functionName: "MinecraftEipManager",
            handler: "eipmanager.lambda_handler",
            code: lambda.Code.fromAsset(path.join(__dirname, '../resources/eip')),
            reservedConcurrentExecutions: 1,
            timeout: cdk.Duration.seconds(300),
            environment: {
                CLUSTER: props.ecsService.cluster.clusterName,
                SERVICE: props.ecsService.serviceName,
                EIP: props.eip.getAtt('AllocationId').toString()
            },
        })

        const policy = new iam.PolicyStatement();
        policy.addAllResources();
        policy.addActions('ec2:AssociateAddress');
        eipManager.addToRolePolicy(policy);


        const event = new events.Rule(this, "ecs-cloudwatch", {
            eventPattern: {
                source: ["aws.ecs"],
                detailType: ["ECS Task State Change"],
                // detail: {
                //     desiredStatus: ["RUNNING"],
                //     lastStatus: ["RUNNING"]
                // }
            }
        })

        event.addTarget(new targets.LambdaFunction(eipManager));



        // const hostedZone = route53.HostedZone.fromHostedZoneId(this, "HostedZone", props.route53Zone)
        
        const logGroup = logs.LogGroup.fromLogGroupName(this, "MinecraftLogs", props.route53LogGroup);
        
        const subFilter = new logs.SubscriptionFilter(this, "MinecraftFilter", {
            destination: new dest.LambdaDestination(lambdaFn, { addPermissions: true }),
            logGroup: logGroup,
            filterPattern: logs.FilterPattern.literal(props.hostname)
        })
    }
}
