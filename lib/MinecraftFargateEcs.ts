import * as cdk from '@aws-cdk/core';
import * as efs from '@aws-cdk/aws-efs';
import * as datasync from '@aws-cdk/aws-datasync';
import * as ecs from '@aws-cdk/aws-ecs'
import * as iam from '@aws-cdk/aws-iam'
import * as ec2 from '@aws-cdk/aws-ec2'


interface MinecraftFargateEcsProps {
    vpc: ec2.Vpc
    filesystem: efs.FileSystem,
    hostname: string
}


export class MinecraftFargateEcs extends cdk.Construct {
    
    public readonly service: ecs.FargateService;
    
    constructor(scope: cdk.Construct, id: string, props: MinecraftFargateEcsProps) {
        super(scope, id);
        
        const image = "itzg/minecraft-bedrock-server";
        
        const task = new ecs.FargateTaskDefinition(this, "MinecraftTask", {
            memoryLimitMiB: 2000,
            cpu: 1
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
            taskDefinition: task
        });
        
        // Allow service to access EFS
        props.filesystem.connections.allowFrom(this.service, ec2.Port.tcp(2049));
        
        this.service.connections.allowFromAnyIpv4(ec2.Port.tcp(25565));
        
    }
}