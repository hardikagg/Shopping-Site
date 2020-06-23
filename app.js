require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const https = require("https");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const findOrCreate = require("mongoose-findorcreate");
const MongoStore = require("connect-mongo")(session);

const app = express();

var d = new Date();
var isoDate = (d.toISOString()).substring(0, 10);
console.log(isoDate);
var day=d.getDay();


if(day===6){
    d.setDate(d.getDate()-1);
    var newDate=d.getDate();
    var newMonth=d.getMonth()+1;
    if(d.getDate()<10&&d.getDate()>=1){
        newDate="0"+d.getDate();
    }
    if(d.getMonth()<8&&d.getMonth()>=0){
        newMonth="0"+(d.getMonth()+1);
    }
    
    isoDate=`${d.getFullYear()}-${newMonth}-${newDate}`;
    console.log(isoDate);
}
if(day===7){
    d.setDate(d.getDate()-2);
    var newDate=d.getDate();
    var newMonth=d.getMonth()+1;
    if(d.getDate()<10&&d.getDate()>=1){
        newDate="0"+d.getDate();
    }
    if(d.getMonth()<8&&d.getMonth()>=0){
        newMonth="0"+(d.getMonth()+1);
    }
    
    isoDate=`${d.getFullYear()}-${newMonth}-${newDate}`;
    console.log(isoDate);
}

var nameOfCurr = "USD";
var symbol = "INR";

app.use(express.static(__dirname + "/public"));
app.use(bodyParser.urlencoded({ extended: true }));

app.set('view engine', 'ejs');

app.use(session({
    secret: "Hello",
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({ mongooseConnection: mongoose.connection }),
    cookie: { maxAge: 180 * 60 * 1000 }
}));

app.use(passport.initialize());
app.use(passport.session());



mongoose.connect("mongodb+srv://admin-royal:test123@cluster0-ew67l.mongodb.net/userDB", { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set("useCreateIndex", true);

const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    googleId: String,
    secret: String,
    nationality: String
})

const productSchema = new mongoose.Schema({
    name: String,
    price: Number,
    priceDollar: Number,
    image: String,
    description: String,
    unit: String,
    subGroup: String
})

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cart: { type: Object, required: true },
    address: { type: String, required: true },
    name: { type: String, required: true },
    paymentId: { type: String, required: true }
})

function Cart(oldCart) {

    this.items = oldCart.items || {};
    this.totalQty = oldCart.totalQty || 0;
    this.totalPrice = oldCart.totalPrice || 0;
    this.totalPriceDollar = oldCart.totalPriceDollar || 0;

    this.add = function (item, id, curr) {
        var storedItem = this.items[id];
        if (!storedItem) {
            storedItem = this.items[id] = { item: item, qty: 0, price: 0, priceDollar: 0 };
        }
        storedItem.qty++;
        if (curr === "USD") {
            storedItem.priceDollar = storedItem.item.priceDollar * storedItem.qty;
            this.totalPriceDollar += storedItem.item.priceDollar;
        } else {
            storedItem.price = storedItem.item.price * storedItem.qty;
            this.totalPrice += storedItem.item.price;
        }


        this.totalQty++;

    }

    this.reduceByOne = function (id, curr) {
        this.items[id].qty--;
        if (curr === "USD") {
            this.items[id].priceDollar -= this.items[id].item.priceDollar;
            this.totalPriceDollar -= this.items[id].item.priceDollar;
        } else {
            this.items[id].price -= this.items[id].item.price;
            this.totalPrice -= this.items[id].item.price;
        }

        this.totalQty--;


        if (this.items[id].qty <= 0) {
            delete this.items[id];
        }
    }
    this.removeItem = function (id, curr) {
        this.totalQty -= this.items[id].qty;
        if (curr === "USD") {
            this.totalPriceDollar -= this.items[id].priceDollar;
        } else {
            this.totalPrice -= this.items[id].price;
        }
        delete this.items[id];
    }

    this.generateArray = function () {
        var arr = [];
        for (var id in this.items) {
            arr.push(this.items[id]);
        }
        return arr;
    }
}

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);
const Product = new mongoose.model("Product", productSchema);
const Order = new mongoose.model("Order", orderSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
    done(null, user.id);
});

passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });
});

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://dry-crag-38070.herokuapp.com/auth/google/royal",
    userProfileURL: "http://www.googleapis.com/oauth2/v3/userinfo"
},
    function (accessToken, refreshToken, profile, cb) {
        User.findOrCreate({ googleId: profile.id }, function (err, user) {
            return cb(err, user);
        });
    }
));

