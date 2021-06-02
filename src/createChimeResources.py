#  “Copyright Amazon.com Inc. or its affiliates.” 
import json
import boto3
import time

chime = boto3.client('chime')

def getPhoneNumber(retry_limit=10, retries=0):
  if retries >= retry_limit:
    return 'Could not get phone number'

  try:
    search_response = chime.search_available_phone_numbers(
        State='IL',
        MaxResults=1
    )
    phoneNumberToOrder = search_response['E164PhoneNumbers'][0]
    print ('Phone Number: ' + phoneNumberToOrder)
    phone_order = chime.create_phone_number_order(
        ProductType='SipMediaApplicationDialIn',
        E164PhoneNumbers=[
            phoneNumberToOrder,
        ]
    )
    print ('Phone Order: ' + str(phone_order))

    check_phone_order = chime.get_phone_number_order(
      PhoneNumberOrderId=phone_order['PhoneNumberOrder']['PhoneNumberOrderId']
    )
    order_status = check_phone_order['PhoneNumberOrder']['Status']
    timeout = 0

    while not order_status == 'Successful':
      timeout += 1  
      if timeout == 10:
        return 'Could not get phone'
      print('Checking status: ' + str(order_status))
      time.sleep(5)
      check_phone_order = chime.get_phone_number_order(
        PhoneNumberOrderId=phone_order['PhoneNumberOrder']['PhoneNumberOrderId']
      )
      order_status = check_phone_order['PhoneNumberOrder']['Status']
    
  except:
    return getPhoneNumber(retries=retries+1)
    
  return phoneNumberToOrder

def createSMA (region, name, lambdaArn):
  sma_create_response = chime.create_sip_media_application(
    AwsRegion=region,
    Name=name+'-SMA',
    Endpoints=[
        {
            'LambdaArn': lambdaArn
        },
    ]
  ) 

  print ('sma create: ' + str(sma_create_response))

  return sma_create_response['SipMediaApplication']['SipMediaApplicationId']

def createSipRule (name, phoneNumber, smaID, region):
  print(phoneNumber)
  sip_rule_response = chime.create_sip_rule(
    Name=name+'-Rule',
    TriggerType='ToPhoneNumber',
    TriggerValue=phoneNumber,
    Disabled=False,
    TargetApplications=[
        {
            'SipMediaApplicationId': smaID,
            'Priority': 1,
            'AwsRegion': region
        },
    ]
  )
  print('sip rule response: ' + str(sip_rule_response))

  return sip_rule_response

def on_event(event, context):
  print(event)
  request_type = event['RequestType']
  if request_type == 'Create': return on_create(event)
  if request_type == 'Update': return on_update(event)
  if request_type == 'Delete': return on_delete(event)
  raise Exception("Invalid request type: %s" % request_type)

def on_create(event):
  physical_id = 'smaResources'
  region = event['ResourceProperties']['region']
  smaName = event['ResourceProperties']['smaName']
  lambdaArn = event['ResourceProperties']['lambdaArn']
  phoneNumberRequired = event['ResourceProperties']['phoneNumberRequired']
  smaRequired = event['ResourceProperties']['createSMA']
  smaID = event['ResourceProperties']['smaID']
  ruleName = event['ResourceProperties']['ruleName']

  if phoneNumberRequired == 'true':
    newPhoneNumber = getPhoneNumber()

  if smaRequired == 'true':
    smaID = createSMA(region, smaName, lambdaArn)

  print ('smaID: ' + smaID)
  print ('region: ' + region)
  print ('phoneNumber: ' + newPhoneNumber)
  print ('ruleName: ' + ruleName)
  
  if phoneNumberRequired == 'true':
    sipRuleResponse = createSipRule(ruleName, newPhoneNumber, smaID, region)
    createSMAResponse = { 'smaID': smaID, 'phoneNumber': newPhoneNumber}
  else:
    createSMAResponse = { 'smaID': smaID }

  return { 'PhysicalResourceId': physical_id, 'Data': createSMAResponse }

def on_update(event):
  physical_id = event["PhysicalResourceId"]
  props = event["ResourceProperties"]
  print("update resource %s with props %s" % (physical_id, props))
  return { 'PhysicalResourceId': physical_id }  


def on_delete(event):
  physical_id = event["PhysicalResourceId"]
  print("delete resource %s" % physical_id)
  return { 'PhysicalResourceId': physical_id }