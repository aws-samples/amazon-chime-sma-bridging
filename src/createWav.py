#  “Copyright Amazon.com Inc. or its affiliates.”
import json
import boto3
import os
import wave


wavFileBucket = os.environ["WAVFILE_BUCKET"]

polly = boto3.client("polly")


def createPolly(accountId, id):
    response = polly.synthesize_speech(OutputFormat="pcm", Text=accountId, SampleRate="8000", VoiceId="Joanna")

    if "AudioStream" in response:
        outputWav = id + ".wav"
        with wave.open("/tmp/" + outputWav, "wb") as wav_file:
            wav_file.setparams((1, 2, 8000, 0, "NONE", "NONE"))
            wav_file.writeframes(response["AudioStream"].read())

    return outputWav


def uploadWav(wavFile):
    s3 = boto3.client("s3")
    s3.upload_file("/tmp/" + wavFile, wavFileBucket, wavFile, ExtraArgs={"ContentType": "audio/wav"})

    return


def lambda_handler(event, context):
    print(event)
    if event["Records"][0]["eventName"] != "REMOVE":
        accountId = event["Records"][0]["dynamodb"]["NewImage"]["accountId"]["S"]
        id = event["Records"][0]["dynamodb"]["NewImage"]["id"]["S"]

        accountIdStr = ""
        for x in accountId:
            accountIdStr = accountIdStr + " " + x

        accountIdWav = createPolly(accountIdStr, id)
        uploadWav(accountIdWav)

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
        },
        "body": json.dumps("Success"),
    }
