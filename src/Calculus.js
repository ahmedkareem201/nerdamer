module.exports = function(nerdamer) {
    var core = nerdamer.getCore(),
        _ = core.PARSER,
        isSymbol = core.Utils.isSymbol,
        FN = core.groups.FN,
        format = core.Utils.format,
        keys = core.Utils.keys,
        Symbol = core.Symbol,
        text = core.Utils.text,
        N = core.groups. N,
        S = core.groups.S,
        FN = core.groups.FN,
        PL = core.groups.PL,
        CP = core.groups.CP,
        CB = core.groups.CB,
        EX = core.groups.EX;
 
    var __ = core.Calculus = {
        diff: function(symbol, d) { 
            d = core.Utils.text(d);//we need only the text representation of the 
            var self = __.diff;
            //format [multiplier multiplier, substition function, power multiplier]
            var table = {
                'sin': 'cos({0})',
                'cos': '-sin({0})',
                'tan': 'sec({0})^2',
                'csc': '-cot({0})*csc({0})',
                'sec': 'sec({0})*tan({0})',
                'cot': '-csc({0})^2',
                'asin': '1/(sqrt(1-({0})^2))',
                'acos': '-1/(sqrt(1-({0})^2))',
                'atan': '1/(1+({0})^2)',
                'log': '1/{0}',
                'abs': '{1}/abs({1})'
            };

            function polydiff(symbol) { 
                if(!(symbol.value === d || symbol.contains(d))) return new Symbol(0);
                if(symbol.value === d || symbol.contains(d)) { 
                    if(isSymbol(symbol.power)) {
                        symbol = _.multiply(symbol, symbol.power.copy());
                        symbol.power = _.add(symbol.power, new Symbol(-1));
                    }
                    else {
                        symbol.multiplier *= symbol.power;
                        symbol.power -=1;
                        //has to symbol become a number
                        if(symbol.power === 0) symbol = new Symbol(symbol.multiplier);
                    }
                }
                return symbol;
            }

            function productdiff(symbol) {
                var k = keys( symbol.symbols ),
                    l = k.length,
                    retval = new core.Symbol(0);// the default return

                // A regular for loop is chosen to reduce the number of loops by pulling the keys and working with that;
                for( var i=0; i<l; i++ ) {
                    var key = k[i],
                        df = derive(symbol.symbols[key].copy()); 
                    if(df.valueOf() !== 0) {
                        var ll = k.length;
                        for( var j=0; j<ll; j++ ) {
                            //we need to skip the current symbol
                            if(j !== i) {
                                var s = symbol.symbols[k[j]];
                                df = _.multiply(df, s);
                            }
                        }
                        retval = _.add(retval, df);
                    }
                }

                return retval;
            }

            function multidiff(symbol) {
                var retval = new Symbol(0);
                symbol.forEachWithin(function(sub_symbol) {
                    retval = _.add(retval, derive(sub_symbol));
                });
                return retval;
            }

            //define how the different symbols are derived
            function derive(symbol) {
                switch(symbol.group) {
                    case core.groups.N:
                        symbol = new Symbol(0);
                        break;
                    case core.groups.S: 
                        symbol = polydiff(symbol);
                        break;
                    case FN:
                        //we assume that all functions only have 1 argument
                        symbol = _.parse(format(table[symbol.baseName], symbol.args[0].text(), d));
                        break;
                    case core.groups.PL:
                        symbol = multidiff(symbol);
                        break;
                    case core.groups.CP:
                        symbol = multidiff(symbol);
                        break;
                    case core.groups.CB:
                        symbol = productdiff(symbol);
                        break;
                    default:
                        symbol = new Symbol(1);
                }
                return symbol;
            }
            
            var derived = derive(symbol.copy());
            if(symbol.group !== S && symbol.power !== 1) _.multiply(polydiff(symbol.copy()), derived);
            if(isSymbol(symbol.power) && symbol.power.contains(d)) {
                derived = _.multiply(derived, self.call(self, symbol.power.copy(), d));
            }

            if(symbol.args) {
                derived = _.multiply(derived, self.call(self, symbol.args[0].copy(), d));
            }

            return derived;
         },
        sum: function(fn, index, start, end) {
            if(!(index.group === core.groups.S)) throw new Error('Index must be symbol. '+text(index)+' provided');
            index = index.value;
            var retval;
            if(core.Utils.isNumericSymbol(start) && core.Utils.isNumericSymbol(end)) {
                start = start.multiplier;
                end = end.multiplier;

                var variables = core.Utils.variables(fn);
                if(variables.length === 1 && index === variables[0]) {
                    var f = core.Utils.build(fn);
                    retval = 0;
                    for(var i=start; i<=end; i++) {
                        retval += f.call(undefined, i);
                    }
                }
                else {
                    var f = fn.text(),
                        subs = {'~': true}, //lock subs
                    retval = new core.Symbol(0);

                    for(var i=start; i<=end; i++) {
                        subs[index] = new Symbol(i); 
                        retval = _.add(retval, _.parse(f, subs)); //verrrrryyy sllloooowww
                    }
                }
            }
            else {
                retval = _.symfunction('sum',arguments);
            }

            return retval;
        },
        integrate: function(symbol, ig) {
            var ig_val = ig.text();

            var p_int = function(symbol) {
                symbol.power += 1; 
                symbol.multiplier /= symbol.power;
                return symbol;
            },
            integrate_symbols = function(symbol) {
                var result = new Symbol(0);
                symbol.forEachWithin(function(s) {
                    result = _.add(result, integrate(s));
                });
                return result;
            },
            look_up = function(symbol) {
                var table = {
                    cos: 'sin({0})',
                    sin: '-cos({0})',
                    tan: 'log(sec({0}))',
                    sec: 'log(tan({0})+sec({0}))',
                    csc: '-log(csc({0})+cot({0}))',
                    cot: 'log(sin({0}))',
                    acos: '({0})*acos({0})-sqrt(1-({0})^2)',
                    asin: '({0})*asin({0})+sqrt(1-({0})^2)',
                    log: '({0})*log({0})-({0})'
                },
                integral = table[symbol.baseName],
                arg = symbol.args[0];
                if(integral && arg.group === S) {
                    symbol = _.parse(format((1/arg.multiplier)+'*('+integral+')', arg.text()));
                }
                return symbol;
            },
            integrate = function(symbol) {
                var retval;
                switch(symbol.group) {
                    case N:
                        retval = _.multiply(symbol.copy(), ig.copy());
                        break;
                    case S:
                        //if the value is the same as the integrand.
                        if(symbol.group === S && symbol.value === ig_val) {
                            if(symbol.power === -1) {
                                retval = _.symfunction('log', [new Symbol(ig)]);
                                retval.multiplier = symbol.multiplier;
                            }
                            else {
                                retval = p_int(symbol);
                            }
                        }
                        //otherwise just multiply times the integrand e.g. y become y*x if integrand is x
                        else {
                            retval = _.multiply(symbol.copy(), ig.copy());
                        }
                        break;
                    case FN: 
                        var arg = symbol.args[0]; 
                        if(arg.contains(ig_val)) {
                            if(arg.power === 1 && symbol.power === 1) {
                                symbol = look_up(symbol);
                            }
                        }
                        retval = symbol;
                        break;
                    case PL:
                        retval = integrate_symbols(symbol);
                        break;
                    case CP:
                        retval = integrate_symbols(symbol);
                        break;
                    case CB:
                        symbol.forEachWithin(function(s,x){
                            if(s.contains(ig_val)) this.symbols[x] = integrate(s);
                        });
                        symbol.updateHash();
                        retval = symbol;
                        break;
                }
                return retval;
            };

            return integrate(symbol);    
        }
    };
    
    return [
        {
            name: 'diff',
            visible: true,
            numargs: 2,
            build: function(){ return __.diff; }
        },
        {
            name: 'sum',
            visible: true,
            numargs: 4,
            build: function(){ return __.sum; }
        },
        {
            name: 'integrate',
            visible: true,
            numargs: 2,
            build: function(){ return __.integrate; }
        }
    ];
};
