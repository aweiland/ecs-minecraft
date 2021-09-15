import * as cdk from '@aws-cdk/core';
import * as efs from '@aws-cdk/aws-efs';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambdapython from '@aws-cdk/aws-lambda-python';
import * as route53 from '@aws-cdk/aws-route53'
import * as cw from '@aws-cdk/aws-cloudwatch'
import * as logs from '@aws-cdk/aws-logs'
import * as dest from '@aws-cdk/aws-logs-destinations'
import * as iam from '@aws-cdk/aws-iam'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as ecs from '@aws-cdk/aws-ecs'


interface MinecraftStarterProps {
    vpc: ec2.Vpc
    filesystem: efs.FileSystem
    ecsControlStatment: iam.PolicyStatement
    route53LogGroup: string
    hostname: string
    ecsService: ecs.FargateService
    ecsTaskRole: iam.Role
}
//https://github.com/doctorray117/minecraft-ondemand

export class MinecraftStarter extends cdk.Construct {
    
    
    constructor(scope: cdk.Construct, id: string, props: MinecraftStarterProps) {
        super(scope, id);

        const lambdaFn = new lambdapython.PythonFunction(this, "MinecraftLauncher", {
            // code: lambda.Code.fromAsset("resources"),
            entry: "resources",
            handler: "lambda_handler",
            index: 'launcher.py',
            environment: {
                CLUSTER: props.ecsService.cluster.clusterName,
                SERVICE: props.ecsService.serviceName
            }

        })
        lambdaFn.addToRolePolicy(props.ecsControlStatment);

        // const hostedZone = route53.HostedZone.fromHostedZoneId(this, "HostedZone", props.route53Zone)
        
        const logGroup = logs.LogGroup.fromLogGroupName(this, "MinecraftLogs", props.route53LogGroup);
        
        const subFilter = new logs.SubscriptionFilter(this, "MinecraftFilter", {
            destination: new dest.LambdaDestination(lambdaFn, { addPermissions: true }),
            logGroup: logGroup,
            filterPattern: logs.FilterPattern.literal(props.hostname)
        })
    }
}
