/*
 * Author  : Martin Donk
 * Source  : http://www.nerdamer.com
 * Email   : mdonk@gmail.com
 * License : http://opensource.org/licenses/LGPL-3.0
 */

var nerdamer = (function() {
    
    var EQNS = [],
        KNOWN_VARS = {},
        NUMER = false;

    // The groups that help during parsing. Note that the names are NOT mathematically accurate.
    // For instance POLYNOMIAL does not include the zeroth power. Some others are just names I chose.
    var NUMERIC = 1,
        SYMBOLIC = 2,
        FUNCTION = 3,
        POLYNOMIAL = 4, //and I do use this term very loosely.
        COMBINATION = 5,
        COMPOSITION = 6,
        EXPONENTIAL = 7;

    var operators = {
        '+': {order: 1, fn: 'add'},
        '-': {order: 2, fn: 'subtract'},
        '*': {order: 3, fn: 'multiply'},
        '/': {order: 4, fn: 'divide'},
        '^': {order: 5, fn: 'pow'}
    },

    //in order to use the function in Math just set the function name to null. eg. Math.cos -> 'cos':null
    functions = {
        'cos' : null,
        'sin' : null,
        'tan' : null,
        'sec' : null,
        'csc' : null,
        'cot' : null,
        'acos': null,
        'asin': null,
        'atan': null,
        'exp' : null,
        'log' : log,
        'abs' : abs,
        'sqrt': sqrt
    },
    
    Math2 = {
        'sec': function( x ) { return 1/Math.cos( x );},
        'cot': function( x ) { return 1/Math.tan( x );},
        'csc': function( x ) { return 1/Math.sin( x );}
    },

    //define any and all constants here. Or use the defConst of the nerdamer object
    constants = {
        'pi': Math.PI,
        'e' : Math.E
    };

    function sqrt( symbol ) { 
        var g = symbol.group
        if( g === NUMERIC ) {
            symbol.multiplier = Math.sqrt( symbol.multiplier );
        }
        else { 
            symbol.power /= 2;
        }
        return symbol;
    }

    function abs( symbol, fn ) {
        fn = fn || Symbol('abs')
        symbol.multiplier = Math.abs( symbol.multiplier );
        return math( fn, symbol )
    }
    
    function log( symbol ) {
        if( symbol.value === 'e' && symbol.multiplier === 1 ) {
            return isSymbol( symbol.power ) ? symbol.power : Symbol( symbol.power )
        }
        else {
            return math( Symbol('log'), symbol )
        }
    }

    // A wrapper for methods in the Math object. The method being wrapped still has to be added to the functions object and its key set to 
    // null, undefined, or anything falsy;
    function math( fn , symbol ) { 
        var g = symbol.group; 
        var name = fn.value;
        if( g === NUMERIC && NUMER ) { 
            var f = Math[name] ? Math[name] : Math2[name]
            symbol.multiplier = f( symbol.multiplier );
        }
        else {
            if( g === COMPOSITION || g === POLYNOMIAL ){
                symbol.group = FUNCTION;
                symbol.value = fn.value;
            }
            else {
                fn.group = FUNCTION;
                fn.symbols = Parser.addSymbol( symbol, {}, fn );
                symbol = fn;
            }
        } 
        return symbol;
    }

    //An attempt to get objects to behave somewhat as symbols.
    //Depends on methods: text, validateName
    function Symbol( value ) {
        if( !( this instanceof Symbol ) ) {
            return new Symbol( value );
        }
        if( !isNaN( value ) ) {
            this.group = NUMERIC;
            this.value = '_'; 
            this.multiplier = Number( value );
        }
        else {
            this.group = SYMBOLIC;
            validateName( value );
            this.value = value;
            this.multiplier = 1;
            this.power = 1;
        }
        //remove the strict warning.
        return this; 
    }
    Symbol.prototype = {
        // return a text reprensentation of the symbol's base value. This method depends on text in cases where 
        // because sometimes a clear distinction has to be made of the value between brackets for instance.
        // e.g. 2(x+1) and (x+1) the same but the same does not hold true for a function like cos(x) and cos(2x). 
        // That's when text comes in
        name: function( baseOnly ) {
            var v, g = this.group, symbol, pw;
            if( g === COMBINATION || g === COMPOSITION || g === POLYNOMIAL && this.power !== 1 ) { 
                //the delimiter for joining back the name. Any character excluded from variable names will do really.
                var d = g === COMBINATION ? '*' : '+',
                    names = [];
                for( symbol in this.symbols ) {
                    var t = text( this.symbols[symbol] );
                    names.push( this.symbols[symbol].group === COMPOSITION ? inBrackets( t ) : t );
                }
                v = inBrackets( names.sort().join(d) );
                if( g === COMPOSITION && this.power !== 1 ) v = v+ baseOnly ? '' : '^('+this.power+')';
            }
            else if( g === POLYNOMIAL ) { 
                for( pw in this.symbols ) {
                    v = this.symbols[pw].value;
                    break;
                }
            }
            else if( g === FUNCTION ) {
                v = this.value+inBrackets( text(this.symbols) )+( this.power === 1 ? '' : baseOnly ? '' : '^('+this.power+')' );
            }
            else {
                v = this.value;
            }
            return v;
        },
        // Copies over a predefined list of properties from one symbol to another.
        copy: function() {
            var copy = new Symbol(),
                properties = [ 'multiplier','value','group' ],
                l = properties.length, i;

            if( this.symbols ) {
                copy.symbols = {};
                for( var x in this.symbols ) {
                    copy.symbols[x] = this.symbols[x].copy();
                }
            }

            for( i = 0; i < l; i++ ) {
                if( this[properties[i]] ) {
                    copy[properties[i]] = this[properties[i]]
                }
            }

            if( this.power ) {
                copy.power = this.power instanceof Symbol ? this.power.copy() : this.power;
            }

            return copy;
        },
        valueOf: function() {
            if( this.group === NUMERIC ) {
                return this.multiplier;
            }
            else if( this.power === 0 ){
                return 1;
            }
            else if( this.multiplier === 0 ) {
                return 0;
            }
            else {
                return text( this );
            }
        },
        //an add-on helper function to help sniff out symbols in complex symbols
        hasVariable: function( x ) {
            return this.group > SYMBOLIC && ( x in this.symbols );
        }
    }
    
    function Expression( str ){
        this.tokens = this.tokenize( str );
    }
    Expression.prototype = {
        tokenize: function( expStr ) {
        //normalize e.g. turn (x-2)(x+1) into (x-2)*(x+1) and clean out white space.
        expStr = expStr.split(' ').join('').replace( /\)\(/g, ')*(' );
        var self = this,
            openBrackets = 0,
            stack = [],
            depth = [],
            //variable for the last operator
            lastOperator = 0, 
            //expression length
            el = expStr.length, 
            brackets = {
                '(': function() {

                    //a bracket signifies a new function and this needs it's own stack
                    stack.push( [] ); 

                    //we need to find our way back to upper stack so make a note of it
                    depth.push( stack ); 

                    //move to the new stack 
                    stack = stack[stack.length - 1]; 
                    
                    //open a new  bracket
                    openBrackets++;
                },
                ')': function() {

                    //move up one level on the stack
                    stack = depth.pop(); 
                    
                    //close the bracket
                    openBrackets--;
                }
            };
            var stackInsert = function( pos ) {
                var e = expStr.substring( lastOperator, pos ),
                    curOperator = expStr.charAt( pos ); 
                        if(e) {
                            if( KNOWN_VARS[ e ] ) {
                                e = self.tokenize( KNOWN_VARS[e].eq );
                            }
                            else {
                                if( constants[e] && NUMER ) {
                                    e = constants[e];
                                }
                                e = Symbol( e );
                            }
                            stack.push( e );
                        }

                    if(curOperator) {
                        stack.push( curOperator );
                    }    
            };
            for( var i=0; i<el; i++ ){
                var c = expStr.charAt( i );
                if( operators[c] || brackets[c] ) {
                    stackInsert( i );
                    lastOperator = i+1; 
                    if( brackets[c] ) {
                        stack.pop();
                        brackets[c]();
                    }
                }
            }
            stackInsert( expStr.length );
            if( openBrackets !== 0 ) throw new Error('Malformed expression!');
            return stack;
        }
    }
    var Parser = {
        tokenize: Expression.prototype.tokenize,
        //The function responsible for the actual parsing of the expression.
        parseTokens: function( tokensOrExpression ) { 
            var tokens = tokensOrExpression.tokens || tokensOrExpression,
                parsed = {},
                curPosition = 0,
                lastOrder = 0; 
            while( curPosition <= tokens.length ){ 
                var token = tokens[curPosition],
                    atTheEnd = curPosition === tokens.length;
                //function support
                if( token && token.value in functions ) {
                    token = remove( tokens, curPosition );
                    var contents = Parser.fetchSymbol( tokens, curPosition ),
                        fn = functions[ token.value ]
                    insert( tokens , ( fn ? fn( contents, token ) : math( token, contents ) ), curPosition ); 
                }
                if( operators[token] || atTheEnd ) {

                    // an order of -1 insures that we have a lower order than anything else and forces processing
                    var order = atTheEnd ? -1 : operators[token].order;

                    if( order < lastOrder ) {

                        // remove the whole prior section from the tokens as we now know that we're either at the end
                        // or a higher order operator [*,^,/]
                        var subTokens = tokens.splice( 0, curPosition ),

                            // we look ahead to the next operator after the subtokens to determine if we can place the last
                            // symbol into parsed or if we have to hang on to it for further multiplication after a '^'.*/
                            nextOperator = tokens[0]; 

                        //parsing from this point on is pretty straight forward
                        while( subTokens.length > 0 ) { 
                            var firstSymbol = Parser.fetchSymbol( subTokens ),
                                curOperator = subTokens.pop();
                            if( curOperator === '-' ){
                                //just negate the multiplier and reinsert for addition
                                firstSymbol.multiplier *= -1; 
                                if( subTokens[0] ) subTokens.push( '+' );
                                subTokens.push( firstSymbol ); 
                            }
                            // insert the token into parsed if the operator is + or if no operator was found meaning we 
                            // only have one token left.
                            else if( curOperator === '+' || !curOperator ) {
                                if( nextOperator === '*' || nextOperator === '/' ){

                                    //At this point we've already seen that the next operator so clear the next operator for the next iteration.
                                    nextOperator = null; 

                                    tokens.unshift( firstSymbol );
                                }
                                else {
                                    Parser.unpackSymbol( firstSymbol, parsed );
                                }
                            }
                            else { 
                                var secondSymbol = Parser.fetchSymbol( subTokens ); 
                                subTokens.push( this[operators[curOperator].fn]( firstSymbol, secondSymbol ) ); 
                            }
                        }

                        if( order > 0 ) {
                            // go back to the beginning and let's start parsing again. A better point may be chosen and may lead to better
                            // performance but I'll investigate that later.
                            curPosition = 0; 
                        }                
                    }
                    lastOrder = order;
                }
                curPosition++;
            }
            //place a zero in the object if it's empty e.g. 1-1 will result in a empty object
            if( keys( parsed ).length === 0 ) parsed._ = Symbol(0); 
            return parsed;
        },
        // a function to safely fetch a token out of the token array. This will read a sub-array into a symbol during parsing.
        fetchSymbol: function( tokens, index ) { 
            // pop out the token
            var sym = index >= 0 ? remove( tokens, index ) : tokens.pop(); 

            if( isArray( sym ) ) {
                //pack it and ship it
                sym = this.packSymbol( this.parseTokens( sym ) );
            }
            return sym;
        },
        // transfer over a symbol when downgrading to simpler symbol.
        transfer: function( second, first ) { 
            first.multiplier *= second.multiplier;
            this.powMultiply( first, second ); //TODO: have the value check if it's dealing with a number and more as well;
            first.value = second.value;
            first.group = second.group;
            delete first.symbols;
            delete first.length;
        },

        // This method neatly reorganizes all the tokens into an object and is sort of a compliment to the Parser.add method.
        // If a symbol is found they are added together. It also does some book keeping on higher group Symbols.
        addSymbol: function( symbol, item, parent, multiply ) { 
            var obj;
            if( isSymbol( item ) ) {
                obj = item.symbols;
                parent = item;
            }
            else {
                obj = item;
            }
            if( symbol.power == 0 ) symbol = Symbol( symbol.multiplier ); 
            //"polynomials" are stored by their power so verify and use the power value as the key.
            var name = ( parent ? parent.group === POLYNOMIAL: false ) ? ( isSymbol( symbol.power ) ? text( symbol.power ) : symbol.power ) : symbol.name();
            if( !obj[name] ) {
                //some bookkeeping
                if( parent ) {
                    if( parent.group === COMBINATION ) {
                        parent.multiplier *= symbol.multiplier;
                        symbol.multiplier = 1;
                    }
                    !parent.length ? parent.length = 1 : parent.length++;
                }
                //if the symbol is zero why even bother adding it.
                if( symbol.multiplier !== 0 ) obj[name] = symbol;
            }
            else {
                obj[name] = multiply ? this.multiply( obj[name], symbol ) : this.add( obj[name], symbol );
                //time for some clean up;
                if( obj[name].multiplier == 0 ) { 
                    delete obj[name];
                    if( parent ) parent.length--;
                }
                if( parent && parent.group === COMBINATION && +obj[name] === 1 ) {
                    delete obj[name]; parent.length--;
                    if( parent.length === 1 ) {
                        //I have a bit of a quandry here in that I don't want to have to rely on the returned obj
                        //but I still need to parent to transform;
                        this.transfer( firstObject( obj ), parent )
                    }
                }
            }
            return obj;
        },
        add: function( a, b) { 
            if( !isSymbol(a) ) a = Symbol(a); //this enables us to pass in numbers which is usefull for exponentials
            if( !isSymbol(b) ) b = Symbol(b);
            var g1 = a.group, g2 = b.group;
            var p1 = ''+a.power, p2 = ''+b.power; 
            if( g1 === COMBINATION && g2 === POLYNOMIAL || 
                g1 === SYMBOLIC && g2 === POLYNOMIAL ) return this.add( b, a );
            //note: the add function doesn't get called directly during parse time
            //first let's make sure we're not dealing with a polynomial
            if( g1 === POLYNOMIAL && p1 === '1' ) { 
                var m = a.multiplier, x;
                //move the value of the multiplier down to avoid later problems
                if( m !== 1 ) {
                    for( x in a.symbols ) {
                        a.symbols[x].multiplier *= a.multiplier;
                    }
                    a.multiplier = 1;
                }
                if( g2 === POLYNOMIAL && p2 === '1') {
                    for( x in b.symbols ) {
                        this.addSymbol( b.symbols[x], a.symbols, a );
                    }
                }
                else {
                    this.addSymbol( b, a.symbols, a );
                }
            }
            else if( a.value === b.value && p1 === p2 ){
                a.multiplier += b.multiplier;
            }  
            else {
                a = this.convertAndInsert( a, b, POLYNOMIAL );
            }
            return a;
        },
        //this is method should never actually be called but is there just in case something was overlooked
        subtract: function( a, b ) {
            b.multiplier *= -1;
            return this.add( a, b );
        },
        multiply: function( a, b ) {   
            var g1 = a.group, g2 = b.group,
                p1 = a.power, p2 = b.power,
                n1 = g1 === FUNCTION ? a.name( true ) : null,
                n2 = g2 === FUNCTION ? b.name( true ) : null;
            //quick returns
            if( p1 === 0 ) a = Symbol( a.multiplier );
            if( p2 === 0 ) b = Symbol( a.multiplier );
            if( a.multiplier === 0 || b.multiplier === 0 ) return Symbol( 0 );

            if( g2 > g1 ) { 
                //always have the lower group on the right for easy comparison.
                return this.multiply( b, a) 
            }
            var isCompositeA = ( g1 === POLYNOMIAL || g1 === COMPOSITION ),
                isCompositeB = ( g2 === POLYNOMIAL || g2 === COMPOSITION ),
                t, x;
            a.multiplier *= b.multiplier;
            //exit early if it's a number.
            if( g2 === NUMERIC ) return a;
            // We have already grabbed the value of the multiplier so we have to now set it to 1.
            b.multiplier = 1;

            if( a.value === b.value && g2 !== NUMERIC && g1 !== POLYNOMIAL && 
                !( g1 === EXPONENTIAL && g2 === POLYNOMIAL ) && n1 === n2 ) { 
                this.powAdd( a, b );
                if( +a.power === 0 ) {
                    //this is needed if during multiplication one of the symbols in a combination results in a zero power.
                    return Symbol( a.multiplier );
                }
            }
            else if( isCompositeA && p1 === 1 || isCompositeB && p2 === 1 ) { 
                // The multiply method always puts the lower group symbol to the right but sometimes, such as in the case of a multipart symbol,
                // We need it back on the right. The following tests for these cases.
                if( g1 === COMBINATION && g2 === POLYNOMIAL || g1 === FUNCTION && g2 === COMPOSITION ||
                    g1 === EXPONENTIAL && g2 === POLYNOMIAL || g1 === EXPONENTIAL && g2 === COMPOSITION ||
                    isCompositeB && isCompositeA && p1 !== 1  ) { 
                    t = a; a = b; b = t; //swap symbols
                    t = p1; p1 = p2; p2 = t; //swap powers
                } 
                if( a.value !== b.value && a.group === POLYNOMIAL || p1 !== p2 ) { a.group = COMPOSITION; }
                t = {}; a.length = 0;
                for( x in a.symbols ) {          
                    var r = this.multiply( a.symbols[x], b.copy() );  
                    var m = r.multiplier;
                    if( b.group === POLYNOMIAL && p2 === 1 || b.group === COMPOSITION && p2 === 1 ) {
                        for( var xx in r.symbols ) {
                            if( m!== 1 ) r.symbols[xx].multiplier *= m;
                            this.addSymbol( r.symbols[xx], t, a );
                        }
                        r.multiplier = 1;
                    }
                    else {
                        this.addSymbol( r, t, a ); 
                    }
                }
                   a.symbols = t; 
            }
            else if( g1 === COMBINATION && g2 !== NUMERIC && g2 !== POLYNOMIAL ) { 
                if( g2 === COMBINATION && p1 === 1 ) { 
                    for( x in b.symbols ) {
                        this.powDivide( b.symbols[x], a );
                        this.addSymbol( b.symbols[x], a, undefined, true );
                    }
                }
                else {
                    this.powDivide( b, a );
                    this.addSymbol( b, a, undefined, true );
                }
            }
            else if( g2 !== NUMERIC ){ 
                a = this.convertAndInsert( a, b, COMBINATION );
            }
            return a;
        },
        divide: function( b, a ) {
            if( b.multiplier === 0 ) throw new Error('Division by zero!')
            b.multiplier = 1/b.multiplier;
            if( b.group > NUMERIC ) {
                if( isSymbol( b.power ) ) {
                    b.power.multiplier *= -1;
                }
                else {
                    b.power *= -1;
                }
            }
            return this.multiply( a, b );
        },
        pow: function( b, a ) { 
            if( b == 1 ) return a;//x^1 = x;
            
            var g1 = a.group, g2 = b.group;

            //if the radical is even we must retain its absolute value.
            var isEven = 1/( +b - parseInt( +b ) ) % 2 === 0 && a.power % 2 === 0;

            if( g1 === NUMERIC && g2 === NUMERIC ) {
                a.multiplier = Math.pow( a.multiplier, b.multiplier );
                return a;//early exit.
            }
            else { 
                var p = a.power;
                if( g2 === NUMERIC && !isSymbol( p ) ) {
                    a.multiplier = Math.pow( a.multiplier, b.multiplier );
                    a.power *= b.multiplier;
                }
                else { 
                    // the symbols is now an exponential
                    if( g1 !== FUNCTION ) {
                        //but first some upgrades to the humble numeric symbol
                        if( g1 === NUMERIC ) {
                            a.value = a.multiplier;
                            a.multiplier = 1;
                            p = 1;
                        }
                        // It will become impossible to distinguish between a composite and a combination once the 
                        // the group is changed by looking at the objects structure so we make note.
                        if( g1 !== EXPONENTIAL ) a.origin = g1;
                        a.group = EXPONENTIAL;
                        
                    }

                    // Make sure that you're sending in a symbol for multiplication
                    if( !isSymbol( p ) ){ p = Symbol( p ); }
                    a.power = this.multiply( p , b );

                    // No need leave the power anymore complex than it needs to be.
                    if( a.power.group === NUMERIC ) { a.power = a.power.multiplier; } 
                }
            }
            //If the symbol went down from an exponential. Restore.
            if( a.power === 1 && a.origin ) {
                if( a.origin === NUMERIC ) {
                    a = Symbol( a.multiplier*a.value );
                }
                else {
                    a.group = a.origin;
                }
            }
            // Verify that the symbol is a candidate to have its absolute value retained
            if( isEven && parseInt( a.power + 1 ) % 2 === 0 ) a = abs( a );
            return a;
        },
        // A method to pack intermediate results into a symbol or just return the symbol.
        // e.g. calculations done on an expression between brackets
        packSymbol: function( obj, group ) {
            group = group || COMPOSITION;
            var k = keys( obj );
            var l = k.length;
            if( l === 0 ) {
                return Symbol(0);
            }
            else if( l === 1 ) {
                return obj[k[0]]; 
            }
            else {
                var n = new Symbol();
                n.group = group;
                n.symbols = obj;
                n.length = l;
                n.value = text( obj );
                return n;
            }
        },
        //this method is provides a quick and dirty way to upgrade or downgrade a symbol's group
        convertAndInsert: function( symbol, symbol2,  group ) {
            var ns = Symbol(),
                // Lets addSymbol know to multiply instead of add the symbols if the parsed object already has such a value.
                isCombo = group === COMPOSITION; 
            ns.group = group;
            if( group > SYMBOLIC ) {
                ns.symbols = {}; 
                ns.length = 0;
                this.addSymbol( symbol, ns.symbols, ns, isCombo ); 
                this.addSymbol( symbol2, ns.symbols, ns, isCombo );
                ns.value = ns.name();
                symbol = ns;
            }
            else if( group <= SYMBOLIC && symbol.group > SYMBOLIC ) {
                delete symbol.symbols;
            } 
            return symbol;
        },

        // Method unpacks a COMPOSITE Symbol into a parsed object.
        unpackSymbol: function( symbol, parsed, forceUnpack ) { 
            if( symbol.power === 1 && symbol.group === COMPOSITION || forceUnpack )  {
                for( var x in symbol.symbols ) {
                    symbol.symbols[x].multiplier *= symbol.multiplier; 
                    this.addSymbol( symbol.symbols[x], parsed );
                }
            }
            else {
                this.addSymbol( symbol, parsed );
            }
        },
        //a quick and dirty way to get a fully built symbol.
        rToken: function( str ) {
            return this.packSymbol( this.parseTokens( this.tokenize( str ) ) );
        },
        // The next functions are needed in case the exponential is a symbol
        powDivide: function( a, b ) {
            if( isSymbol( a.power ) || isSymbol( b.power )) {
                b.power = this.divide( a.power, b.power ); 
            }
            else {
                a.power /= b.power;
            }
        },
        powMultiply: function( a, b) { 
            if( isSymbol( a.power ) || isSymbol( b.power )) {
                a.power = this.multiply( a.power, b.power );
            }
            else {
                a.power *= b.power;
            }
        },
        powAdd: function( a, b ) { 
            if( isSymbol( a.power ) || isSymbol( b.power )) {
                a.power = this.add( a.power, b.power );
            }
            else {
                a.power += b.power;
            }
        }
    };
    // removes an item from either an array or an object.
    // If an array the index must be specified after the array.
    // If an object the key must be specified
    function remove( obj, indexOrKey ) {
        var result;
        if( isArray( obj ) ) {
            result =  obj.splice( indexOrKey, 1 )[0];
        }
        else {
            result = obj[ indexOrKey ];
            delete obj[ indexOrKey ];
        }
        return result;
    }

    // returns true if the obj is a symbol.
    function isSymbol( obj ) {
        return ( obj instanceof Symbol );
    }

    // returns the keys of an object/associative array.
    function keys( obj ) {
        var k = [];
        for( var key in obj ) { k.push( key ); }
        return k;
    }

    // This recursive method attempts to return a parsed object or symbol back in text form.
    // When asFunction is set to true it will make sure to write in JS function form.
    function text( obj, delimiter, option, forceBracket ) { 
        var asFunction = option === 'function',
            g = obj.group, v; 
        delimiter = delimiter || '+';
        if( g === COMBINATION || obj.origin === COMBINATION ) delimiter = '*';
        //base case
        if( obj instanceof Symbol ) {
            if( g === NUMERIC ) {
                v = +obj.multiplier;
            }
            else {
                if( g === FUNCTION ) {
                    // Whenever we exporting the text to a javascript function we have to format the text differently.
                    // This should probably be its own function but for now we're using text.
                    v = asFunction ? 'Math.'+obj.value : obj.value;
                    v = v + inBrackets( text( obj.symbols, undefined, option ) );
                }
                else if( g === POLYNOMIAL || g === COMPOSITION || g === COMBINATION || g === EXPONENTIAL && obj.symbols ) {
                    v = text( obj.symbols, delimiter, option );
                    if( obj.multiplier !== 1 && g !== COMBINATION || obj.power !== 1 || forceBracket )  v = inBrackets( v );
                }
                else {
                    v = obj.value;
                }
                var m = obj.multiplier, p = obj.power;
                if( asFunction ) {
                    if( p !== 1 ) v = 'Math.pow'+inBrackets( v+','+( g === EXPONENTIAL ? text( p, undefined, option) : p) );
                    if( m !== 1 ) v = m+'*'+v;
                }
                else {
                    m = m === 1 ? '' : m === -1 ? '-' : m+'*';
                    p = p === 1 ? '' : '^('+obj.power+')';
                    v = m+v+p;
                }    
            }
        }
        else {
            var a= [];
            for( var x in obj ) { 
                a.push( text( obj[x], undefined, option ) );
            }
            v = a.sort().join( delimiter ).replace(/\+\-/g,'-');
        }
        return v;
    }

    // inserts an object into an array or recursively adds items if an array is given
    function insert( arr, item, index ) {
        if( isArray( item ) ) {
            for( var i=0; i<=item.length+1; i++ ){
                insert( arr, item.pop(), index );
            }
        }
        else if( typeof index === 'undefined ') {
            arr.push( item );
        }
        else{
            arr.splice( index, 0, item );
        }
    }

    function isArray( arr ) {
        return arr instanceof Array;
    }

    function inBrackets( str ) {
        return '('+str+')';
    }
    
    
    function round( x, s ) { 
        s = s || 14;
        return Math.round( x*Math.pow( 10,s ) )/Math.pow( 10,s );
    }

    function firstObject( obj ) {
        for( var x in obj ) break;
        return obj[x];
    }

    function variables( obj, vars ) { 
        vars  = vars || {};
        if( isSymbol( obj ) ) { 
            var g = obj.group; var s = g === EXPONENTIAL;
            if( g > SYMBOLIC && g !== POLYNOMIAL && g !== EXPONENTIAL ) {
                variables( obj.symbols, vars ); 
            }
            else if( g === SYMBOLIC || g === POLYNOMIAL ) {
                vars[obj.value] = null;
            }
            else if( g === EXPONENTIAL ) { 
                var ov = obj.value;
                // We don't want a number passed in as a parameter so let's check.
                if( isNaN( ov ) ) vars[ov] = null;
                variables( obj.power, vars );
            }
        }
        else { 
            for( var x in obj ) {
                variables( obj[x], vars );
            }
        }   
        return keys( vars );
    }

    function validateName( name, type ) { 
        type = type || 'variable';
        if( !(/^[a-z][a-z\d\_]*$/gi.test( name ) ) ) {
            throw new Error( name+' is not a valid '+type+' name' );
        }
    }
    
    function stripWhiteSpace( str ) {
        return str.split(' ').join('');
    } 
    
    function build( parsed ) { 
        var vars = variables( parsed ).sort().join(',');
        return new Function( vars, 'return '+text( parsed, undefined, 'function' )+';' );
    }
    
    function getEquation( equationNumber, fn ) {
        var e = !equationNumber ? EQNS.length - 1 : equationNumber - 1,
            eqn = EQNS[e],
            result = 'No equation found.';
            if( eqn ) { 
                eqn.equation =  fn( eqn );
                result = eqn.equation;
            }
        return result;
    }
    
    var Calculus = {
        //equivalent of derivative of the outside.
        diff: function( obj, d ) { 
            if( obj.group === FUNCTION ) {
                return this.chainRule( obj, d );
            }
            else {
                return this.derive( obj, d );
            }
        },
        polydiff: function( symbol, d ) {
            if( symbol.value === d || symbol.hasVariable( d )) {
                symbol.multiplier *= symbol.power;
                symbol.power -= 1; 
                if( symbol.power === 0 ) {
                    symbol = Symbol( symbol.multiplier );
                }
            } 
            return symbol;
        },
        derive: function( symbol, d ) { 
            var g = symbol.group, t, a, b, cp; 
            
            if( isSymbol( symbol ) ) {
                if( g === NUMERIC || g === SYMBOLIC && symbol.value !== d ) { 
                    symbol = Symbol( 0 );
                }
                else if( g === SYMBOLIC ) {  
                    symbol = this.polydiff( symbol, d );
                }
                else if( g === COMBINATION ) { 
                    return this.productRule( symbol, d );
                }
                
                else if( g === FUNCTION && symbol.power === 1 ) {
                    switch( symbol.value ) {
                        case 'log':
                            cp = symbol.copy();
                            symbol = Parser.divide( Parser.packSymbol( symbol.symbols), this.diff(Parser.packSymbol( cp.symbols ), d) );
                            break;
                        case 'cos':
                            symbol.value = 'sin';
                            symbol.multiplier *= -1;
                            break;
                        case 'sin': 
                            symbol.value = 'cos';
                            break;
                        //quick and pretty derivatives
                        case 'tan':
                            symbol.value = 'sec';
                            symbol.power = 2;
                            break;
                        case 'sec': 
                            //use a copy if this gives errors
                            symbol = this.quickdiff( symbol, 'tan');
                            break;
                        case 'csc':
                            symbol = this.quickdiff( symbol, '-cot');
                            break;
                        case 'cot':
                            symbol.value = 'csc';
                            symbol.multiplier *= -1;
                            symbol.power = 2;
                            break;
                    }
                }
                else if( g === FUNCTION && symbol.power !== 1 ) {
                    cp = symbol.copy();
                    if( g === FUNCTION ) cp.power = 1;
                    symbol = Parser.multiply( this.polydiff( cp, d ), this.derive( g === FUNCTION ? symbol : symbol.symbols, d ) );
                }
                else if( g === EXPONENTIAL ) { 
                        a = Parser.rToken( 'log'+inBrackets( symbol.value )+'*'+symbol.power );
                        b = this.diff( a, d );
                    symbol = Parser.multiply( symbol, b );
                }
                else if( g === COMPOSITION || g === POLYNOMIAL ) {
                    a = this.polydiff( symbol.copy(), d );
                    b = this.diff( symbol.symbols, d );
                    symbol = Parser.multiply( a, b );
                }
            }
            else { 
                t = {};
                var obj = symbol;
                for( var x in obj ) { 
                    Parser.addSymbol( this.derive( obj[x].copy(), d ), t );
                }
                symbol = Parser.packSymbol( t );
            } 
            return symbol;
        },
        //a quick and simple way to return a known derivative
        quickdiff: function( symbol, val, altVal ) {
            return Parser.multiply( symbol, Parser.rToken( val+inBrackets( altVal || text( symbol.symbols ) ) ));
        },
        chainRule: function( symbol, d ) {
            var a = this.derive( symbol, d ),
                b = this.derive( symbol.symbols, d );
            return Parser.multiply( a , b );
        },
        productRule: function( symbol, d ) { 
            var n = 0,//use this to keep track of how many derivatives you actually pulled
                stack = [],//we're going to stack the derivatives. This may seem wasteful at first but it saves us a lot of trouble later on
                k = keys( symbol.symbols ),
                l = k.length,
                result = symbol;// the default return
            //a standard for loop is chosen to reduce the number of loops by pulling the keys and working with that;
            for( var i=0; i<l; i++ ) {
                var key = k[i],
                    df = this.diff( symbol.symbols[key].copy(), d ); 
                if( +df !== 0 ) {
                    n++;
                    var ll = k.length;
                    for( var j=0; j<ll; j++ ) {
                        //we need to skip the current symbol
                        if( j !== i ) {
                            //the unfortunate thing is that we make a copy of the symbol even when we don't have to.
                            var s = symbol.symbols[k[j]];
                            df = Parser.multiply( df, s );
                        }
                    }
                    //if there is only one symbol return else
                    stack.push( df );
                }
            }
            //we have all the derivatives but let's return a symbol
            if( stack.length === 1 ) { 
                result = stack[0]; 
                result.multiplier *= symbol.multiplier;
            }
            else {
                var r = {};
                l = stack.length;
                for( i=0; i<l; i++ ) {
                    var c = stack[i];
                    c.multiplier *= symbol.multiplier;
                    Parser.addSymbol( c, r );
                }
                result = Parser.packSymbol( r ); 
            }
            return result;
        }
    };
    
    return {
        // Use this function to set a known value.
        known: function( str ) {
            var t = str.split('=');
            if( !t[1] ) t.push( 0 );//if the user just passes in a variable that variable is set to 0.
            validateName( t[0] );
            var kwn = new Expression( t[1] ),
                isSameVariable = false, l=kwn.tokens.length;
            for( var i=0; i<l; i++ ) { 
                if( kwn.tokens[i].value === t[0]){
                    //assigning a variable to itself currently results in an infinite loop
                    isSameVariable = true; break;
                }
            }
            if( t[0] in functions || isSameVariable ) throw new Error('Invalid assignment.');
            KNOWN_VARS[t[0]] =  kwn;
            KNOWN_VARS[t[0]].eq = text( Parser.parseTokens( kwn.tokens ) );
            return kwn.eq;
        },
        knowns: function() {
            var result = {};
            for( var x in KNOWN_VARS ) result[x] = KNOWN_VARS[x].eq;
            return result;
        },
        // Use this method to add and equation to the nerdamer object.
        addEquation: function( str, location ) {
            //Tokanize the string
            var expression = new Expression( ''+str );
            //parse out
            expression.parsed = Parser.parseTokens( expression.tokens );
            expression.equation = text( expression.parsed );
            location ? EQNS[location - 1] = expression : EQNS.push( expression );
            return expression;
        },
        // Use this method to get a list of equations currently contained in the nerdamer object.
        equations: function( asObject ) {
            var l = EQNS.length, result = asObject ? {} : [];
            for( var i = 0; i < l; i++ ){
                result[ asObject? i+1 : i ] = text( EQNS[i].parsed );
            }
            return result;
        },
        // Use this method to evaluate an expression prevously added.
        evaluate: function( equationNumber, numer ) {
            NUMER = !!numer; 
            var result = getEquation( equationNumber, function( eqn ){
                return text( Parser.parseTokens( eqn.tokenize( eqn.equation ) ) );
            });
            NUMER = false; //restore NUMER;
            return result;
        },
        // The only problem with this method is that you to make sure to keep in mind that the parameters are sorted alphabetically.
        buildFunction: function( equationNumber ) {
            return getEquation( equationNumber, function( eqn ){
                return build( eqn.parsed );
            });
        },
        clear: function( equationNumber, opt ) {
            if( opt === 'known' ) {
                remove( KNOWN_VARS, equationNumber );
            }
            else {
                if( !equationNumber ) equationNumber = EQNS.length;
                if( equationNumber === 'all' ) { EQNS = []; }
                else {
                    remove( EQNS, equationNumber - 1 )
                }
            }    
        },
        //just a test function at present
        diff: function( expStr, independent ) {
            var r = Calculus.diff( Parser.parseTokens( Parser.tokenize( expStr ) ), independent );
            return this.addEquation( text( r ) ).equation;
        }
    }
})();
