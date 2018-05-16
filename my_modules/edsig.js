const crc32c = require('fast-crc32c')
const { randomBytes } = require('crypto')
const EdDSA = require('elliptic').eddsa
const ec = new EdDSA('ed25519')
const net = require('./net')
const DEBUG = true;

// For testing...
let secret = Buffer.from( "UG8HnBjdfbcxmCGgHkHAVGDezaOXXJAKZ222BU5_YLs", 'base64' );    // actually base64url
const TEST_KEYPAIR = ec.keyFromSecret(secret);

//
// Authorization is used to verify who is making an HTTP request
//

// req { body:, method:, originalUrl:, headers: }
// callback(err,null or { type:'edsig', pid:<base64url> })
exports.verifyRequestSignature = function(req,callback) {

    // For FUN (and testing), what would the sig be for the test user (created below)?
    createAuthorization( req, TEST_KEYPAIR );

    // crack open the authorization header to get the public key and signature
    parseSignature(req.headers,'authorization',(err,authorization) => {
        if(err)
            return callback(err);
        if(!authorization)
            return callback();  // it's ok!

        // verify specific EdSig request headers and CRC32C of body (if present)
        let reqbytes = reqToBytes( req );
        let success = authorization.pubkey.verify(reqbytes, authorization.sighex);

        if( DEBUG) console.log( 'Verified?', success );
        if( success )
            callback(null,{ type:'edsig', pid:authorization.keypath[0] });
        else
            callback( new net.ServerError([4],'EdSig signature check failed' ) );
    });
}

// convert HTTP request to a Buffer
// req { body:, method:, originalUrl:, headers: }
function reqToBytes(req) {

    // TODO: Remove!  For testing...
    // do a crc32c of the body and add to request
    const bodyHash = crc32c.calculate( req.body );
    req.headers['x-content-hash'] = 'CRC32C ' + bodyHash;

    // message is "METHOD path\nheader1value\nheader2value\n...header3value"  (NOTE: NO trailing \n)
    const signHeaders = [
        'content-length',
        'content-type',
        'date',
        'host',
        'x-content-hash' ];     // order is important!
    let message = req.method + ' ' + req.originalUrl;
    signHeaders.forEach(name => {
        let value = req.headers[name] || '';
        message += '\n' + value;
    });

    return Buffer.from( message );
}

// Create an authorization header value from the given Node Request object and an EC keypair
function createAuthorization( req, keypair ) {
    // Convert request summary to bytes and sign
    var msg = reqToBytes( req );
    var sigbytes = Buffer.from( keypair.sign(msg).toBytes() );

    // extract public key bytes
    let pubbytes = Buffer.from( keypair.getPublic() );

    let edsig = 'EdSig kp=' + base64url(pubbytes) + ',sig=' + base64url(sigbytes);
    if( DEBUG) console.log( 'Created authorization', edsig );
    return edsig;
}

//
// Certification is provided by the owner of content
//

// callback(err,auth)
exports.verifyContentSignature = function(req,callback) {
    let path = req.originalUrl;
    let body = req.body;
    let headers = {
        "content-length": req.headers['content-length'],
        "content-type": req.headers['content-type'],
        "x-created": req.headers['x-created']
    };
    let contentbytes = contentSummaryToBytes( path, body, headers );

    // For FUN, what should it be?
    createCertification( path, body, headers, TEST_KEYPAIR );

    // crack open the certification header to get the public key and signature
    parseSignature(req.headers,'x-certification',(err,certification) => {
        if(err)
            return callback(err);
        if(!certification)
            return callback(new net.ServerError([4],'Missing required header: X-Certification' ));

        // verify specific EdSig request headers and CRC32C of body (if present)
        let success = certification.pubkey.verify(contentbytes, certification.sighex);

        if( DEBUG) console.log( 'Certified?', success );
        if( success )
            callback(null,{ type:'edsig', pid:certification.keypath[0] });
        else
            callback( new net.ServerError([4],'EdSig signature check failed' ) );
    });
}

// convert content summary(CRC of body,headers,path) to byte Buffer
// headers { content-length, content-type, x-created }
function contentSummaryToBytes(path,body,headers) {

    // do a crc32c of the body and add to request
    const bodyHash = crc32c.calculate( body );
    headers['x-content-hash'] = 'CRC32C ' + bodyHash;

    if( !headers['x-created'] )
        headers['x-created'] = (new Date()).toISOString();

    // IMPORTANT to anchor the content to a place in the filesystem
    // message is "path\nheader1value\nheader2value\n...header3value"  (NOTE: NO trailing \n)
    const signHeaders = [
        'content-length',
        'content-type',
        'x-created',
        'x-content-hash' ];     // order is important!
    let message = path;
    signHeaders.forEach(name => {
        let value = headers[name] || '';
        message += '\n' + value;
    });

    return Buffer.from( message );
}

function createCertification( path, body, headers, keypair ) {
    // Convert request to bytes and sign
    var msg = contentSummaryToBytes( path, body, headers );
    var sigbytes = Buffer.from( keypair.sign(msg).toBytes() );

    // extract public key bytes
    let pubbytes = Buffer.from( keypair.getPublic() );

    let edcert = 'EdSig kp=' + base64url(pubbytes) + ',sig=' + base64url(sigbytes);
    if( DEBUG) console.log( 'Created certification', edcert );
    return edcert;
}

//
// Util
//

// callback(err,result)
// result = { pubkey:, sighex:, keypath:[ root/pid, child, ... ] }
function parseSignature(headers,name,callback) {
    const signature = headers[name];
    if( !signature ) {
        if( DEBUG) console.log( 'No', name, 'header' );
        return callback();
    }

    const authFields = signature.split(/\s+/);
    if( authFields[0] != 'EdSig' ) {
        return callback( new net.ServerError([4],'Unsupported auth scheme ' + authFields[0] + ' in ' + name ) );
    } else if( authFields.length < 2 ) {
        return callback( new net.ServerError([4],'Missing required second EdSig parameter for ' + name ) );
    }

    // extract public key from authorization header
    const kvset = asKVset( authFields[1] );
    const keypath = kvset.kp.split(':'); // rootkey[:sigkey]
    const rootkey = keypath[0]; // NOTE: rootkey and pid are the same thing
    const pubhex = Buffer.from(rootkey, 'base64').toString('hex');  // ec wants hex, so convert from base64url to hex 
    const pubkey = ec.keyFromPublic(pubhex, 'hex');

    // extract 512 bit request signature from authorization header
    const sighex = Buffer.from( kvset.sig, 'base64' ).toString('hex'); 

    callback( null,  {
        pubkey: pubkey,
        sighex: sighex,
        keypath: keypath
    });
}

// Convert a base64 buffer to a base64url string
// + becomes -, / becomes _, trailing = are removed
// More info at https://tools.ietf.org/html/rfc4648#section-5
// NOTE: Buffer() correctly decodes base64url, so we just need this encode function.
function base64url(buffer){
    let base64 = buffer.toString('base64');    // convert bytes in buffer to 'normal' base64

    // replace web/url unsafe characters and remove trailing '='
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=+$/, '');

    return base64url;
}

function clean(y) {
    return y && trim(y);
}

function trim(x) {
    return x && x.replace(/^\s+|\s+$/gm,'');
}

function asKVset(s) {
    var result = {};
    s.split(',').forEach(function(x){
        var p = x.indexOf('=');
        if( p > -1 ) {
            var key = clean(x.substring(0,p));
            var value = trim(x.substring(p + 1));
            value && (result[key] = value);
        }
    });

    return result;
}