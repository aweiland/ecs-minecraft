import * as cdk from '@aws-cdk/core';
import * as efs from '@aws-cdk/aws-efs';
import * as datasync from '@aws-cdk/aws-datasync';
import * as s3 from '@aws-cdk/aws-s3'
import * as iam from '@aws-cdk/aws-iam'
import * as ec2 from '@aws-cdk/aws-ec2'

interface MinecraftStorageProps {
    vpc: ec2.Vpc
}


export class MinecraftStorage extends cdk.Construct {
    
    public readonly filesystem: efs.FileSystem
    
    constructor(scope: cdk.Construct, id: string, props: MinecraftStorageProps) {
        super(scope, id);
        
        this.filesystem = new efs.FileSystem(this, "MinecraftEFS", {
            vpc: props.vpc,
            
        });
        
        
        const accessPoint = this.filesystem.addAccessPoint("MinecraftRoot", {
            posixUser: { uid: '1000', gid: '1000' },
            path: "/minecraft"
        });
        

        // const accessPointSg = new ec2.SecurityGroup(this, "EfsAccessSG", {
        //     vpc: props.vpc,
        //     allowAllOutbound: true,
        // })
        // accessPointSg.addIngressRule(accessPoint., ec2.Port.tcp(22))

        const syncEfsRole = new iam.Role(this, "DataSyncEfsRole", {
            assumedBy: new iam.ServicePrincipal('datasync.amazonaws.com')
        });
        
        
        const dataBucket = new s3.Bucket(this, "MinecraftBucket");
        
        const syncS3Role = new iam.Role(this, "DataSyncS3Role", {
            assumedBy: new iam.ServicePrincipal('datasync.amazonaws.com')
        });
        
        dataBucket.grantReadWrite(syncS3Role);
        
        // const s3Location = new datasync.CfnLocationS3(this, "S3Location", {
        //     s3BucketArn: dataBucket.bucketArn,
        //     s3Config: {
        //         bucketAccessRoleArn: syncS3Role.roleArn
        //     },
        //     subdirectory: '/minecraft'
        // })
        
        // const cfnFilesystem = this.filesystem.mountTargetsAvailable as efs.CfnMountTarget[]
        // const sgArns = this.filesystem.connections.securityGroups.map(s => (s.node.defaultChild as ec2.CfnSecurityGroup).getAtt('arn').toString()) as string[]
        

        // const efsLocation = new datasync.CfnLocationEFS(this, "EFSLocation", {
        //     efsFilesystemArn: this.filesystem.fileSystemArn,
        //     subdirectory: "/minecraft",
        //     ec2Config: {
        //         subnetArn: cfnFilesystem[0].subnetId,
        //         securityGroupArns: sgArns
        //     }
        // });
        
        // const task = new datasync.CfnTask(this, "EfsToS3Task", {
        //     sourceLocationArn: efsLocation.getAtt('arn').toString(),
        //     destinationLocationArn: s3Location.getAtt('arn').toString(),
        //     excludes: [{ 'filterType': 'SIMPLE_PATTERN', 'value': '*.jar|/world|/logs' }],
        //     options: {
        //         transferMode: 'CHANGED'
        //     }
        // })
    }
    
}