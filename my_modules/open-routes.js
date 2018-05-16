const net = require('./net')

//
// Routes that don't require authentication
//

module.exports = function( express, s3 ) {
    const router = express.Router();

    // simple status page, also used for server health
    const runningSince = new Date();
    router.get( '/status', function(req,res) {
        res.json({ version:[1,0,0], started:runningSince }); 
    });

    // For debugging ONLY
    router.get( '/personas/:pid/:path(*)',function(req,res){
        let path = 'personas/' + req.params.pid + '/' + req.params.path;
        s3.fetchMedia(path,(err,result) => {
            if(err)
                net.signalError(req,res,err);
            else
                sendMedia( req, res, result );
        });
    });

    console.log( 'Open API routes are ready' );
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