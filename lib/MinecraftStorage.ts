import * as cdk from '@aws-cdk/core';
import * as efs from '@aws-cdk/aws-efs';
import * as datasync from '@aws-cdk/aws-datasync';
import * as s3 from '@aws-cdk/aws-s3'
import * as iam from '@aws-cdk/aws-iam'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as logs from '@aws-cdk/aws-logs'


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
            path: "/minecraft",
            createAcl: {
                ownerGid: '1000',
                ownerUid: '1000',
                permissions: '0755'
            }
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
            assumedBy: new iam.ServicePrincipal('datasync.amazonaws.com'),
            inlinePolicies: {
                SyncBucket: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            actions: [
                                "s3:GetBucketLocation",
                                "s3:ListBucket",
                                "s3:ListBucketMultipartUploads"
                            ],
                            resources: [dataBucket.bucketArn]
                        }),
                        new iam.PolicyStatement({
                            actions: [
                                "s3:AbortMultipartUpload",
                                "s3:DeleteObject",
                                "s3:GetObject",
                                "s3:ListMultipartUploadParts",
                                "s3:GetObjectTagging",
                                "s3:PutObjectTagging",
                                "s3:PutObject"
                            ],
                            resources: [`${dataBucket.bucketArn}/*`]
                        })
                    ]
                })
            }
        });

        // dataBucket.grantReadWrite(syncS3Role);

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
            resourceName: props.vpc.selectSubnets({subnetType: ec2.SubnetType.ISOLATED}).subnets[0].subnetId
        }, cdk.Stack.of(this))

        const efsLocation = new datasync.CfnLocationEFS(this, "EFSLocation", {
            efsFilesystemArn: this.filesystem.fileSystemArn,
            subdirectory: "/minecraft",
            ec2Config: {
                subnetArn: subnetArn,
                securityGroupArns: [sgArn]
            }
        });
        
        efsLocation.node.addDependency(this.filesystem.mountTargetsAvailable);
        
        const logGroup = new logs.LogGroup(this, "MinecraftLogs", {
            logGroupName: '/minecraft/datasync'
        });
        logGroup.grantWrite(new iam.ServicePrincipal('datasync.amazonaws.com'))
        

        new datasync.CfnTask(this, "EfsToS3Task", {
            name: 'minecraft-efs-to-s3',
            sourceLocationArn: efsLocation.ref,
            destinationLocationArn: s3Location.ref,
            // cloudWatchLogGroupArn: logGroup.logGroupArn,
            excludes: [{ 'filterType': 'SIMPLE_PATTERN', 'value': '*.jar|/world|/logs' }],
            options: {
                overwriteMode: 'ALWAYS',
                transferMode: 'CHANGED',
                // logLevel: 'BASIC'
            }
        });
        
        new datasync.CfnTask(this, "S3ToEfsTask", {
            name: 'minecraft-s3-to-efs',
            sourceLocationArn: s3Location.ref,
            destinationLocationArn: efsLocation.ref,
            // cloudWatchLogGroupArn: logGroup.logGroupArn,
            // excludes: [{ 'filterType': 'SIMPLE_PATTERN', 'value': '*.jar|/world|/logs' }],
            options: {
                overwriteMode: 'ALWAYS',
                transferMode: 'CHANGED',
                // logLevel: 'BASIC'
            }
        });
    }

}
