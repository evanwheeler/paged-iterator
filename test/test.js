var PagedIterator = require( '..' ),
    should = require( 'should' ),
    assert = require( 'assert' ),
    Q = require( 'q' );
    
var async = function( fn ) { 
    if( process && typeof process.nextTick === 'function' ) {
        process.nextTick( fn );
    }
    else { 
        setTimeout( fn, 0 );
    }
}
    
describe( 'PagedIterator(options)', function() { 
    it( 'should required option fetchPage', function() { 
        try { 
            var iter = new PagedIterator();
            assert( false );
        }
        catch(e) {
            e.message.should.equal( "fetchPage option is required" ); 
        }
    } );

    it( 'should allow pageSize option', function() { 
        var iter = new PagedIterator( { pageSize: 50, fetchPage: function() {} } );
        iter.pageSize.should.equal( 50 );
    } );

    it( 'should allow page option', function() { 
        var iter = new PagedIterator( { page: 2, fetchPage: function() {} } );
        iter.page.should.equal( 2 );
    } );
} );

function makeFetchPageValue( maxVal ) { 
    return function fetchPageImpl( page, pageSize, iter ) { 
        var rtn = [];
        for( var i = 0; i < pageSize; ++i ) { 
            var v = 1 + i + ( page * pageSize );
            if( v > maxVal ) break;
            rtn.push( v );
        }        
        return rtn;
    };
}

function makeFetchPagePromise( maxVal ) { 
    return function fetchPageImpl( page, pageSize, iter ) { 
        var rtn = [];
        for( var i = 0; i < pageSize; ++i ) { 
            var v = 1 + i + ( page * pageSize );
            if( v > maxVal ) break;
            rtn.push( v );
        }        
        
        var d = Q.defer();
        
        process.nextTick( function() { 
            d.resolve( rtn );
        } );
        
        return d;
    };
}

describe( 'PagedIterator#next', function() { 
    it( 'should work when fetchPage returns a raw value', function( done ) { 
        var iter = new PagedIterator( { fetchPage: makeFetchPageValue( 1 ), pageSize: 20 } );
        iter.next().then( function( result ) { 
            async( function() { 
                result.should.equal( 1 );
                done();
            } );
        }, function( err ) { 
            async( function() { 
                assert( false );
                done();
            } );
        } );
    } );

    it( 'should work when fetchPage returns a promise', function( done ) { 
        var iter = new PagedIterator( { fetchPage: makeFetchPagePromise( 1 ), pageSize: 20 } );
        iter.next().then( function( result ) { 
            async( function() { 
                result.should.equal( 1 );
                done();
            } );
        }, function( err ) { 
            async( function() { 
                assert( false );
                done();
            } );
        } );
    } );

    it( 'should work across pages', function( done ) { 
        var iter = new PagedIterator( { fetchPage: makeFetchPagePromise( 20 ), pageSize: 5 } );
            
        var arr = [];
        for( var i = 0; i < 20; ++i ) { 
            arr.push( iter.next() );
        }
        
        Q.all( arr ).then( function( result ) { 
            async( function() { 
                result.length.should.equal( 20 );
                
                for( var j = 0; j < 20; ++j ) 
                    result[j].should.equal( j + 1 );
                
                done();
            } );
        } ).fail( function( err ) { 
            async( function() { 
                assert( false );
                done();
            } );
        } );
    } );

    it( 'should return null when no more items exist', function( done ) { 
        var iter = new PagedIterator( { fetchPage: makeFetchPagePromise( 20 ), pageSize: 5 } );
            
        var arr = [];
        for( var i = 0; i < 25; ++i ) { 
            arr.push( iter.next() );
        }
        
        Q.all( arr ).then( function( result ) { 
            async( function() { 
                result.length.should.equal( 25 );
                var j;
                for( j = 0; j < 20; ++j ) 
                    result[j].should.equal( j + 1 );
                    
                for( j = 20; j < 25; ++j ) { 
                    should( result[j] ).be.null;
                }
                
                done();
            } );
        } ).fail( function( err ) { 
            async( function() { 
                assert( false );
                done();
            } );
        } );
    } );
} );
