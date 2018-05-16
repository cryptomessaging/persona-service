# Persona Service

A registry for cryptomessaging persona information.

This project currently supports two production platforms: Lambda+Node and Elastic Beanstalk+Node+Express.  We hope many more are supported in the future!


## Local testing of the Persona Service

The following assumes you have installed Git and Node.js, and are running on a Mac.

    $ git clone https://github.com/cryptomessaging/persona-service.git
    $ cd persona-service
    $ npm install
    $ export LOCAL_S3_SIMULATOR_DIR=~/s3simulator
    $ node index 

## API

The Persona Service is an asymetric HTTP service, where infrequent Restful write requests are executed against one DNS resolved endpint (i.e. a Lambda function) and high frequency read requests are serviced by an edge caching network such as CloudFront.  It is recommended that all requests use HTTPS for security.


### HTTP Read Requests

Read requests are serviced by CloudFront, do not require authentication, and generally follow the pattern of returning an HTTP status 200 and the response body.  ALL requests to paths under /personas will include the following response headers:

- x-certify: EdCert ...
- x-created: <date>
- x-content-hash: CRC32C value
- content-type:
- content-length:

Clients can confirm the authenticity of a persona file by verifying the signature in the x-certify response header.

Write requests are serviced by a dedicated Restful service, which is specified in a configuration file located at /service.json at controller.url.
<pre>
{
    "name": "Persona Service",
    "version": [0,1,0],
    "pid": "2PSphxmthCo8E7-vftQsiTl_cZzGR280emInOhI-_P8",
    "controller": {
        "url": "https://persona-controller.cryptomessaging.org"
    },
    "ttl": "86400"
}
</pre>

All write requests require the HTTP "authorization" header to have a CMSig value.  If a write request is updating a file under a persona, then the file being updated also requires an "x-cm-signature" header.

An HTTP 200 response indicates success.  Due to the nature of edge caching, new files will be immediately available, but updated files may continue to show the stale file for up to the previous files TTL value.

- 500 A server error occured that was not due to the request.  Please try again later
- 400 The request could not be processed; The reasons are provided in the response JSON.
- 404 Endpoint not found
- 410 Resource not available
- 204 Content not available

Create or update existing persona file:
POST /personas/:personaid/metapage.json

Delete persona file:
DELETE /personas/:personaid/path...

Delete entire persona:
DELETE /personas/:personaid

List one persona directory:
GET /personas/:personaid/directory 


### Persona Service Directory Layout

The directory layout of the persona service is very simple: /personas/&lt;personaid&gt;/path... where the owner of each persona controls the location of all files under their persona.

The recommended layout of files is:
<pre>
/personas/
    &lt;your persona id&gt;/
        metapage.json
        keyring.json
        keyring/
            &lt;key id&gt;.json
        images/
            profile/
                full.jpg
                100.jpg
</pre>


## AWS Setup for Elastic Beanstalk

TBD

## AWS Setup for Lambda

1. Create persona-service user
    From AWS Console, IAM service:
    - Select users from left menu
    - Click "Add user"
    - User name: persona-service
    - Access type: programmatic access
    - No groups to add to
    

2. Create S3 bucket
    From AWS Console, S3 service:
    - "+ Create Bucket"
    - Name: personas.cryptomessaging.org
    - Region: US-West-2
    - No properties to set, next ->
    - "Create"

    Set public read policy (so CloudFront can read it)
    - Navigate to new Bucket
    - Click "Permissions" Tab
    - Click "Bucket Policy"
    - Add below:

<pre>
{
    "Version":"2012-10-17",
    "Statement":[
        {
            "Sid":"AddPerm",
            "Effect":"Allow",
            "Principal": "*",
            "Action":["s3:GetObject"],
            "Resource":["arn:aws:s3:::personas.cryptomessaging.org/*"]
        }
    ]
}  
</pre>

3. Configure Cloud Front
    From AWS Console, CloudFront service:
    - "Create Distribution"
    - Delivery method: Web -> "Next"
    - Origin domain name: personas.cryptomessaging.org
    - Alternate Domain Names (CNAMES): personas.cryptomessaging.org
    - Custom SSL certificate: *.cryptomessaging.org
    - Default Root Object: index.html
    - "Create Distribution"

4. Use Route53 to map personas.cryptomessaging.org to CloudFront distribution
    - Name: personas
    - Type: CNAME
    - Value: d27avv9hgfexz3.cloudfront.net
    - "Create"

5. Create IAM role for Lambda function
    - "Create Role"
    - Choose AWS service, then Lambda
    - "Next: Permissions"
    - Select AWSLambdaExecute
    - "Next: Review"
    - Role Name: lambda-personaService-execution-role
    - "Create Role"

    Open service we just created to add an inline policy
    - Click Permissions tab
    - Click "Add inline policy"
    - In service, click "Choose a service", then choose S3
    - Checkbox "All S3 actions"
    - Click "Resources"
    - Make sure "Specific" is checked
    - Enter bucket ARN of: arn:aws:s3:::personas.cryptomessaging.org
    - For object, checkbox "Any"
    - Enter bucket ARN of: arn:aws:s3:::personas.cryptomessaging.org/*
    - "Next: Review Policy"
    - Name: personas-s3-policy
    - "Create policy"

6. Create Lambda function
    - Name: personaService
    - Runtime: Node.js 8.10
    - Role: choose an existing role
    - Existing role: lambda-personaService-execution-role

    = arn:aws:lambda:us-west-2:272944513323:function:personaService

    personaService Configuration:
    - Add trigger: API Gateway
    - Configure triggers:
    - API: Create a new API
    - API name: personaService
    - Deployment stage: v1
    - Security: Open
    - "Add"

7. Create API proxy gateway
    - API name: personaService
    - Endpoint type: Regional
    - "Create"

    Create Proxy Resource:
    - Select personaService/ Resources from left menu
    - "Actions" -> Create Resource
    - Checkbox "configure as proxy resource"
    - Enable API Gateway CORS: checked
    - "Create Resource"
    - Integration type: Lambda Function Proxy
    - Lambda Region: us-west-2
    - Lambda Function: personaService
    - "Save"

    Create Stage:
    - Select APIs/personaService/Stages from left menu
    - "Create"
    - Stage name: prod
    - Deployment: <todays date/time>
    - "Create"

    https://9xpmv3ybj8.execute-api.us-west-2.amazonaws.com/v1/...


## Deploy to Lambda on AWS

$ ./lambda-deploy.sh
