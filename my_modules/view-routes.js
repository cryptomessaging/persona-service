const net = require('./net')

//
// These routes are for debugging.
// Normally these are handled by the edge caching network
//

module.exports = function( express, s3 ) {
    const router = express.Router();

    router.get( '/service.json|favicon.ico|index.html',function(req,res){
        let path = req.originalUrl;
        s3.fetchMedia(path,(err,result) => {
            if(err)
                net.signalError(req,res,err);
            else
                sendMedia( req, res, result );
        });
    });

    router.get( '/personas/:pid/:path(*)',function(req,res){
        let path = 'personas/' + req.params.pid + '/' + req.params.path;
        s3.fetchMedia(path,(err,result) => {
            if(err)
                net.signalError(req,res,err);
            else
                sendMedia( req, res, result );
        });
    });

    console.log( 'DEBUG view routes are ready' );
    return router;
}

function sendMedia( req, res, mediaResult ) {
    if( mediaResult.media.length == 0 ) {
        res.status(204).end();  // its ok to have no content
    } else {
        let metadata = mediaResult.metadata;
        if( metadata ) {
            Object.keys(metadata).forEach( name => {
                res.setHeader('x-amz-meta-' + name, metadata[name] );
            });
        }

        res.setHeader('Content-Type',mediaResult.contentType);
        res.write( mediaResult.media );
        res.end();  
    }
}