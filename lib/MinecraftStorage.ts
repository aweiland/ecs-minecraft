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
    public readonly accessPoint: efs.AccessPoint

    constructor(scope: cdk.Construct, id: string, props: MinecraftStorageProps) {
        super(scope, id);
        // --- EFS ---
        this.filesystem = new efs.FileSystem(this, "MinecraftEFS", {
            vpc: props.vpc,
        });

        this.accessPoint = this.filesystem.addAccessPoint("MinecraftRoot", {
            posixUser: { uid: '1000', gid: '1000' },
            path: "/minecraft"
        });

        const efsAccessSg = new ec2.SecurityGroup(this, "EfsAccessSG", {
            vpc: props.vpc,
            allowAllOutbound: true,
        });
        this.filesystem.connections.allowFrom(efsAccessSg, ec2.Port.tcp(2049));


        const syncEfsRole = new iam.Role(this, "DataSyncEfsRole", {
            assumedBy: new iam.ServicePrincipal('datasync.amazonaws.com')
        });

        // --- S3 ---
        const dataBucket = new s3.Bucket(this, "MinecraftBucket");

        const syncS3Role = new iam.Role(this, "DataSyncS3Role", {
            assumedBy: new iam.ServicePrincipal('datasync.amazonaws.com')
        });

        dataBucket.grantReadWrite(syncS3Role);

        const s3Location = new datasync.CfnLocationS3(this, "S3Location", {
            s3BucketArn: dataBucket.bucketArn,
            s3Config: {
                bucketAccessRoleArn: syncS3Role.roleArn
            },
            subdirectory: '/minecraft'
        })

        // --- DataSync ---
        const sgArn = cdk.Arn.format({
            resource: 'security-group',
            service: 'ec2',
            resourceName: efsAccessSg.securityGroupId
        }, cdk.Stack.of(this))

        const subnetArn = cdk.Arn.format({
            resource: "subnet",
            service: "ec2",
            resourceName: props.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE}).subnets[0].subnetId
        }, cdk.Stack.of(this))

        const efsLocation = new datasync.CfnLocationEFS(this, "EFSLocation", {
            efsFilesystemArn: this.filesystem.fileSystemArn,
            subdirectory: "/minecraft",
            ec2Config: {
                subnetArn: subnetArn,
                securityGroupArns: [sgArn]
            }
        });

        const task = new datasync.CfnTask(this, "EfsToS3Task", {
            sourceLocationArn: efsLocation.ref,
            destinationLocationArn: s3Location.ref,
            excludes: [{ 'filterType': 'SIMPLE_PATTERN', 'value': '*.jar|/world|/logs' }],
            options: {
                transferMode: 'CHANGED'
            }
        })
    }

}
