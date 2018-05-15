#!/bin/bash

cd "$(dirname "$0")"

aws s3 cp static/ s3://personas.cryptomessaging.org/ --recursive --profile cryptomessaging

echo "Static files deployed to S3!"