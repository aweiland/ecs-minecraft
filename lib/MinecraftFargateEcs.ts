import * as cdk from '@aws-cdk/core';
import * as efs from '@aws-cdk/aws-efs';
import * as ecs from '@aws-cdk/aws-ecs'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as iam from '@aws-cdk/aws-iam'


interface MinecraftFargateEcsProps {
    vpc: ec2.Vpc
    filesystem: efs.FileSystem
    accessPoint: efs.AccessPoint
    hostname: string
}


export class MinecraftFargateEcs extends cdk.Construct {

    public readonly service: ecs.FargateService;
    public readonly ecsControlPolicy: iam.Policy;
    public readonly ecsTaskRole: iam.Role;

    constructor(scope: cdk.Construct, id: string, props: MinecraftFargateEcsProps) {
        super(scope, id);

        const image = "itzg/minecraft-bedrock-server";

        const efsAccessPolicy = new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: [props.filesystem.fileSystemArn],
              actions: [
                  'elasticfilesystem:ClientMount',
                  'elasticfilesystem:ClientWrite',
                  'elasticfilesystem:DescribeFileSystems'
              ],
              conditions: {
                  StringEquals: {
                      "elasticfilesystem:AccessPointArn": props.accessPoint.accessPointArn
                  }
              }
            }),
          ],
        });

        this.ecsTaskRole = new iam.Role(this, "EcsTaskRole", {
            assumedBy: new iam.ServicePrincipal('ecs.amazonaws.com'),
            inlinePolicies: {
                EFSAccess: efsAccessPolicy
            }
        })



        const task = new ecs.FargateTaskDefinition(this, "MinecraftTask", {
            memoryLimitMiB: 2000,
            cpu: 1,
            taskRole: this.ecsTaskRole
        });

        const volumeConfig = {
            name: "data",
            efsVolumeConfiguration:{
                fileSystemId: props.filesystem.fileSystemId,
                rootDirectory: "/minecraft"
            }
        };

        task.addVolume(volumeConfig);


        const cluster = new ecs.Cluster(this, "MinecraftCluster", {
            vpc: props.vpc
        });


        const container = task.addContainer("MinecraftContainer", {
            image: ecs.ContainerImage.fromRegistry(image),
            essential: false,
            environment: {
                EULA: 'TRUE'
            }
        });

        container.addPortMappings({containerPort: 25565});
        container.addMountPoints({ containerPath: '/data', sourceVolume: volumeConfig.name, readOnly: false });


        const watchdog = task.addContainer("Watchdog", {
            image: ecs.ContainerImage.fromRegistry("doctorray/minecraft-ecsfargate-watchdog"),
            essential: true,
            environment: {
                CLUSTER: 'minecraft',
                SERVICE: 'minecraft-server',
                DNSZONE: 'ROUTE53ZONEHERE',
                SERVERNAME: props.hostname,
            }
        });


        this.service = new ecs.FargateService(this, "MinecraftService", {
            serviceName: 'minecraft-server',
            desiredCount: 0,
            vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
            assignPublicIp: true,
            cluster: cluster,
            taskDefinition: task,
            capacityProviderStrategies: [
                {capacityProvider: 'FARGATE_SPOT'}
            ]
        });


        const ecsControlDocument = new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources:
                [
                    this.service.serviceArn,
                    task.taskDefinitionArn + '/*'
                ],
              actions: [
                  'ecs:*',
                  'elasticfilesystem:ClientWrite',
                  'elasticfilesystem:DescribeFileSystems'
              ]

            }),
            new iam.PolicyStatement({
                resources: ['*'],
                actions: ['ec2:DescribeNetworkInterfaces']
            })
          ],
        });

        this.ecsControlPolicy = new iam.Policy(this, "EcsControl", {
            document: ecsControlDocument
        })

        this.ecsTaskRole.attachInlinePolicy(this.ecsControlPolicy);

        // Allow service to access EFS
        props.filesystem.connections.allowFrom(this.service, ec2.Port.tcp(2049));

        this.service.connections.allowFromAnyIpv4(ec2.Port.tcp(25565));

    }
}
