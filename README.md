# Persona Service

A registry for cryptomessaging persona information.

This project currently supports two production platforms: Lambda+Node and Elastic Beanstalk+Node.  We hope many more are supported in the future!


## Local testing of the Persona Service

The following assumes you have installed Git and Node.js, and are running on a Mac.

1. Install the Persona Server and run it locally:
<pre>
$ git clone https://github.com/cryptomessaging/persona-service.git
$ cd persona-service
$ npm install
$ export LOCAL_S3_SIMULATOR_DIR=~/s3simulator
$ export PERSONAS_S3_BUCKET=personas.mydomain.com
$ export PERSONAS_CONTROLLER_PATHNAME_PREFIX=/v1
$ node index
</pre>

2. Install a command line interface (EdSig) for interacting with the Persona Service:
<pre>
$ npm install -g edsig-cli    
</pre>

3. Read the [EdSig README](https://github.com/cryptomessaging/edsig) for a tutorial on the commands.  Your local persona service is available at http://localhost:3030 or you can interact with the Alpha Persona Service at https://personas.cryptomessaging.org


## API

The Persona Service is an asymetric HTTP service, where infrequent Restful write requests are executed against one Internet service (i.e. a Lambda function) and high frequency read requests are handled by an edge caching network such as CloudFront.  It is recommended that all requests use HTTPS for security.


### Authentication and Certification with Personas

The Persona service uses elliptic curve cryptography to digitally sign requests and content.  Personas are created with a 256 bit secret, which is used to generate a 256 bit public key using the Ed25519 curve. The public key is encoded as [base64url](https://tools.ietf.org/html/rfc4648#section-5) and is used as the globally unique persona id.

To create a new persona nicknamed Satoshi using the edsig command line tool:
<pre>
$ edsig persona create "Satoshi"
</pre>

The above command echoes the new persona as JSON to the screen, and also writes that file to the ~/.cryptomessaging directory in a new directory with the same name as the newly created persona id, and in that new directory a file named persona.json

The following examples in this README will use the Satoshi persona for authorization and certification.




### HTTP Read Requests

Read requests are serviced by CloudFront, do not require authentication, and generally follow the pattern of returning an HTTP status 200 and the response body.  ALL requests to paths under /personas will include the following response headers:

- x-certification: EdSig ...
- x-created: <date>
- x-content-hash: CRC32C value
- content-type:
- content-length:

Clients can confirm the authenticity of a persona file by verifying the signature in the x-certification response header.


### HTTP Write Requests

Write requests are serviced by a dedicated Restful service, which is specified in a configuration file located at /service.json under the "controller" property, as "url".  The following is an example of a service.json file:
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

All write requests require the HTTP "authorization" header to have a EdSig value.  If a write request is updating a file under a persona, then the file being updated also requires an "x-certification" header.

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

### EdSig Authorization and Certification

The Edwards Curve Signature (EdSig) uses the Edwards Curve (ed25519) to digitally sign summary information about HTTP requests or content.

EdSig can be used to authorize an HTTP request by providing an HTTP 'Authorization' header.  The Authorization header value takes the form:
<pre>
Authorization: EdSig kp=&lt;persona id&gt;[:&lt;subkey name&gt;],sig=&lt;base64url encoded 512 bit signature&gt;
</pre>
The 'kp' parameter of the second header value token is the 'key path' and may either be a simple value representing the personas public key, or may be a compound value delimited by semicolons where the first value is the personas root public key, and the second value is the public key from the keypair that was used to sign this request.

The <strong>persona id</strong> is a base64url encoded public key.  The signature is calculated as:
<pre>
keypair = An Ed25519 based keypair.  See the Elliptic NPM module for an example.
method = HTTP request method, as 'GET", 'POST', etc.
path = original path portion of the URL of request, such as '/personas/4234gsdflk23h23kj23/metapage.json'
content-length = bytes in request body as an integer, this can be empty
content-type = MIME type, such as 'application/json'
date = ISO date string
host = Host servicing this request
x-content-hash = CRC32C hash of the content, prefixed with 'CRC32C', i.e. 'CRC32C 12334332767'

summary = method + ' ' + path + LINEFEED + content-length + LINEFEED + content-type + LINEFEED + date + LINEFEED + host + LINEFEED + x-content-hash
signature = base64urlEncode( keypair.sign(summary) )
</pre>

EdSig can also be used to certify the content in an HTTP response.  The Certification header value takes the form:
<pre>
Certification: EdSig kp=&lt;persona id&gt;[:&lt;subkey name&gt;],sig=&lt;base64url encoded 512 bit signature&gt;
</pre>
The values of the certification header are formed in the same manner as the Authorization header above.

The signature for a certification is calculated as:
<pre>
keypair = An Ed25519 based keypair.  See the Elliptic NPM module for an example.
path = original path portion of URL of request, such as '/personas/4234gsdflk23h23kj23/metapage.json'
content-length = bytes in request body as an integer, this can be empty
content-type = MIME type, such as 'application/json'
created = ISO date string
x-content-hash = CRC32C hash of the content, prefixed with 'CRC32C', i.e. 'CRC32C 12334332767'

summary = path + LINEFEED + content-length + LINEFEED + content-type + LINEFEED + created + LINEFEED + x-content-hash
signature = base64urlEncode( keypair.sign(summary) )
</pre>


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
