const crc32c = require('fast-crc32c')
const { randomBytes } = require('crypto')
const EdDSA = require('elliptic').eddsa
const ec = new EdDSA('ed25519')
const net = require('./net')

exports.verifyContentSignature = function(req) {
    return null;
}

// req { body:, method:, originalUrl:, headers: }
// callback(err,null or { type:'edsig', pid:<base64url> })
exports.verifyRequestSignature = function(req,callback) {

    // For FUN (and testing), what would the sig be for a random user (created below)?
    let secret = randomBytes(32);
    var keypair = ec.keyFromSecret(secret);
    createAuthorization( req, keypair );

    // Make sure there's an 'authorization' header
    const authorization = req.headers.authorization;
    if( !authorization ) {
        console.log( 'No authorization header' );
        return callback();
    }

    const authFields = authorization.split(/\s+/);
    if( authFields[0] != 'EdSig' ) {
        return callback( new net.ServerError([4],'Unsupported auth scheme: ' + authFields[0] ) );
    } else if( authFields.length < 2 ) {
        return callback( new net.ServerError([4],'Missing required second EdSig parameter' ) );
    }

    // extract public key from authorization header
    const kvset = asKVset( authFields[1] );
    const keypath = kvset.kp.split(':'); // rootkey[:sigkey]
    const rootkey = keypath[0]; // NOTE: rootkey and pid are the same thing
    const pubhex = Buffer.from(rootkey, 'base64').toString('hex');  // ec wants hex, so convert from base64url to hex 
    const pubkey = ec.keyFromPublic(pubhex, 'hex');

    // extract 512 bit request signature from authorization header
    let sighex = Buffer.from( kvset.sig, 'base64' ).toString('hex');

    // verify specific EdSig request headers and CRC32C of body (if present)
    let reqbytes = reqToBytes( req );
    let success = pubkey.verify(reqbytes, sighex);

    console.log( 'Verified?', success );
    if( success )
        callback(null,{ type:'edsig', pid:keypath[0] });
    else
        callback( new net.ServerError([4],'EdSig signature check failed' ) );
}

// Create an authorization header value from the given Node Request object and an EC keypair
function createAuthorization( req, keypair ) {
    // Convert request to bytes and sign
    var msg = reqToBytes( req );
    var sigbytes = Buffer.from( keypair.sign(msg).toBytes() );
    console.log( 'Sig', sigbytes );

    // extract public key bytes
    let pubbytes = Buffer.from( keypair.getPublic() );
    console.log( 'Public key', pubbytes );

    let edsig = 'EdSig kp=' + base64url(pubbytes) + ',sig=' + base64url(sigbytes);
    console.log( 'Created authorization', edsig );
    return edsig;
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

//
// Util
//

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