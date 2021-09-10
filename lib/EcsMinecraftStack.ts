import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import {MinecraftVpc} from './MinecraftVpc';
import {MinecraftStorage} from './MinecraftStorage';

interface EcsMinecraftStackConfig extends cdk.StackProps, ec2.VpcProps {
  hostname: string
}

export class EcsMinecraftStack extends cdk.Stack {
  
  public readonly vpc: ec2.Vpc
  
  constructor(scope: cdk.Construct, id: string, props: EcsMinecraftStackConfig) {
    super(scope, id, props);
    
    const maxAzs = props?.maxAzs || 2;
    
    this.vpc = new MinecraftVpc(this, 'MinecraftVpc', {
      cidr: props.cidr, 
    });
    
    new MinecraftStorage(this, 'MinecraftStorage', {vpc: this.vpc});
    

    // The code that defines your stack goes here
  }
}
