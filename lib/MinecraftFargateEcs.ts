import * as cdk from '@aws-cdk/core';
import * as efs from '@aws-cdk/aws-efs';
import * as ecs from '@aws-cdk/aws-ecs'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as iam from '@aws-cdk/aws-iam'
import * as logs from '@aws-cdk/aws-logs'


interface MinecraftFargateEcsProps {
    vpc: ec2.Vpc
    filesystem: efs.FileSystem
    accessPoint: efs.AccessPoint
    hostname: string
    image?: string
    cpu?: number
    memory?: number
    route53Zone: string
}


interface LimitConversion {
    cpu: number
    memory: number
}

export class MinecraftFargateEcs extends cdk.Construct {

    public readonly service: ecs.FargateService;
    public readonly ecsControlStatement: iam.PolicyStatement
    public readonly ecsTaskRole: iam.Role;
    
    constructor(scope: cdk.Construct, id: string, props: MinecraftFargateEcsProps) {
        super(scope, id);

        const image = props.image || "itzg/minecraft-bedrock-server";
        
        const {cpu, memory} = this.convertLimits(props.cpu || 1, props.memory || 2);

        const efsAccessPolicy = new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: [props.filesystem.fileSystemArn],
              actions: [
                  'elasticfilesystem:ClientMount',
                  'elasticfilesystem:ClientWrite',
                  'elasticfilesystem:DescribeFileSystems'
              ],
            //   conditions: {
            //       StringEquals: {
            //           "elasticfilesystem:AccessPointArn": props.accessPoint.accessPointArn
            //       }
            //   }
            }),
          ],
        });

        this.ecsTaskRole = new iam.Role(this, "EcsTaskRole", {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            inlinePolicies: {
                EFSAccess: efsAccessPolicy
            }
        })
        
        const executionRole = new iam.Role(this, "EcsExecutionRole", {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess')
            ]
        });
        
        
        const cluster = new ecs.Cluster(this, "MinecraftCluster", {
            vpc: props.vpc,
            clusterName: 'minecraft',
            enableFargateCapacityProviders: true
        });


        const task = new ecs.FargateTaskDefinition(this, "MinecraftTask", {
            memoryLimitMiB: memory,
            cpu,
            taskRole: this.ecsTaskRole,
            executionRole,
        });

        const volumeConfig: ecs.Volume = {
            name: "data",
            efsVolumeConfiguration:{
                fileSystemId: props.filesystem.fileSystemId,
                rootDirectory: "/",
                transitEncryption: 'ENABLED',
                authorizationConfig: {
                    accessPointId: props.accessPoint.accessPointId,
                    iam: 'ENABLED'
                }
            }
        };

        task.addVolume(volumeConfig);


        const logGroup = new logs.LogGroup(this, "MinecraftLogs", {
            logGroupName: '/minecraft/ecs'
        });

        const container = task.addContainer("MinecraftContainer", {
            image: ecs.ContainerImage.fromRegistry(image),
            essential: false,
            environment: {
                EULA: 'TRUE'
            },
            logging: ecs.LogDriver.awsLogs({
                streamPrefix: 'minecraft-server',
                logGroup
            })
        });

        container.addPortMappings({ containerPort: 25565 });
        container.addMountPoints({ containerPath: '/data', sourceVolume: volumeConfig.name, readOnly: false });


        const watchdog = task.addContainer("Watchdog", {
            image: ecs.ContainerImage.fromRegistry("doctorray/minecraft-ecsfargate-watchdog"),
            essential: true,
            environment: {
                CLUSTER: cluster.clusterName,
                SERVICE: 'minecraft-server',
                DNSZONE: props.route53Zone,
                SERVERNAME: props.hostname,
                STARTUPMIN: '10',
                SHUTDOWNMIN: '20'
            },
            logging: ecs.LogDriver.awsLogs({
                streamPrefix: 'minecraft-watchdog',
                logGroup
            })
        });


        this.service = new ecs.FargateService(this, "MinecraftService", {
            serviceName: 'minecraft-server',
            desiredCount: 0,
            vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
            assignPublicIp: true,
            cluster: cluster,
            taskDefinition: task,
            capacityProviderStrategies: [
                {capacityProvider: 'FARGATE_SPOT', base: 1, weight: 1}
            ]
        });

        const {account, region } = cdk.Stack.of(this)
        // Reusable control statement for the ECS service
        this.ecsControlStatement = new iam.PolicyStatement({
            resources: [
                    // this.service.serviceArn,
                    // task.taskDefinitionArn + '/*'
                `arn:aws:ecs:${region}:${account}:service/minecraft/minecraft-server`,
                `arn:aws:ecs:${region}:${account}:task/minecraft/*`
            ],
            actions: [ 'ecs:*']
        });

        const ifaceStatement = new iam.PolicyStatement({
            resources: ['*'],
            actions: ['ec2:DescribeNetworkInterfaces']
        });

        const ecsControlPolicy = new iam.Policy(this, "EcsControl");
        ecsControlPolicy.addStatements(this.ecsControlStatement, ifaceStatement)

        this.ecsTaskRole.attachInlinePolicy(ecsControlPolicy);
        logGroup.grantWrite(this.ecsTaskRole);

        // Allow service to access EFS
        props.filesystem.connections.allowFrom(this.service, ec2.Port.tcp(2049));

        this.service.connections.allowFromAnyIpv4(ec2.Port.tcp(25565));
        
        // Route 53
        const route53Policy1 = new iam.PolicyStatement({
              resources: ['arn:aws:route53:::hostedzone/' + props.route53Zone],
              actions: [
                  'route53:GetHostedZone',
                  'route53:ChangeResourceRecordSets',
                  'route53:ListResourceRecordSets'
              ]
            });
        const route53Policy2 = new iam.PolicyStatement({
                resources: ['*'],
                actions: ['route53:ListHostedZones']
            });

        const policy = new iam.Policy(this, "Route53Policy", {
            statements: [route53Policy1, route53Policy2]
        })
        
        this.ecsTaskRole.attachInlinePolicy(policy);
    }
    
    
    convertLimits(cpu: number, memory: number): LimitConversion {
        const converted = {
            cpu: cpu * 1024,
            memory: memory * 1024
        };
        
        return converted;
    }
    
    
}
