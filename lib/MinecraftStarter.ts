import * as cdk from '@aws-cdk/core';
import * as efs from '@aws-cdk/aws-efs';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambdapython from '@aws-cdk/aws-lambda-python';
import * as route53 from '@aws-cdk/aws-route53'
import * as cw from '@aws-cdk/aws-cloudwatch'
import * as iam from '@aws-cdk/aws-iam'
import * as ec2 from '@aws-cdk/aws-ec2'


interface MinecraftStarterProps {
    vpc: ec2.Vpc
    filesystem: efs.FileSystem,
    ecsControlPolicy: iam.Policy,
    ecsTaskRole: iam.Role,
    route53Zone: string
}
//https://github.com/doctorray117/minecraft-ondemand

export class MinecraftStarter extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, props: MinecraftStarterProps) {
        super(scope, id);
        
        const lambdaFn = new lambdapython.PythonFunction(this, "MinecraftLauncher", {
            code: lambda.Code.fromAsset("resources"),
            handler: "launcher.lambda_handler",
        })
        
        const hostedZone = route53.HostedZone.fromHostedZoneId(this, "HostedZone", props.route53Zone)
        
        
        lambdaFn.addToRolePolicy(props.ecsControlPolicy);
        
        
        const route53Policy = new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: ['arn:aws:route53:::hostedzone/' + props.route53Zone],
              actions: [
                  'route53:GetHostedZone',
                  'route53:ChangeResourceRecordSets',
                  'route53:ListResourceRecordSets'
              ]
            }),
            new iam.PolicyStatement({
                resources: ['*'],
                actions: ['route53:ListHostedZones'] 
            }),
          ],
        });
        
        lambdaFn.addToRolePolicy(route53Policy);
    }
}