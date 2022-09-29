import argparse
import sys
import wave
import boto3


polly = boto3.client("polly")


def create_polly(polly_text, file_name):
    """Create Polly Function"""
    response = polly.synthesize_speech(OutputFormat="pcm", Engine="neural", Text=polly_text, SampleRate="8000", VoiceId="Joanna")

    if "AudioStream" in response:
        output_wav = "../wav_files/" + file_name + ".wav"
        with wave.open(output_wav, "wb") as wav_file:
            wav_file.setparams((1, 2, 8000, 0, "NONE", "NONE"))
            wav_file.writeframes(response["AudioStream"].read())

    return output_wav


PARSE_MSG = "Simple utility to create wav files for SMA via Polly"
parser = argparse.ArgumentParser(prog="create_wav.py", description=PARSE_MSG)
parser.add_argument("-file", help="Name of file to be created (without .wav)")
parser.add_argument("-text", help="Text of the audio to be created in quotes")
args = parser.parse_args()

file_name_arg = args.file
polly_text_arg = args.text

if not file_name_arg:
    print("Filename is required")
    sys.exit()

if not polly_text_arg:
    print("Text is required")
    sys.exit()

wav_file_output = create_polly(polly_text_arg, file_name_arg)
print("wav file created: " + wav_file_output)
