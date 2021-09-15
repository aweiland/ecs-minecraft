import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import {clone} from './util'



export class MinecraftVpc extends ec2.Vpc {
    constructor(scope: cdk.Construct, id: string, props: ec2.VpcProps) {
        super(scope, id, {
            ...props,
            subnetConfiguration: [ 
                { cidrMask: 24, name: 'Public', subnetType: ec2.SubnetType.PUBLIC, }, 
                { cidrMask: 24, name: 'Isolated', subnetType: ec2.SubnetType.ISOLATED }
            ]
        });
    }
    
}