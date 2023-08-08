import boto3
import os

REGION = 'us-east-1'
CLUSTER = 'minecraft'
SERVICE = 'minecraft-server'


def lambda_handler(event, context):
    global CLUSTER, SERVICE
    """Updates the desired count for a service."""
    
    CLUSTER = _environment_value_as_type('CLUSTER', type=str, default=CLUSTER)
    SERVICE = _environment_value_as_type('SERVICE', type=str, default=SERVICE)

    ecs = boto3.client('ecs', region_name=REGION)
    response = ecs.describe_services(
        cluster=CLUSTER,
        services=[SERVICE],
    )

    desired = response["services"][0]["desiredCount"]

    if desired == 0:
        ecs.update_service(
            cluster=CLUSTER,
            service=SERVICE,
            desiredCount=1,
        )
        print("Updated desiredCount to 1")
    else:
        print("desiredCount already at 1")
        
        
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