// import * as cdk from '@aws-cdk/core';
// import * as ec2 from '@aws-cdk/aws-ec2';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import {MinecraftVpc} from './MinecraftVpc';
import {MinecraftStorage} from './MinecraftStorage';
import {MinecraftFargateEcs} from "./MinecraftFargateEcs";
import {MinecraftStarter} from './MinecraftStarter'
import {Construct} from "constructs";
import {ServerStatus} from "./ServerStatus";

interface EcsMinecraftStackConfig extends cdk.StackProps, ec2.VpcProps {
  hostname: string
  route53LogGroup: string
  route53Zone: string
}

export class EcsMinecraftStack extends cdk.Stack {

  public readonly vpc: ec2.Vpc

  constructor(scope: Construct, id: string, props: EcsMinecraftStackConfig) {
    super(scope, id, props);

    const maxAzs = props?.maxAzs || 2;

    this.vpc = new MinecraftVpc(this, 'MinecraftVpc', {
      cidr: props.cidr,
    });

    const storage = new MinecraftStorage(this, 'MinecraftStorage', {vpc: this.vpc});
    
    const fargate = new MinecraftFargateEcs(this, "MinecraftFargate", {
        vpc: this.vpc,
        accessPoint: storage.accessPoint,
        filesystem: storage.filesystem,
        hostname: props.hostname,
        route53Zone: props.route53Zone
    });

    new ServerStatus(this, 'server-status', {
      ecsCluster: fargate.ecsCluster
    })
    
    new MinecraftStarter(this, 'MinecraftStarter', {
      ecsControlStatment: fargate.ecsControlStatement,
      filesystem: storage.filesystem,
      hostname: props.hostname,
      route53LogGroup: props.route53LogGroup,
      vpc: this.vpc,
      ecsService: fargate.service,
      ecsTaskRole: fargate.ecsTaskRole,
      eip: fargate.eip
    })


    // The code that defines your stack goes here
  }
}