app.get("/", function (req, res) {

    const apikey = "SU6WMPB1W1UENIMU";
    const symbol = nameOfCurr;
    const url = "https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=" + symbol + "&to_symbol=INR&apikey=" + apikey;

    https.get(url, "JSON", function (response) {
        var data;
        response.on("data", function (chunk) {
            if (!data) {
                data = chunk;
            } else {
                data += chunk;
            }
        });

        response.on("end", function () {
            const currency = JSON.parse(data);
            const newData = currency["Time Series FX (Daily)"];
            const latest = newData[isoDate];
            const close = latest["4. close"];
            if (req.user) {
                res.render("index", { date: isoDate, curr: nameOfCurr, converted: close, login: "Sign Out" });
            } else {
                res.render("index", { date: isoDate, curr: nameOfCurr, converted: close, login: "Sign In/Register" });
            }

        });
    })
})

app.post("/", function (req, res) {
    nameOfCurr = req.body.currency;
    res.redirect("/");
})

app.get("/auth/google",
    passport.authenticate('google', { scope: ["profile"] })
);

app.get("/auth/google/royal",
    passport.authenticate('google', { failureRedirect: "/register" }),
    function (req, res) {
        res.redirect("/profile");
    });

app.get("/products", function (req, res) {
    var successMsg = "Success";
    if (req.user) {
        if (req.user.nationality) {
            res.render("products", { login: "Sign Out" });
        } else {
            res.redirect("/profile");
        }
    } else {
        res.render("products", { login: "Sign In/Register", successMsg: successMsg });
    }

})

app.get("/profile", function (req, res) {
    if(req.user){
        if(req.user.nationality){
            res.render("profile", { email: req.user._id, nation: req.user.nationality });
        }else{
            res.render("profile", { email: req.user._id, nation: "no" });
        }
    }else{
        res.redirect("/register");
    }
    
})

app.post("/profile", function (req, res) {

    User.findByIdAndUpdate({ _id: req.user._id }, { nationality: req.body.nationality }, { useFindAndModify: false }, function (err, result) {
        if (err) {
            console.log(err);
        }
    })
    console.log(req.user);
    
    res.redirect("/products");
})

app.get("/about", function (req, res) {
    if (req.user) {
        res.render("about", { login: "Sign Out" });
    } else {
        res.render("about", { login: "Sign In/Register" });
    }
})

app.get("/products/welding", function (req, res) {
    Product.find(function (err, docs) {
        if (req.user) {
            if (req.user.nationality === "Indian") {
                res.render("welding", { login: "Sign Out", products: docs, symbol: "INR", signedIn: "true" });
            } else {
                res.render("welding", { login: "Sign Out", products: docs, symbol: "USD", signedIn: "true" });
            }

        } else {
            res.render("welding", { login: "Sign In/Register", products: docs, symbol: symbol, signedIn: "false" });
        }
    });

})

app.post("/products/welding", function (req, res) {
    symbol = req.body.currSymbol;
    res.redirect("/products/welding");
})

app.get("/products/safety", function (req, res) {
    Product.find(function (err, docs) {
        if (req.user) {
            if (req.user.nationality === "Indian") {
                res.render("safety", { login: "Sign Out", products: docs, symbol: "INR", signedIn: "true" });
            } else {
                res.render("safety", { login: "Sign Out", products: docs, symbol: "USD", signedIn: "true" });
            }

        } else {
            res.render("safety", { login: "Sign In/Register", products: docs, symbol: symbol, signedIn: "false" });
        }
    });
})

app.post("/products/safety", function (req, res) {
    symbol = req.body.currSymbol;
    res.redirect("/products/safety");
})

app.get("/products/measuring", function (req, res) {
    Product.find(function (err, docs) {
        if (req.user) {
            if (req.user.nationality === "Indian") {
                res.render("measuring", { login: "Sign Out", products: docs, symbol: "INR", signedIn: "true" });
            } else {
                res.render("measuring", { login: "Sign Out", products: docs, symbol: "USD", signedIn: "true" });
            }

        } else {
            res.render("measuring", { login: "Sign In/Register", products: docs, symbol: symbol, signedIn: "false" });
        }
    });
})

app.post("/products/measuring", function (req, res) {
    symbol = req.body.currSymbol;
    res.redirect("/products/measuring");
})

app.get("/contact", function (req, res) {
    if (req.user) {
        res.render("contact", { login: "Sign Out" });
    } else {
        res.render("contact", { login: "Sign In/Register" });
    }
})

app.get("/add-to-cart/:productGroup/:id", function (req, res) {
    if (req.user) {
        var productId = req.params.id;
        var productGroup = req.params.productGroup;
        var curr;
        if (req.user.nationality === "Indian") {
            curr = "INR";
        } else {
            curr = "USD";
        }
        var cart = new Cart(req.session.cart ? req.session.cart : {});
        Product.findById(productId, function (err, product) {
            if (err) {
                console.log(err);
                return res.redirect("/products/" + productGroup);

            }
            cart.add(product, product.id, curr);
            req.session.cart = cart;
            res.redirect("/products/" + productGroup);
        })
    } else {
        res.redirect("/register");
    }

})

