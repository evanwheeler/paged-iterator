var Q = require( 'q' ),
    Deferred = Q.defer,
    isPromise = Q.isPromiseAlike;

/**
 * Either calls process.nextTick for nodejs or setTimeout.
 * @param {function} fn - The function to defer execute.
 */
function nextTick( fn ) { 
    if ( process && typeof process.nextTick === 'function' ) {
        process.nextTick( fn );
    }
    else setTimeout( fn, 0 );
}

/**
 * Accepts input as promise, deferred, or value and returns a promise. 
 */ 
function ensurePromise( obj ) { 
    if( isPromise( obj ) ) return obj;
    if( obj && obj.promise ) return obj.promise;

    // coerce to promise.
    return Q( obj );
}

/**
 * Paging iterator for iterating over a large data set.  Supports fetching pages into a buffer by
 * overriding the fetchPage function.
 * @param options - Override options for page,pageSize,fetchPage.
 * @constructor
 */
var PagedIterator = module.exports = function( options ) {

    this.options = options = options || {};

    // override parameters.
    this.page = options.page || 0;
    this.pageSize = options.pageSize || 100;

    // expect client code to override fetchPage.
    if( !options.fetchPage || typeof options.fetchPage !== 'function' ) {
        throw new Error( "fetchPage option is required" );
    }
        
    // save our fetchPage function.
    this.fetchPage = options.fetchPage;
    
    // keeps track of our overall state -- _done will be true when the buffer is empty
    // and there are no more items to fetch.
    this._done = false;

    // keeps track of our last fetch state -- set to true if we've performed a
    // fetch that did not return a complete page size.
    this._lastFetch = false;

    // Internal fetch buffer.
    this._buffer = [];

    // Queue of deferred next() calls.
    this._deferredQueue = [];
}

PagedIterator.prototype = {

    /**
     * Retrieves the next item
     * @returns {Promise} A promise object which will be fulfilled with the
     * next value or null (indicates no more items).
     **/
    next: function() {
        var d = Deferred();

        if( !this._done ) {
            // queue it up.
            this._deferredQueue.push( d );

            if( this._deferredQueue.length === 1 ) {
                // process it now.
                this._next( d );
            }
        }

        return d.promise;
    },

    /**
     * Processes the next item in the queue if any exist.
     **/
    _processQueue: function() {
        var nextDeferred;

        if( this._deferredQueue.length ) {
            // get the next deferred to process.
            nextDeferred = this._deferredQueue[0];

            // process.
            this._next( nextDeferred );
        }
    },

    /**
     * Rejects a deferred object with an error.
     * @param deferred - The deferred object to reject.
     * @param err - The error to reject with.
     **/
    _fail: function( deferred, err ) {
        if( deferred !== this._deferredQueue[0] ) {
            throw new Error( "_fail: Deferred doesn't match the next item in the queue." );
        }

        // fail everything left in the queue.
        while( this._deferredQueue.length ) {
            deferred = this._deferredQueue.shift();
            deferred.reject( err );
        }
    },

    /**
     * Resolves a deferred object with a value and then processes any backlog.
     * @param deferred - The deferred object which will be resolved.
     * @param val - The value to resolve with.  If val is null, this will mark the _done flag to true.
     **/
    _resolveNext: function( deferred, val ) {
        if( deferred !== this._deferredQueue[0] ) {
            throw new Error( "_resolveNext: Deferred doesn't match the next item in the queue" );
        }

        if( !val ) {
            this._done = true;
        }

        this._deferredQueue.shift();
        deferred.resolve( val );
        
        var self = this;
        
        // continue processing on next tick.
        nextTick( function() { 
            self._processQueue(); 
        } );
    },

    /**
     * Private method retrieves the next item - This will pull from the internal
     * buffer if it is not empty or it will refill the
     * the buffer and then return the next item.
     * @param d - Deferred object that will be processed.
     * @returns {promise} A promise that will be resolved with the next item or null to
     *          indicate no more items.
     **/
    _next: function( d ) {
        var self = this;

        if( this._buffer.length ) {
            // return from non-empty buffer...
            this._resolveNext( d, this._buffer.shift() );
        }
        else if( this._done || this._lastFetch ) {
            // always resolve with null if we're done.
            this._resolveNext( d, null );
        }
        else {
            // try to refill the buffer.
            this._refillBuffer().then( function(r) {
                var val = null;

                if( r.length ) {
                    val = self._buffer.shift();
                }

                // resolve from buffer.
                self._resolveNext( d, val );

            } ).fail( function( err ) {
                self._fail( d, err );
            } );
        }

        return d.promise;
    },

    /**
     * Refills the internal buffer.  This will update the _lastFetch value.
     * @returns a promise that will be resolved with the new buffer.
     **/
    _refillBuffer: function() {
        var self = this;
        
        // fetch should return a promise.
        return this._fetch().then( function( result ) {
            // save to buffer
            self._buffer = result;

            // determine if this is the last fetch.
            self._lastFetch = ( result.length < self.pageSize );
            
            return result;
        } );
    },

    /**
     * Fetches the next set of results and resolves the next result.
     * @returns a promise that will be resolved with the next result.
     */
    _fetch: function() {
        var p = this.fetchPage( this.page++, this.pageSize, this );
        
        // make sure this returns a promise.
        return ensurePromise( p );
    },

    /**
     * Default implementation of page fetch using jQuery ajax or equivalent -- this is fairly opinionated.
     * Override is expected.  An overriding function should return
     * a promise which will be fulfilled with the requested page of data.
     * @param page Page to fetch
     * @returns A promise that will be fulfilled with the items in the page.
     **/
    /* fetchPage: function( page, pageSize, iter ) {
        var d = Deferred();

        $.ajax( {
            url: this.options.url,
            data: { page: page, pageSize: pageSize },
        } ).then( function( result ) {
            d.resolve( result );
        } ).fail( function( xhr, err, msg ) {
            d.reject( msg );
        } );

        return d.promise;
    }*/

};
