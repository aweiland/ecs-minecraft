import boto3
import os
import logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = 'us-east-1'
CLUSTER = 'minecraft'
SERVICE = 'minecraft-server'

def lambda_handler(event, context):
#     if event['detail']['status'] == 'RUNNING':
#     logger.info(event)
    logger.info(event['detail']['attachments'][0]['status'])
    if event['detail']['attachments'][0]['status'] == 'ATTACHED':
        for detail in event['detail']['attachments'][0]['details']:
            if detail['name'] == 'networkInterfaceId':
                attachInterface(detail['value'], _environment_value_as_type('EIP', type=str))



def attachInterface(eni, eip):
    logger.info(f'Associating {eip} to interface {eni}')
    ec2 = boto3.client('ec2', region_name=REGION)
    ec2.associate_address(AllocationId=eip, NetworkInterfaceId=eni)


# TODO This would make a nice Lambda layer
def _environment_value_as_type(name, **kwargs):

    # Retrieves environment variable by name and casts the value to desired type.
    # Cloudformation and environment variables in general come in as strings.

    default_value = kwargs.pop('default', None)
    desired_type = kwargs.pop('type', str)

    value = os.getenv(name, None)

    if value is None:
        if default_value is None:
            return None
        else:
            return default_value

    # This code deals with boolean types returned via environment variables and
    # handles the case where CF stores the value as true and false as strings
    # as well as handling the case where it might be True or False by converting
    # the string to all lowercase and handling it explicitly.
    if desired_type is bool:
        # boolean values from CF are returned as true and false not True and False
        if type(value) is str:
            if value.lower() == 'true':
                value = True
            elif value.lower() == 'false':
                value = False

    return desired_type(value)