app.get("/reduce/:id", function (req, res) {
    var productId = req.params.id;
    var cart = new Cart(req.session.cart ? req.session.cart : {});
    var curr;
    if (req.user.nationality === "Indian") { curr = "INR" } else { curr = "USD" };
    cart.reduceByOne(productId, curr);
    req.session.cart = cart;
    res.redirect("/cart");
})

app.get("/remove/:id", function (req, res) {
    var productId = req.params.id;
    var cart = new Cart(req.session.cart ? req.session.cart : {});
    var curr;
    if (req.user.nationality === "Indian") { curr = "INR" } else { curr = "USD" };
    cart.removeItem(productId, curr);
    req.session.cart = cart;
    res.redirect("/cart");
})

app.get("/cart", function (req, res) {
    if (req.user) {
        if (!req.session.cart) {
            return res.render("cart", { products: null, login: "Sign Out" });
        } else {
            var cart = new Cart(req.session.cart);
            if (req.user.nationality === "Indian") {
                if (cart.totalPrice <= 0) {
                    res.render("cart", { products: null, login: "Sign Out" });
                } else {
                    res.render("cart", { products: cart.generateArray(), totalPrice: cart.totalPrice, login: "Sign Out", currency: "INR" });
                }
            } else {
                if (cart.totalPriceDollar <= 0) {
                    res.render("cart", { products: null, login: "Sign Out" });
                } else {
                    res.render("cart", { products: cart.generateArray(), totalPrice: cart.totalPriceDollar, login: "Sign Out", currency: "USD" });
                }
            }
        }
    } else {
        res.redirect("/register");
    }
})

app.post("/cart", function (req, res) {
    var cart = new Cart(req.session.cart);
    var order = new Order({
        user: req.user,
        cart: cart,
        address: req.body.address,
        name: req.body.name,
        paymentId: "NA"
    })
    order.save(function (err, result) {
        // alert("Success");
        req.session.cart = null;
        res.redirect("/order");
    })

})

app.get("/order", function (req, res) {
    if (req.user) {
        Order.find({ user: req.user }, function (err, orders) {
            if (err) {
                return res.write("Error");
            }
            var cart;
            orders.forEach(function (order) {
                cart = new Cart(order.cart);
                order.items = cart.generateArray();
            })
            if(req.user.nationality==="Indian"){
                res.render("order", { orders: orders, curr: "INR" });
            }else{
                res.render("order", { orders: orders, curr: "USD" });
            }
        })

    } else {
        res.redirect("/register");
    }
})

app.get("/checkout", function (req, res) {
    if (req.user) {
        if (!req.session.cart) {
            return res.redirect("/cart");
        }
        var cart = new Cart(req.session.cart);
        var errMsg = "error";
        res.render("checkout", { total: cart.totalPrice });
    }
    else {
        res.redirect("/register");
    }

})

app.post("/checkout", function (req, res) {
    if (!req.session.cart) {
        return res.redirect("/cart");
    }
    var cart = new Cart(req.session.cart);
    var stripe = require('stripe')('sk_test_51GwAkTIMqV6QF8NzMOefcmHWad8hW3TGTCR01u9tJLXwRDGrIkPziH9iXn7Df8xz6OBpdjjndECYqF13eZhW8nQx00ya86XugV');

    // `source` is obtained with Stripe.js; see https://stripe.com/docs/payments/accept-a-payment-charges#web-create-token
    stripe.charges.create(
        {
            amount: cart.totalPrice,
            currency: 'inr',
            source: req.body.stripeToken,
            description: 'My First Test Charge (created for API docs)',
        },
        function (err, charge) {
            if (err) {

                return res.redirect("/checkout");
            }
            var order = new Order({
                user: req.user,
                cart: cart,
                address: req.body.address,
                name: req.body.name,
                paymentId: charge.id || "NA"
            })
            order.save(function (err, result) {
                // alert("Success");
                req.session.cart = null;
                res.redirect("/products");
            })

        }
    );
})


app.get("/login", function (req, res) {

    res.render("login");

});

app.get("/register", function (req, res) {
    if (req.user) {
        res.redirect("/logout");
    } else {
        res.render("register");
    }
})


app.get("/logout", function (req, res) {
    req.logout();
    res.redirect("/");
});

app.post("/register", function (req, res) {

    User.register({ username: req.body.username }, req.body.password, function (err, user) {
        if (err) {
            console.log(err);
            res.redirect("/register");
        } else {
            passport.authenticate("local")(req, res, function () {
                res.redirect("/profile");
            });
        }
    });

});

app.post("/login", function (req, res) {

    const user = new User({
        username: req.body.username,
        password: req.body.password
    });

    req.login(user, function (err) {
        if (err) {
            console.log(err);
        } else {
            passport.authenticate("local")(req, res, function () {
                res.redirect("/");
            });
        }
    });

});


app.listen(process.env.PORT || 3000, function () {
    console.log("Started");
})


//client id: 204438764890-5mcjufu1jp6p46h1aoi3e0gbuv5do7pk.apps.googleusercontent.com
//client secret: zU-fkHY4ZJxCjejO_LKFhr6T