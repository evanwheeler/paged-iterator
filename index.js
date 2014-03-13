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

    // Keep track of the active deferred.
    this._activeDeferred = null;

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

        // queue it up.
        this._deferredQueue.push( d );

        var self = this;

        // make sure it runs...
        self._processQueue();

        return d.promise;
    },

    /**
     * Processes the next item in the queue if any exist.
     **/
    _processQueue: function() {

        // kick this off if there are tasks.
        if( this._deferredQueue.length &&
            !this._activeDeferred ) {

            // setup the next active...
            this._activeDeferred = this._deferredQueue.shift();

            var self = this;

            // always run on the next tick
            nextTick( function() {
                // process the deferred.
                self._processActive();
            })
        }
    },


    /**
     * Tryies to fulfill the active item - This will pull from the internal
     * buffer if it is not empty or it will refill the
     * the buffer and then return the next item.
     * @param d - Deferred object that will be processed.
     * @private
     **/
    _processActive: function() {
        var self = this;

        // If we have items in the buffer, resolve with those first.
        // If we're done or we've done our last fetch and the buffer is empty, resolve with null.
        // Otherwise, refill the buffer and start again.

        if( this._buffer.length ) {
            // return from non-empty buffer...
            this._resolveActive( this._buffer.shift() );
        }
        else if( this._done || this._lastFetch ) {
            // always resolve with null if we're done.
            this._resolveActive( null );
        }
        else {
            // try to refill the buffer and then try next again.
            this._refillBuffer()
                .then( function() {
                    self._processActive();
                } )
                .fail( function( err ) {
                    self._fail( err );
                } )
                .done();
        }
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
     * Resolves a deferred object with a value and then processes any backlog.
     * @param deferred - The deferred object which will be resolved.
     * @param val - The value to resolve with.  If val is null, this will mark the _done flag to true.
     **/
    _resolveActive: function( val ) {

        if( val === null || typeof val === 'undefined' ) {
            // this marks the final page.
            this._done = true;
        }

        // resolve the active deferred and mark it null so we can continue.
        this._activeDeferred.resolve( val );
        this._activeDeferred = null;

        // continue processing ...
        this._processQueue();
    },

    /**
     * Rejects a deferred object with an error.
     * @param deferred - The deferred object to reject.
     * @param err - The error to reject with.
     **/
    _fail: function( err ) {

        if( this._activeDeferred ) {
            this._activeDeferred.reject( err );
            this._activeDeferred = null;
        }

        // we can't continue so mark us done.
        this._done = true;

        // fail everything left in the queue.
        while( this._deferredQueue.length ) {
            this._deferredQueue.shift().reject( err );
        }
    }

    /**
     * Client code should provide this method.  An overriding function should return
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
